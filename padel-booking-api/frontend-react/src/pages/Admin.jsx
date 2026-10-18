import { useCallback, useEffect, useState } from "react";

import { EmptyState, Field, Modal, Spinner, StatusBadge } from "../components/ui.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { api, describeDetail } from "../lib/api.js";
import { fmtLongDate, hhmm, money } from "../lib/format.js";
import { labels } from "../lib/labels.js";

const BOOKING_STATUSES = ["pending", "confirmed", "completed", "cancelled", "no_show"];
const ROLES = ["player", "coach", "admin"];

/* --------------------------------------------------------- Dashboard ---- */

function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/stats/dashboard")
      .then(setData)
      .catch((err) => setError(describeDetail(err.detail || err.message)));
  }, []);

  if (error) return <EmptyState title="No se pudieron cargar las métricas" message={error} />;
  if (!data) return <Spinner />;

  const stats = [
    ["Reservas hoy", data.bookings_today, true],
    ["Próximas reservas", data.upcoming_bookings],
    ["Reservas activas", data.active_bookings],
    ["Canceladas", data.cancelled_bookings],
    ["Cobrado (mes)", money(data.revenue_paid), true],
    ["Pendiente de cobro", money(data.revenue_pending)],
    ["Usuarios", data.total_users],
    ["Pistas", data.total_courts],
    ["Valoración media", data.average_rating ? `${data.average_rating} ★` : "—"],
  ];

  return (
    <>
      <div className="grid grid--stats">
        {stats.map(([label, value, highlight]) => (
          <div className={`stat${highlight ? " stat--brand" : ""}`} key={label}>
            <div className="stat__label">{label}</div>
            <div className="stat__value">{String(value)}</div>
          </div>
        ))}
      </div>

      <section className="section">
        <div className="section__head">
          <h2>Ocupación · {data.period}</h2>
        </div>
        {data.occupancy.length ? (
          <div className="card card--pad">
            <div className="weekbars">
              {data.occupancy.map((c) => {
                const pct = Math.round(c.occupancy_rate * 100);
                return (
                  <div className="weekbar" key={c.court_name} style={{ gridTemplateColumns: "180px 1fr 60px" }}>
                    <div className="weekbar__label">{c.court_name}</div>
                    <div className="weekbar__track">
                      <div className="weekbar__fill" style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                    <div className="weekbar__val">{pct}%</div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <EmptyState title="Sin datos de ocupación" message="Aún no hay reservas este mes." />
        )}
      </section>

      <div className="grid grid--two section">
        <div className="card card--pad">
          <h3 style={{ marginBottom: 14 }}>Reservas por estado</h3>
          <div className="stack-tight">
            {Object.entries(data.bookings_by_status).map(([status, count]) => (
              <div className="between" key={status}>
                <StatusBadge kind="booking" status={status} />
                <b>{count}</b>
              </div>
            ))}
          </div>
        </div>
        <div className="card card--pad">
          <h3 style={{ marginBottom: 14 }}>Jugadores más activos</h3>
          <div className="stack-tight">
            {data.top_players.length ? (
              data.top_players.map((p, i) => (
                <div className="between" key={p.full_name}>
                  <span>
                    {i + 1}. {p.full_name}
                  </span>
                  <span className="chip chip--brand">nivel {p.level}</span>
                </div>
              ))
            ) : (
              <p className="muted small">Sin datos este mes</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------------------------------------------------- All bookings ---- */

function AllBookings() {
  const toast = useToast();
  const [bookings, setBookings] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setBookings(null);
    setError("");
    try {
      setBookings(await api.get("/bookings", { scope: "all", limit: 200 }));
    } catch (err) {
      setError(describeDetail(err.detail || err.message));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(id, status) {
    try {
      await api.patch(`/bookings/${id}/status`, { status });
      toast(`Reserva #${id} · ${labels.bookingStatus(status)}`);
    } catch (err) {
      toast(describeDetail(err.detail || err.message), "error");
      load();
    }
  }

  if (error) return <EmptyState title="No se pudieron cargar las reservas" message={error} />;
  if (!bookings) return <Spinner />;
  if (!bookings.length) return <EmptyState title="Sin reservas" message="Todavía no se han creado reservas." />;

  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>#</th>
            <th>Cliente</th>
            <th>Pista</th>
            <th>Fecha</th>
            <th>Horario</th>
            <th>Total</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {bookings.map((b) => (
            <tr key={b.id}>
              <td>#{b.id}</td>
              <td>{b.user?.full_name ?? b.user_id}</td>
              <td>{b.court?.name ?? `#${b.court_id}`}</td>
              <td>{fmtLongDate(b.booking_date)}</td>
              <td>{`${hhmm(b.start_time)}–${hhmm(b.end_time)}`}</td>
              <td>{money(b.total_price)}</td>
              <td>
                <select
                  style={{ width: "auto", padding: "6px 10px" }}
                  value={b.status}
                  onChange={(e) => setStatus(b.id, e.target.value)}
                >
                  {BOOKING_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {labels.bookingStatus(s)}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------ Users ---- */

function Users() {
  const toast = useToast();
  const [users, setUsers] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setUsers(null);
    setError("");
    try {
      setUsers(await api.get("/users", { limit: 200 }));
    } catch (err) {
      setError(describeDetail(err.detail || err.message));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function update(id, payload) {
    try {
      await api.patch(`/users/${id}`, payload);
      toast("Usuario actualizado");
      load();
    } catch (err) {
      toast(describeDetail(err.detail || err.message), "error");
      load();
    }
  }

  if (error) return <EmptyState title="No se pudieron cargar los usuarios" message={error} />;
  if (!users) return <Spinner />;

  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>#</th>
            <th>Nombre</th>
            <th>Email</th>
            <th>Rol</th>
            <th>Nivel</th>
            <th>Estado</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>#{u.id}</td>
              <td>{u.full_name}</td>
              <td className="muted">{u.email}</td>
              <td>
                <select
                  style={{ width: "auto", padding: "6px 10px" }}
                  value={u.role}
                  onChange={(e) => update(u.id, { role: e.target.value })}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {labels.role(r)}
                    </option>
                  ))}
                </select>
              </td>
              <td>{String(u.level)}</td>
              <td>
                <StatusBadge kind="match" status={u.is_active ? "open" : "cancelled"} text={u.is_active ? "Activo" : "Inactivo"} />
              </td>
              <td>
                <button className="btn btn--sm btn--ghost" onClick={() => update(u.id, { is_active: !u.is_active })}>
                  {u.is_active ? "Desactivar" : "Activar"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------ Courts ---- */

function CreateCourtModal({ onClose, onCreated }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: "",
    court_number: 1,
    surface: "panoramic",
    environment: "outdoor",
    price_per_hour: 24,
    has_lighting: "true",
    is_covered: "false",
    description: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.post("/courts", {
        name: form.name,
        court_number: Number(form.court_number),
        surface: form.surface,
        environment: form.environment,
        has_lighting: form.has_lighting === "true",
        is_covered: form.is_covered === "true",
        price_per_hour: form.price_per_hour,
        description: form.description || null,
      });
      toast("Pista creada");
      onCreated();
    } catch (err) {
      setError(describeDetail(err.detail || err.message));
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Nueva pista"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--ghost" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn" type="submit" form="court-form" disabled={busy}>
            Crear pista
          </button>
        </>
      }
    >
      <form id="court-form" className="stack" onSubmit={submit}>
        {error ? <div className="toast toast--error">{error}</div> : null}
        <div className="row">
          <Field label="Nombre">
            <input
              required
              minLength={2}
              placeholder="Pista Central"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Número">
            <input
              type="number"
              min={1}
              max={99}
              required
              value={form.court_number}
              onChange={(e) => setForm({ ...form, court_number: e.target.value })}
            />
          </Field>
        </div>
        <div className="row">
          <Field label="Superficie">
            <select value={form.surface} onChange={(e) => setForm({ ...form, surface: e.target.value })}>
              <option value="panoramic">Panorámica</option>
              <option value="prefabricated">Prefabricada</option>
              <option value="concrete">Hormigón</option>
            </select>
          </Field>
          <Field label="Ambiente">
            <select value={form.environment} onChange={(e) => setForm({ ...form, environment: e.target.value })}>
              <option value="outdoor">Outdoor</option>
              <option value="indoor">Indoor</option>
            </select>
          </Field>
        </div>
        <div className="row-3">
          <Field label="Precio/hora (€)">
            <input
              type="number"
              min={1}
              step={0.5}
              required
              value={form.price_per_hour}
              onChange={(e) => setForm({ ...form, price_per_hour: e.target.value })}
            />
          </Field>
          <Field label="Iluminación">
            <select value={form.has_lighting} onChange={(e) => setForm({ ...form, has_lighting: e.target.value })}>
              <option value="true">Sí</option>
              <option value="false">No</option>
            </select>
          </Field>
          <Field label="Cubierta">
            <select value={form.is_covered} onChange={(e) => setForm({ ...form, is_covered: e.target.value })}>
              <option value="false">No</option>
              <option value="true">Sí</option>
            </select>
          </Field>
        </div>
        <Field label="Descripción">
          <textarea
            maxLength={1000}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </Field>
      </form>
    </Modal>
  );
}

function Courts() {
  const toast = useToast();
  const [courts, setCourts] = useState(null);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [nonce, setNonce] = useState(0);

  const load = useCallback(async () => {
    setCourts(null);
    setError("");
    try {
      setCourts(await api.get("/courts", { include_unavailable: true }, { auth: false }));
    } catch (err) {
      setError(describeDetail(err.detail || err.message));
    }
  }, [nonce]);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(court) {
    try {
      await api.del(`/courts/${court.id}`);
      toast("Pista eliminada");
      setNonce((n) => n + 1);
    } catch (err) {
      toast(describeDetail(err.detail || err.message), "error");
    }
  }

  return (
    <>
      <div className="section__head">
        <h2>Pistas</h2>
        <button className="btn" onClick={() => setShowCreate(true)}>
          ＋ Nueva pista
        </button>
      </div>

      <div className="list">
        {error ? (
          <EmptyState title="No se pudieron cargar las pistas" message={error} />
        ) : courts === null ? (
          <Spinner />
        ) : (
          courts.map((c) => (
            <article className="rowcard" key={c.id}>
              <div className="rowcard__main">
                <span className="rowcard__title">
                  {c.name} · Nº {c.court_number}
                </span>
                <div className="rowcard__meta">
                  <span>{labels.environment(c.environment)}</span>
                  <span>{labels.surface(c.surface)}</span>
                  <span>
                    <b>{money(c.price_per_hour)}</b> /h
                  </span>
                  <span>{labels.courtStatus(c.status)}</span>
                </div>
              </div>
              <div className="rowcard__side">
                <button className="btn btn--sm btn--danger" onClick={() => remove(c)}>
                  Eliminar
                </button>
              </div>
            </article>
          ))
        )}
      </div>

      {showCreate ? (
        <CreateCourtModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            setNonce((n) => n + 1);
          }}
        />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------- Page ---- */

export function Admin() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState("dashboard");

  const tabs = [
    ["dashboard", "Resumen"],
    ["bookings", "Reservas"],
    ...(isAdmin
      ? [
          ["users", "Usuarios"],
          ["courts", "Pistas"],
        ]
      : []),
  ];

  return (
    <>
      <div className="page-head">
        <h1>Panel del club</h1>
        <p>Métricas, agenda y gestión.</p>
      </div>

      <div className="segmented" style={{ marginBottom: 18 }}>
        {tabs.map(([key, text]) => (
          <button key={key} type="button" className={tab === key ? "is-active" : ""} onClick={() => setTab(key)}>
            {text}
          </button>
        ))}
      </div>

      {tab === "dashboard" ? <Dashboard /> : null}
      {tab === "bookings" ? <AllBookings /> : null}
      {tab === "users" ? <Users /> : null}
      {tab === "courts" ? <Courts /> : null}
    </>
  );
}
