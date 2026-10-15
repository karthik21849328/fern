import { billFor, dayKey, stayTiming } from '../lib/billing.js';
import { ROOMS } from '../lib/constants.js';
import { formatLongDate, guestCountLabel, inr } from '../lib/format.js';
import { activeByRoom } from '../lib/storage.js';
import { timingLabel } from '../components.jsx';
import { useResort } from '../store.jsx';

export default function Dashboard() {
  const { stays, settings, go } = useResort();
  const occupied = activeByRoom(stays);
  const inHouse = stays.filter((stay) => stay.status === 'in').sort((a, b) => Number(a.room) - Number(b.room));
  const today = dayKey(new Date());
  const leavingToday = inHouse.filter((stay) => stayTiming(stay) === 'due' || stayTiming(stay) === 'late').length;
  const toCollect = inHouse.reduce((sum, stay) => sum + billFor(stay).total, 0);
  const collected = stays
    .filter((stay) => stay.status === 'out' && dayKey(stay.actualCheckOut) === today)
    .reduce((sum, stay) => sum + billFor(stay).total, 0);

  return (
    <div className="stack">
      <div>
        <p className="eyebrow">{formatLongDate(new Date())}</p>
        <h1 className="page-title">Today</h1>
        <p className="lede">Tap a vacant room to check a guest in. Open an occupied room to add extras or settle the bill.</p>
      </div>

      <div className="stat-grid">
        <article className="stat">
          <span className="stat-value">{inHouse.length}</span>
          <span className="stat-label">In house</span>
        </article>
        <article className="stat">
          <span className="stat-value">{ROOMS.filter((room) => !occupied.has(room)).length}</span>
          <span className="stat-label">Vacant</span>
        </article>
        <article className="stat">
          <span className="stat-value">{leavingToday}</span>
          <span className="stat-label">Due out today</span>
        </article>
        <article className="stat">
          <span className="stat-value">{inr(toCollect)}</span>
          <span className="stat-label">To collect</span>
        </article>
      </div>
      {collected > 0 ? <p className="collected">Collected today {inr(collected)}</p> : null}

      {stays.length === 0 ? (
        <p className="note">
          Nightly rate is {inr(settings.roomRate)}. Water, juice, and chocolate prices live in Settings. Change them before the first guest if these are not your rates.
        </p>
      ) : null}

      <section className="stack tight">
        <h2>Rooms</h2>
        <div className="room-grid">
          {ROOMS.map((room) => {
            const stay = occupied.get(room);
            const timing = stay ? stayTiming(stay) : 'vacant';
            const bill = stay ? billFor(stay) : null;
            return (
              <button
                key={room}
                type="button"
                className={`room-card${stay ? ' is-in' : ''}${timing === 'due' ? ' is-due' : ''}${timing === 'late' ? ' is-late' : ''}${timing === 'over' ? ' is-over' : ''}`}
                onClick={() => (stay ? go({ name: 'stay', id: stay.id }) : go({ name: 'checkin', room }))}
              >
                <span className="room-no">{room}</span>
                {stay ? (
                  <>
                    <span className="room-guest">{stay.guestName || 'Guest'}</span>
                    <span className="room-meta">{guestCountLabel(stay)}</span>
                    <span className="room-meta">{inr(bill.total)}</span>
                    {timingLabel(timing) ? <span className="badge">{timingLabel(timing)}</span> : null}
                  </>
                ) : (
                  <span className="room-meta">Vacant</span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section className="stack tight">
        <div className="section-head">
          <h2>In house</h2>
          {inHouse.length > 0 ? (
            <button type="button" className="text-btn" onClick={() => go({ name: 'guests' })}>View all</button>
          ) : null}
        </div>
        {inHouse.length === 0 ? (
          <p className="empty">No guests in house. Rooms 101 to 106 are free.</p>
        ) : (
          inHouse.map((stay) => {
            const bill = billFor(stay);
            return (
              <button key={stay.id} type="button" className="stay-card" onClick={() => go({ name: 'stay', id: stay.id })}>
                <span>
                  <strong>{stay.guestName || 'Guest'}</strong>
                  <span className="hint">Room {stay.room} · {guestCountLabel(stay)} · {stay.paymentMode}</span>
                </span>
                <span className="money">{inr(bill.total)}</span>
              </button>
            );
          })
        )}
      </section>
    </div>
  );
}
