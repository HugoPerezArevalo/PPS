import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { Field } from "../components/ui.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { describeDetail } from "../lib/api.js";

export function Login() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const user = await login(email, password);
      toast(`¡Bienvenido, ${user.full_name.split(" ")[0]}!`);
      navigate(location.state?.from || "/", { replace: true });
    } catch (err) {
      setError(describeDetail(err.detail || err.message));
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="page-head">
        <h1>Inicia sesión</h1>
        <p>Accede para reservar pistas, gestionar tus reservas y partidos.</p>
      </div>

      <div className="card card--pad">
        <form className="stack" onSubmit={onSubmit}>
          {error ? <div className="toast toast--error">{error}</div> : null}

          <Field label="Email">
            <input
              type="email"
              autoComplete="email"
              required
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Contraseña">
            <input
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
              placeholder="Mínimo 8 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>

          <button className="btn btn--block btn--lg" type="submit" disabled={busy}>
            {busy ? "Entrando…" : "Entrar"}
          </button>

          <p className="small" style={{ textAlign: "center", margin: "4px 0 0" }}>
            ¿Aún no tienes cuenta? <Link to="/register">Regístrate</Link>
          </p>
        </form>
      </div>

      <p className="small muted" style={{ textAlign: "center", marginTop: 14 }}>
        Demo: <b>admin@padel.com</b> / Admin123! · <b>player@padel.com</b> / Player123!
      </p>
    </div>
  );
}
