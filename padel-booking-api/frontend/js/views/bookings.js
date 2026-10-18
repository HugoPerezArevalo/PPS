// Vista "Mis reservas": listado, reprogramación, cancelación, pago y valoración.

import { api, describeDetail } from "../api.js";
import { auth } from "../store.js";
import { RULES } from "../config.js";
import {
  clear,
  confirmDialog,
  emptyState,
  fmtLongDate,
  h,
  hhmm,
  isoDate,
  labels,
  minutesToTime,
  money,
  openModal,
  spinner,
  statusBadge,
  toast,
  today,
} from "../ui.js";
import { openAuthModal } from "../components/auth.js";

const filters = { status: "" };

export async function renderBookings(root) {
  clear(root);
  if (!auth.isLoggedIn()) {
    root.appendChild(requireLogin("Mis reservas"));
    return;
  }

  root.appendChild(
    h("div", { class: "page-head" }, [
      h("h1", {}, "Mis reservas"),
      h("p", {}, "Consulta, reprograma o cancela tus reservas y gestiona tus pagos."),
    ])
  );

  const seg = h("div", { class: "segmented" }, [
    segBtn("Todas", "", filters.status === ""),
    segBtn("Confirmadas", "confirmed", filters.status === "confirmed"),
    segBtn("Pendientes", "pending", filters.status === "pending"),
    segBtn("Completadas", "completed", filters.status === "completed"),
    segBtn("Canceladas", "cancelled", filters.status === "cancelled"),
  ]);
  root.appendChild(h("div", { class: "between", style: "margin-bottom:18px" }, seg));

  const list = h("div", { class: "list" });
  root.appendChild(list);

  async function load() {
    clear(list);
    list.appendChild(spinner());
    try {
      const query = { scope: "mine", limit: 100 };
      if (filters.status) query.status = filters.status;
      const bookings = await api.get("/bookings", query);
      clear(list);
      if (!bookings.length) {
        list.appendChild(emptyState("Todavía no tienes reservas", "Reserva tu primera pista desde la pantalla de inicio.", linkBtn("Reservar ahora", "#/home")));
        return;
      }
      for (const b of bookings) list.appendChild(bookingCard(b, load));
    } catch (err) {
      clear(list);
      list.appendChild(emptyState("No se pudieron cargar las reservas", describeDetail(err.detail || err.message)));
    }
  }

  seg.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-status]");
    if (!btn) return;
    filters.status = btn.dataset.status;
    for (const b of seg.querySelectorAll("button")) b.classList.toggle("is-active", b === btn);
    load();
  });

  await load();
}

function bookingCard(b, reload) {
  const pendingPayment = (b.payments || []).find((p) => p.status === "pending");
  const canCancel = b.status === "pending" || b.status === "confirmed";
  const canReschedule = b.status === "pending" || b.status === "confirmed";
  const canReview = b.status === "completed" || b.status === "confirmed";

  const actions = [];
  if (pendingPayment) {
    actions.push(
      h("button", { class: "btn btn--sm", onclick: () => pay(pendingPayment, reload) }, `Pagar ${money(pendingPayment.amount)}`)
    );
  }
  if (canReview) actions.push(h("button", { class: "btn btn--sm btn--ghost", onclick: () => reviewModal(b) }, "Valorar"));
  if (canReschedule) actions.push(h("button", { class: "btn btn--sm btn--ghost", onclick: () => rescheduleModal(b, reload) }, "Reprogramar"));
  if (canCancel) actions.push(h("button", { class: "btn btn--sm btn--danger", onclick: () => cancelBooking(b, reload) }, "Cancelar"));

  return h("article", { class: "rowcard" }, [
    h("div", { class: "rowcard__main" }, [
      h("div", { class: "between" }, [
        h("span", { class: "rowcard__title" }, `#${b.id} · ${b.court?.name ?? "Pista " + b.court_id}`),
        statusBadge("booking", b.status),
      ]),
      h("div", { class: "rowcard__meta" }, [
        h("span", {}, ["📅 ", h("b", {}, fmtLongDate(b.booking_date))]),
        h("span", {}, ["⏰ ", h("b", {}, `${hhmm(b.start_time)}–${hhmm(b.end_time)}`)]),
        h("span", {}, ["👥 ", h("b", {}, `${b.players_count}`)]),
      ]),
      b.notes ? h("p", { class: "small muted", style: "margin:0" }, `📝 ${b.notes}`) : null,
    ]),
    h("div", { class: "rowcard__side" }, [
      h("span", { class: "price-tag" }, money(b.total_price)),
      ...actions,
    ]),
  ]);
}

async function cancelBooking(b, reload) {
  const ok = await confirmDialog({
    title: "Cancelar reserva",
    message: `¿Seguro que quieres cancelar la reserva #${b.id} del ${fmtLongDate(b.booking_date)} a las ${hhmm(b.start_time)}?`,
    confirmLabel: "Sí, cancelar",
    danger: true,
  });
  if (!ok) return;
  try {
    await api.post(`/bookings/${b.id}/cancel`, { reason: "Cancelada por el jugador" });
    toast("Reserva cancelada");
    reload();
  } catch (err) {
    toast(describeDetail(err.detail || err.message), "error");
  }
}

function rescheduleModal(b, reload) {
  const form = h("form", { class: "stack" }, [
    h("div", { class: "row" }, [
      field("Fecha", h("input", { type: "date", name: "booking_date", value: b.booking_date, min: isoDate(today()), required: "" })),
      field("Jugadores", h("select", { name: "players_count" }, [1, 2, 3, 4].map((n) => h("option", { value: String(n), selected: n === b.players_count ? "" : null }, `${n}`)))),
    ]),
    h("div", { class: "row" }, [
      field("Inicio", h("input", { type: "time", name: "start_time", value: hhmm(b.start_time), step: "1800", required: "" })),
      field("Fin", h("input", { type: "time", name: "end_time", value: hhmm(b.end_time), step: "1800", required: "" })),
    ]),
    field("Notas", h("textarea", { name: "notes", maxlength: "500" }, b.notes || "")),
  ]);
  const errorBox = h("div", { class: "toast toast--error", style: "display:none" });
  form.prepend(errorBox);

  const submit = h("button", { class: "btn", type: "submit" }, "Guardar cambios");
  const modal = openModal({ title: "Reprogramar reserva", body: form, footer: [h("button", { class: "btn btn--ghost", onclick: () => modal.close() }, "Cancelar"), submit] });
  submit.addEventListener("click", () => form.requestSubmit());

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form).entries());
    if (f.start_time >= f.end_time) {
      errorBox.textContent = "La hora de fin debe ser posterior a la de inicio";
      errorBox.style.display = "block";
      return;
    }
    submit.disabled = true;
    submit.textContent = "Guardando…";
    try {
      await api.patch(`/bookings/${b.id}`, {
        booking_date: f.booking_date,
        start_time: f.start_time,
        end_time: f.end_time,
        notes: f.notes || null,
      });
      modal.close();
      toast("Reserva reprogramada");
      reload();
    } catch (err) {
      errorBox.textContent = describeDetail(err.detail || err.message);
      errorBox.style.display = "block";
      submit.disabled = false;
      submit.textContent = "Guardar cambios";
    }
  });
}

async function pay(payment, reload) {
  const ok = await confirmDialog({
    title: "Pagar reserva",
    message: `Vas a marcar como pagado ${money(payment.amount)}. En una integración real aquí se abriría la pasarela de pago.`,
    confirmLabel: "Pagar",
  });
  if (!ok) return;
  try {
    await api.post(`/payments/${payment.id}/pay`, { transaction_ref: `web-${Date.now()}` });
    toast("Pago registrado ✅");
    reload();
  } catch (err) {
    toast(describeDetail(err.detail || err.message), "error");
  }
}

function reviewModal(b) {
  let rating = 5;
  const stars = h("div", { class: "stack-tight", style: "flex-direction:row;gap:6px;font-size:1.9rem" });
  function paint() {
    clear(stars);
    for (let i = 1; i <= 5; i++) {
      stars.appendChild(
        h("button", { type: "button", style: `background:none;border:0;cursor:pointer;color:${i <= rating ? "#f5a524" : "#d5ddd8"};font-size:1.9rem;line-height:1` , onclick: () => { rating = i; paint(); } }, "★")
      );
    }
  }
  paint();

  const form = h("form", { class: "stack" }, [
    h("div", { class: "field" }, [h("label", {}, "Puntuación"), stars]),
    h("div", { class: "field" }, [h("label", {}, "Comentario (opcional)"), h("textarea", { name: "comment", maxlength: "1000", placeholder: "¿Qué te pareció la pista?" })]),
  ]);
  const errorBox = h("div", { class: "toast toast--error", style: "display:none" });
  form.prepend(errorBox);

  const submit = h("button", { class: "btn", type: "submit" }, "Publicar valoración");
  const modal = openModal({ title: `Valorar ${b.court?.name ?? "pista"}`, body: form, footer: [h("button", { class: "btn btn--ghost", onclick: () => modal.close() }, "Cancelar"), submit] });
  submit.addEventListener("click", () => form.requestSubmit());

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form).entries());
    submit.disabled = true;
    try {
      await api.post(`/courts/${b.court_id}/reviews`, { rating, comment: f.comment || null });
      modal.close();
      toast("¡Gracias por tu valoración!");
    } catch (err) {
      errorBox.textContent = describeDetail(err.detail || err.message);
      errorBox.style.display = "block";
      submit.disabled = false;
    }
  });
}

/* ------------------------------------------------------------ helpers ---- */

function segBtn(text, status, active) {
  return h("button", { type: "button", "data-status": status, class: active ? "is-active" : "" }, text);
}

function field(labelText, input) {
  return h("div", { class: "field" }, [h("label", {}, labelText), input]);
}

export function requireLogin(title) {
  return h("div", { class: "empty" }, [
    h("h3", {}, `${title} requiere una cuenta`),
    h("p", {}, "Inicia sesión o crea una cuenta gratuita para continuar."),
    h("button", { class: "btn", onclick: () => openAuthModal("login", () => rerender()) }, "Iniciar sesión"),
  ]);
}

function linkBtn(text, href) {
  return h("a", { class: "btn", href }, text);
}

function rerender() {
  location.hash = location.hash || "#/home";
  // Fuerza un re-render recargando la ruta actual.
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}
