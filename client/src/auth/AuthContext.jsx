import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

const ANON = { status: 'anon', user: null, csrf: null };

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null, csrf: null });

  useEffect(() => {
    const c = new AbortController();
    api('GET', '/auth/me', { signal: c.signal })
      .then((d) => setState({ status: 'authed', user: d.user, csrf: d.csrfToken }))
      .catch((e) => { if (e.name !== 'AbortError') setState(ANON); });
    return () => c.abort();
  }, []);

  const start = useCallback(async (path, body) => {
    const d = await api('POST', path, { body });
    setState({ status: 'authed', user: d.user, csrf: d.csrfToken });
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      login: (email, password) => start('/auth/login', { email, password }),
      register: (email, password) => start('/auth/register', { email, password }),
      async logout() {
        try { await api('POST', '/auth/logout', { csrf: state.csrf }); } finally { setState(ANON); }
      },
    }),
    [state, start],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
