// Vista de administración: métricas, agenda global, usuarios y pistas.

import { api, describeDetail } from "../api.js";
import { auth } from "../store.js";
import {
  clear,
  emptyState,
  fmtLongDate,
  h,
  hhmm,
  isoDate,
  labels,
  money,
  openModal,
  spinner,
  statusBadge,
  toast,
  today,
} from "../ui.js";

let tab = "dashboard";

const BOOKING_STATUSES = ["pending", "confirmed", "completed", "cancelled", "no_show"];

export async function renderAdmin(root) {
  clear(root);
  if (!auth.isLoggedIn() || !auth.isStaff()) {
    root.appendChild(
      emptyState("Área restringida", "Esta sección está disponible para monitores y administradores.")
    );
    return;
  }

  root.appendChild(h("div", { class: "page-head" }, [h("h1", {}, "Panel del club"), h("p", {}, "Métricas, agenda y gestión.")]));

  const tabs = [["dashboard", "Resumen"], ["bookings", "Reservas"]];
  if (auth.isAdmin()) {
    tabs.push(["users", "Usuarios"], ["courts", "Pistas"]);
  }
  const seg = h("div", { class: "segmented", style: "margin-bottom:18px" },
    tabs.map(([key, text]) => h("button", { type: "button", "data-key": key, class: tab === key ? "is-active" : "", onclick: () => switchTab(key) }, text))
  );
  root.appendChild(seg);

  const host = h("div");
  root.appendChild(host);

  function switchTab(next) {
    tab = next;
    for (const b of seg.querySelectorAll("button")) b.classList.toggle("is-active", b.dataset.key === next);
    load();
  }

  switchTab(tab);

  function load() {
    if (tab === "dashboard") return renderDashboard(host);
    if (tab === "bookings") return renderAllBookings(host);
    if (tab === "users") return renderUsers(host);
    if (tab === "courts") return renderCourts(host);
  }
}

/* ---------------------------------------------------------- dashboard ---- */

async function renderDashboard(host) {
  clear(host);
  host.appendChild(spinner());
  try {
    const s = await api.get("/stats/dashboard");
    clear(host);

    const cards = [
      stat("Reservas hoy", s.bookings_today, true),
      stat("Próximas reservas", s.upcoming_bookings),
      stat("Reservas activas", s.active_bookings),
      stat("Canceladas", s.cancelled_bookings),
      stat("Cobrado (mes)", money(s.revenue_paid), true),
      stat("Pendiente de cobro", money(s.revenue_pending)),
      stat("Usuarios", s.total_users),
      stat("Pistas", s.total_courts),
      stat("Valoración media", s.average_rating ? `${s.average_rating} ★` : "—"),
    ];
    host.appendChild(h("div", { class: "grid grid--stats" }, cards));

    // Ocupación por pista
    const occ = h("section", { class: "section" }, [
      h("div", { class: "section__head" }, [h("h2", {}, `Ocupación · ${s.period}`)]),
    ]);
    if (s.occupancy.length) {
      const bars = h("div", { class: "weekbars" });
      for (const c of s.occupancy) {
        const pct = Math.round(c.occupancy_rate * 100);
        bars.appendChild(
          h("div", { class: "weekbar", style: "grid-template-columns:180px 1fr 60px" }, [
            h("div", { class: "weekbar__label" }, c.court_name),
            h("div", { class: "weekbar__track" }, h("div", { class: "weekbar__fill", style: `width:${Math.min(100, pct)}%` })),
            h("div", { class: "weekbar__val" }, `${pct}%`),
          ])
        );
      }
      occ.appendChild(h("div", { class: "card card--pad" }, bars));
    } else {
      occ.appendChild(emptyState("Sin datos de ocupación", "Aún no hay reservas este mes."));
    }
    host.appendChild(occ);

    // Distribución por estado + top jugadores
    const bottom = h("div", { class: "grid grid--two section" }, [
      card("Reservas por estado", listOfStatuses(s.bookings_by_status)),
      card("Jugadores más activos", listOfPlayers(s.top_players)),
    ]);
    host.appendChild(bottom);
  } catch (err) {
    clear(host);
    host.appendChild(emptyState("No se pudieron cargar las métricas", describeDetail(err.detail || err.message)));
  }
}

function stat(label, value, highlight) {
  return h("div", { class: `stat${highlight ? " stat--brand" : ""}` }, [
    h("div", { class: "stat__label" }, label),
    h("div", { class: "stat__value" }, String(value)),
  ]);
}

function card(title, body) {
  return h("div", { class: "card card--pad" }, [h("h3", { style: "margin-bottom:14px" }, title), body]);
}

function listOfStatuses(map) {
  const entries = Object.entries(map);
  if (!entries.length) return h("p", { class: "muted small" }, "Sin datos");
  return h("div", { class: "stack-tight" }, entries.map(([status, count]) =>
    h("div", { class: "between" }, [statusBadge("booking", status), h("b", {}, String(count))])
  ));
}

function listOfPlayers(players) {
  if (!players.length) return h("p", { class: "muted small" }, "Sin datos este mes");
  return h("div", { class: "stack-tight" }, players.map((p, i) =>
    h("div", { class: "between" }, [h("span", {}, `${i + 1}. ${p.full_name}`), h("span", { class: "chip chip--brand" }, `nivel ${p.level}`)])
  ));
}

/* ----------------------------------------------------- all bookings ---- */

async function renderAllBookings(host) {
  clear(host);
  host.appendChild(spinner());
  try {
    const bookings = await api.get("/bookings", { scope: "all", limit: 200 });
    clear(host);
    if (!bookings.length) {
      host.appendChild(emptyState("Sin reservas", "Todavía no se han creado reservas."));
      return;
    }
    const tbody = h("tbody");
    for (const b of bookings) tbody.appendChild(bookingRow(b, host));
    host.appendChild(
      h("div", { class: "table-wrap" }, h("table", { class: "data" }, [
        h("thead", {}, h("tr", {}, [
          h("th", {}, "#"), h("th", {}, "Cliente"), h("th", {}, "Pista"), h("th", {}, "Fecha"),
          h("th", {}, "Horario"), h("th", {}, "Total"), h("th", {}, "Estado"),
        ])),
        tbody,
      ]))
    );
  } catch (err) {
    clear(host);
    host.appendChild(emptyState("No se pudieron cargar las reservas", describeDetail(err.detail || err.message)));
  }
}

function bookingRow(b, host) {
  const statusSelect = h(
    "select",
    {
      style: "width:auto;padding:6px 10px",
      onchange: (e) => setStatus(b.id, e.target.value, host),
    },
    BOOKING_STATUSES.map((s) => h("option", { value: s, selected: s === b.status ? "" : null }, labels.bookingStatus(s)))
  );

  return h("tr", {}, [
    h("td", {}, `#${b.id}`),
    h("td", {}, b.user?.full_name ?? b.user_id),
    h("td", {}, b.court?.name ?? `#${b.court_id}`),
    h("td", {}, fmtLongDate(b.booking_date)),
    h("td", {}, `${hhmm(b.start_time)}–${hhmm(b.end_time)}`),
    h("td", {}, money(b.total_price)),
    h("td", {}, statusSelect),
  ]);
}

async function setStatus(id, status, host) {
  try {
    await api.patch(`/bookings/${id}/status`, { status });
    toast(`Reserva #${id} · ${labels.bookingStatus(status)}`);
  } catch (err) {
    toast(describeDetail(err.detail || err.message), "error");
    renderAllBookings(host);
  }
}

/* --------------------------------------------------------- users ---- */

async function renderUsers(host) {
  clear(host);
  host.appendChild(spinner());
  try {
    const users = await api.get("/users", { limit: 200 });
    clear(host);
    const tbody = h("tbody");
    for (const u of users) {
      const roleSel = h("select", {
        style: "width:auto;padding:6px 10px",
        onchange: (e) => updateUser(u.id, { role: e.target.value }, host),
      }, ["player", "coach", "admin"].map((r) => h("option", { value: r, selected: r === u.role ? "" : null }, labels.role(r))));

      tbody.appendChild(h("tr", {}, [
        h("td", {}, `#${u.id}`),
        h("td", {}, u.full_name),
        h("td", { class: "muted" }, u.email),
        h("td", {}, roleSel),
        h("td", {}, String(u.level)),
        h("td", {}, statusBadge("match", u.is_active ? "open" : "cancelled", u.is_active ? "Activo" : "Inactivo")),
        h("td", {}, h("button", { class: "btn btn--sm btn--ghost", onclick: () => updateUser(u.id, { is_active: !u.is_active }, host) }, u.is_active ? "Desactivar" : "Activar")),
      ]));
    }
    host.appendChild(
      h("div", { class: "table-wrap" }, h("table", { class: "data" }, [
        h("thead", {}, h("tr", {}, [h("th", {}, "#"), h("th", {}, "Nombre"), h("th", {}, "Email"), h("th", {}, "Rol"), h("th", {}, "Nivel"), h("th", {}, "Estado"), h("th", {}, "")])),
        tbody,
      ]))
    );
  } catch (err) {
    clear(host);
    host.appendChild(emptyState("No se pudieron cargar los usuarios", describeDetail(err.detail || err.message)));
  }
}

async function updateUser(id, payload, host) {
  try {
    await api.patch(`/users/${id}`, payload);
    toast("Usuario actualizado");
  } catch (err) {
    toast(describeDetail(err.detail || err.message), "error");
    renderUsers(host);
  }
}

/* --------------------------------------------------------- courts ---- */

async function renderCourts(host) {
  clear(host);
  host.appendChild(h("div", { class: "section__head" }, [
    h("h2", {}, "Pistas"),
    h("button", { class: "btn", onclick: () => createCourtModal(host) }, "＋ Nueva pista"),
  ]));
  const list = h("div", { class: "list" }, spinner());
  host.appendChild(list);
  try {
    const courts = await api.get("/courts", { include_unavailable: true }, { auth: false });
    clear(list);
    for (const c of courts) {
      list.appendChild(
        h("article", { class: "rowcard" }, [
          h("div", { class: "rowcard__main" }, [
            h("span", { class: "rowcard__title" }, `${c.name} · Nº ${c.court_number}`),
            h("div", { class: "rowcard__meta" }, [
              h("span", {}, labels.environment(c.environment)),
              h("span", {}, labels.surface(c.surface)),
              h("span", {}, [h("b", {}, money(c.price_per_hour)), " /h"]),
              h("span", {}, c.status),
            ]),
          ]),
          h("div", { class: "rowcard__side" }, [
            h("button", { class: "btn btn--sm btn--danger", onclick: () => deleteCourt(c, host) }, "Eliminar"),
          ]),
        ])
      );
    }
  } catch (err) {
    clear(list);
    list.appendChild(emptyState("No se pudieron cargar las pistas", describeDetail(err.detail || err.message)));
  }
}

async function deleteCourt(court, host) {
  try {
    await api.del(`/courts/${court.id}`);
    toast("Pista eliminada");
    renderCourts(host);
  } catch (err) {
    toast(describeDetail(err.detail || err.message), "error");
  }
}

function createCourtModal(host) {
  const form = h("form", { class: "stack" }, [
    h("div", { class: "row" }, [
      field("Nombre", h("input", { name: "name", required: "", minlength: "2", placeholder: "Pista Central" })),
      field("Número", h("input", { type: "number", name: "court_number", min: "1", max: "99", value: "1", required: "" })),
    ]),
    h("div", { class: "row" }, [
      field("Superficie", h("select", { name: "surface" }, [["panoramic", "Panorámica"], ["prefabricated", "Prefabricada"], ["concrete", "Hormigón"]].map(([v, t]) => h("option", { value: v }, t)))),
      field("Ambiente", h("select", { name: "environment" }, [["outdoor", "Outdoor"], ["indoor", "Indoor"]].map(([v, t]) => h("option", { value: v }, t)))),
    ]),
    h("div", { class: "row-3" }, [
      field("Precio/hora (€)", h("input", { type: "number", name: "price_per_hour", min: "1", step: "0.5", value: "24", required: "" })),
      field("Iluminación", h("select", { name: "has_lighting" }, [["true", "Sí"], ["false", "No"]].map(([v, t]) => h("option", { value: v }, t)))),
      field("Cubierta", h("select", { name: "is_covered" }, [["false", "No"], ["true", "Sí"]].map(([v, t]) => h("option", { value: v }, t)))),
    ]),
    field("Descripción", h("textarea", { name: "description", maxlength: "1000" })),
  ]);
  const errorBox = h("div", { class: "toast toast--error", style: "display:none" });
  form.prepend(errorBox);
  const submit = h("button", { class: "btn", type: "submit" }, "Crear pista");
  const modal = openModal({ title: "Nueva pista", body: form, footer: [h("button", { class: "btn btn--ghost", onclick: () => modal.close() }, "Cancelar"), submit] });
  submit.addEventListener("click", () => form.requestSubmit());

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form).entries());
    submit.disabled = true;
    try {
      await api.post("/courts", {
        name: f.name,
        court_number: Number(f.court_number),
        surface: f.surface,
        environment: f.environment,
        has_lighting: f.has_lighting === "true",
        is_covered: f.is_covered === "true",
        price_per_hour: f.price_per_hour,
        description: f.description || null,
      });
      modal.close();
      toast("Pista creada");
      renderCourts(host);
    } catch (err) {
      errorBox.textContent = describeDetail(err.detail || err.message);
      errorBox.style.display = "block";
      submit.disabled = false;
    }
  });
}

function field(labelText, input) {
  return h("div", { class: "field" }, [h("label", {}, labelText), input]);
}
