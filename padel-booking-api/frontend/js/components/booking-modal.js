// Modal de creación de reserva a partir de una franja libre.

import { api, describeDetail } from "../api.js";
import { RULES } from "../config.js";
import { auth } from "../store.js";
import { h, hhmm, minutesToTime, money, openModal, toast } from "../ui.js";

// Devuelve cuántos minutos seguidos libres hay desde el índice dado.
function freeRun(slots, index) {
  let minutes = 0;
  for (let i = index; i < slots.length; i++) {
    if (slots[i].status !== "free") break;
    minutes += RULES.slotMinutes;
  }
  return minutes;
}

export function openBookingModal({ court, date, slots, startTime, onBooked }) {
  const startIndex = slots.findIndex((s) => hhmm(s.start) === startTime);
  const maxRun = startIndex >= 0 ? freeRun(slots, startIndex) : RULES.minBookingMinutes;
  const maxDuration = Math.min(maxRun, RULES.maxBookingHours * 60);

  const durations = [];
  for (let m = RULES.minBookingMinutes; m <= maxDuration; m += RULES.slotMinutes) durations.push(m);

  let duration = durations.includes(90) ? 90 : durations[0] || RULES.minBookingMinutes;

  const summary = h("div", { class: "summary" });

  function renderSummary() {
    while (summary.firstChild) summary.removeChild(summary.firstChild);
    const end = minutesToTime(startTime, duration);
    const price = (Number(court.price_per_hour) * duration) / 60;
    const rows = [
      ["Pista", `${court.name} · Nº ${court.court_number}`],
      ["Fecha", date],
      ["Horario", `${startTime} – ${end} (${duration === 60 ? "1 h" : duration + " min"})`],
    ];
    for (const [k, v] of rows) {
      summary.appendChild(h("div", { class: "summary__row" }, [h("span", {}, k), h("b", {}, v)]));
    }
    summary.appendChild(
      h("div", { class: "summary__row summary__total" }, [
        h("span", {}, "Total"),
        h("b", {}, money(price)),
      ])
    );
  }

  const durationSelect = h(
    "select",
    {
      onchange: (e) => {
        duration = Number(e.target.value);
        renderSummary();
      },
    },
    durations.map((m) =>
      h("option", { value: String(m), selected: m === duration ? "" : null },
        m === 60 ? "1 hora" : m === 90 ? "1 h 30 min" : m === 120 ? "2 horas" : `${m} min`)
    )
  );

  const dupeWarn = h("div", { class: "toast toast--warn", style: "display:none" }, "");

  const form = h("form", { class: "stack" }, [
    summary,
    dupeWarn,
    h("div", { class: "row" }, [
      field("Duración", durationSelect),
      field(
        "Jugadores",
        h("select", { name: "players_count" }, [1, 2, 3, 4].map((n) => h("option", { value: String(n), selected: n === 4 ? "" : null }, `${n} jugador${n > 1 ? "es" : ""}`)))
      ),
    ]),
    field(
      "Método de pago",
      h("select", { name: "payment_method" }, [
        h("option", { value: "card" }, "Tarjeta"),
        h("option", { value: "bizum" }, "Bizum"),
        h("option", { value: "cash" }, "Efectivo en el club"),
        h("option", { value: "transfer" }, "Transferencia"),
        h("option", { value: "credit" }, "Bono / saldo"),
      ])
    ),
    field("Notas (opcional)", h("textarea", { name: "notes", maxlength: "500", placeholder: "Ej.: necesitamos alquilar palas" })),
  ]);

  const submit = h("button", { class: "btn btn--lg", type: "submit" }, "Confirmar reserva");
  form.appendChild(h("button", { type: "submit", style: "display:none" }));

  const modal = openModal({
    title: "Reservar pista",
    body: form,
    footer: [
      h("button", { class: "btn btn--ghost", type: "button", onclick: () => modal.close() }, "Cancelar"),
      submit,
    ],
  });

  submit.addEventListener("click", () => form.requestSubmit());

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!auth.isLoggedIn()) {
      modal.close();
      toast("Inicia sesión para reservar", "warn");
      location.hash = "#/login";
      return;
    }
    const data = Object.fromEntries(new FormData(form).entries());
    const end = minutesToTime(startTime, duration);
    submit.disabled = true;
    submit.textContent = "Reservando…";
    dupeWarn.style.display = "none";
    try {
      const booking = await api.post("/bookings", {
        court_id: court.id,
        booking_date: date,
        start_time: startTime,
        end_time: end,
        players_count: Number(data.players_count || 4),
        payment_method: data.payment_method || "card",
        notes: data.notes || null,
      });
      modal.close();
      toast("¡Reserva confirmada! 🎾");
      onBooked?.(booking);
    } catch (err) {
      dupeWarn.textContent = describeDetail(err.detail || err.message);
      dupeWarn.style.display = "block";
      submit.disabled = false;
      submit.textContent = "Confirmar reserva";
    }
  });

  renderSummary();
  return modal;
}

function field(label, input) {
  return h("div", { class: "field" }, [h("label", {}, label), input]);
}
