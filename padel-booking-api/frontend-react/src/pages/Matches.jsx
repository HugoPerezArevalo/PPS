import { useCallback, useEffect, useState } from "react";

import { EmptyState, Field, Modal, Spinner, StatusBadge } from "../components/ui.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { api, describeDetail } from "../lib/api.js";
import { RULES } from "../lib/config.js";
import { fmtLongDate, hhmm, isoDate, today } from "../lib/format.js";

/* ------------------------------------------------------- Create modal ---- */

function CreateMatchModal({ onClose, onCreated }) {
  const toast = useToast();
  const [courts, setCourts] = useState([]);
  const [form, setForm] = useState({
    match_date: isoDate(today()),
    start_time: "19:00",
    duration_minutes: 90,
    players_needed: 2,
    min_level: 1,
    max_level: 7,
    court_id: "",
    notes: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get("/courts", null, { auth: false })
      .then(setCourts)
      .catch(() => {});
  }, []);

  async function submit(e) {
    e.preventDefault();
    if (Number(form.min_level) > Number(form.max_level)) {
      setError("El nivel mínimo no puede ser mayor que el máximo");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.post("/matches", {
        match_date: form.match_date,
        start_time: form.start_time,
        duration_minutes: Number(form.duration_minutes),
        players_needed: Number(form.players_needed),
        min_level: Number(form.min_level),
        max_level: Number(form.max_level),
        court_id: form.court_id ? Number(form.court_id) : null,
        notes: form.notes || null,
      });
      toast("Partido publicado 🎾");
      onCreated();
    } catch (err) {
      setError(describeDetail(err.detail || err.message));
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Publicar partido"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--ghost" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn" type="submit" form="match-form" disabled={busy}>
            {busy ? "Publicando…" : "Publicar partido"}
          </button>
        </>
      }
    >
      <form id="match-form" className="stack" onSubmit={submit}>
        {error ? <div className="toast toast--error">{error}</div> : null}
        <div className="row">
          <Field label="Fecha">
            <input
              type="date"
              required
              min={isoDate(today())}
              value={form.match_date}
              onChange={(e) => setForm({ ...form, match_date: e.target.value })}
            />
          </Field>
          <Field label="Hora">
            <input
              type="time"
              step={1800}
              required
              value={form.start_time}
              onChange={(e) => setForm({ ...form, start_time: e.target.value })}
            />
          </Field>
        </div>
        <div className="row-3">
          <Field label="Duración">
            <select
              value={form.duration_minutes}
              onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })}
            >
              {[60, 90, 120, 150, 180].map((n) => (
                <option key={n} value={n}>
                  {n === 60 ? "1 h" : `${n} min`}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Jugadores que faltan">
            <select
              value={form.players_needed}
              onChange={(e) => setForm({ ...form, players_needed: Number(e.target.value) })}
            >
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nivel mínimo">
            <input
              type="number"
              min={RULES.minLevel}
              max={RULES.maxLevel}
              step={0.5}
              value={form.min_level}
              onChange={(e) => setForm({ ...form, min_level: e.target.value })}
            />
          </Field>
        </div>
        <div className="row">
          <Field label="Nivel máximo">
            <input
              type="number"
              min={RULES.minLevel}
              max={RULES.maxLevel}
              step={0.5}
              value={form.max_level}
              onChange={(e) => setForm({ ...form, max_level: e.target.value })}
            />
          </Field>
          <Field label="Pista (opcional)">
            <select value={form.court_id} onChange={(e) => setForm({ ...form, court_id: e.target.value })}>
              <option value="">Sin asignar</option>
              {courts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} (Nº {c.court_number})
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Notas (opcional)">
          <textarea
            maxLength={500}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Ej.: partido amistoso, buen rollo."
          />
        </Field>
      </form>
    </Modal>
  );
}

/* -------------------------------------------------------- Apply modal ---- */

function ApplyModal({ match, onClose, onApplied }) {
  const { user } = useAuth();
  const toast = useToast();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.post(`/matches/${match.id}/apply`, { message: message || null });
      toast("Solicitud enviada ✉️");
      onApplied();
    } catch (err) {
      setError(describeDetail(err.detail || err.message));
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Solicitar plaza"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--ghost" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn" type="submit" form="apply-form" disabled={busy}>
            Enviar solicitud
          </button>
        </>
      }
    >
      <form id="apply-form" className="stack" onSubmit={submit}>
        {error ? <div className="toast toast--error">{error}</div> : null}
        <div className="summary">
          <div className="summary__row">
            <span>Partido</span>
            <b>de {match.user.full_name}</b>
          </div>
          <div className="summary__row">
            <span>Fecha</span>
            <b>
              {fmtLongDate(match.match_date)} · {hhmm(match.start_time)}
            </b>
          </div>
          <div className="summary__row">
            <span>Nivel requerido</span>
            <b>
              {match.min_level}–{match.max_level} · tú: {user?.level ?? "?"}
            </b>
          </div>
        </div>
        <Field label="Mensaje para el anfitrión (opcional)">
          <textarea
            maxLength={255}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="¡Hola! Cuento con ese nivel y busco partido."
          />
        </Field>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------- Page ---- */

export function Matches() {
  const { user } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState("browse");
  const [browseFilters, setBrowseFilters] = useState({ date_from: "", min_level: "" });
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [applyTo, setApplyTo] = useState(null);
  const [nonce, setNonce] = useState(0);

  const load = useCallback(async () => {
    setItems(null);
    setError("");
    try {
      if (tab === "browse") {
        const query = { status: "open", limit: 100 };
        if (browseFilters.date_from) query.date_from = browseFilters.date_from;
        if (browseFilters.min_level) query.min_level = browseFilters.min_level;
        const data = await api.get("/matches", query);
        setItems(data.items);
      } else {
        setItems(await api.get("/matches/me"));
      }
    } catch (err) {
      setError(describeDetail(err.detail || err.message));
    }
  }, [tab, browseFilters, nonce]);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(match, application, action) {
    try {
      await api.post(`/matches/${match.id}/applications/${application.id}/${action}`, {});
      toast(action === "accept" ? "Solicitud aceptada" : "Solicitud rechazada");
      load();
    } catch (err) {
      toast(describeDetail(err.detail || err.message), "error");
    }
  }

  async function closeOrCancel(match, action) {
    try {
      await api.post(`/matches/${match.id}/${action}`, {});
      toast(`Partido ${action === "cancel" ? "cancelado" : "finalizado"}`);
      load();
    } catch (err) {
      toast(describeDetail(err.detail || err.message), "error");
    }
  }

  return (
    <>
      <div className="page-head between">
        <div>
          <h1>Partidos</h1>
          <p>Encuentra compañeros y rivales con tu nivel.</p>
        </div>
        <button className="btn" onClick={() => setShowCreate(true)}>
          ＋ Publicar partido
        </button>
      </div>

      <div className="segmented" style={{ marginBottom: 18 }}>
        <button type="button" className={tab === "browse" ? "is-active" : ""} onClick={() => setTab("browse")}>
          Buscar partidos
        </button>
        <button type="button" className={tab === "mine" ? "is-active" : ""} onClick={() => setTab("mine")}>
          Mis partidos
        </button>
      </div>

      {tab === "browse" ? (
        <form
          className="filters"
          style={{ marginBottom: 18 }}
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
        >
          <Field label="Desde">
            <input
              type="date"
              min={isoDate(today())}
              value={browseFilters.date_from}
              onChange={(e) => setBrowseFilters({ ...browseFilters, date_from: e.target.value })}
            />
          </Field>
          <Field label="Nivel mínimo">
            <input
              type="number"
              min={RULES.minLevel}
              max={RULES.maxLevel}
              step={0.5}
              placeholder="1.0–7.0"
              value={browseFilters.min_level}
              onChange={(e) => setBrowseFilters({ ...browseFilters, min_level: e.target.value })}
            />
          </Field>
          <button className="btn" type="submit">
            Buscar
          </button>
        </form>
      ) : null}

      <div className="list">
        {error ? (
          <EmptyState title="No se pudieron cargar los partidos" message={error} />
        ) : items === null ? (
          <Spinner />
        ) : items.length === 0 ? (
          <EmptyState
            title={tab === "browse" ? "No hay partidos abiertos" : "No has publicado partidos"}
            message={
              tab === "browse"
                ? "Prueba a quitar filtros o publica tu propio partido."
                : "Publica un partido para encontrar jugadores."
            }
          />
        ) : (
          items.map((m) => {
            const isOwner = user && m.user.id === user.id;
            const slotsLeft = Math.max(0, m.players_needed - m.accepted_count);
            return (
              <article className="rowcard" key={m.id}>
                <div className="rowcard__main">
                  <div className="between">
                    <span className="rowcard__title">Partido de {m.user.full_name}</span>
                    <StatusBadge kind="match" status={m.status} />
                  </div>
                  <div className="rowcard__meta">
                    <span>
                      📅 <b>{fmtLongDate(m.match_date)}</b>
                    </span>
                    <span>
                      ⏰ <b>{`${hhmm(m.start_time)} · ${m.duration_minutes} min`}</b>
                    </span>
                    <span>
                      🎯 Nivel <b>{`${m.min_level}–${m.max_level}`}</b>
                    </span>
                    <span>
                      🧑 Nivel del anfitrión: <b>{m.user.level}</b>
                    </span>
                    {m.court_id ? (
                      <span>
                        🏟️ Pista <b>#{m.court_id}</b>
                      </span>
                    ) : null}
                  </div>
                  {m.notes ? <p className="small muted" style={{ margin: 0 }}>📝 {m.notes}</p> : null}

                  {tab === "mine" && m.applications?.length ? (
                    <div className="stack" style={{ marginTop: 4 }}>
                      <span className="small muted">Solicitudes</span>
                      {m.applications.map((a) => (
                        <div
                          key={a.id}
                          className="between"
                          style={{ padding: "8px 12px", background: "var(--brand-tint)", borderRadius: 10 }}
                        >
                          <span className="small">
                            <b>{a.user.full_name}</b> · nivel {a.user.level}
                            {a.message ? ` · “${a.message}”` : ""}
                          </span>
                          <span className="pill-list">
                            <StatusBadge kind="application" status={a.status} />
                            {a.status === "pending" ? (
                              <>
                                <button className="btn btn--sm" onClick={() => decide(m, a, "accept")}>
                                  Aceptar
                                </button>
                                <button className="btn btn--sm btn--danger" onClick={() => decide(m, a, "reject")}>
                                  Rechazar
                                </button>
                              </>
                            ) : null}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="rowcard__side">
                  {tab === "mine" || isOwner ? (
                    <>
                      <span className="chip chip--brand">{`${m.accepted_count}/${m.players_needed} aceptados`}</span>
                      {m.status === "open" ? (
                        <button className="btn btn--sm btn--ghost" onClick={() => closeOrCancel(m, "cancel")}>
                          Cancelar
                        </button>
                      ) : null}
                      {m.status === "open" || m.status === "full" ? (
                        <button className="btn btn--sm btn--soft" onClick={() => closeOrCancel(m, "close")}>
                          Finalizar
                        </button>
                      ) : null}
                    </>
                  ) : m.status === "open" && slotsLeft > 0 ? (
                    <button className="btn btn--sm" onClick={() => setApplyTo(m)}>
                      Solicitar plaza
                    </button>
                  ) : (
                    <StatusBadge kind="match" status={m.status} />
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>

      {showCreate ? (
        <CreateMatchModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            setTab("mine");
            setNonce((n) => n + 1);
          }}
        />
      ) : null}

      {applyTo ? (
        <ApplyModal
          match={applyTo}
          onClose={() => setApplyTo(null)}
          onApplied={() => {
            setApplyTo(null);
            load();
          }}
        />
      ) : null}
    </>
  );
}
