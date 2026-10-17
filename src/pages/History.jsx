import { useMemo, useState } from 'react';
import { SearchBox, StayCard } from '../components.jsx';
import { formatDay } from '../lib/format.js';
import { useResort } from '../store.jsx';

export default function History() {
  const { stays, go, remoteLoading } = useResort();
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();

  const past = useMemo(() => (
    stays
      .filter((stay) => stay.status === 'out')
      .filter((stay) => {
        if (!needle) return true;
        return [stay.guestName, stay.phone, stay.room, stay.source, stay.paymentMode]
          .join(' ')
          .toLowerCase()
          .includes(needle);
      })
      .sort((a, b) => new Date(b.actualCheckOut || b.checkOut) - new Date(a.actualCheckOut || a.checkOut))
  ), [stays, needle]);

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">History</h1>
        <p className="lede">Past checkouts from the server. Tap a guest to open the full bill and stay details.</p>
      </div>
      <SearchBox value={query} onChange={setQuery} placeholder="Search past guests" />
      {past.length === 0 ? (
        <p className="empty">
          {needle
            ? 'No stays match that search.'
            : remoteLoading
              ? 'Loading history…'
              : 'No checked-out stays yet.'}
        </p>
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
