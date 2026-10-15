function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function dayKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

export function nightCount(checkInIso, checkOutIso) {
  const start = new Date(checkInIso);
  const end = new Date(checkOutIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  if (endUtc < startUtc) return 0;
  return Math.max(1, Math.round((endUtc - startUtc) / 86400000));
}

export function datesAreValid(checkInIso, checkOutIso) {
  const start = new Date(checkInIso);
  const end = new Date(checkOutIso);
  return !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end > start;
}

export function stayTiming(stay, now = new Date()) {
  if (stay.status !== 'in') return 'out';
  const planned = new Date(stay.checkOut);
  if (Number.isNaN(planned.getTime())) return 'in';
  if (now.getTime() > planned.getTime()) {
    return dayKey(now) === dayKey(planned) ? 'late' : 'over';
  }
  if (dayKey(now) === dayKey(planned)) return 'due';
  return 'in';
}

export function billedThrough(stay, now = new Date()) {
  const planned = new Date(stay.checkOut);
  if (Number.isNaN(planned.getTime())) return now.toISOString();
  return (planned.getTime() > now.getTime() ? planned : now).toISOString();
}

export function computeBill(stay, checkOutIso) {
  const nights = nightCount(stay.checkIn, checkOutIso);
  const rate = Math.max(0, Number(stay.roomRate) || 0);
  const roomTotal = money(nights * rate);
  const extraLines = (stay.extras || []).map((extra) => {
    const qty = Math.max(0, Number(extra.qty) || 0);
    const unitPrice = Math.max(0, Number(extra.unitPrice) || 0);
    return { ...extra, qty, unitPrice, lineTotal: money(qty * unitPrice) };
  });
  const extrasTotal = money(extraLines.reduce((sum, extra) => sum + extra.lineTotal, 0));
  const subtotal = money(roomTotal + extrasTotal);
  const discount = money(Math.min(Math.max(0, Number(stay.discount) || 0), subtotal));
  return {
    nights,
    roomTotal,
    extraLines,
    extrasTotal,
    discount,
    subtotal,
    total: money(subtotal - discount),
    through: checkOutIso,
  };
}

export function billFor(stay, now = new Date(), overrides = {}) {
  const through = overrides.through || (stay.status === 'out' ? stay.checkOut : billedThrough(stay, now));
  const discount = overrides.discount ?? stay.discount ?? 0;
  return computeBill({ ...stay, discount }, through);
}
