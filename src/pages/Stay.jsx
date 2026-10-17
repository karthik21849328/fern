import { useState } from 'react';
import { BillView, Dialog, Field, IdThumbs, Segmented, Stepper } from '../components.jsx';
import { billFor, billedThrough, datesAreValid } from '../lib/billing.js';
import { PAYMENT_MODES } from '../lib/constants.js';
import { formatFull, formatWhen, fromDatetimeLocal, inr, toDatetimeLocal } from '../lib/format.js';
import { useResort } from '../store.jsx';

export default function Stay() {
  const { route, stays, go } = useResort();
  const stay = stays.find((item) => item.id === route.id);
  if (!stay) {
    return (
      <div className="card stack">
        <p>This stay could not be found.</p>
        <button type="button" className="btn primary" onClick={() => go({ name: 'dashboard' })}>Back to rooms</button>
      </div>
    );
  }
  if (stay.status === 'out') return <Receipt stay={stay} />;
  return <OpenStay stay={stay} />;
}

function OpenStay({ stay }) {
  const { settings, rooms, roomNumbers, staffNames, checkoutStay, updateStay, removeExtra, restoreExtra, removeStay, go, notify } = useResort();
  const [settling, setSettling] = useState(false);
  const [billThrough, setBillThrough] = useState(() => toDatetimeLocal(billedThrough(stay)));
  const [payMode, setPayMode] = useState(stay.paymentMode);
  const [discount, setDiscount] = useState(String(stay.discount || 0));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');

  const occupied = new Set(rooms.filter((room) => room.status === 'occupied' && room.room !== stay.room).map((room) => room.room));
  const throughIso = settling ? fromDatetimeLocal(billThrough) : billedThrough(stay);
  const discountValue = settling ? Number(discount) || 0 : stay.discount;
  const bill = billFor(stay, new Date(), { through: throughIso, discount: discountValue });
  const canSettle = datesAreValid(stay.checkIn, throughIso) && bill.nights > 0;

  function openSettle() {
    setPayMode(stay.paymentMode);
    setDiscount(String(stay.discount || 0));
    setBillThrough(toDatetimeLocal(billedThrough(stay)));
    setCheckoutError('');
    setSettling(true);
  }

  async function complete() {
    if (!canSettle || checkingOut) return;
    setCheckingOut(true);
    setCheckoutError('');
    try {
      const result = await checkoutStay({
        stayId: stay.id,
        billThrough: throughIso,
        discount: bill.discount,
        paymentMode: payMode,
      });
      const total = result?.bill?.total ?? bill.total;
      notify(`Collected ${inr(total)} from ${stay.guestName || 'guest'}`);
    } catch (err) {
      setCheckoutError(err?.message || 'Checkout failed. Try again.');
    } finally {
      setCheckingOut(false);
    }
  }

  return (
    <div className="stack">
      <div>
        <p className="eyebrow">Room {stay.room}</p>
        <h1 className="page-title">{stay.guestName || 'Guest'}</h1>
        <p className="lede">
          <a href={`tel:${stay.phone}`}>{stay.phone}</a>
          {' · '}
          {stay.source}
        </p>
      </div>

      {!settling ? <BillView stay={stay} bill={bill} paymentMode={stay.paymentMode} /> : null}

      <ExtraForm stay={stay} onRemove={async (extra) => {
        try {
          await removeExtra(stay.id, extra.id);
          notify(`${extra.name} removed`, () => {
            restoreExtra(stay.id, extra).catch(() => {});
          });
        } catch (err) {
          notify(err?.message || 'Could not remove extra');
        }
      }} />

      <details className="fold">
        <summary>Guest details</summary>
        <div className="stack">
          <Field id="edit-name" label="Guest name">
            <input id="edit-name" className="input" value={stay.guestName} onChange={(event) => updateStay(stay.id, { guestName: event.target.value })} />
          </Field>
          <Field id="edit-phone" label="Phone">
            <input id="edit-phone" className="input" value={stay.phone} onChange={(event) => updateStay(stay.id, { phone: event.target.value })} inputMode="tel" />
          </Field>
          <Field id="edit-address" label="Address">
            <textarea id="edit-address" className="textarea" value={stay.address} onChange={(event) => updateStay(stay.id, { address: event.target.value })} />
          </Field>
          <div className="split always">
            <Field label="Adults">
              <Stepper label="adults" value={stay.adults} min={1} max={20} onChange={(value) => updateStay(stay.id, { adults: value })} />
            </Field>
            <Field label="Children">
              <Stepper label="children" value={stay.children} min={0} max={20} onChange={(value) => updateStay(stay.id, { children: value })} />
            </Field>
          </div>
          <Field id="edit-source" label="Checked in from">
            <input id="edit-source" className="input" value={stay.source} onChange={(event) => updateStay(stay.id, { source: event.target.value })} />
          </Field>
          <div>
            <div className="label">Photo ID</div>
            <IdThumbs front={stay.idFront} back={stay.idBack} name={stay.guestName || 'Guest'} />
          </div>
        </div>
      </details>

      <details className="fold">
        <summary>Dates and rate</summary>
        <div className="stack">
          <Field id="edit-in" label="Check-in">
            <input id="edit-in" className="input" type="datetime-local" value={toDatetimeLocal(stay.checkIn)} onChange={(event) => {
              const iso = fromDatetimeLocal(event.target.value);
              if (iso) updateStay(stay.id, { checkIn: iso });
            }} />
          </Field>
          <Field id="edit-out" label="Planned check-out" hint="The bill runs through this time, or through now if the guest has stayed longer.">
            <input id="edit-out" className="input" type="datetime-local" value={toDatetimeLocal(stay.checkOut)} onChange={(event) => {
              const iso = fromDatetimeLocal(event.target.value);
              if (iso) updateStay(stay.id, { checkOut: iso });
            }} />
          </Field>
          <Field id="edit-rate" label="Rate per night (₹)">
            <input id="edit-rate" className="input" type="number" min="0" value={stay.roomRate} onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next)) updateStay(stay.id, { roomRate: next });
            }} />
          </Field>
          <Field id="edit-room" label="Room">
            <select id="edit-room" className="select" value={stay.room} onChange={(event) => updateStay(stay.id, { room: event.target.value })}>
              {[stay.room, ...roomNumbers.filter((room) => room !== stay.room && !occupied.has(String(room)))].map((room) => (
                <option key={room}>{room}</option>
              ))}
            </select>
          </Field>
          <Field label="Payment mode">
            <Segmented label="Payment mode" value={stay.paymentMode} options={PAYMENT_MODES} onChange={(value) => updateStay(stay.id, { paymentMode: value })} />
          </Field>
        </div>
      </details>

      {settling ? (
        <section className="card stack">
          <h2>Settle bill</h2>
          <p className="hint">Nights are counted from the check-in date to the date below. Booked nights stay on the bill if the guest leaves early. Use “Charge until now” to shorten it. A later date adds nights.</p>
          <Field id="bill-through" label="Bill through">
            <input id="bill-through" className="input" type="datetime-local" value={billThrough} onChange={(event) => setBillThrough(event.target.value)} />
          </Field>
          <button type="button" className="btn ghost" onClick={() => setBillThrough(toDatetimeLocal(new Date()))}>Charge until now</button>
          <Field id="discount" label="Discount (₹)">
            <input id="discount" className="input" type="number" min="0" inputMode="decimal" value={discount} onChange={(event) => setDiscount(event.target.value)} />
          </Field>
          <Field label="Payment mode">
            <Segmented label="Payment mode" value={payMode} options={PAYMENT_MODES} onChange={setPayMode} />
          </Field>
          <BillView stay={{ ...stay, status: 'in' }} bill={bill} paymentMode={payMode} />
          {checkoutError ? <div className="error" role="alert">{checkoutError}</div> : null}
        </section>
      ) : null}

      <div className="dock no-print">
        <div>
          <span className="hint">{settling ? 'Collect' : 'To collect'}</span>
          <strong className="money">{canSettle || !settling ? inr(bill.total) : '—'}</strong>
        </div>
        {settling ? (
          <div className="dock-actions">
            <button type="button" className="btn ghost" disabled={checkingOut} onClick={() => setSettling(false)}>Back</button>
            <button type="button" className="btn primary" disabled={!canSettle || checkingOut} onClick={complete}>
              {checkingOut ? 'Saving…' : 'Complete'}
            </button>
          </div>
        ) : (
          <button type="button" className="btn primary" onClick={openSettle}>Check out</button>
        )}
      </div>

      {!settling ? (
        <button type="button" className="btn ghost danger-text" onClick={() => setConfirmDelete(true)}>Delete this check-in</button>
      ) : null}

      {confirmDelete ? (
        <Dialog title="Delete this check-in?" onClose={() => setConfirmDelete(false)}>
          <p>Room {stay.room} will be freed. Extras on this stay will be removed with it.</p>
          <div className="dialog-actions">
            <button type="button" className="btn ghost" onClick={() => setConfirmDelete(false)}>Keep stay</button>
            <button type="button" className="btn danger" onClick={() => {
              removeStay(stay.id);
              notify('Check-in deleted');
              go({ name: 'dashboard' });
            }}>Delete</button>
          </div>
        </Dialog>
      ) : null}

      <p className="hint">Catalog prices for new extras come from Settings. {staffNames.length ? `${staffNames.join(' and ')} are on the added-by list.` : 'Staff names load from the server.'}</p>
    </div>
  );
}

function ExtraForm({ stay, onRemove }) {
  const { settings, staffNames, addExtra, go, notify } = useResort();
  const [draft, setDraft] = useState({
    custom: false,
    itemId: '',
    name: '',
    qty: 1,
    unitPrice: '',
    addedBy: '',
    other: false,
    otherName: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function chooseItem(item) {
    setDraft((current) => ({
      ...current,
      custom: false,
      itemId: item.id,
      name: item.name,
      unitPrice: String(item.price),
    }));
    setError('');
  }

  async function onAddExtra(event) {
    event.preventDefault();
    const name = draft.name.trim();
    const price = Number(draft.unitPrice);
    const who = (draft.other ? draft.otherName : draft.addedBy).trim();
    if (!name) {
      setError('Choose an item or type one.');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setError('Enter a price. Use 0 for a complimentary item.');
      return;
    }
    if (!who) {
      setError('Choose who added this.');
      return;
    }
    const extra = {
      id: crypto.randomUUID(),
      name,
      qty: draft.qty,
      unitPrice: price,
      addedBy: who,
      addedAt: new Date().toISOString(),
    };
    setSaving(true);
    setError('');
    try {
      await addExtra(stay.id, extra);
      notify(`${name} added by ${who}`);
      go({ name: 'dashboard' });
    } catch (err) {
      setError(err?.message || 'Could not save extra. Redeploy fern03 with extras support.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card stack">
      <h2>Extras</h2>
      <p className="hint">Water, juice, chocolate, or anything else from the desk. Each line records who added it.</p>
      {stay.extras.length === 0 ? <p className="empty">Nothing added yet.</p> : (
        <div>
          {stay.extras.map((extra) => (
            <div className="extra-row" key={extra.id}>
              <div>
                <strong>{extra.name} × {extra.qty}</strong>
                <div className="hint">{extra.addedBy} · {formatWhen(extra.addedAt)} · {inr(extra.unitPrice)} each</div>
              </div>
              <div className="extra-side">
                <span>{inr(extra.qty * extra.unitPrice)}</span>
                <button type="button" className="text-btn" onClick={() => onRemove(extra)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <form className="stack" onSubmit={onAddExtra}>
        <div className="chip-row" role="listbox" aria-label="Extra items">
          {settings.catalog.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`chip${!draft.custom && draft.itemId === item.id ? ' on' : ''}`}
              onClick={() => chooseItem(item)}
            >
              {item.name} · {inr(item.price)}
            </button>
          ))}
          <button
            type="button"
            className={`chip${draft.custom ? ' on' : ''}`}
            onClick={() => setDraft((current) => ({ ...current, custom: true, itemId: '', name: '', unitPrice: '' }))}
          >
            Custom
          </button>
        </div>
        {draft.custom ? (
          <Field id="custom-name" label="Item name">
            <input id="custom-name" className="input" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Snacks, laundry, cab…" />
          </Field>
        ) : null}
        <div className="split two">
          <Field label="Quantity">
            <Stepper label="quantity" value={draft.qty} min={1} max={99} onChange={(qty) => setDraft((current) => ({ ...current, qty }))} />
          </Field>
          <Field id="extra-price" label="Price each (₹)">
            <input id="extra-price" className="input" type="number" min="0" inputMode="decimal" value={draft.unitPrice} onChange={(event) => setDraft((current) => ({ ...current, unitPrice: event.target.value }))} />
          </Field>
        </div>
        <Field id="added-by" label="Added by">
          <select
            id="added-by"
            className="select"
            value={draft.other ? '__other' : draft.addedBy}
            onChange={(event) => {
              if (event.target.value === '__other') setDraft((current) => ({ ...current, other: true, addedBy: '' }));
              else setDraft((current) => ({ ...current, other: false, otherName: '', addedBy: event.target.value }));
            }}
          >
            <option value="">Select staff</option>
            {staffNames.map((name) => <option key={name} value={name}>{name}</option>)}
            <option value="__other">Someone else</option>
          </select>
        </Field>
        {draft.other ? (
          <Field id="other-staff" label="Staff name">
            <input id="other-staff" className="input" value={draft.otherName} onChange={(event) => setDraft((current) => ({ ...current, otherName: event.target.value }))} placeholder="Name" />
          </Field>
        ) : null}
        {error ? <div className="error">{error}</div> : null}
        <button className="btn primary block" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add to bill'}</button>
      </form>
    </section>
  );
}

function Receipt({ stay }) {
  const { removeStay, go, notify } = useResort();
  const bill = billFor(stay);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="stack sheet">
      <div>
        <p className="eyebrow">Fenni n Ferns Resort</p>
        <h1 className="page-title">Guest bill</h1>
        <p className="lede">Room {stay.room} · {stay.paymentMode}</p>
      </div>
      <BillView stay={stay} bill={bill} paymentMode={stay.paymentMode} />
      <section className="card stack tight">
        <h2>{stay.guestName || 'Guest'}</h2>
        <p>{stay.phone}</p>
        <p className="address">{stay.address}</p>
        <p className="hint">Checked in from {stay.source}</p>
        <p className="hint">Arrived {formatFull(stay.checkIn)}</p>
        <p className="hint">Billed through {formatFull(stay.checkOut)}</p>
        {stay.actualCheckOut ? <p className="hint">Settled {formatFull(stay.actualCheckOut)}</p> : null}
      </section>
      <div className="no-print">
        <IdThumbs front={stay.idFront} back={stay.idBack} name={stay.guestName || 'Guest'} />
      </div>
      <div className="row-actions no-print">
        <button type="button" className="btn ghost" onClick={() => window.print()}>Print bill</button>
        <button type="button" className="btn primary" onClick={() => go({ name: 'dashboard' })}>Done</button>
      </div>
      <button type="button" className="btn ghost danger-text no-print" onClick={() => setConfirmDelete(true)}>Delete this record</button>
      {confirmDelete ? (
        <Dialog title="Delete this bill?" onClose={() => setConfirmDelete(false)}>
          <p>This removes the stay from history on this device.</p>
          <div className="dialog-actions">
            <button type="button" className="btn ghost" onClick={() => setConfirmDelete(false)}>Keep</button>
            <button type="button" className="btn danger" onClick={() => {
              removeStay(stay.id);
              notify('Record deleted');
              go({ name: 'history' });
            }}>Delete</button>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
