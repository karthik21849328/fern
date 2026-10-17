import { useState } from 'react';
import { Field } from '../components.jsx';
import { useAuth } from '../auth.jsx';

export default function Login() {
  const { login } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    const value = password.trim();
    if (!value) {
      setError('Enter the desk password.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      await login(value);
    } catch (err) {
      setPassword('');
      setError(err?.status === 401 ? 'That password is not right.' : 'Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lock">
      <div className="lock-panel">
        <div className="lock-hero">
          <p className="eyebrow">Resort reception</p>
          <h1>Fenni n Ferns</h1>
          <p>Front desk</p>
        </div>
        <form className="lock-card" onSubmit={onSubmit}>
          <Field id="desk-password" label="Password">
            <input
              id="desk-password"
              className={`input${error ? ' invalid' : ''}`}
              type="password"
              autoComplete="current-password"
              autoFocus
              disabled={busy}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setError('');
              }}
            />
          </Field>
          {error ? <div className="error" role="alert">{error}</div> : <p className="hint">For reception staff.</p>}
          <button className="btn primary block" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Enter'}
          </button>
        </form>
      </div>
    </div>
  );
}
