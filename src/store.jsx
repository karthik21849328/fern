import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createDefaultSettings, loadState, sanitizeState, saveState } from './lib/storage.js';

const ResortContext = createContext(null);

export function ResortProvider({ children }) {
  const [state, setState] = useState(loadState);
  const [route, setRoute] = useState({ name: 'dashboard' });
  const [toast, setToast] = useState(null);
  const [storageError, setStorageError] = useState('');
  const toastTimer = useRef(null);

  useEffect(() => {
    try {
      saveState(state);
      setStorageError('');
    } catch {
      setStorageError('This browser is out of space. Export a backup, then remove an ID photo or an old stay.');
    }
  }, [state]);

  const notify = useCallback((message, undo) => {
    setToast({ message, undo: undo || null });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const go = useCallback((next) => setRoute(next), []);

  const back = useCallback(() => {
    setRoute((current) => {
      if (current.name === 'stay') return { name: 'guests' };
      return { name: 'dashboard' };
    });
  }, []);

  const checkIn = useCallback((input) => {
    const stay = {
      ...input,
      id: crypto.randomUUID(),
      status: 'in',
      extras: [],
      discount: 0,
      createdAt: new Date().toISOString(),
      actualCheckOut: null,
    };
    setState((current) => ({ ...current, stays: [stay, ...current.stays] }));
    return stay;
  }, []);

  const updateStay = useCallback((id, patch) => {
    setState((current) => ({
      ...current,
      stays: current.stays.map((stay) => (stay.id === id ? { ...stay, ...patch } : stay)),
    }));
  }, []);

  const restoreExtra = useCallback((stayId, extra) => {
    setState((current) => ({
      ...current,
      stays: current.stays.map((stay) => {
        if (stay.id !== stayId) return stay;
        if (stay.extras.some((item) => item.id === extra.id)) return stay;
        return { ...stay, extras: [...stay.extras, extra] };
      }),
    }));
  }, []);

  const removeStay = useCallback((id) => {
    setState((current) => ({
      ...current,
      stays: current.stays.filter((stay) => stay.id !== id),
    }));
  }, []);

  const updateSettings = useCallback((patch) => {
    setState((current) => ({ ...current, settings: { ...current.settings, ...patch } }));
  }, []);

  const importState = useCallback((data) => {
    setState(sanitizeState(data));
  }, []);

  const resetAll = useCallback(() => {
    setState({ stays: [], settings: createDefaultSettings() });
  }, []);

  const value = useMemo(
    () => ({
      stays: state.stays,
      settings: state.settings,
      route,
      toast,
      storageError,
      go,
      back,
      notify,
      dismissToast: () => setToast(null),
      checkIn,
      updateStay,
      restoreExtra,
      removeStay,
      updateSettings,
      importState,
      resetAll,
    }),
    [
      state,
      route,
      toast,
      storageError,
      go,
      back,
      notify,
      checkIn,
      updateStay,
      restoreExtra,
      removeStay,
      updateSettings,
      importState,
      resetAll,
    ],
  );

  return <ResortContext.Provider value={value}>{children}</ResortContext.Provider>;
}

export function useResort() {
  const context = useContext(ResortContext);
  if (!context) throw new Error('useResort must be used within ResortProvider');
  return context;
}
