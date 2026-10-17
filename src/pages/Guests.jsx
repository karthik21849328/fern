import { useMemo, useState } from 'react';
import { SearchBox, StayCard } from '../components.jsx';
import { useResort } from '../store.jsx';

export default function Guests() {
  const { stays, rooms, settings, go } = useResort();
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();

  const inHouse = useMemo(() => {
    const byId = new Map(stays.filter((stay) => stay.status === 'in').map((stay) => [stay.id, stay]));
    return rooms
      .filter((room) => room.status === 'occupied' && room.stay?.id)
      .map((room) => {
        const existing = byId.get(room.stay.id);
        if (existing) return existing;
        return {
          id: room.stay.id,
          room: room.room,
          roomUuid: room.id,
          guestName: room.stay.guestName || 'Guest',
          phone: room.stay.phone || '',
          address: room.stay.address || '',
          adults: room.stay.adults || 1,
          children: room.stay.children || 0,
          checkIn: room.stay.checkIn || new Date().toISOString(),
          checkOut: room.stay.checkOut || new Date().toISOString(),
          actualCheckOut: null,
          source: room.stay.source || '',
          paymentMode: room.stay.paymentMode || 'Cash',
          roomRate: Number(room.stay.roomRate) || Number(settings.roomRate) || 0,
          idFront: room.stay.idFront || null,
          idBack: room.stay.idBack || null,
          extras: Array.isArray(room.stay.extras) ? room.stay.extras : [],
          discount: Number(room.stay.discount) || 0,
          status: 'in',
          settledTotal: null,
        };
      })
      .filter((stay) => {
        if (!needle) return true;
        return [stay.guestName, stay.phone, stay.room, stay.source, stay.paymentMode]
          .join(' ')
          .toLowerCase()
          .includes(needle);
      })
      .sort((a, b) => Number(a.room) - Number(b.room));
  }, [rooms, stays, settings.roomRate, needle]);

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">In house</h1>
        <p className="lede">{inHouse.length} current stay{inHouse.length === 1 ? '' : 's'}. Tap a guest for details, extras, or checkout.</p>
      </div>
      <SearchBox value={query} onChange={setQuery} placeholder="Search name, phone, or room" />
      {inHouse.length === 0 ? (
        <p className="empty">{needle ? 'No guests match that search.' : 'No guests in house.'}</p>
      ) : (
        inHouse.map((stay) => (
          <StayCard key={stay.id} stay={stay} onOpen={() => go({ name: 'stay', id: stay.id })} />
        ))
      )}
    </div>
  );
}
