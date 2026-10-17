import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { loginWithPassword } from './lib/api.js';

const TOKEN_KEY = 'Fenni n Ferns-desk-token';
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || '');
  const open = Boolean(token);

  const login = useCallback(async (password) => {
    const nextToken = await loginWithPassword(password);
    sessionStorage.setItem(TOKEN_KEY, nextToken);
    setToken(nextToken);
    return nextToken;
  }, []);

  const lock = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem('Fenni n Ferns-desk-open');
    setToken('');
  }, []);

  const value = useMemo(() => ({ open, token, login, lock }), [open, token, login, lock]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
