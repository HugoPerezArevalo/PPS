import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { DOCS_URL } from "../lib/config.js";
import { labels } from "../lib/labels.js";

const BrandMark = () => (
  <span className="brand__mark" aria-hidden="true">
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="9" cy="9" r="3.2" />
      <circle cx="15" cy="15" r="3.2" />
    </svg>
  </span>
);

export function Layout() {
  const { isLoggedIn, isStaff, user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const links = [
    { to: "/", label: "Reservar", end: true },
    { to: "/matches", label: "Partidos" },
    { to: "/bookings", label: "Mis reservas" },
    ...(isStaff ? [{ to: "/admin", label: "Panel" }] : []),
    { to: "/profile", label: "Mi perfil" },
  ];

  async function handleLogout() {
    await logout();
    toast("Sesión cerrada");
    navigate("/");
  }

  return (
    <div id="app-shell">
      <header className="topbar">
        <div className="topbar__inner">
          <Link className="brand" to="/" aria-label="PadelClub inicio" onClick={() => setOpen(false)}>
            <BrandMark />
            <span className="brand__text">
              Padel<strong>Club</strong>
            </span>
          </Link>

          <nav className={`mainnav${open ? " is-open" : ""}`} aria-label="Navegación principal">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) => (isActive ? "is-active" : "")}
                onClick={() => setOpen(false)}
              >
                {l.label}
              </NavLink>
            ))}
          </nav>

          <div className="topbar__actions">
            {isLoggedIn ? (
              <>
                <Link className="btn btn--soft" to="/profile" title={`${user?.email} · ${labels.role(user?.role)}`}>
                  <span
                    aria-hidden="true"
                    style={{
                      display: "inline-grid",
                      placeItems: "center",
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      background: "var(--brand)",
                      color: "#fff",
                      fontSize: ".72rem",
                      fontWeight: 800,
                    }}
                  >
                    {(user?.full_name || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                  </span>
                  <span className="label">{user?.full_name?.split(" ")[0] || "Cuenta"}</span>
                </Link>
                <button className="iconbtn" title="Cerrar sesión" aria-label="Cerrar sesión" onClick={handleLogout}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                </button>
              </>
            ) : (
              <Link className="btn btn--sm" to="/login">
                Iniciar sesión
              </Link>
            )}
          </div>

          <button
            className="iconbtn burger"
            aria-label="Abrir menú"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </header>

      <main className="app" tabIndex={-1}>
        <Outlet />
      </main>

      <footer className="footer">
        <div className="footer__inner">
          <span>PadelClub · gestión de reservas</span>
          <a href={DOCS_URL} target="_blank" rel="noopener noreferrer">
            Documentación de la API
          </a>
        </div>
      </footer>
    </div>
  );
}
