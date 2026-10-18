// Configuración del frontend React.
//
// La URL base de la API se toma de la variable de entorno VITE_API_BASE.
// Si está vacía se usa la ruta relativa "/api/v1", que en desarrollo Vite
// redirige al backend FastAPI mediante proxy (ver vite.config.js).
const RAW_BASE = (import.meta.env.VITE_API_BASE || "/api/v1").trim();

export const API_BASE = (RAW_BASE || "/api/v1").replace(/\/$/, "");

// Enlace a Swagger/OpenAPI del backend.
export const DOCS_URL = API_BASE.startsWith("http")
  ? API_BASE.replace(/\/api\/v1\/?$/, "") + "/docs"
  : "/docs";

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
