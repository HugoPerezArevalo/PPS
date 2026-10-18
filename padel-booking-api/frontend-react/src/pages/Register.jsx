import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Field } from "../components/ui.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { describeDetail } from "../lib/api.js";

export function Register() {
  const { register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ full_name: "", email: "", password: "", level: 3 });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const user = await register({
        full_name: form.full_name,
        email: form.email,
        password: form.password,
        level: Number(form.level),
      });
      toast(`¡Bienvenido, ${user.full_name.split(" ")[0]}!`);
      navigate("/", { replace: true });
    } catch (err) {
      setError(describeDetail(err.detail || err.message));
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="page-head">
        <h1>Crea tu cuenta</h1>
        <p>Regístrate gratis para reservar y buscar partidos.</p>
      </div>

      <div className="card card--pad">
        <form className="stack" onSubmit={onSubmit}>
          {error ? <div className="toast toast--error">{error}</div> : null}

          <Field label="Nombre completo">
            <input
              required
              minLength={2}
              maxLength={120}
              placeholder="Ana García"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              autoComplete="email"
              required
              placeholder="tu@email.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label="Contraseña" hint="Mínimo 8 caracteres. Se guarda cifrada con bcrypt.">
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={72}
              placeholder="Mínimo 8 caracteres"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </Field>
          <Field label="Nivel de juego" hint="Puedes cambiarlo más tarde en tu perfil.">
            <select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}>
              <option value={1}>1.0 · Principiante</option>
              <option value={2}>2.0</option>
              <option value={3}>3.0 · Intermedio</option>
              <option value={4}>4.0</option>
              <option value={5}>5.0 · Avanzado</option>
              <option value={6}>6.0</option>
              <option value={7}>7.0 · Profesional</option>
            </select>
          </Field>

          <button className="btn btn--block btn--lg" type="submit" disabled={busy}>
            {busy ? "Creando cuenta…" : "Registrarme"}
          </button>

          <p className="small" style={{ textAlign: "center", margin: "4px 0 0" }}>
            ¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
