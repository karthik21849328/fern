import { useEffect, useRef } from 'react';
import { IconBack, IconClock, IconGear, IconHome, IconPlus, IconUsers, Mark } from './components.jsx';
import Dashboard from './pages/Dashboard.jsx';
import CheckIn from './pages/CheckIn.jsx';
import Guests from './pages/Guests.jsx';
import History from './pages/History.jsx';
import Settings from './pages/Settings.jsx';
import Stay from './pages/Stay.jsx';
import { AuthProvider, useAuth } from './auth.jsx';
import Login from './pages/Login.jsx';
import { ResortProvider, useResort } from './store.jsx';

const TABS = [
  { name: 'dashboard', label: 'Home', Icon: IconHome },
  { name: 'checkin', label: 'Check-in', Icon: IconPlus },
  { name: 'guests', label: 'In house', Icon: IconUsers },
  { name: 'history', label: 'History', Icon: IconClock },
];

function titleFor(route, stays) {
  if (route.name === 'dashboard') return 'Reception';
  if (route.name === 'checkin') return 'Check-in';
  if (route.name === 'guests') return 'In house';
  if (route.name === 'history') return 'History';
  if (route.name === 'settings') return 'Settings';
  if (route.name === 'stay') {
    const stay = stays.find((item) => item.id === route.id);
    if (!stay) return 'Stay';
    return stay.status === 'out' ? `Bill · ${stay.room}` : `Room ${stay.room}`;
  }
  return 'Fenni n Ferns Resort';
}

function Shell() {
  const { route, stays, toast, remoteError, go, back, dismissToast } = useResort();
  const mainRef = useRef(null);
  const title = titleFor(route, stays);
  const showBack = !['dashboard', 'checkin', 'guests', 'history'].includes(route.name);

  useEffect(() => {
    document.title = `${title} · Fenni n Ferns Resort`;
    window.scrollTo(0, 0);
    mainRef.current?.scrollTo(0, 0);
  }, [route.name, route.id, route.room, title]);

  return (
    <div className="app">
      <aside className="nav">
        <div className="brand">
          <Mark />
          <div className="brand-copy">
            <strong>Fenni n Ferns</strong>
            <span>Resort reception</span>
          </div>
        </div>
        <div className="nav-tabs">
          {TABS.map(({ name, label, Icon }) => {
            const active = route.name === name || (name === 'guests' && route.name === 'stay');
            return (
              <button
                key={name}
                type="button"
                className={`nav-btn${active ? ' active' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={() => go({ name })}
              >
                <Icon />
                {label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className={`nav-btn nav-footer${route.name === 'settings' ? ' active' : ''}`}
          onClick={() => go({ name: 'settings' })}
        >
          <IconGear />
          Settings
        </button>
      </aside>

      <div className="main-col" ref={mainRef}>
        <header className="topbar">
          {showBack ? (
            <button type="button" className="icon-btn" onClick={back} aria-label="Back">
              <IconBack />
            </button>
          ) : (
            <Mark />
          )}
          <p className="top-title">{title}</p>
          {route.name !== 'settings' ? (
            <button type="button" className="icon-btn settings-link" onClick={() => go({ name: 'settings' })} aria-label="Settings">
              <IconGear />
            </button>
          ) : <span className="icon-spacer" />}
        </header>
        {remoteError ? <div className="banner" role="alert">{remoteError}</div> : null}
        <main className="content">
          {route.name === 'dashboard' && <Dashboard />}
          {route.name === 'checkin' && <CheckIn key={route.room || 'blank'} initialRoom={route.room || ''} />}
          {route.name === 'guests' && <Guests />}
          {route.name === 'stay' && <Stay />}
          {route.name === 'history' && <History />}
          {route.name === 'settings' && <Settings />}
        </main>
      </div>

      {toast ? (
        <div className="toast" role="status">
          <span>{toast.message}</span>
          {toast.undo ? (
            <button type="button" onClick={() => { toast.undo(); dismissToast(); }}>Undo</button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Gate() {
  const { open } = useAuth();
  if (!open) return <Login />;
  return (
    <ResortProvider>
      <Shell />
    </ResortProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
