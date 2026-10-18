// Vista "Partidos": buscar, publicar, solicitar plaza y gestionar solicitudes.

import { api, describeDetail } from "../api.js";
import { RULES } from "../config.js";
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
import { openAuthModal } from "../components/auth.js";

let tab = "browse";
const browseFilters = { date_from: "", min_level: "" };

export async function renderMatches(root) {
  clear(root);
  if (!auth.isLoggedIn()) {
    root.appendChild(
      h("div", { class: "empty" }, [
        h("h3", {}, "Matchmaking para jugadores"),
        h("p", {}, "Inicia sesión para buscar partidos, publicar los tuyos y solicitar plaza."),
        h("button", { class: "btn", onclick: () => openAuthModal("login", () => window.dispatchEvent(new HashChangeEvent("hashchange"))) }, "Iniciar sesión"),
      ])
    );
    return;
  }

  root.appendChild(
    h("div", { class: "page-head between" }, [
      h("div", {}, [h("h1", {}, "Partidos"), h("p", {}, "Encuentra compañeros y rivales con tu nivel.")]),
      h("button", { class: "btn", onclick: () => createMatchModal(loadCurrent) }, "＋ Publicar partido"),
    ])
  );

  const seg = h("div", { class: "segmented", style: "margin-bottom:18px" }, [
    h("button", { type: "button", class: tab === "browse" ? "is-active" : "", onclick: () => switchTab("browse") }, "Buscar partidos"),
    h("button", { type: "button", class: tab === "mine" ? "is-active" : "", onclick: () => switchTab("mine") }, "Mis partidos"),
  ]);
  root.appendChild(seg);
  const host = h("div");
  root.appendChild(host);

  function switchTab(next) {
    tab = next;
    for (const b of seg.querySelectorAll("button")) b.classList.toggle("is-active", b.textContent === (next === "browse" ? "Buscar partidos" : "Mis partidos"));
    loadCurrent();
  }

  function loadCurrent() {
    if (tab === "browse") loadBrowse(host);
    else loadMine(host);
  }

  loadCurrent();
}

/* ------------------------------------------------------------- browse ---- */

async function loadBrowse(host) {
  clear(host);

  const filters = h("form", { class: "filters", style: "margin-bottom:18px" }, [
    field("Desde", h("input", { type: "date", name: "date_from", value: browseFilters.date_from, min: isoDate(today()) })),
    field("Nivel mínimo", h("input", { type: "number", name: "min_level", min: RULES.minLevel, max: RULES.maxLevel, step: "0.5", value: browseFilters.min_level, placeholder: "1.0–7.0" })),
    h("button", { class: "btn", type: "submit" }, "Buscar"),
  ]);
  const list = h("div", { class: "list" });
  host.appendChild(filters);
  host.appendChild(list);

  filters.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(filters).entries());
    browseFilters.date_from = f.date_from;
    browseFilters.min_level = f.min_level;
    load();
  });

  async function load() {
    clear(list);
    list.appendChild(spinner());
    try {
      const query = { status: "open", limit: 100 };
      if (browseFilters.date_from) query.date_from = browseFilters.date_from;
      if (browseFilters.min_level) query.min_level = browseFilters.min_level;
      const data = await api.get("/matches", query);
      clear(list);
      if (!data.items.length) {
        list.appendChild(emptyState("No hay partidos abiertos", "Prueba a quitar filtros o publica tu propio partido."));
        return;
      }
      for (const m of data.items) list.appendChild(matchCard(m, load, false));
    } catch (err) {
      clear(list);
      list.appendChild(emptyState("No se pudieron cargar los partidos", describeDetail(err.detail || err.message)));
    }
  }

  await load();
}

/* --------------------------------------------------------------- mine ---- */

async function loadMine(host) {
  clear(host);
  const list = h("div", { class: "list" }, spinner());
  host.appendChild(list);
  try {
    const matches = await api.get("/matches/me");
    clear(list);
    if (!matches.length) {
      list.appendChild(emptyState("No has publicado partidos", "Publica un partido para encontrar jugadores."));
      return;
    }
    for (const m of matches) list.appendChild(matchCard(m, () => loadMine(host), true));
  } catch (err) {
    clear(list);
    list.appendChild(emptyState("No se pudieron cargar tus partidos", describeDetail(err.detail || err.message)));
  }
}

/* -------------------------------------------------------- match card ---- */

function matchCard(m, reload, isMine) {
  const me = auth.user();
  const isOwner = me && m.user.id === me.id;
  const slotsLeft = Math.max(0, m.players_needed - m.accepted_count);

  const side = [];
  if (isMine || isOwner) {
    side.push(h("span", { class: "chip chip--brand" }, `${m.accepted_count}/${m.players_needed} aceptados`));
    if (m.status === "open") side.push(h("button", { class: "btn btn--sm btn--ghost", onclick: () => closeOrCancel(m, "cancel", reload) }, "Cancelar"));
    if (m.status === "open" || m.status === "full") side.push(h("button", { class: "btn btn--sm btn--soft", onclick: () => closeOrCancel(m, "close", reload) }, "Finalizar"));
  } else if (m.status === "open" && slotsLeft > 0) {
    side.push(h("button", { class: "btn btn--sm", onclick: () => applyModal(m, reload) }, "Solicitar plaza"));
  } else if (m.status !== "open") {
    side.push(statusBadge("match", m.status));
  }

  const apps = isMine && m.applications?.length
    ? h("div", { class: "stack", style: "margin-top:4px" }, [
        h("span", { class: "small muted" }, "Solicitudes"),
        ...m.applications.map((a) => applicationRow(m, a, reload)),
      ])
    : null;

  return h("article", { class: "rowcard" }, [
    h("div", { class: "rowcard__main" }, [
      h("div", { class: "between" }, [
        h("span", { class: "rowcard__title" }, `Partido de ${m.user.full_name}`),
        statusBadge("match", m.status),
      ]),
      h("div", { class: "rowcard__meta" }, [
        h("span", {}, ["📅 ", h("b", {}, fmtLongDate(m.match_date))]),
        h("span", {}, ["⏰ ", h("b", {}, `${hhmm(m.start_time)} · ${m.duration_minutes} min`)]),
        h("span", {}, ["🎯 Nivel ", h("b", {}, `${m.min_level}–${m.max_level}`)]),
        h("span", {}, ["🧑 Nivel del anfitrión: ", h("b", {}, m.user.level)]),
        m.court_id ? h("span", {}, ["🏟️ Pista ", h("b", {}, `#${m.court_id}`)]) : null,
      ]),
      m.notes ? h("p", { class: "small muted", style: "margin:0" }, `📝 ${m.notes}`) : null,
      apps,
    ]),
    h("div", { class: "rowcard__side" }, side),
  ]);
}

function applicationRow(m, a, reload) {
  const actions = [];
  if (a.status === "pending") {
    actions.push(h("button", { class: "btn btn--sm", onclick: () => decide(m, a, "accept", reload) }, "Aceptar"));
    actions.push(h("button", { class: "btn btn--sm btn--danger", onclick: () => decide(m, a, "reject", reload) }, "Rechazar"));
  }
  return h("div", { class: "between", style: "padding:8px 12px;background:var(--brand-tint);border-radius:10px" }, [
    h("span", { class: "small" }, [h("b", {}, a.user.full_name), ` · nivel ${a.user.level}`, a.message ? ` · “${a.message}”` : ""]),
    h("span", { class: "pill-list" }, [statusBadge("application", a.status), ...actions]),
  ]);
}

/* ------------------------------------------------------------ actions ---- */

async function decide(m, application, action, reload) {
  try {
    await api.post(`/matches/${m.id}/applications/${application.id}/${action}`, {});
    toast(action === "accept" ? "Solicitud aceptada" : "Solicitud rechazada");
    reload();
  } catch (err) {
    toast(describeDetail(err.detail || err.message), "error");
  }
}

async function closeOrCancel(m, action, reload) {
  const label = action === "cancel" ? "cancelar" : "finalizar";
  try {
    await api.post(`/matches/${m.id}/${action}`, {});
    toast(`Partido ${action === "cancel" ? "cancelado" : "finalizado"}`);
    reload();
  } catch (err) {
    toast(describeDetail(err.detail || err.message), "error");
  }
}

function applyModal(m, reload) {
  const me = auth.user();
  const form = h("form", { class: "stack" }, [
    h("div", { class: "summary" }, [
      h("div", { class: "summary__row" }, [h("span", {}, "Partido"), h("b", {}, `de ${m.user.full_name}`)]),
      h("div", { class: "summary__row" }, [h("span", {}, "Fecha"), h("b", {}, `${fmtLongDate(m.match_date)} · ${hhmm(m.start_time)}`)]),
      h("div", { class: "summary__row" }, [h("span", {}, "Nivel requerido"), h("b", {}, `${m.min_level}–${m.max_level} · tú: ${me?.level ?? "?"}`)]),
    ]),
    field("Mensaje para el anfitrión (opcional)", h("textarea", { name: "message", maxlength: "255", placeholder: "¡Hola! Cuento con ese nivel y busco partido." })),
  ]);
  const errorBox = h("div", { class: "toast toast--error", style: "display:none" });
  form.prepend(errorBox);
  const submit = h("button", { class: "btn", type: "submit" }, "Enviar solicitud");
  const modal = openModal({ title: "Solicitar plaza", body: form, footer: [h("button", { class: "btn btn--ghost", onclick: () => modal.close() }, "Cancelar"), submit] });
  submit.addEventListener("click", () => form.requestSubmit());

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form).entries());
    submit.disabled = true;
    try {
      await api.post(`/matches/${m.id}/apply`, { message: f.message || null });
      modal.close();
      toast("Solicitud enviada ✉️");
      reload();
    } catch (err) {
      errorBox.textContent = describeDetail(err.detail || err.message);
      errorBox.style.display = "block";
      submit.disabled = false;
    }
  });
}

function createMatchModal(reload) {
  const form = h("form", { class: "stack" }, [
    h("div", { class: "row" }, [
      field("Fecha", h("input", { type: "date", name: "match_date", value: isoDate(today()), min: isoDate(today()), required: "" })),
      field("Hora", h("input", { type: "time", name: "start_time", value: "19:00", step: "1800", required: "" })),
    ]),
    h("div", { class: "row-3" }, [
      field("Duración", h("select", { name: "duration_minutes" }, [60, 90, 120, 150, 180].map((n) => h("option", { value: String(n), selected: n === 90 ? "" : null }, n === 60 ? "1 h" : `${n} min`)))),
      field("Jugadores que faltan", h("select", { name: "players_needed" }, [1, 2, 3].map((n) => h("option", { value: String(n), selected: n === 2 ? "" : null }, String(n))))),
      field("Nivel mínimo", h("input", { type: "number", name: "min_level", min: RULES.minLevel, max: RULES.maxLevel, step: "0.5", value: "1.0" })),
    ]),
    h("div", { class: "row" }, [
      field("Nivel máximo", h("input", { type: "number", name: "max_level", min: RULES.minLevel, max: RULES.maxLevel, step: "0.5", value: "7.0" })),
      field("Pista (opcional)", h("select", { name: "court_id" }, [h("option", { value: "" }, "Sin asignar")])),
    ]),
    field("Notas (opcional)", h("textarea", { name: "notes", maxlength: "500", placeholder: "Ej.: partido amistoso, buen rollo." })),
  ]);

  // Rellena el selector de pistas.
  api.get("/courts", null, { auth: false }).then((courts) => {
    const sel = form.querySelector("select[name=court_id]");
    for (const c of courts) sel.appendChild(h("option", { value: String(c.id) }, `${c.name} (Nº ${c.court_number})`));
  }).catch(() => {});

  const errorBox = h("div", { class: "toast toast--error", style: "display:none" });
  form.prepend(errorBox);
  const submit = h("button", { class: "btn", type: "submit" }, "Publicar partido");
  const modal = openModal({ title: "Publicar partido", body: form, footer: [h("button", { class: "btn btn--ghost", onclick: () => modal.close() }, "Cancelar"), submit] });
  submit.addEventListener("click", () => form.requestSubmit());

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form).entries());
    if (Number(f.min_level) > Number(f.max_level)) {
      errorBox.textContent = "El nivel mínimo no puede ser mayor que el máximo";
      errorBox.style.display = "block";
      return;
    }
    submit.disabled = true;
    submit.textContent = "Publicando…";
    try {
      await api.post("/matches", {
        match_date: f.match_date,
        start_time: f.start_time,
        duration_minutes: Number(f.duration_minutes),
        players_needed: Number(f.players_needed),
        min_level: Number(f.min_level),
        max_level: Number(f.max_level),
        court_id: f.court_id ? Number(f.court_id) : null,
        notes: f.notes || null,
      });
      modal.close();
      toast("Partido publicado 🎾");
      reload();
    } catch (err) {
      errorBox.textContent = describeDetail(err.detail || err.message);
      errorBox.style.display = "block";
      submit.disabled = false;
      submit.textContent = "Publicar partido";
    }
  });
}

function field(labelText, input) {
  return h("div", { class: "field" }, [h("label", {}, labelText), input]);
}
