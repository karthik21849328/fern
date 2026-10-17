import { useState } from 'react';
import { Field, Segmented, Stepper } from '../components.jsx';
import { datesAreValid, nightCount } from '../lib/billing.js';
import { PAYMENT_MODES, SOURCES } from '../lib/constants.js';
import { fromDatetimeLocal, inr, nightsLabel, toDatetimeLocal } from '../lib/format.js';
import { compressImage } from '../lib/images.js';
import { useResort } from '../store.jsx';

function defaultCheckout() {
  const checkout = new Date();
  checkout.setDate(checkout.getDate() + 1);
  checkout.setHours(11, 0, 0, 0);
  return checkout;
}

function emptyForm(room, settings) {
  return {
    room: room || '',
    checkIn: toDatetimeLocal(new Date()),
    checkOut: toDatetimeLocal(defaultCheckout()),
    guestName: '',
    phone: '',
    address: '',
    adults: 1,
    children: 0,
    source: 'Walk-in',
    sourceOther: '',
    paymentMode: 'Cash',
    roomRate: settings.roomRate || 0,
    idFront: null,
    idBack: null,
  };
}

export default function CheckIn({ initialRoom = '' }) {
  const { settings, rooms, roomNumbers, vacantRooms, remoteLoading, checkIn, go, notify } = useResort();
  const [form, setForm] = useState(() => emptyForm(initialRoom, settings));
  const [errors, setErrors] = useState({});
  const [uploading, setUploading] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const occupiedByRoom = new Map(
    rooms.filter((room) => room.status === 'occupied').map((room) => [room.room, room]),
  );
  const checkInIso = fromDatetimeLocal(form.checkIn);
  const checkOutIso = fromDatetimeLocal(form.checkOut);
  const datesOk = datesAreValid(checkInIso, checkOutIso);
  const nights = datesOk ? nightCount(checkInIso, checkOutIso) : 0;
  const rate = Number(form.roomRate);
  const roomCharge = datesOk && rate > 0 ? nights * rate : 0;

  function setField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function onPhoto(side, file) {
    if (!file) return;
    setUploading(side);
    try {
      const url = await compressImage(file);
      setField(side, url);
      setErrors((current) => ({ ...current, [side]: '' }));
    } catch {
      setErrors((current) => ({ ...current, [side]: 'Could not read that photo. Try another image.' }));
    } finally {
      setUploading('');
    }
  }

  function validate() {
    const next = {};
    if (!form.room) next.room = 'Choose a room';
    else if (!roomNumbers.includes(form.room)) next.room = 'Choose a room from the list';
    else if (occupiedByRoom.has(form.room)) next.room = 'That room already has a guest';
    if (!datesOk) next.checkOut = 'Check-out must be after check-in';
    if (!form.guestName.trim() || form.guestName.trim().length < 2) next.guestName = 'Enter the guest name';
    if (form.phone.replace(/\D/g, '').length < 8) next.phone = 'Enter a valid phone number';
    if (!form.address.trim()) next.address = 'Enter the address';
    if (form.adults < 1) next.adults = 'At least one adult is required';
    if (form.source === 'Other' && !form.sourceOther.trim()) next.sourceOther = 'Say where they checked in from';
    if (!PAYMENT_MODES.includes(form.paymentMode)) next.paymentMode = 'Choose cash, UPI, or card';
    if (!Number.isFinite(rate) || rate <= 0) next.roomRate = 'Enter the nightly rate';
    return next;
  }

  async function onSubmit(event) {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    setSubmitError('');
    if (Object.keys(nextErrors).length > 0) return;

    const selectedRoom = rooms.find((room) => room.room === form.room);
    if (!selectedRoom?.id) {
      setSubmitError('Choose a room from the server list.');
      return;
    }
    if (selectedRoom.status === 'occupied') {
      setSubmitError('That room already has a guest.');
      return;
    }

    setSubmitting(true);
    try {
      const guestName = form.guestName.trim().replace(/\s+/g, ' ');
      const stay = await checkIn({
        room: form.room,
        roomUuid: selectedRoom.id,
        guestName,
        phone: form.phone.trim(),
        address: form.address.trim(),
        adults: form.adults,
        children: form.children,
        checkIn: checkInIso,
        checkOut: checkOutIso,
        source: form.source === 'Other' ? form.sourceOther.trim() : form.source,
        paymentMode: form.paymentMode,
        roomRate: rate,
        idFront: form.idFront,
        idBack: form.idBack,
      });
      if (!stay?.id) {
        setSubmitError('Check-in may have saved, but stay details were missing. Refresh Home and open the room.');
        return;
      }
      notify(`Checked ${stay.guestName || guestName} into room ${stay.room || form.room}`);
      go({ name: 'stay', id: stay.id });
    } catch (err) {
      setSubmitError(err?.message || 'Check-in failed. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      <div>
        <h1 className="page-title">Check in</h1>
        <p className="lede">Room, guest, where they came from, and how they will pay. Extras can be added on the stay.</p>
      </div>
      {Object.keys(errors).length > 0 ? <div className="form-error" role="alert">Please fix the highlighted fields.</div> : null}
      {submitError ? <div className="form-error" role="alert">{submitError}</div> : null}

      <section className="card stack tight">
        <h2>Room</h2>
        <div className="room-grid compact" role="radiogroup" aria-label="Room">
          {rooms.map((room) => {
            const taken = room.status === 'occupied';
            const selected = form.room === room.room;
            return (
              <button
                key={room.id}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={taken}
                className={`room-card pick${selected ? ' is-in' : ''}${taken ? ' is-taken' : ''}`}
                onClick={() => setField('room', room.room)}
              >
                <span className="room-no">{room.room}</span>
                <span className="room-meta">{taken ? room.stay?.guestName || 'Occupied' : 'Free'}</span>
              </button>
            );
          })}
        </div>
        {remoteLoading && rooms.length === 0 ? <p className="hint">Loading rooms…</p> : null}
        {!remoteLoading && rooms.length === 0 ? <p className="hint">No active rooms are available from the server.</p> : null}
        {!remoteLoading && vacantRooms.length === 0 && rooms.length > 0 ? <p className="hint">All rooms are occupied. Check a guest out to free a room.</p> : null}
        {errors.room ? <div className="error">{errors.room}</div> : null}
      </section>

      <section className="card stack">
        <h2>Stay</h2>
        <div className="split two">
          <Field id="check-in" label="Check-in" error={errors.checkIn}>
            <input id="check-in" className="input" type="datetime-local" value={form.checkIn} onChange={(event) => setField('checkIn', event.target.value)} />
          </Field>
          <Field id="check-out" label="Check-out" error={errors.checkOut}>
            <input id="check-out" className={`input${errors.checkOut ? ' invalid' : ''}`} type="datetime-local" value={form.checkOut} onChange={(event) => setField('checkOut', event.target.value)} />
          </Field>
        </div>
        <Field id="rate" label="Room rate per night (₹)" error={errors.roomRate} hint="Copied onto this stay. Later price changes will not rewrite it.">
          <input
            id="rate"
            className={`input${errors.roomRate ? ' invalid' : ''}`}
            type="number"
            min="1"
            inputMode="numeric"
            value={form.roomRate}
            onChange={(event) => setField('roomRate', event.target.value)}
          />
        </Field>
        {datesOk && rate > 0 ? (
          <div className="preview-bill">
            <span>{nightsLabel(nights)} in room {form.room || '—'}</span>
            <strong>{inr(roomCharge)}</strong>
          </div>
        ) : null}
      </section>

      <section className="card stack">
        <h2>Guest</h2>
        <Field id="guest-name" label="Guest name" error={errors.guestName}>
          <input id="guest-name" className={`input${errors.guestName ? ' invalid' : ''}`} value={form.guestName} onChange={(event) => setField('guestName', event.target.value)} placeholder="Full name" autoComplete="name" autoCapitalize="words" />
        </Field>
        <Field id="phone" label="Phone number" error={errors.phone}>
          <input id="phone" className={`input${errors.phone ? ' invalid' : ''}`} value={form.phone} onChange={(event) => setField('phone', event.target.value)} placeholder="10-digit mobile" autoComplete="tel" inputMode="tel" />
        </Field>
        <Field id="address" label="Address" error={errors.address}>
          <textarea id="address" className={`textarea${errors.address ? ' invalid' : ''}`} value={form.address} onChange={(event) => setField('address', event.target.value)} placeholder="Area, city" autoComplete="street-address" />
        </Field>
        <div className="split always">
          <Field label="Adults">
            <Stepper label="adults" value={form.adults} min={1} max={20} onChange={(value) => setField('adults', value)} />
          </Field>
          <Field label="Children">
            <Stepper label="children" value={form.children} min={0} max={20} onChange={(value) => setField('children', value)} />
          </Field>
        </div>
        <p className="hint">{form.adults + form.children === 1 ? '1 guest in total' : `${form.adults + form.children} guests in total`}</p>
      </section>

      <section className="card stack">
        <h2>Arrival</h2>
        <Field id="source" label="Checked in from" hint="Walk-in, phone, or a booking site.">
          <select id="source" className="select" value={form.source} onChange={(event) => setField('source', event.target.value)}>
            {SOURCES.map((source) => <option key={source}>{source}</option>)}
            <option>Other</option>
          </select>
        </Field>
        {form.source === 'Other' ? (
          <Field id="source-other" label="Where from?" error={errors.sourceOther}>
            <input id="source-other" className={`input${errors.sourceOther ? ' invalid' : ''}`} value={form.sourceOther} onChange={(event) => setField('sourceOther', event.target.value)} placeholder="Booking source" />
          </Field>
        ) : null}
        <Field label="Payment mode" error={errors.paymentMode} hint="Cash, UPI, or card.">
          <Segmented label="Payment mode" value={form.paymentMode} options={PAYMENT_MODES} onChange={(value) => setField('paymentMode', value)} />
        </Field>
      </section>

      <section className="card stack">
        <h2>Photo ID</h2>
        <p className="hint">Optional. Aadhaar or any other photo ID, front and back.</p>
        <div className="id-grid">
          <IdUpload
            label="Front"
            preview={form.idFront}
            uploading={uploading === 'idFront'}
            error={errors.idFront}
            onFile={(file) => onPhoto('idFront', file)}
            onClear={() => setField('idFront', null)}
          />
          <IdUpload
            label="Back"
            preview={form.idBack}
            uploading={uploading === 'idBack'}
            error={errors.idBack}
            onFile={(file) => onPhoto('idBack', file)}
            onClear={() => setField('idBack', null)}
          />
        </div>
      </section>

      <div className="dock">
        <div>
          <span className="hint">Room charge</span>
          <strong className="money">{roomCharge ? inr(roomCharge) : '—'}</strong>
        </div>
        <button className="btn primary" type="submit" disabled={Boolean(uploading) || submitting || vacantRooms.length === 0}>
          {uploading ? 'Reading photo…' : submitting ? 'Checking in…' : 'Check in'}
        </button>
      </div>
    </form>
  );
}

function IdUpload({ label, preview, uploading, error, onFile, onClear }) {
  return (
    <div className="id-slot-wrap">
      <label className="id-slot">
        <input
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            onFile(file);
          }}
        />
        {preview ? <img src={preview} alt={`${label} of the ID`} /> : <span>{uploading ? 'Reading photo…' : `Tap to add ${label.toLowerCase()}`}</span>}
      </label>
      <div className="id-caption">
        <span>{label}</span>
        {preview ? <button type="button" className="text-btn" onClick={onClear}>Remove</button> : null}
      </div>
      {error ? <div className="error">{error}</div> : null}
    </div>
  );
}
