// Configuración del frontend.
//
// La URL base de la API se resuelve automáticamente:
//  - Si la web se sirve desde el propio servidor FastAPI (puerto 8000),
//    se usa el mismo origen.
//  - En cualquier otro caso (p. ej. `python -m http.server` en el 3000/5173)
//    se apunta al backend local por defecto.
//
// Puedes sobreescribirla en cualquier momento desde la consola del navegador:
//   localStorage.setItem('padel.apiBase', 'https://mi-api.com/api/v1')
export const API_BASE = (() => {
  const override = localStorage.getItem("padel.apiBase");
  if (override) return override.replace(/\/$/, "");
  const { protocol, hostname, port } = location;
  if (port === "8000") return `${protocol}//${hostname}:${port}/api/v1`;
  return "http://127.0.0.1:8000/api/v1";
})();

export const DOCS_URL = API_BASE.replace(/\/api\/v1\/?$/, "") + "/docs";

export const CURRENCY = "EUR";

// Reglas de negocio espejo de la API (para la UI).
export const RULES = {
  slotMinutes: 30,
  minBookingMinutes: 30,
  maxBookingHours: 3,
  maxPlayers: 4,
  minLevel: 1,
  maxLevel: 7,
};
