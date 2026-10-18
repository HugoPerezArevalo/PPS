// Estado de sesión (tokens + usuario) con persistencia en localStorage
// y un pequeño emisor de eventos para que la interfaz reaccione.

const ACCESS_KEY = "padel.access";
const REFRESH_KEY = "padel.refresh";
const USER_KEY = "padel.user";

const listeners = new Set();

export const auth = {
  access: () => localStorage.getItem(ACCESS_KEY),
  refresh: () => localStorage.getItem(REFRESH_KEY),
  user: () => {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  isLoggedIn: () => Boolean(localStorage.getItem(ACCESS_KEY)),
  isStaff: () => {
    const role = auth.user()?.role;
    return role === "admin" || role === "coach";
  },
  isAdmin: () => auth.user()?.role === "admin",

  setSession({ access_token, refresh_token, user }) {
    if (access_token) localStorage.setItem(ACCESS_KEY, access_token);
    if (refresh_token) localStorage.setItem(REFRESH_KEY, refresh_token);
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    emit();
  },

  setUser(user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    emit();
  },

  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
    emit();
  },

  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

function emit() {
  for (const fn of listeners) fn(auth.user());
}
