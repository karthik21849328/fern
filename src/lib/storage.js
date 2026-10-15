import { PAYMENT_MODES } from './constants.js';

const STORAGE_KEY = 'Fenni n Ferns-resort-v1';

export function createDefaultSettings() {
  return {
    roomRate: 2500,
    staff: ['Adam', 'Karthik'],
    catalog: [
      { id: 'water', name: 'Water bottle', price: 20 },
      { id: 'juice', name: 'Juice', price: 80 },
      { id: 'chocolate', name: 'Chocolate', price: 40 },
    ],
  };
}

export function activeByRoom(stays) {
  const map = new Map();
  for (const stay of stays) {
    if (stay.status === 'in' && stay.room) map.set(String(stay.room), stay);
  }
  return map;
}

export function sanitizeState(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.stays)) {
    throw new Error('Invalid backup');
  }

  const defaults = createDefaultSettings();
  const incoming = data.settings && typeof data.settings === 'object' ? data.settings : {};
  const roomRate = Number(incoming.roomRate);

  const settings = {
    roomRate: Number.isFinite(roomRate) ? roomRate : defaults.roomRate,
    staff: Array.isArray(incoming.staff)
      ? [...new Set(incoming.staff.map((name) => String(name).trim()).filter(Boolean))]
      : defaults.staff,
    catalog: Array.isArray(incoming.catalog)
      ? incoming.catalog
          .map((item) => ({
            id: String(item.id || crypto.randomUUID()),
            name: String(item.name || '').trim(),
            price: Math.max(0, Number(item.price) || 0),
          }))
          .filter((item) => item.name)
      : defaults.catalog,
  };

  if (settings.staff.length === 0) settings.staff = defaults.staff;

  const stays = data.stays.map((stay) => ({
    id: String(stay.id || crypto.randomUUID()),
    room: String(stay.room || ''),
    guestName: String(stay.guestName || ''),
    phone: String(stay.phone || ''),
    address: String(stay.address || ''),
    adults: Math.max(0, Number(stay.adults) || 0),
    children: Math.max(0, Number(stay.children) || 0),
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    actualCheckOut: stay.actualCheckOut || null,
    source: String(stay.source || ''),
    paymentMode: PAYMENT_MODES.includes(stay.paymentMode) ? stay.paymentMode : 'Cash',
    roomRate: Math.max(0, Number(stay.roomRate) || 0),
    idFront: typeof stay.idFront === 'string' ? stay.idFront : null,
    idBack: typeof stay.idBack === 'string' ? stay.idBack : null,
    extras: Array.isArray(stay.extras)
      ? stay.extras.map((extra) => ({
          id: String(extra.id || crypto.randomUUID()),
          name: String(extra.name || 'Item'),
          qty: Math.max(1, Number(extra.qty) || 1),
          unitPrice: Math.max(0, Number(extra.unitPrice) || 0),
          addedBy: String(extra.addedBy || ''),
          addedAt: extra.addedAt || new Date().toISOString(),
        }))
      : [],
    discount: Math.max(0, Number(stay.discount) || 0),
    status: stay.status === 'out' ? 'out' : 'in',
    createdAt: stay.createdAt || new Date().toISOString(),
  }));

  return { stays, settings };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { stays: [], settings: createDefaultSettings() };
    return sanitizeState(JSON.parse(raw));
  } catch {
    return { stays: [], settings: createDefaultSettings() };
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
