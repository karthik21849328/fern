import { useState } from 'react';
import { SearchBox, StayCard } from '../components.jsx';
import { useResort } from '../store.jsx';

export default function Guests() {
  const { stays, go } = useResort();
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const inHouse = stays
    .filter((stay) => stay.status === 'in')
    .filter((stay) => {
      if (!needle) return true;
      return [stay.guestName, stay.phone, stay.room, stay.source, stay.paymentMode].join(' ').toLowerCase().includes(needle);
    })
    .sort((a, b) => Number(a.room) - Number(b.room));

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">In house</h1>
        <p className="lede">{stays.filter((stay) => stay.status === 'in').length} current stays. The amount is the room plus anything added so far.</p>
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
