import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './auth.jsx';
import { checkInStay as checkInStayApi, checkoutStay as checkoutStayApi, fetchRooms, fetchStaff } from './lib/api.js';
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
  if (!doc && !fallback.id) return null;
  return {
    id: String(doc?.id || fallback.id || ''),
    room: String(roomNumber || fallback.room || ''),
    roomUuid: roomUuid || fallback.roomUuid || '',
    guestName: doc?.guest_name || fallback.guestName || 'Guest',
    phone: doc?.phone || fallback.phone || '',
    address: doc?.address || fallback.address || '',
    adults: Number(doc?.adults ?? fallback.adults) || 1,
    children: Number(doc?.children ?? fallback.children) || 0,
    checkIn: doc?.check_in || fallback.checkIn || new Date().toISOString(),
    checkOut: doc?.check_out || fallback.checkOut || new Date().toISOString(),
    actualCheckOut: doc?.actual_check_out || fallback.actualCheckOut || null,
    source: doc?.source || fallback.source || '',
    paymentMode: doc?.payment_mode || fallback.paymentMode || 'Cash',
    roomRate: Number(doc?.room_rate ?? fallback.roomRate) || 0,
    idFront: doc?.id_front_url || fallback.idFront || null,
    idBack: doc?.id_back_url || fallback.idBack || null,
    extras: Array.isArray(doc?.extras) ? doc.extras : (fallback.extras || []),
    discount: Number(doc?.discount ?? fallback.discount) || 0,
    status: doc?.status === 'out' || fallback.status === 'out' ? 'out' : 'in',
    settledTotal: doc?.settled_total ?? fallback.settledTotal ?? null,
    createdAt: doc?.created_at || fallback.createdAt || new Date().toISOString(),
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
      // Keep checked-out stays from this session for History / receipts only.
      // Open stays are always replaced from the API.
      setStays((current) => {
        const history = current.filter((stay) => stay.status === 'out');
        const historyIds = new Set(history.map((stay) => stay.id));
        const mergedOpen = openStays.filter((stay) => !historyIds.has(stay.id));
        return [...mergedOpen, ...history];
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

    const stayId = String(result?.stay_id || result?.document?.id || '');
    return documentToStay(
      result?.document,
      input.room,
      input.roomUuid,
      {
        id: stayId,
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

  const restoreExtra = useCallback((stayId, extra) => {
    setStays((current) => current.map((stay) => {
      if (stay.id !== stayId) return stay;
      if (stay.extras.some((item) => item.id === extra.id)) return stay;
      return { ...stay, extras: [...stay.extras, extra] };
    }));
  }, []);

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
