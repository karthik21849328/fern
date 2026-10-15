import { useEffect, useState } from 'react';
import { billFor, stayTiming } from './lib/billing.js';
import { formatWhen, guestCountLabel, inr, nightsLabel } from './lib/format.js';

const TIMING_LABEL = {
  due: 'Leaves today',
  late: 'Past check-out time',
  over: 'Extra night',
};

export function Mark() {
  return (
    <svg className="mark" viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#0e4f3c" />
      <path d="M16 6c2.2 4.4 7 6.8 7 12a7 7 0 0 1-14 0c0-5.2 4.8-7.6 7-12z" fill="#e7c98a" />
    </svg>
  );
}

export function IconHome() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
    </svg>
  );
}

export function IconPlus() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

export function IconUsers() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M16 20v-1.2A3.8 3.8 0 0 0 12.2 15H7.8A3.8 3.8 0 0 0 4 18.8V20" strokeLinecap="round" />
      <circle cx="10" cy="8" r="3" />
      <path d="M20 20v-1.2A3.8 3.8 0 0 0 17.5 15.2M16 5.1a3 3 0 0 1 0 5.8" strokeLinecap="round" />
    </svg>
  );
}

export function IconClock() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4.5L15 15" strokeLinecap="round" />
    </svg>
  );
}

export function IconGear() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M4.8 6.8l1.6 1.6M17.6 15.6l1.6 1.6M3.5 12h2.2M18.3 12h2.2M4.8 17.2l1.6-1.6M17.6 8.4l1.6-1.6" strokeLinecap="round" />
    </svg>
  );
}

export function IconBack() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M15 5 8 12l7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Field({ id, label, hint, error, children }) {
  return (
    <div className="field">
      {id ? (
        <label className="label" htmlFor={id}>{label}</label>
      ) : (
        <div className="label">{label}</div>
      )}
      {children}
      {error ? <div className="error">{error}</div> : hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

export function Stepper({ label, value, min, max, onChange }) {
  return (
    <div className="stepper">
      <button type="button" aria-label={`Decrease ${label}`} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <span>{value}</span>
      <button type="button" aria-label={`Increase ${label}`} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
    </div>
  );
}

export function Segmented({ label, value, options, onChange }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          className={value === option ? 'on' : ''}
          onClick={() => onChange(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export function BillView({ stay, bill, paymentMode }) {
  return (
    <section className="bill" aria-label="Bill">
      <p className="bill-kicker">{stay.status === 'out' ? 'Paid' : 'To collect'}</p>
      <div className="bill-total">
        <span>{stay.status === 'out' ? 'Total' : 'Due'}</span>
        <strong>{inr(bill.total)}</strong>
      </div>
      <p className="hint">{guestCountLabel(stay)} · Room {stay.room}</p>
      {bill.nights === 0 ? (
        <p className="error">Check-out has to be after check-in before the room charge can be calculated.</p>
      ) : (
        <div className="bill-row">
          <div>
            <div>Room · {nightsLabel(bill.nights)}</div>
            <div className="hint">{inr(stay.roomRate)} × {bill.nights} · through {formatWhen(bill.through)}</div>
          </div>
          <div>{inr(bill.roomTotal)}</div>
        </div>
      )}
      {bill.extraLines.map((extra) => (
        <div className="bill-row" key={extra.id}>
          <div>
            <div>{extra.name} × {extra.qty}</div>
            <div className="hint">{extra.addedBy || 'Staff'} · {formatWhen(extra.addedAt)}</div>
          </div>
          <div>{inr(extra.lineTotal)}</div>
        </div>
      ))}
      {bill.discount > 0 && (
        <div className="bill-row">
          <div>Discount</div>
          <div>−{inr(bill.discount)}</div>
        </div>
      )}
      <p className="hint pay-line">Payment · {paymentMode}</p>
    </section>
  );
}

export function StayCard({ stay, onOpen, detail }) {
  const bill = billFor(stay);
  const timing = stayTiming(stay);
  return (
    <button type="button" className="stay-card" onClick={onOpen}>
      <span>
        <strong>{stay.guestName || 'Guest'}</strong>
        <span className="hint">
          Room {stay.room}
          {detail ? ` · ${detail}` : ` · ${guestCountLabel(stay)}`}
        </span>
        {TIMING_LABEL[timing] ? <span className="badge">{TIMING_LABEL[timing]}</span> : null}
      </span>
      <span className="money">{inr(stay.status === 'out' ? bill.total : bill.total)}</span>
    </button>
  );
}

export function IdThumbs({ front, back, name }) {
  const [open, setOpen] = useState(null);
  if (!front && !back) return <p className="hint">No ID photos yet.</p>;
  return (
    <>
      <div className="id-grid">
        {front ? (
          <figure>
            <button type="button" className="id-thumb" onClick={() => setOpen({ src: front, alt: `${name} ID front` })}>
              <img src={front} alt={`${name} ID front`} />
            </button>
            <figcaption>Front</figcaption>
          </figure>
        ) : null}
        {back ? (
          <figure>
            <button type="button" className="id-thumb" onClick={() => setOpen({ src: back, alt: `${name} ID back` })}>
              <img src={back} alt={`${name} ID back`} />
            </button>
            <figcaption>Back</figcaption>
          </figure>
        ) : null}
      </div>
      {open ? (
        <div className="lightbox" role="dialog" aria-label={open.alt} onClick={() => setOpen(null)}>
          <img src={open.src} alt={open.alt} />
        </div>
      ) : null}
    </>
  );
}

export function Dialog({ title, children, onClose }) {
  useEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="dialog-backdrop" onClick={onClose} role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder }) {
  return (
    <input
      className="input search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      type="search"
      aria-label={placeholder}
    />
  );
}

export function timingLabel(timing) {
  return TIMING_LABEL[timing] || '';
}
