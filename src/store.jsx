import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './auth.jsx';
import {
  addStayExtra as addStayExtraApi,
  checkInStay as checkInStayApi,
  checkoutStay as checkoutStayApi,
  fetchHistory,
  fetchRooms,
  fetchStaff,
  mapStayDocument,
  removeStayExtra as removeStayExtraApi,
} from './lib/api.js';
import { clearBrowserCache, createDefaultSettings } from './lib/storage.js';

const ResortContext = createContext(null);

clearBrowserCache();

function roomStayToLocal(room, roomRate) {
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
    status: 'in',
    settledTotal: remote.settledTotal ?? null,
    createdAt: new Date().toISOString(),
  };
}

function documentToStay(doc, roomNumber, roomUuid, fallback = {}) {
  const mapped = mapStayDocument(
    { ...fallback, ...doc, room_num: roomNumber || doc?.room_num || fallback.room },
    roomNumber || fallback.room,
  );
  if (!mapped) {
    return {
      id: String(fallback.id || crypto.randomUUID()),
      room: String(roomNumber || fallback.room || ''),
      roomUuid: roomUuid || fallback.roomUuid || '',
      guestName: fallback.guestName || 'Guest',
      phone: fallback.phone || '',
      address: fallback.address || '',
      adults: fallback.adults || 1,
      children: fallback.children || 0,
      checkIn: fallback.checkIn || new Date().toISOString(),
      checkOut: fallback.checkOut || new Date().toISOString(),
      actualCheckOut: fallback.actualCheckOut || null,
      source: fallback.source || '',
      paymentMode: fallback.paymentMode || 'Cash',
      roomRate: Number(fallback.roomRate) || 0,
      idFront: fallback.idFront || null,
      idBack: fallback.idBack || null,
      extras: fallback.extras || [],
      discount: Number(fallback.discount) || 0,
      status: fallback.status === 'out' ? 'out' : 'in',
      settledTotal: fallback.settledTotal ?? null,
      createdAt: fallback.createdAt || new Date().toISOString(),
    };
  }
  return {
    ...mapped,
    id: mapped.id || String(fallback.id || crypto.randomUUID()),
    room: String(roomNumber || mapped.room || fallback.room || ''),
    roomUuid: roomUuid || mapped.roomUuid || fallback.roomUuid || '',
    guestName: mapped.guestName || fallback.guestName || 'Guest',
    phone: mapped.phone || fallback.phone || '',
    address: mapped.address || fallback.address || '',
    adults: mapped.adults || fallback.adults || 1,
    children: mapped.children ?? fallback.children ?? 0,
    checkIn: mapped.checkIn || fallback.checkIn || new Date().toISOString(),
    checkOut: mapped.checkOut || fallback.checkOut || new Date().toISOString(),
    actualCheckOut: mapped.actualCheckOut || fallback.actualCheckOut || null,
    source: mapped.source || fallback.source || '',
    paymentMode: mapped.paymentMode || fallback.paymentMode || 'Cash',
    roomRate: Number(mapped.roomRate || fallback.roomRate) || 0,
    idFront: mapped.idFront || fallback.idFront || null,
    idBack: mapped.idBack || fallback.idBack || null,
    extras: mapped.extras?.length ? mapped.extras : (fallback.extras || []),
    discount: Number(mapped.discount ?? fallback.discount) || 0,
    status: mapped.status === 'out' || fallback.status === 'out' ? 'out' : 'in',
    settledTotal: mapped.settledTotal ?? fallback.settledTotal ?? null,
    createdAt: mapped.createdAt || fallback.createdAt || new Date().toISOString(),
  };
}

export function ResortProvider({ children }) {
  const { token, lock } = useAuth();
  const [settings, setSettings] = useState(createDefaultSettings);
  const [rooms, setRooms] = useState([]);
  const [stays, setStays] = useState([]);
  const [staff, setStaff] = useState([]);
  const [remoteLoading, setRemoteLoading] = useState(true);
  const [remoteError, setRemoteError] = useState('');
  const [route, setRoute] = useState({ name: 'dashboard' });
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const refreshRemote = useCallback(async () => {
    if (!token) return;
    setRemoteLoading(true);
    setRemoteError('');
    try {
      const [allRooms, checkoutRooms, pastStays, nextStaff] = await Promise.all([
        fetchRooms(token, 'all'),
        fetchRooms(token, 'checkout').catch(() => []),
        fetchHistory(token).catch(() => []),
        fetchStaff(),
      ]);

      const checkoutByRoom = new Map(
        checkoutRooms
          .filter((room) => room.status === 'occupied')
          .map((room) => [room.room, room]),
      );

      // Rooms and occupancy come only from the API.
      const nextRooms = allRooms.map((room) => {
        if (room.status !== 'occupied') {
          return { ...room, status: 'vacant', stay: null, bill: null };
        }
        const richer = checkoutByRoom.get(room.room);
        return {
          ...room,
          status: 'occupied',
          stay: richer?.stay || room.stay,
          bill: richer?.bill || room.bill || null,
        };
      });

      const rate = settingsRef.current.roomRate;
      const openStays = nextRooms
        .filter((room) => room.status === 'occupied' && room.stay?.id)
        .map((room) => roomStayToLocal(room, rate))
        .filter(Boolean);

      setRooms(nextRooms);
      setStaff(nextStaff);
      // Open stays + checkout history both come from the server.
      setStays(() => {
        const historyIds = new Set(pastStays.map((stay) => stay.id));
        const open = openStays.filter((stay) => !historyIds.has(stay.id));
        return [...open, ...pastStays];
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

    await refreshRemote();

    const stayId = String(
      result?.stay_id
      || result?.document?.id
      || result?.document?.stay_id
      || '',
    );

    const stay = documentToStay(
      result?.document || result,
      input.room,
      input.roomUuid,
      {
        id: stayId || crypto.randomUUID(),
        room: input.room,
        roomUuid: input.roomUuid,
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
        status: 'in',
      },
    );

    // Ensure the stay exists in memory even if rooms refresh was slow/stale.
    setStays((current) => {
      if (current.some((item) => item.id === stay.id)) {
        return current.map((item) => (item.id === stay.id ? { ...item, ...stay, status: 'in' } : item));
      }
      return [stay, ...current];
    });

    return stay;
  }, [token, refreshRemote]);

  const checkoutStay = useCallback(async ({ stayId, billThrough, discount, paymentMode }) => {
    if (!token) throw new Error('Not signed in');

    const result = await checkoutStayApi(token, {
      stayId,
      billThrough,
      discount,
      paymentMode,
    });

    const settledTotal = result?.bill?.total ?? result?.document?.settled_total ?? null;
    const actualCheckOut = result?.document?.actual_check_out || new Date().toISOString();
    const checkOut = result?.document?.check_out || billThrough;

    const closed = documentToStay(result?.document, result?.document?.room_num, null, {
      id: stayId,
      status: 'out',
      checkOut,
      actualCheckOut,
      paymentMode,
      discount: Number(discount) || 0,
      settledTotal,
    });

    // Occupancy comes from the API after refresh.
    await refreshRemote();

    // Keep this checkout in memory for History / receipt during this session only.
    if (closed) {
      setStays((current) => {
        const rest = current.filter((stay) => {
          if (stay.id === stayId) return false;
          if (stay.status === 'in' && String(stay.room) === String(closed.room)) return false;
          return true;
        });
        return [{ ...closed, status: 'out' }, ...rest];
      });
    }

    return result;
  }, [token, refreshRemote]);

  const updateStay = useCallback((id, patch) => {
    setStays((current) => current.map((stay) => (stay.id === id ? { ...stay, ...patch } : stay)));
  }, []);

  const applyExtras = useCallback((stayId, extras) => {
    setStays((current) => current.map((stay) => (
      stay.id === stayId ? { ...stay, extras } : stay
    )));
  }, []);

  const addExtra = useCallback(async (stayId, extra) => {
    if (!token) throw new Error('Not signed in');
    const result = await addStayExtraApi(token, { stayId, extra });
    const extras = result.extras?.length
      ? result.extras
      : undefined;
    if (extras) {
      applyExtras(stayId, extras);
    } else {
      setStays((current) => current.map((stay) => {
        if (stay.id !== stayId) return stay;
        const next = result.extra || extra;
        if (stay.extras.some((item) => item.id === next.id)) {
          return { ...stay, extras: stay.extras.map((item) => (item.id === next.id ? next : item)) };
        }
        return { ...stay, extras: [...stay.extras, next] };
      }));
    }
    return result.extra || extra;
  }, [token, applyExtras]);

  const removeExtra = useCallback(async (stayId, extraId) => {
    if (!token) throw new Error('Not signed in');
    const result = await removeStayExtraApi(token, { stayId, extraId });
    if (Array.isArray(result.extras)) {
      applyExtras(stayId, result.extras);
    } else {
      setStays((current) => current.map((stay) => (
        stay.id === stayId
          ? { ...stay, extras: stay.extras.filter((item) => item.id !== extraId) }
          : stay
      )));
    }
  }, [token, applyExtras]);

  const restoreExtra = useCallback(async (stayId, extra) => {
    await addExtra(stayId, extra);
  }, [addExtra]);

  const removeStay = useCallback((id) => {
    setStays((current) => current.filter((stay) => stay.id !== id));
  }, []);

  const updateSettings = useCallback((patch) => {
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

  const resetAll = useCallback(() => {
    clearBrowserCache();
    setSettings(createDefaultSettings());
    setStays([]);
    refreshRemote();
  }, [refreshRemote]);

  const openRoom = useCallback((room) => {
    if (!room) return;
    if (room.status === 'vacant') {
      go({ name: 'checkin', room: room.room, roomUuid: room.id });
      return;
    }

    const existing = stays.find(
      (stay) => stay.status === 'in' && (stay.id === room.stay?.id || String(stay.room) === String(room.room)),
    );
    if (existing) {
      go({ name: 'stay', id: existing.id });
      return;
    }

    const imported = roomStayToLocal(room, settings.roomRate);
    if (!imported) {
      notify('This room is occupied, but stay details are missing.');
      return;
    }
    setStays((current) => [imported, ...current.filter((stay) => stay.id !== imported.id)]);
    go({ name: 'stay', id: imported.id });
  }, [go, notify, settings.roomRate, stays]);

  const roomNumbers = useMemo(() => rooms.map((room) => room.room), [rooms]);
  const vacantRooms = useMemo(() => rooms.filter((room) => room.status === 'vacant'), [rooms]);
  const occupiedRooms = useMemo(() => rooms.filter((room) => room.status === 'occupied'), [rooms]);
  const staffNames = useMemo(() => staff.map((person) => person.name), [staff]);

  const value = useMemo(
    () => ({
      stays,
      settings,
      rooms,
      roomNumbers,
      vacantRooms,
      occupiedRooms,
      staff,
      staffNames,
      remoteLoading,
      remoteError,
      storageError: '',
      refreshRemote,
      route,
      toast,
      go,
      back,
      openRoom,
      notify,
      dismissToast: () => setToast(null),
      checkIn,
      checkoutStay,
      updateStay,
      addExtra,
      removeExtra,
      restoreExtra,
      removeStay,
      updateSettings,
      importState: () => {},
      resetAll,
    }),
    [
      stays,
      settings,
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
      go,
      back,
      openRoom,
      notify,
      checkIn,
      checkoutStay,
      updateStay,
      addExtra,
      removeExtra,
      restoreExtra,
      removeStay,
      updateSettings,
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
