// Utilidades de interfaz: creación de DOM, formato y componentes pequeños.

import { CURRENCY } from "./config.js";

/* --------------------------------------------------------------- DOM ---- */

// h('div', { class: 'x', onclick: fn }, [hijo, "texto", ...])
export function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") el.className = value;
    else if (key === "dataset") Object.assign(el.dataset, value);
    else if (key === "html") el.innerHTML = value;
    else if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === "value" || key === "checked" || key === "disabled") {
      el[key] = value;
    } else if (key === "for") {
      el.htmlFor = value;
    } else {
      el.setAttribute(key, value);
    }
  }
  append(el, children);
  return el;
}

export function append(parent, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(parent, child);
    else if (child instanceof Node) parent.appendChild(child);
    else parent.appendChild(document.createTextNode(String(child)));
  }
  return parent;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/* ------------------------------------------------------------ formato ---- */

export function money(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: CURRENCY,
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
  }).format(n);
}

// "19:00:00" -> "19:00"
export function hhmm(value) {
  if (!value) return "—";
  return String(value).slice(0, 5);
}

const DAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const DAYS_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function isoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseIso(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function fmtLongDate(iso) {
  if (!iso) return "—";
  const d = typeof iso === "string" ? parseIso(iso) : iso;
  return `${DAYS[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

export function fmtShortDate(iso) {
  const d = typeof iso === "string" ? parseIso(iso) : iso;
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

export function dateParts(iso) {
  const d = typeof iso === "string" ? parseIso(iso) : iso;
  return { dow: DAYS_SHORT[d.getDay()], day: d.getDate(), month: MONTHS_SHORT[d.getMonth()] };
}

export function fmtDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function minutesToTime(startStr, addMinutes) {
  const [hh, mm] = hhmm(startStr).split(":").map(Number);
  const total = hh + addMinutes / 60;
  const H = Math.floor(total);
  const M = Math.round((total - H) * 60);
  return `${String(H).padStart(2, "0")}:${String(M).padStart(2, "0")}`;
}

export function durationLabel(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  return `${m} min`;
}

/* --------------------------------------------------------- etiquetas ---- */

const SURFACE = { panoramic: "Panorámica", prefabricated: "Prefabricada", concrete: "Hormigón" };
const ENVIRONMENT = { indoor: "Indoor", outdoor: "Outdoor" };
const BOOKING_STATUS = {
  pending: "Pendiente",
  confirmed: "Confirmada",
  cancelled: "Cancelada",
  completed: "Completada",
  no_show: "No presentado",
};
const PAYMENT_STATUS = { pending: "Pendiente", paid: "Pagado", refunded: "Reembolsado", failed: "Fallido" };
const PAYMENT_METHOD = { cash: "Efectivo", card: "Tarjeta", bizum: "Bizum", transfer: "Transferencia", credit: "Bono" };
const MATCH_STATUS = { open: "Abierto", full: "Completo", cancelled: "Cancelado", completed: "Completado" };
const APPLICATION_STATUS = { pending: "Pendiente", accepted: "Aceptada", rejected: "Rechazada" };
const ROLE = { admin: "Administrador", coach: "Monitor", player: "Jugador" };

export const labels = {
  surface: (v) => SURFACE[v] || v,
  environment: (v) => ENVIRONMENT[v] || v,
  bookingStatus: (v) => BOOKING_STATUS[v] || v,
  paymentStatus: (v) => PAYMENT_STATUS[v] || v,
  paymentMethod: (v) => PAYMENT_METHOD[v] || v,
  matchStatus: (v) => MATCH_STATUS[v] || v,
  applicationStatus: (v) => APPLICATION_STATUS[v] || v,
  role: (v) => ROLE[v] || v,
};

/* ------------------------------------------------------- componentes ---- */

export function badge(status, text) {
  return h("span", { class: `badge badge--${status}` }, text || labels.bookingStatus(status));
}

export function statusBadge(kind, status, text) {
  if (kind === "booking") return badge(status, text || labels.bookingStatus(status));
  if (kind === "match") return badge(status, text || labels.matchStatus(status));
  if (kind === "payment") return badge(status, text || labels.paymentStatus(status));
  if (kind === "application") return badge(status, text || labels.applicationStatus(status));
  return badge(status, text);
}

export function ratingStars(rating, count) {
  const value = Number(rating) || 0;
  const star = h("span", { class: "star", "aria-hidden": "true" }, "★");
  const text = value ? value.toFixed(1) : "Nuevo";
  const node = h("span", { class: "rating", title: `${value.toFixed(1)} / 5` }, [star, h("span", {}, text)]);
  if (typeof count === "number") {
    node.appendChild(h("span", { class: "muted small", style: "font-weight:600" }, `(${count})`));
  }
  return node;
}

export function tagsForCourt(court) {
  const chips = [];
  chips.push(h("span", { class: `chip chip--brand` }, labels.environment(court.environment)));
  chips.push(h("span", { class: "chip" }, labels.surface(court.surface)));
  if (court.has_lighting) chips.push(h("span", { class: "chip" }, "💡 Iluminación"));
  if (court.is_covered) chips.push(h("span", { class: "chip" }, "🏠 Cubierta"));
  return h("div", { class: "chips" }, chips);
}

export function spinner() {
  return h("div", { class: "spinner", role: "status", "aria-label": "Cargando" });
}

export function emptyState(title, message, action) {
  return h("div", { class: "empty" }, [
    h("h3", {}, title),
    h("p", {}, message || ""),
    action || null,
  ]);
}

/* ------------------------------------------------------------ toasts ---- */

export function toast(message, type = "success", timeout = 4200) {
  const root = document.getElementById("toasts");
  const node = h("div", { class: `toast toast--${type}` }, message);
  root.appendChild(node);
  setTimeout(() => {
    node.style.transition = "opacity .25s, transform .25s";
    node.style.opacity = "0";
    node.style.transform = "translateX(16px)";
    setTimeout(() => node.remove(), 260);
  }, timeout);
}

/* ------------------------------------------------------------ modal ---- */

export function openModal({ title, body, footer, wide = false, onClose }) {
  const root = document.getElementById("modal-root");
  const backdrop = h("div", { class: "modal-backdrop" });
  const closeBtn = h("button", { class: "modal__close", "aria-label": "Cerrar", onclick: close }, "×");
  const modal = h("div", { class: `modal${wide ? " modal--wide" : ""}`, role: "dialog", "aria-modal": "true" }, [
    h("div", { class: "modal__head" }, [h("h2", {}, title), closeBtn]),
    h("div", { class: "modal__body" }, body),
    footer ? h("div", { class: "modal__foot" }, footer) : null,
  ]);
  backdrop.appendChild(modal);

  function onKey(e) {
    if (e.key === "Escape") close();
  }
  function close() {
    document.removeEventListener("keydown", onKey);
    backdrop.remove();
    onClose?.();
  }
  backdrop.addEventListener("mousedown", (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener("keydown", onKey);

  root.appendChild(backdrop);
  const firstInput = modal.querySelector("input, select, textarea, button");
  firstInput?.focus();
  return { close, modal, backdrop };
}

export function confirmDialog({ title, message, confirmLabel = "Confirmar", danger = false }) {
  return new Promise((resolve) => {
    let resolved = false;
    const done = (value) => {
      if (resolved) return;
      resolved = true;
      resolve(value);
    };
    const { close } = openModal({
      title,
      body: h("p", { style: "margin:0;color:var(--body)" }, message),
      onClose: () => done(false),
      footer: [
        h("button", { class: "btn btn--ghost", onclick: () => { done(false); close(); } }, "Cancelar"),
        h(
          "button",
          {
            class: `btn ${danger ? "btn--danger" : ""}`,
            onclick: () => { done(true); close(); },
          },
          confirmLabel
        ),
      ],
    });
  });
}
