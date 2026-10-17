import { useState } from 'react';
import { Dialog, Field } from '../components.jsx';
import { inr } from '../lib/format.js';
import { useAuth } from '../auth.jsx';
import { useResort } from '../store.jsx';

export default function Settings() {
  const {
    settings,
    rooms,
    staff,
    remoteLoading,
    refreshRemote,
    updateSettings,
    resetAll,
    notify,
    go,
  } = useResort();
  const { lock } = useAuth();
  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function onRefresh() {
    setRefreshing(true);
    await refreshRemote();
    setRefreshing(false);
    notify('Rooms and staff refreshed from server');
  }

  function addItem(event) {
    event.preventDefault();
    const name = itemName.trim();
    const price = Number(itemPrice);
    if (!name || !Number.isFinite(price) || price < 0) {
      notify('Enter an item name and price');
      return;
    }
    updateSettings({
      catalog: [...settings.catalog, { id: crypto.randomUUID(), name, price }],
    });
    setItemName('');
    setItemPrice('');
  }

  const roomLabel = rooms.length
    ? rooms.map((room) => room.room).join(', ')
    : 'none loaded yet';

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">Settings</h1>
        <p className="lede">Rooms, staff, and occupancy come from the server. Guest records are not stored in this browser.</p>
      </div>

      <section className="card stack">
        <h2>Room rate</h2>
        <Field id="room-rate" label="Default nightly rate (₹)" hint="Used for the next check-in form. Already checked-in guests keep the rate saved on the server.">
          <input
            id="room-rate"
            className="input"
            type="number"
            min="0"
            value={settings.roomRate}
            onChange={(event) => {
              const value = event.target.value;
              if (value === '') updateSettings({ roomRate: 0 });
              else if (Number.isFinite(Number(value))) updateSettings({ roomRate: Number(value) });
            }}
          />
        </Field>
        <p className="hint">Current default {inr(settings.roomRate)} per night. Active rooms: {roomLabel}.</p>
      </section>

      <section className="card stack">
        <h2>Extras menu</h2>
        <p className="hint">Local menu for this session only. Used when adding water, juice, and other items on a stay.</p>
        {settings.catalog.map((item) => (
          <div className="catalog-row" key={item.id}>
            <input
              className="input"
              aria-label={`${item.name} name`}
              value={item.name}
              onChange={(event) => updateSettings({
                catalog: settings.catalog.map((row) => (row.id === item.id ? { ...row, name: event.target.value } : row)),
              })}
            />
            <input
              className="input"
              aria-label={`${item.name} price`}
              type="number"
              min="0"
              value={item.price}
              onChange={(event) => updateSettings({
                catalog: settings.catalog.map((row) => (row.id === item.id ? { ...row, price: Number(event.target.value) } : row)),
              })}
            />
            <button
              type="button"
              className="btn small ghost"
              onClick={() => updateSettings({ catalog: settings.catalog.filter((row) => row.id !== item.id) })}
            >
              Remove
            </button>
          </div>
        ))}
        <form className="catalog-row" onSubmit={addItem}>
          <input className="input" value={itemName} onChange={(event) => setItemName(event.target.value)} placeholder="New item" aria-label="New extra name" />
          <input className="input" type="number" min="0" value={itemPrice} onChange={(event) => setItemPrice(event.target.value)} placeholder="Price" aria-label="New extra price" />
          <button className="btn small primary" type="submit">Add</button>
        </form>
      </section>

      <section className="card stack">
        <div className="section-head">
          <h2>Staff</h2>
          <button type="button" className="text-btn" disabled={refreshing || remoteLoading} onClick={onRefresh}>
            {refreshing || remoteLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        <p className="hint">Loaded from the server. These names appear in the “Added by” list on a stay.</p>
        {staff.length === 0 ? (
          <p className="empty">{remoteLoading ? 'Loading staff…' : 'No active staff came back from the server.'}</p>
        ) : (
          staff.map((person) => (
            <div className="staff-row" key={person.id}>
              <span>{person.name}</span>
              <span className="hint">Active</span>
            </div>
          ))
        )}
      </section>

      <section className="card stack">
        <h2>Rooms from server</h2>
        {rooms.length === 0 ? (
          <p className="empty">{remoteLoading ? 'Loading rooms…' : 'No active rooms came back from the server.'}</p>
        ) : (
          rooms.map((room) => (
            <div className="staff-row" key={room.id}>
              <span>Room {room.room}</span>
              <span className="hint">
                {[
                  room.status === 'occupied' ? `Occupied${room.stay?.guestName ? ` · ${room.stay.guestName}` : ''}` : 'Vacant',
                  room.metadata?.type,
                  room.metadata?.floor != null ? `Floor ${room.metadata.floor}` : '',
                ].filter(Boolean).join(' · ')}
              </span>
            </div>
          ))
        )}
      </section>

      <div className="row-actions">
        <button type="button" className="btn ghost" onClick={lock}>Lock desk</button>
        <button type="button" className="btn danger" onClick={() => setConfirmReset(true)}>Reset local extras menu</button>
      </div>

      {confirmReset ? (
        <Dialog title="Reset extras menu?" onClose={() => setConfirmReset(false)}>
          <p>This resets the local extras prices and reloads rooms from the server. Guest data stays on the server.</p>
          <div className="dialog-actions">
            <button type="button" className="btn ghost" onClick={() => setConfirmReset(false)}>Cancel</button>
            <button type="button" className="btn danger" onClick={() => {
              resetAll();
              setConfirmReset(false);
              notify('Local menu reset');
              go({ name: 'dashboard' });
            }}>Reset</button>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
