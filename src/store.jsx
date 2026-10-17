import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './auth.jsx';
import { checkInStay as checkInStayApi, checkoutStay as checkoutStayApi, fetchRooms, fetchStaff } from './lib/api.js';
import { createDefaultSettings, loadState, sanitizeState, saveState } from './lib/storage.js';

const ResortContext = createContext(null);

function remoteStayToLocal(room, roomRate) {
  const remote = room.stay;
  if (!remote?.id) return null;
  return {
    id: remote.id,
    room: room.room,
    roomUuid: room.id,
    guestName: remote.guestName || 'Guest',
    phone: remote.phone || '',
    address: remote.address || '',
    adults: remote.adults || 1,
    children: remote.children || 0,
    checkIn: remote.checkIn || new Date().toISOString(),
    checkOut: remote.checkOut || new Date().toISOString(),
    actualCheckOut: remote.actualCheckOut || null,
    source: remote.source || '',
    paymentMode: remote.paymentMode || 'Cash',
    roomRate: Number(remote.roomRate) || Number(roomRate) || 0,
    idFront: remote.idFront || null,
    idBack: remote.idBack || null,
    extras: Array.isArray(remote.extras) ? remote.extras : [],
    discount: Number(remote.discount) || 0,
    status: remote.status === 'out' ? 'out' : 'in',
    settledTotal: remote.settledTotal ?? null,
    createdAt: new Date().toISOString(),
    fromServer: true,
  };
}

function staySummary(stay) {
  if (!stay) return null;
  return {
    id: stay.id,
    guestName: stay.guestName,
    phone: stay.phone,
    address: stay.address,
    adults: stay.adults,
    children: stay.children,
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    paymentMode: stay.paymentMode,
    source: stay.source,
    roomRate: stay.roomRate,
    discount: stay.discount,
    extras: stay.extras,
    status: stay.status,
  };
}

/**
 * Desk occupancy is driven by local open stays.
 * After checkout, a stale rooms API cannot keep showing the old guest.
 */
function reconcileRooms(rooms, stays, forced = {}) {
  const forcedStayIds = forced.stayIds || new Set();
  const forcedRooms = forced.roomNumbers || new Set();
  const checkedOutIds = new Set([
    ...stays.filter((stay) => stay.status === 'out').map((stay) => stay.id),
    ...forcedStayIds,
  ]);

  const openByRoom = new Map();
  for (const stay of stays) {
    if (stay.status !== 'in') continue;
    if (checkedOutIds.has(stay.id)) continue;
    if (forcedRooms.has(String(stay.room))) continue;
    openByRoom.set(String(stay.room), stay);
  }

  return rooms.map((room) => {
    const roomKey = String(room.room);
    const localOpen = openByRoom.get(roomKey);
    const remoteStayId = room.stay?.id;

    if (forcedRooms.has(roomKey) || (remoteStayId && checkedOutIds.has(remoteStayId))) {
      return { ...room, status: 'vacant', stay: null, bill: null };
    }

    if (localOpen) {
      return {
        ...room,
        status: 'occupied',
        stay: staySummary(localOpen),
      };
    }

    // No local open stay for this room → show vacant, even if API is stale.
    return { ...room, status: 'vacant', stay: null, bill: null };
  });
}

export function ResortProvider({ children }) {
  const { token, lock } = useAuth();
  const [state, setState] = useState(loadState);
  const [rawRooms, setRawRooms] = useState([]);
  const [staff, setStaff] = useState([]);
  const [remoteLoading, setRemoteLoading] = useState(true);
  const [remoteError, setRemoteError] = useState('');
  const [route, setRoute] = useState({ name: 'dashboard' });
  const [toast, setToast] = useState(null);
  const [storageError, setStorageError] = useState('');
  const toastTimer = useRef(null);
  const staysRef = useRef(state.stays);
  const forcedVacantStayIdsRef = useRef(new Set());
  const forcedVacantRoomsRef = useRef(new Set());

  useEffect(() => {
    staysRef.current = state.stays;
  }, [state.stays]);

  const rooms = useMemo(
    () => reconcileRooms(rawRooms, state.stays, {
      stayIds: forcedVacantStayIdsRef.current,
      roomNumbers: forcedVacantRoomsRef.current,
    }),
    [rawRooms, state.stays],
  );

  const refreshRemote = useCallback(async () => {
    if (!token) return;
    setRemoteLoading(true);
    setRemoteError('');
    try {
      const [allRooms, checkoutRooms, nextStaff] = await Promise.all([
        fetchRooms(token, 'all'),
        fetchRooms(token, 'checkout').catch(() => []),
        fetchStaff(),
      ]);

      const checkoutByRoom = new Map(
        checkoutRooms
          .filter((room) => room.status === 'occupied')
          .map((room) => [room.room, room]),
      );
      const mergedRooms = allRooms.map((room) => {
        if (room.status !== 'occupied') {
          return { ...room, stay: null, bill: null };
        }
        const richer = checkoutByRoom.get(room.room);
        if (!richer) return room;
        return {
          ...room,
          stay: richer.stay || room.stay,
          bill: richer.bill || room.bill,
        };
      });

      const latestStays = staysRef.current;
      const forced = {
        stayIds: forcedVacantStayIdsRef.current,
        roomNumbers: forcedVacantRoomsRef.current,
      };
      setRawRooms(reconcileRooms(mergedRooms, latestStays, forced));
      setStaff(nextStaff);

      // Import from API occupancy (mergedRooms), not from the vacated UI list.
      setState((current) => {
        const checkedOutIds = new Set([
          ...current.stays.filter((stay) => stay.status === 'out').map((stay) => stay.id),
          ...forcedVacantStayIdsRef.current,
        ]);
        const openStayIds = new Set(
          current.stays
            .filter((stay) => stay.status === 'in' && !checkedOutIds.has(stay.id))
            .map((stay) => stay.id),
        );
        const openRooms = new Set(
          current.stays
            .filter((stay) => stay.status === 'in' && !checkedOutIds.has(stay.id))
            .map((stay) => String(stay.room)),
        );

        const imports = [];
        for (const room of mergedRooms) {
          if (room.status !== 'occupied' || !room.stay?.id) continue;
          if (checkedOutIds.has(room.stay.id)) continue;
          if (forcedVacantRoomsRef.current.has(String(room.room))) continue;
          if (openStayIds.has(room.stay.id) || openRooms.has(room.room)) continue;
          const stay = remoteStayToLocal(room, current.settings.roomRate);
          if (stay) {
            imports.push(stay);
            openStayIds.add(stay.id);
            openRooms.add(stay.room);
          }
        }
        if (imports.length === 0) return current;
        const nextStays = [...imports, ...current.stays];
        staysRef.current = nextStays;
        return { ...current, stays: nextStays };
      });
    } catch (err) {
      if (err?.status === 401) {
        lock();
        return;
      }
      setRemoteError('Could not load rooms and staff from the server.');
    } finally {
      setRemoteLoading(false);
    }
  }, [token, lock]);

  useEffect(() => {
    refreshRemote();
  }, [refreshRemote]);

  useEffect(() => {
    try {
      saveState(state);
      setStorageError('');
    } catch {
      setStorageError('This browser is out of space. Export a backup, then remove an ID photo or an old stay.');
    }
  }, [state]);

  const notify = useCallback((message, undo) => {
    setToast({ message, undo: undo || null });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const go = useCallback((next) => setRoute(next), []);

  const back = useCallback(() => {
    setRoute((current) => {
      if (current.name === 'stay') return { name: 'guests' };
      return { name: 'dashboard' };
    });
  }, []);

  const checkIn = useCallback(async (input) => {
    if (!token) throw new Error('Not signed in');
    if (!input.roomUuid) throw new Error('Choose a room from the server list');

    const result = await checkInStayApi(token, {
      roomId: input.roomUuid,
      guestName: input.guestName,
      phone: input.phone,
      address: input.address,
      adults: input.adults,
      children: input.children,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      source: input.source,
      paymentMode: input.paymentMode,
      roomRate: input.roomRate,
      idFront: input.idFront,
      idBack: input.idBack,
    });

    const doc = result?.document || {};
    const stay = {
      id: String(result?.stay_id || doc.id || crypto.randomUUID()),
      room: String(input.room),
      roomUuid: input.roomUuid,
      guestName: doc.guest_name || input.guestName,
      phone: doc.phone || input.phone,
      address: doc.address || input.address,
      adults: Number(doc.adults ?? input.adults) || 1,
      children: Number(doc.children ?? input.children) || 0,
      checkIn: doc.check_in || input.checkIn,
      checkOut: doc.check_out || input.checkOut,
      actualCheckOut: doc.actual_check_out || null,
      source: doc.source || input.source,
      paymentMode: doc.payment_mode || input.paymentMode,
      roomRate: Number(doc.room_rate ?? input.roomRate) || 0,
      idFront: doc.id_front_url || input.idFront || null,
      idBack: doc.id_back_url || input.idBack || null,
      extras: Array.isArray(doc.extras) ? doc.extras : [],
      discount: Number(doc.discount) || 0,
      status: 'in',
      createdAt: doc.created_at || new Date().toISOString(),
      fromServer: true,
    };

    // Room is occupied again after a fresh check-in.
    forcedVacantStayIdsRef.current.delete(stay.id);
    forcedVacantRoomsRef.current.delete(String(stay.room));

    setState((current) => {
      const next = { ...current, stays: [stay, ...current.stays] };
      staysRef.current = next.stays;
      return next;
    });
    setRawRooms((current) => current.map((room) => (
      String(room.room) === String(stay.room)
        ? {
            ...room,
            status: 'occupied',
            stay: {
              id: stay.id,
              guestName: stay.guestName,
              phone: stay.phone,
              address: stay.address,
              adults: stay.adults,
              children: stay.children,
              checkIn: stay.checkIn,
              checkOut: stay.checkOut,
              paymentMode: stay.paymentMode,
              source: stay.source,
              roomRate: stay.roomRate,
              discount: stay.discount,
              extras: stay.extras,
              status: 'in',
            },
          }
        : room
    )));

    await refreshRemote();
    return stay;
  }, [token, refreshRemote]);

  const updateStay = useCallback((id, patch) => {
    setState((current) => {
      const next = {
        ...current,
        stays: current.stays.map((stay) => (stay.id === id ? { ...stay, ...patch } : stay)),
      };
      staysRef.current = next.stays;
      return next;
    });
  }, []);

  const restoreExtra = useCallback((stayId, extra) => {
    setState((current) => {
      const next = {
        ...current,
        stays: current.stays.map((stay) => {
          if (stay.id !== stayId) return stay;
          if (stay.extras.some((item) => item.id === extra.id)) return stay;
          return { ...stay, extras: [...stay.extras, extra] };
        }),
      };
      staysRef.current = next.stays;
      return next;
    });
  }, []);

  const removeStay = useCallback((id) => {
    setState((current) => {
      const next = {
        ...current,
        stays: current.stays.filter((stay) => stay.id !== id),
      };
      staysRef.current = next.stays;
      return next;
    });
  }, []);

  const updateSettings = useCallback((patch) => {
    setState((current) => ({ ...current, settings: { ...current.settings, ...patch } }));
  }, []);

  const importState = useCallback((data) => {
    const next = sanitizeState(data);
    staysRef.current = next.stays;
    setState(next);
  }, []);

  const resetAll = useCallback(() => {
    forcedVacantStayIdsRef.current = new Set();
    forcedVacantRoomsRef.current = new Set();
    const next = { stays: [], settings: createDefaultSettings() };
    staysRef.current = next.stays;
    setState(next);
  }, []);

  const checkoutStay = useCallback(async ({ stayId, billThrough, discount, paymentMode }) => {
    if (!token) throw new Error('Not signed in');
    const localStay = staysRef.current.find((stay) => stay.id === stayId);
    const roomNumber = localStay ? String(localStay.room) : '';

    const result = await checkoutStayApi(token, {
      stayId,
      billThrough,
      discount,
      paymentMode,
    });

    const settledTotal = result?.bill?.total ?? result?.document?.settled_total ?? null;
    const actualCheckOut = result?.document?.actual_check_out || new Date().toISOString();
    const checkOut = result?.document?.check_out || billThrough;

    forcedVacantStayIdsRef.current.add(stayId);
    if (roomNumber) forcedVacantRoomsRef.current.add(roomNumber);

    setState((current) => {
      // Close every open local stay on that room so duplicates cannot keep it occupied.
      const nextStays = current.stays.map((stay) => {
        const sameStay = stay.id === stayId;
        const sameRoom = roomNumber && String(stay.room) === roomNumber && stay.status === 'in';
        if (!sameStay && !sameRoom) return stay;
        return {
          ...stay,
          status: 'out',
          checkOut,
          actualCheckOut,
          paymentMode,
          discount: Number(discount) || 0,
          settledTotal: sameStay ? settledTotal : stay.settledTotal,
        };
      });
      staysRef.current = nextStays;
      return { ...current, stays: nextStays };
    });

    setRawRooms((current) => reconcileRooms(current, staysRef.current, {
      stayIds: forcedVacantStayIdsRef.current,
      roomNumbers: forcedVacantRoomsRef.current,
    }));

    try {
      await refreshRemote();
      // Apply again after refresh in case the API still returns the old guest.
      setRawRooms((current) => reconcileRooms(current, staysRef.current, {
        stayIds: forcedVacantStayIdsRef.current,
        roomNumbers: forcedVacantRoomsRef.current,
      }));
    } catch {
      // Keep vacant room from local checkout.
    }
    return result;
  }, [token, refreshRemote]);

  const openRoom = useCallback((room) => {
    if (!room) return;
    if (room.status === 'vacant') {
      go({ name: 'checkin', room: room.room, roomUuid: room.id });
      return;
    }

    const local = staysRef.current.find(
      (stay) => stay.status === 'in' && (stay.id === room.stay?.id || String(stay.room) === String(room.room)),
    );
    if (local) {
      go({ name: 'stay', id: local.id });
      return;
    }

    const imported = remoteStayToLocal(room, state.settings.roomRate);
    if (!imported) {
      notify('This room is occupied, but stay details are missing.');
      return;
    }
    setState((current) => {
      const next = { ...current, stays: [imported, ...current.stays] };
      staysRef.current = next.stays;
      return next;
    });
    go({ name: 'stay', id: imported.id });
  }, [go, notify, state.settings.roomRate]);

  const roomNumbers = useMemo(() => rooms.map((room) => room.room), [rooms]);
  const vacantRooms = useMemo(() => rooms.filter((room) => room.status === 'vacant'), [rooms]);
  const occupiedRooms = useMemo(() => rooms.filter((room) => room.status === 'occupied'), [rooms]);
  const staffNames = useMemo(() => staff.map((person) => person.name), [staff]);

  const value = useMemo(
    () => ({
      stays: state.stays,
      settings: state.settings,
      rooms,
      roomNumbers,
      vacantRooms,
      occupiedRooms,
      staff,
      staffNames,
      remoteLoading,
      remoteError,
      refreshRemote,
      route,
      toast,
      storageError,
      go,
      back,
      openRoom,
      notify,
      dismissToast: () => setToast(null),
      checkIn,
      checkoutStay,
      updateStay,
      restoreExtra,
      removeStay,
      updateSettings,
      importState,
      resetAll,
    }),
    [
      state,
      rooms,
      roomNumbers,
      vacantRooms,
      occupiedRooms,
      staff,
      staffNames,
      remoteLoading,
      remoteError,
      refreshRemote,
      route,
      toast,
      storageError,
      go,
      back,
      openRoom,
      notify,
      checkIn,
      checkoutStay,
      updateStay,
      restoreExtra,
      removeStay,
      updateSettings,
      importState,
      resetAll,
    ],
  );

  return <ResortContext.Provider value={value}>{children}</ResortContext.Provider>;
}

export function useResort() {
  const context = useContext(ResortContext);
  if (!context) throw new Error('useResort must be used within ResortProvider');
  return context;
}
