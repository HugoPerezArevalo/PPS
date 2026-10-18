// Vista de inicio: buscador, catálogo de pistas y panel de disponibilidad.

import { api, describeDetail } from "../api.js";
import {
  addDays,
  clear,
  dateParts,
  emptyState,
  fmtLongDate,
  h,
  hhmm,
  isoDate,
  labels,
  money,
  ratingStars,
  spinner,
  tagsForCourt,
  toast,
  today,
} from "../ui.js";
import { openBookingModal } from "../components/booking-modal.js";

const state = {
  filters: {},
  selectedCourtId: null,
  date: isoDate(today()),
};

const COURT_STATUS = { available: "Disponible", maintenance: "Mantenimiento", closed: "Cerrada" };

export async function renderHome(root) {
  clear(root);
  root.appendChild(hero());
  root.appendChild(quickSearch());
  const catalogue = h("section", { class: "section" });
  const panel = h("section", { class: "section", id: "booking-panel" });
  root.appendChild(catalogue);
  root.appendChild(panel);

  await Promise.all([loadCatalogue(catalogue, panel), maybeOpenFromHash(panel)]);
}

/* ------------------------------------------------------------- hero ---- */

function hero() {
  return h("section", { class: "hero" }, [
    h("h1", {}, "Reserva tu pista de pádel en segundos"),
    h("p", {}, "Consulta disponibilidad en tiempo real, elige tu horario favorito y confirma. Pistas panorámicas, indoor y outdoor con iluminación LED."),
    h("div", { class: "hero__cta" }, [
      h(
        "button",
        {
          class: "btn btn--white btn--lg btn--keep-label",
          onclick: () => document.getElementById("booking-panel")?.scrollIntoView({ behavior: "smooth" }),
        },
        "Ver disponibilidad"
      ),
      h("a", { class: "btn btn--ghost btn--lg btn--keep-label", href: "#/matches", style: "border-color:rgba(255,255,255,.5);color:#fff" }, "Buscar partido"),
    ]),
  ]);
}

/* ----------------------------------------------------- quick search ---- */

function quickSearch() {
  const status = h("div", { style: "margin-top:14px" });
  const form = h("form", { class: "filters", style: "margin-top:22px" }, [
    field("Día", h("input", { type: "date", name: "date", value: state.date, min: isoDate(today()), required: "" })),
    field("Desde", h("input", { type: "time", name: "start_time", value: "19:00", step: "1800", required: "" })),
    field("Hasta", h("input", { type: "time", name: "end_time", value: "20:30", step: "1800", required: "" })),
    field(
      "Ambiente",
      h("select", { name: "environment" }, [
        h("option", { value: "" }, "Cualquiera"),
        h("option", { value: "indoor" }, "Indoor"),
        h("option", { value: "outdoor" }, "Outdoor"),
      ])
    ),
    h("button", { class: "btn btn--lg", type: "submit" }, "Buscar pista libre"),
  ]);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form).entries());
    if (f.start_time >= f.end_time) {
      toast("La hora de fin debe ser posterior a la de inicio", "warn");
      return;
    }
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.textContent = "Buscando…";
    clear(status);
    try {
      const results = await api.get("/availability/courts", {
        date: f.date,
        start_time: f.start_time,
        end_time: f.end_time,
        environment: f.environment,
      });
      state.date = f.date;
      renderResults(status, results, f);
    } catch (err) {
      toast(describeDetail(err.detail || err.message), "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Buscar pista libre";
    }
  });

  return h("div", { style: "margin-top:-18px;position:relative;z-index:2" }, [form, status]);
}

function renderResults(container, results, query) {
  clear(container);
  if (!results.length) {
    container.appendChild(emptyState("Sin pistas libres", "Prueba otro horario o cambia de día."));
    return;
  }
  container.appendChild(h("p", { class: "small", style: "margin:16px 2px 10px" }, `${results.length} pista(s) libre(s) el ${fmtLongDate(query.date)} de ${query.start_time} a ${query.end_time}`));
  const grid = h("div", { class: "grid grid--courts" });
  for (const item of results) {
    grid.appendChild(
      h("div", { class: "card court-card" }, [
        h("div", { class: "court-card__body" }, [
          h("div", { class: "between" }, [
            h("h3", { class: "court-card__title" }, item.court.name),
            h("span", { class: "price-tag" }, money(item.total_price)),
          ]),
          tagsForCourt(item.court),
          h("div", { class: "court-card__foot" }, [
            h("span", { class: "small muted" }, `Abierta ${hhmm(item.open_time)}–${hhmm(item.close_time)}`),
            h(
              "button",
              {
                class: "btn btn--sm",
                onclick: () => selectCourt(item.court.id, query.date),
              },
              "Reservar"
            ),
          ]),
        ]),
      ])
    );
  }
  container.appendChild(grid);
}

/* --------------------------------------------------- catalogue list ---- */

async function loadCatalogue(section, panel) {
  clear(section);
  section.appendChild(h("div", { class: "section__head" }, [h("h2", {}, "Nuestras pistas")]));

  const filters = h("form", { class: "filters", style: "margin-bottom:18px" }, [
    field(
      "Ambiente",
      select("environment", [["", "Todos"], ["indoor", "Indoor"], ["outdoor", "Outdoor"]])
    ),
    field(
      "Superficie",
      select("surface", [["", "Todas"], ["panoramic", "Panorámica"], ["prefabricated", "Prefabricada"], ["concrete", "Hormigón"]])
    ),
    field(
      "Iluminación",
      select("has_lighting", [["", "Indiferente"], ["true", "Con luz"], ["false", "Sin luz"]])
    ),
    field(
      "Precio máx/h",
      h("input", { type: "number", name: "max_price", min: "1", step: "1", placeholder: "Ej. 30" })
    ),
    h("button", { class: "btn", type: "submit" }, "Filtrar"),
  ]);

  const list = h("div", { class: "grid grid--courts" }, [h("div", { class: "skeleton" }), h("div", { class: "skeleton" }), h("div", { class: "skeleton" })]);
  section.appendChild(filters);
  section.appendChild(list);

  async function load() {
    clear(list);
    list.appendChild(spinner());
    try {
      const courts = await api.get("/courts", state.filters, { auth: false });
      clear(list);
      if (!courts.length) {
        list.appendChild(emptyState("No hay pistas con estos filtros", "Modifica los filtros para ver más resultados."));
        return;
      }
      for (const court of courts) list.appendChild(courtCard(court, panel));
    } catch (err) {
      clear(list);
      list.appendChild(emptyState("No se pudieron cargar las pistas", describeDetail(err.detail || err.message)));
    }
  }

  filters.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(filters).entries());
    state.filters = {};
    if (f.environment) state.filters.environment = f.environment;
    if (f.surface) state.filters.surface = f.surface;
    if (f.has_lighting !== "") state.filters.has_lighting = f.has_lighting;
    if (f.max_price) state.filters.max_price = f.max_price;
    load();
  });

  await load();
}

function courtCard(court, panel) {
  return h("article", { class: "card court-card" }, [
    h("div", { class: "court-card__media" }, [
      h("span", { class: "court-card__num" }, `Pista ${court.court_number}`),
      h("span", { class: "court-card__price" }, [money(court.price_per_hour), h("small", {}, " /h")]),
    ]),
    h("div", { class: "court-card__body" }, [
      h("div", { class: "between" }, [
        h("h3", { class: "court-card__title" }, court.name),
        ratingStars(court.average_rating, court.review_count),
      ]),
      h("p", { class: "court-card__desc" }, court.description || ""),
      tagsForCourt(court),
      h("div", { class: "court-card__foot" }, [
        h("span", { class: `chip ${court.status === "available" ? "chip--lime" : ""}` }, COURT_STATUS[court.status] || court.status),
        h("button", { class: "btn btn--sm btn--soft", onclick: () => selectCourt(court.id, state.date, panel) }, "Ver horarios"),
      ]),
    ]),
  ]);
}

async function selectCourt(courtId, date, panel) {
  state.selectedCourtId = courtId;
  state.date = date || state.date;
  const target = panel || document.getElementById("booking-panel");
  if (!target) return;
  await renderPanel(target);
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function maybeOpenFromHash(panel) {
  const hash = location.hash;
  const m = hash.match(/#court=(\d+)/);
  if (m) await selectCourt(Number(m[1]), state.date, panel);
}

/* --------------------------------------------------- booking panel ---- */

async function renderPanel(panel) {
  clear(panel);
  if (!state.selectedCourtId) {
    panel.appendChild(
      emptyState(
        "Elige una pista para ver su disponibilidad",
        "Pulsa «Ver horarios» en cualquier pista del catálogo, o usa el buscador de arriba."
      )
    );
    return;
  }

  let detail;
  try {
    detail = await api.get(`/courts/${state.selectedCourtId}`, null, { auth: false });
  } catch (err) {
    panel.appendChild(emptyState("No se pudo cargar la pista", describeDetail(err.detail || err.message)));
    return;
  }

  const header = h("div", { class: "section__head" }, [
    h("div", {}, [
      h("h2", {}, detail.name),
      h("p", { class: "muted small", style: "margin:4px 0 0" }, [money(detail.price_per_hour), " / hora · Pista ", String(detail.court_number)]),
    ]),
    ratingStars(detail.average_rating, detail.review_count),
  ]);
  panel.appendChild(header);

  // Tira de fechas (14 días).
  const strip = h("div", { class: "datestrip" });
  panel.appendChild(strip);
  const body = h("div", { class: "grid grid--two", style: "margin-top:20px" }, [
    h("div", { class: "card card--pad" }, [h("h3", { style: "margin-bottom:12px" }, "Franjas disponibles"), h("div", { class: "slots-host" }, spinner())]),
    h("div", { class: "card card--pad" }, [h("h3", { style: "margin-bottom:12px" }, "Próxima semana"), h("div", { class: "week-host" }, spinner())]),
  ]);
  panel.appendChild(body);

  function renderStrip() {
    clear(strip);
    for (let i = 0; i < 14; i++) {
      const d = addDays(today(), i);
      const iso = isoDate(d);
      const p = dateParts(iso);
      strip.appendChild(
        h(
          "button",
          {
            class: `datechip${iso === state.date ? " is-active" : ""}`,
            onclick: () => {
              state.date = iso;
              renderStrip();
              loadDay();
            },
          },
          [h("div", { class: "datechip__dow" }, p.dow), h("div", { class: "datechip__day" }, String(p.day)), h("div", { class: "datechip__month" }, p.month)]
        )
      );
    }
  }

  const slotsHost = body.querySelector(".slots-host");
  const weekHost = body.querySelector(".week-host");

  async function loadDay() {
    clear(slotsHost);
    slotsHost.appendChild(spinner());
    try {
      const grid = await api.get("/availability/slots", { court_id: detail.id, date: state.date });
      clear(slotsHost);
      if (!grid.is_open) {
        slotsHost.appendChild(emptyState("Pista cerrada", "No hay horario de apertura para este día."));
        return;
      }
      const legend = h("div", { class: "chips", style: "margin-bottom:14px" }, [
        h("span", { class: "chip chip--brand" }, "Libre"),
        h("span", { class: "chip" }, "Ocupada"),
        h("span", { class: "chip" }, "Pasada"),
      ]);
      slotsHost.appendChild(legend);
      const gridEl = h("div", { class: "slots" });
      for (const slot of grid.slots) {
        const cls =
          slot.status === "free"
            ? "is-free"
            : slot.status === "booked"
            ? slot.booking_id
              ? "is-mine"
              : "is-booked"
            : slot.status === "past"
            ? "is-past"
            : "is-closed";
        const btn = h(
          "button",
          {
            class: `slot ${cls}`,
            disabled: slot.status !== "free",
            onclick: () =>
              openBookingModal({
                court: detail,
                date: state.date,
                slots: grid.slots,
                startTime: hhmm(slot.start),
                onBooked: () => {
                  loadDay();
                  loadWeek();
                },
              }),
            title: slot.status === "booked" ? "Franja ocupada" : slot.status,
          },
          [h("span", {}, `${hhmm(slot.start)}`), h("small", {}, money(slot.price))]
        );
        gridEl.appendChild(btn);
      }
      slotsHost.appendChild(gridEl);
    } catch (err) {
      clear(slotsHost);
      slotsHost.appendChild(emptyState("Error al cargar la disponibilidad", describeDetail(err.detail || err.message)));
    }
  }

  async function loadWeek() {
    clear(weekHost);
    try {
      const data = await api.get("/availability/week", { court_id: detail.id, start: state.date, days: 7 }, { auth: false });
      clear(weekHost);
      const bars = h("div", { class: "weekbars" });
      for (const day of data.overview) {
        const pct = day.total_slots ? Math.round((day.available_slots / day.total_slots) * 100) : 0;
        bars.appendChild(
          h("div", { class: "weekbar" }, [
            h("div", { class: "weekbar__label" }, `${dateParts(day.date).dow} ${dateParts(day.date).day}`),
            h("div", { class: "weekbar__track" }, h("div", { class: "weekbar__fill", style: `width:${pct}%` })),
            h("div", { class: "weekbar__val" }, `${day.available_slots}/${day.total_slots}`),
          ])
        );
      }
      weekHost.appendChild(bars);
      weekHost.appendChild(h("p", { class: "small muted", style: "margin-top:12px" }, "Franjas libres sobre el total del día."));
    } catch (err) {
      clear(weekHost);
      weekHost.appendChild(h("p", { class: "small muted" }, describeDetail(err.detail || err.message)));
    }
  }

  renderStrip();
  await loadDay();
  await loadWeek();
}

/* --------------------------------------------------------- helpers ---- */

function select(name, options) {
  return h("select", { name }, options.map(([value, text]) => h("option", { value }, text)));
}

function field(labelText, input) {
  return h("div", { class: "field" }, [h("label", {}, labelText), input]);
}
