const AUTH_BASE = 'https://ncnty1ei4k.execute-api.ap-southeast-2.amazonaws.com/default/fern01';
const ROOMS_URL = 'https://bykrvdkmqa.execute-api.ap-southeast-2.amazonaws.com/default/fern03';

async function parseJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function apiError(response, data) {
  const message = data?.error || (response.status === 401 ? 'Unauthorized' : `Request failed (${response.status})`);
  const error = new Error(message);
  error.status = response.status;
  error.data = data;
  return error;
}

function mapStay(stay) {
  if (!stay || typeof stay !== 'object') return null;
  return {
    id: String(stay.id || ''),
    guestName: String(stay.guest_name || stay.guestName || ''),
    phone: String(stay.phone || ''),
    address: String(stay.address || ''),
    adults: Number(stay.adults) || 0,
    children: Number(stay.children) || 0,
    checkIn: stay.check_in || stay.checkIn || null,
    checkOut: stay.check_out || stay.checkOut || null,
    paymentMode: stay.payment_mode || stay.paymentMode || 'Cash',
    source: String(stay.source || ''),
    roomRate: Number(stay.room_rate ?? stay.roomRate) || 0,
    discount: Number(stay.discount) || 0,
    extras: Array.isArray(stay.extras) ? stay.extras : [],
    idFront: stay.id_front_url || stay.idFront || null,
    idBack: stay.id_back_url || stay.idBack || null,
    status: stay.status === 'out' ? 'out' : 'in',
    actualCheckOut: stay.actual_check_out || stay.actualCheckOut || null,
    settledTotal: stay.settled_total ?? stay.settledTotal ?? null,
  };
}

function mapRoom(item) {
  const stay = mapStay(item.stay);
  return {
    id: String(item.uuid || item.id || item.room_num),
    room: String(item.room_num),
    active: item.active !== false,
    status: item.status === 'occupied' ? 'occupied' : 'vacant',
    metadata: item.metadata && typeof item.metadata === 'object' ? item.metadata : {},
    stay,
    bill: item.bill || null,
  };
}

export async function loginWithPassword(password) {
  const response = await fetch(`${AUTH_BASE}?pas=${encodeURIComponent(password.trim())}`);
  const data = await parseJson(response);
  if (!response.ok) throw apiError(response, data);
  if (!data?.token) throw new Error('No token returned');
  return data.token;
}

export async function fetchRooms(token, type = 'all') {
  async function request(queryType) {
    const url = new URL(ROOMS_URL);
    if (queryType) url.searchParams.set('type', queryType);

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await parseJson(response);
    if (!response.ok) throw apiError(response, data);
    return data;
  }

  let data;
  try {
    data = await request(type);
  } catch (err) {
    // Older deploy may not accept type=all
    if (type === 'all') data = await request('');
    else throw err;
  }

  const items = Array.isArray(data?.items) ? data.items : [];
  return items
    .filter((item) => item && item.active !== false && item.room_num != null)
    .map(mapRoom)
    .sort((a, b) => Number(a.room) - Number(b.room));
}

export async function checkInStay(token, payload) {
  const url = `${ROOMS_URL}?type=checkin`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      room_id: payload.roomId,
      guest_name: payload.guestName,
      phone: payload.phone,
      address: payload.address,
      adults: payload.adults,
      children: payload.children,
      check_in: payload.checkIn,
      check_out: payload.checkOut,
      source: payload.source,
      payment_mode: payload.paymentMode,
      room_rate: payload.roomRate,
      id_front_url: payload.idFront || null,
      id_back_url: payload.idBack || null,
    }),
  });
  const data = await parseJson(response);
  if (!response.ok) throw apiError(response, data);
  // Old fern03 only listed rooms on POST — reject that so we never fake a stay.
  if (!data?.stay_id && !data?.document?.id) {
    throw new Error(
      'Check-in API did not save a stay. Redeploy fern03 with the updated backend/fetch_room.py (POST check-in).',
    );
  }
  return data;
}

export async function checkoutStay(token, payload) {
  const url = `${ROOMS_URL}?type=checkout`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      stay_id: payload.stayId,
      bill_through: payload.billThrough,
      discount: payload.discount ?? 0,
      payment_mode: payload.paymentMode,
    }),
  });
  const data = await parseJson(response);
  if (!response.ok) throw apiError(response, data);
  return data;
}

export async function fetchStaff() {
  const response = await fetch(`${AUTH_BASE}?pas=staff`);
  const data = await parseJson(response);
  if (!response.ok) throw apiError(response, data);

  const items = Array.isArray(data?.items) ? data.items : [];
  return items
    .filter((item) => item && item.active !== false && item.name)
    .map((item) => ({
      id: String(item.id || item.uuid || item.name),
      name: String(item.name).trim(),
      active: item.active !== false,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
