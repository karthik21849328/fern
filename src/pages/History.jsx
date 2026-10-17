import { useState } from 'react';
import { SearchBox, StayCard } from '../components.jsx';
import { formatDay } from '../lib/format.js';
import { useResort } from '../store.jsx';

export default function History() {
  const { stays, go } = useResort();
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const past = stays
    .filter((stay) => stay.status === 'out')
    .filter((stay) => {
      if (!needle) return true;
      return [stay.guestName, stay.phone, stay.room, stay.source, stay.paymentMode].join(' ').toLowerCase().includes(needle);
    })
    .sort((a, b) => new Date(b.actualCheckOut || b.checkOut) - new Date(a.actualCheckOut || a.checkOut));

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">History</h1>
        <p className="lede">Checkouts from this session. Occupancy always comes from the server.</p>
      </div>
      <SearchBox value={query} onChange={setQuery} placeholder="Search past guests" />
      {past.length === 0 ? (
        <p className="empty">{needle ? 'No stays match that search.' : 'Checked-out stays will appear here.'}</p>
      ) : (
        past.map((stay) => (
          <StayCard
            key={stay.id}
            stay={stay}
            detail={`${formatDay(stay.checkIn)} – ${formatDay(stay.checkOut)} · ${stay.paymentMode}`}
            onOpen={() => go({ name: 'stay', id: stay.id })}
          />
        ))
      )}
    </div>
  );
}
