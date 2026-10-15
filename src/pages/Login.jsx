import { useState } from 'react';
import { Field } from '../components.jsx';
import { useAuth } from '../auth.jsx';

const PASSWORD = '222';

export default function Login() {
  const { unlock } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  function onSubmit(event) {
    event.preventDefault();
    if (password.trim() === PASSWORD) {
      unlock();
      return;
    }
    setError(true);
    setPassword('');
  }

  return (
    <div className="lock">
      <div className="lock-panel">
        <div className="lock-hero">
          <p className="eyebrow">Resort reception</p>
          <h1>XYZ</h1>
          <p>Front desk</p>
        </div>
        <form className="lock-card" onSubmit={onSubmit}>
          <Field id="desk-password" label="Password">
            <input
              id="desk-password"
              className={`input${error ? ' invalid' : ''}`}
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setError(false);
              }}
            />
          </Field>
          {error ? <div className="error" role="alert">That password is not right.</div> : <p className="hint">For reception staff.</p>}
          <button className="btn primary block" type="submit">Enter</button>
        </form>
      </div>
    </div>
  );
}
