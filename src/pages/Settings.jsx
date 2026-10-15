import { useState } from 'react';
import { Dialog, Field } from '../components.jsx';
import { inr } from '../lib/format.js';
import { useAuth } from '../auth.jsx';
import { useResort } from '../store.jsx';

export default function Settings() {
  const { stays, settings, updateSettings, importState, resetAll, notify, go } = useResort();
  const { lock } = useAuth();
  const [staffName, setStaffName] = useState('');
  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [pendingImport, setPendingImport] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);

  function addStaff(event) {
    event.preventDefault();
    const name = staffName.trim().replace(/\s+/g, ' ');
    if (!name) return;
    if (settings.staff.some((item) => item.toLowerCase() === name.toLowerCase())) {
      notify('That name is already on the list');
      return;
    }
    updateSettings({ staff: [...settings.staff, name] });
    setStaffName('');
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

  function exportBackup() {
    const blob = new Blob([JSON.stringify({ stays, settings }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Fenni n Ferns-resort-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    notify('Backup downloaded');
  }

  function onImportFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (!Array.isArray(data.stays)) throw new Error('bad');
        setPendingImport(data);
      } catch {
        notify('That file is not a valid backup');
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">Settings</h1>
        <p className="lede">Rates and staff for Fenni n Ferns Resort. Guest records stay in this browser on this device.</p>
      </div>

      <section className="card stack">
        <h2>Room rate</h2>
        <Field id="room-rate" label="Default nightly rate (₹)" hint="Used for the next check-in. Guests already in house keep their own rate.">
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
        <p className="hint">Current default {inr(settings.roomRate)} per night. Rooms are 101, 102, 103, 104, 105, and 106.</p>
      </section>

      <section className="card stack">
        <h2>Extras menu</h2>
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
        <h2>Staff</h2>
        <p className="hint">These names appear in the “Added by” list when something is put on a bill.</p>
        {settings.staff.map((name) => (
          <div className="staff-row" key={name}>
            <span>{name}</span>
            <button
              type="button"
              className="btn small ghost"
              disabled={settings.staff.length === 1}
              onClick={() => updateSettings({ staff: settings.staff.filter((item) => item !== name) })}
            >
              Remove
            </button>
          </div>
        ))}
        <form className="staff-add" onSubmit={addStaff}>
          <input className="input" value={staffName} onChange={(event) => setStaffName(event.target.value)} placeholder="Add a name" aria-label="Staff name" />
          <button className="btn primary" type="submit">Add</button>
        </form>
      </section>

      <section className="card stack">
        <h2>Backup</h2>
        <p className="hint">Download a copy before clearing the browser. Import replaces what is on this device.</p>
        <div className="row-actions">
          <button type="button" className="btn ghost" onClick={exportBackup}>Export backup</button>
          <label className="btn ghost">
            Import backup
            <input
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                onImportFile(file);
              }}
            />
          </label>
        </div>
      </section>

      <div className="row-actions">
        <button type="button" className="btn ghost" onClick={lock}>Lock desk</button>
        <button type="button" className="btn danger" onClick={() => setConfirmReset(true)}>Erase all data</button>
      </div>

      {pendingImport ? (
        <Dialog title="Replace current records?" onClose={() => setPendingImport(null)}>
          <p>This overwrites stays and settings on this device with the backup file.</p>
          <div className="dialog-actions">
            <button type="button" className="btn ghost" onClick={() => setPendingImport(null)}>Cancel</button>
            <button type="button" className="btn primary" onClick={() => {
              try {
                importState(pendingImport);
                setPendingImport(null);
                notify('Backup restored');
                go({ name: 'dashboard' });
              } catch {
                setPendingImport(null);
                notify('That file is not a valid backup');
              }
            }}>Replace</button>
          </div>
        </Dialog>
      ) : null}

      {confirmReset ? (
        <Dialog title="Erase everything?" onClose={() => setConfirmReset(false)}>
          <p>All stays and your price changes will be removed from this browser.</p>
          <div className="dialog-actions">
            <button type="button" className="btn ghost" onClick={() => setConfirmReset(false)}>Cancel</button>
            <button type="button" className="btn danger" onClick={() => {
              resetAll();
              setConfirmReset(false);
              notify('All data cleared');
              go({ name: 'dashboard' });
            }}>Erase</button>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
