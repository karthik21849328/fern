import { createContext, useContext, useState } from 'react';

const KEY = 'Fenni n Ferns-desk-open';
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [open, setOpen] = useState(() => sessionStorage.getItem(KEY) === '1');

  function unlock() {
    sessionStorage.setItem(KEY, '1');
    setOpen(true);
  }

  function lock() {
    sessionStorage.removeItem(KEY);
    setOpen(false);
  }

  return <AuthContext.Provider value={{ open, unlock, lock }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
