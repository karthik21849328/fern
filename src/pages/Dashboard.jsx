import { billFor, dayKey, stayTiming } from '../lib/billing.js';
import { formatLongDate, guestCountLabel, inr } from '../lib/format.js';
import { timingLabel } from '../components.jsx';
import { useResort } from '../store.jsx';

export default function Dashboard() {
  const {
    stays,
    settings,
    rooms,
    vacantRooms,
    occupiedRooms,
    remoteLoading,
    openRoom,
    go,
  } = useResort();

  const stayByRoom = new Map(
    stays.filter((stay) => stay.status === 'in').map((stay) => [String(stay.room), stay]),
  );
  const inHouse = occupiedRooms
    .map((room) => stayByRoom.get(room.room) || (room.stay ? {
      id: room.stay.id,
      room: room.room,
      guestName: room.stay.guestName,
      phone: room.stay.phone,
      adults: room.stay.adults,
      children: room.stay.children,
      paymentMode: room.stay.paymentMode,
      checkIn: room.stay.checkIn,
      checkOut: room.stay.checkOut,
      roomRate: Number(room.stay.roomRate) || settings.roomRate,
      extras: Array.isArray(room.stay.extras) ? room.stay.extras : [],
      discount: Number(room.stay.discount) || 0,
      status: 'in',
    } : null))
    .filter(Boolean)
    .sort((a, b) => Number(a.room) - Number(b.room));

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
          <span className="stat-value">{occupiedRooms.length}</span>
          <span className="stat-label">In house</span>
        </article>
        <article className="stat">
          <span className="stat-value">{vacantRooms.length}</span>
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

      {occupiedRooms.length === 0 ? (
        <p className="note">
          Rooms and occupancy load from the server. Nightly rate default is {inr(settings.roomRate)}. Extra item prices are in Settings.
        </p>
      ) : null}

      <section className="stack tight">
        <h2>Rooms</h2>
        {remoteLoading && rooms.length === 0 ? (
          <p className="empty">Loading rooms…</p>
        ) : rooms.length === 0 ? (
          <p className="empty">No active rooms came back from the server.</p>
        ) : (
          <div className="room-grid">
            {rooms.map((room) => {
              const localStay = stayByRoom.get(room.room);
              const occupied = room.status === 'occupied';
              const guestName = localStay?.guestName || room.stay?.guestName || 'Guest';
              const stayForBill = localStay || (room.stay ? {
                ...room.stay,
                room: room.room,
                roomRate: Number(room.stay.roomRate) || settings.roomRate,
                extras: Array.isArray(room.stay.extras) ? room.stay.extras : [],
                discount: Number(room.stay.discount) || 0,
                status: 'in',
              } : null);
              const timing = stayForBill ? stayTiming(stayForBill) : 'vacant';
              const bill = stayForBill ? billFor(stayForBill) : null;
              const meta = room.metadata || {};
              return (
                <button
                  key={room.id}
                  type="button"
                  className={`room-card${occupied ? ' is-in' : ''}${timing === 'due' ? ' is-due' : ''}${timing === 'late' ? ' is-late' : ''}${timing === 'over' ? ' is-over' : ''}`}
                  onClick={() => openRoom(room)}
                >
                  <span className="room-no">{room.room}</span>
                  {occupied ? (
                    <>
                      <span className="room-guest">{guestName}</span>
                      <span className="room-meta">
                        {guestCountLabel({
                          adults: localStay?.adults ?? room.stay?.adults ?? 0,
                          children: localStay?.children ?? room.stay?.children ?? 0,
                        })}
                      </span>
                      {bill ? <span className="room-meta">{inr(bill.total)}</span> : null}
                      {timingLabel(timing) ? <span className="badge">{timingLabel(timing)}</span> : null}
                    </>
                  ) : (
                    <>
                      <span className="room-meta">Vacant</span>
                      {meta.type ? <span className="room-meta">{meta.type}</span> : null}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="stack tight">
        <div className="section-head">
          <h2>In house</h2>
          {inHouse.length > 0 ? (
            <button type="button" className="text-btn" onClick={() => go({ name: 'guests' })}>View all</button>
          ) : null}
        </div>
        {inHouse.length === 0 ? (
          <p className="empty">No guests in house.{vacantRooms.length ? ` ${vacantRooms.length} room${vacantRooms.length === 1 ? '' : 's'} free.` : ''}</p>
        ) : (
          inHouse.map((stay) => {
            const bill = billFor(stay);
            return (
              <button
                key={stay.id}
                type="button"
                className="stay-card"
                onClick={() => {
                  const room = rooms.find((item) => item.room === String(stay.room));
                  if (room) openRoom(room);
                  else go({ name: 'stay', id: stay.id });
                }}
              >
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
