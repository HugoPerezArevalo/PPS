// Cliente HTTP para la API: maneja JSON, query params, tokens, errores
// legibles y renovación automática del access token con el refresh token.

import { API_BASE } from "./config.js";
import { auth } from "./store.js";

export class ApiError extends Error {
  constructor(status, detail) {
    super(typeof detail === "string" ? detail : "Error de la API");
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

function buildUrl(path, query) {
  const url = new URL(API_BASE + path);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

// Convierte el `detail` de FastAPI (string o lista de errores de validación)
// en un mensaje legible.
export function describeDetail(detail) {
  if (!detail) return "Ha ocurrido un error inesperado";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((e) => {
        const loc = Array.isArray(e.loc) ? e.loc.filter((p) => p !== "body").join(".") : "";
        return loc ? `${loc}: ${e.msg}` : e.msg;
      })
      .join("\n");
  }
  return String(detail);
}

let refreshing = null;

async function rawRequest(path, { method = "GET", body, query, auth: withAuth = true } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (withAuth) {
    const token = auth.access();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(buildUrl(path, query), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    throw new ApiError(res.status, data?.detail ?? data);
  }
  return data;
}

async function tryRefresh() {
  const refresh_token = auth.refresh();
  if (!refresh_token) return false;
  try {
    const data = await rawRequest("/auth/refresh", {
      method: "POST",
      body: { refresh_token },
      auth: false,
    });
    auth.setSession(data);
    return true;
  } catch {
    return false;
  }
}

export async function request(path, options = {}) {
  try {
    return await rawRequest(path, options);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && options.auth !== false) {
      // Un único intento de refresco, compartido entre peticiones concurrentes.
      refreshing = refreshing || tryRefresh().finally(() => (refreshing = null));
      const ok = await refreshing;
      if (ok) return rawRequest(path, options);
      auth.clear();
    }
    throw err;
  }
}

// Atajos por método.
export const api = {
  get: (path, query, opts) => request(path, { ...opts, query }),
  post: (path, body, opts) => request(path, { ...opts, method: "POST", body }),
  patch: (path, body, opts) => request(path, { ...opts, method: "PATCH", body }),
  put: (path, body, opts) => request(path, { ...opts, method: "PUT", body }),
  del: (path, opts) => request(path, { ...opts, method: "DELETE" }),
};

// Cierra sesión en el servidor (revoca access + refresh tokens).
// Best-effort: usa la petición cruda para no disparar el refresco automático.
export async function endSession() {
  try {
    await rawRequest("/auth/logout", {
      method: "POST",
      body: { refresh_token: auth.refresh() },
      auth: true,
    });
  } catch {
    // La sesión local se limpia igualmente en el llamador.
  }
}
