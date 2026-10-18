// Utilidades de formato (fechas, horas, importes) en español.

import { CURRENCY } from "./config.js";

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
