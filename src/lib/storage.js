export function createDefaultSettings() {
  return {
    roomRate: 2500,
    catalog: [
      { id: 'water', name: 'Water bottle', price: 20 },
      { id: 'juice', name: 'Juice', price: 80 },
      { id: 'chocolate', name: 'Chocolate', price: 40 },
    ],
  };
}

export function clearBrowserCache() {
  try {
    localStorage.removeItem('Fenni n Ferns-resort-v1');
    localStorage.removeItem('xyz-resort-v1');
  } catch {
    // ignore
  }
}

export function activeByRoom(stays) {
  const map = new Map();
  for (const stay of stays) {
    if (stay.status === 'in' && stay.room) map.set(String(stay.room), stay);
  }
  return map;
}
