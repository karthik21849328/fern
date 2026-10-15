export function inr(value) {
  const n = Number(value) || 0;
  const hasPaise = Math.round(n * 100) % 100 !== 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: hasPaise ? 2 : 0,
    minimumFractionDigits: hasPaise ? 2 : 0,
  }).format(n);
}

function parseDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatWhen(value) {
  const date = parseDate(value);
  if (!date) return '—';
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatFull(value) {
  const date = parseDate(value);
  if (!date) return '—';
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDay(value) {
  const date = parseDate(value);
  if (!date) return '—';
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatLongDate(value) {
  const date = parseDate(value) || new Date();
  return date.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function nightsLabel(nights) {
  return nights === 1 ? '1 night' : `${nights} nights`;
}

export function guestCountLabel(stay) {
  const adults = Number(stay.adults) || 0;
  const children = Number(stay.children) || 0;
  const parts = [];
  if (adults) parts.push(`${adults} adult${adults === 1 ? '' : 's'}`);
  if (children) parts.push(`${children} child${children === 1 ? '' : 'ren'}`);
  return parts.join(' · ') || 'No guests';
}

export function toDatetimeLocal(value) {
  const date = parseDate(value);
  if (!date) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromDatetimeLocal(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}
