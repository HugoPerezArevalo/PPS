// Estado de sesión (JWT + usuario) con persistencia en localStorage.
// Se expone como un store externo compatible con `useSyncExternalStore`.

const ACCESS_KEY = "padel.access";
const REFRESH_KEY = "padel.refresh";
const USER_KEY = "padel.user";

function parseUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function readState() {
  return {
    access: localStorage.getItem(ACCESS_KEY),
    refresh: localStorage.getItem(REFRESH_KEY),
    user: parseUser(),
  };
}

// Snapshot estable: solo se reemplaza cuando cambia la sesión.
let state = readState();
const listeners = new Set();

function emit() {
  state = readState();
  for (const fn of listeners) fn();
}

export const auth = {
  getAccess: () => state.access,
  getRefresh: () => state.refresh,
  getUser: () => state.user,
  isLoggedIn: () => Boolean(state.access),
  isStaff: () => state.user?.role === "admin" || state.user?.role === "coach",
  isAdmin: () => state.user?.role === "admin",

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

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  getSnapshot: () => state,
};
