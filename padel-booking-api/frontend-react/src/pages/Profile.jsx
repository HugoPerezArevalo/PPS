import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { EmptyState, Field, Spinner, StatusBadge } from "../components/ui.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { api, describeDetail } from "../lib/api.js";
import { RULES } from "../lib/config.js";
import { fmtDateTime, money } from "../lib/format.js";
import { labels } from "../lib/labels.js";

function DataCard({ user }) {
  const { refreshUser } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({
    full_name: user.full_name,
    phone: user.phone || "",
    level: String(user.level),
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.patch("/users/me", {
        full_name: form.full_name,
        phone: form.phone || null,
        level: Number(form.level),
      });
      await refreshUser();
      toast("Perfil actualizado");
    } catch (err) {
      setError(describeDetail(err.detail || err.message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card card--pad">
      <h3 style={{ marginBottom: 16 }}>Datos personales</h3>
      <form className="stack" onSubmit={submit}>
        {error ? <div className="toast toast--error">{error}</div> : null}
        <Field label="Nombre completo">
          <input
            required
            minLength={2}
            maxLength={120}
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />
        </Field>
        <Field label="Teléfono">
          <input
            maxLength={30}
            placeholder="+34 600 000 000"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </Field>
        <Field label="Nivel de juego">
          <input
            type="number"
            min={RULES.minLevel}
            max={RULES.maxLevel}
            step={0.5}
            value={form.level}
            onChange={(e) => setForm({ ...form, level: e.target.value })}
          />
        </Field>
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Guardando…" : "Guardar cambios"}
        </button>
      </form>
    </div>
  );
}

function PasswordCard() {
  const toast = useToast();
  const [form, setForm] = useState({ current_password: "", new_password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.post("/users/me/password", {
        current_password: form.current_password,
        new_password: form.new_password,
      });
      setForm({ current_password: "", new_password: "" });
      toast("Contraseña actualizada");
    } catch (err) {
      setError(describeDetail(err.detail || err.message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card card--pad">
      <h3 style={{ marginBottom: 16 }}>Seguridad</h3>
      <form className="stack" onSubmit={submit}>
        {error ? <div className="toast toast--error">{error}</div> : null}
        <Field label="Contraseña actual">
          <input
            type="password"
            minLength={8}
            required
            value={form.current_password}
            onChange={(e) => setForm({ ...form, current_password: e.target.value })}
          />
        </Field>
        <Field label="Nueva contraseña" hint="Mínimo 8 caracteres. Se guarda cifrada con bcrypt.">
          <input
            type="password"
            minLength={8}
            maxLength={72}
            required
            value={form.new_password}
            onChange={(e) => setForm({ ...form, new_password: e.target.value })}
          />
        </Field>
        <button className="btn btn--dark" type="submit" disabled={busy}>
          Cambiar contraseña
        </button>
      </form>
    </div>
  );
}

export function Profile() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [current, setCurrent] = useState(user);
  const [payments, setPayments] = useState(null);
  const [error, setError] = useState("");

  const loadPayments = useCallback(async () => {
    setPayments(null);
    setError("");
    try {
      setPayments(await api.get("/payments/me"));
    } catch (err) {
      setError(describeDetail(err.detail || err.message));
    }
  }, []);

  useEffect(() => {
    // Refresca el usuario desde el servidor al abrir la página.
    api
      .get("/auth/me")
      .then((u) => setCurrent(u))
      .catch(() => {});
    loadPayments();
  }, [loadPayments]);

  async function payNow(payment) {
    try {
      await api.post(`/payments/${payment.id}/pay`, { transaction_ref: `web-${Date.now()}` });
      toast("Pago registrado ✅");
      loadPayments();
    } catch (err) {
      toast(describeDetail(err.detail || err.message), "error");
    }
  }

  async function handleLogout() {
    await logout();
    toast("Sesión cerrada");
    navigate("/");
  }

  if (!current) return <Spinner />;

  return (
    <>
      <div className="page-head between">
        <div>
          <h1>{current.full_name}</h1>
          <p>
            {current.email} · {labels.role(current.role)} · nivel {current.level}
          </p>
        </div>
        <button className="btn btn--ghost" onClick={handleLogout}>
          Cerrar sesión
        </button>
      </div>

      <div className="grid grid--two">
        <DataCard user={current} />
        <PasswordCard />
      </div>

      <section className="section">
        <div className="section__head">
          <h2>Mis pagos</h2>
        </div>
        {error ? (
          <EmptyState title="No se pudieron cargar los pagos" message={error} />
        ) : payments === null ? (
          <Spinner />
        ) : payments.length === 0 ? (
          <EmptyState title="Sin pagos" message="Aquí aparecerán los pagos de tus reservas." />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Reserva</th>
                  <th>Importe</th>
                  <th>Método</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>#{p.booking_id}</td>
                    <td>
                      <b>{money(p.amount)}</b>
                    </td>
                    <td>{labels.paymentMethod(p.method)}</td>
                    <td>
                      <StatusBadge kind="payment" status={p.status} />
                    </td>
                    <td className="muted">{fmtDateTime(p.paid_at || p.created_at)}</td>
                    <td>
                      {p.status === "pending" ? (
                        <button className="btn btn--sm" onClick={() => payNow(p)}>
                          Pagar
                        </button>
                      ) : (
                        <span className="muted small">{p.transaction_ref || "—"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
