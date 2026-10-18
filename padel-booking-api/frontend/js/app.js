// Punto de entrada de la SPA: enrutado por hash, navegación y sesión.

import { DOCS_URL } from "./config.js";
import { endSession } from "./api.js";
import { auth } from "./store.js";
import { clear, h, toast } from "./ui.js";
import { openAuthModal } from "./components/auth.js";
import { renderHome } from "./views/home.js";
import { renderBookings } from "./views/bookings.js";
import { renderMatches } from "./views/matches.js";
import { renderProfile } from "./views/profile.js";
import { renderAdmin } from "./views/admin.js";

const ROUTES = {
  home: { title: "Reservar", render: renderHome },
  bookings: { title: "Mis reservas", render: renderBookings },
  matches: { title: "Partidos", render: renderMatches },
  profile: { title: "Mi perfil", render: renderProfile },
  admin: { title: "Admin", render: renderAdmin },
};

const app = document.getElementById("app");
const nav = document.getElementById("mainnav");
const actions = document.getElementById("topbar-actions");

let renderToken = 0;

function currentRoute() {
  const hash = location.hash.replace(/^#\/?/, "").split("?")[0];
  return ROUTES[hash] ? hash : "home";
}

async function renderRoute() {
  const route = currentRoute();
  const token = ++renderToken;
  clear(app);
  try {
    await ROUTES[route].render(app);
  } catch (err) {
    if (token !== renderToken) return;
    clear(app);
    app.appendChild(
      h("div", { class: "empty" }, [
        h("h3", {}, "Algo ha ido mal"),
        h("p", {}, err?.message || "Error inesperado"),
        h("button", { class: "btn", onclick: () => renderRoute() }, "Reintentar"),
      ])
    );
  }
  if (token === renderToken) updateNav(route);
}

function updateNav(route) {
  clear(nav);
  for (const [key, def] of Object.entries(ROUTES)) {
    if (key === "admin" && !auth.isStaff()) continue;
    nav.appendChild(
      h("a", { href: `#/${key}`, class: key === route ? "is-active" : "", onclick: closeMobileNav }, def.title)
    );
  }
  renderActions();
}

function renderActions() {
  clear(actions);
  const user = auth.user();
  if (user) {
    const initials = (user.full_name || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
    actions.appendChild(
      h("a", { class: "btn btn--soft", href: "#/profile", title: user.email }, [
        h("span", { style: "display:inline-grid;place-items:center;width:24px;height:24px;border-radius:50%;background:var(--brand);color:#fff;font-size:.72rem;font-weight:800" }, initials),
        h("span", { class: "label" }, user.full_name.split(" ")[0]),
      ])
    );
    actions.appendChild(
      h("button", { class: "iconbtn", title: "Cerrar sesión", "aria-label": "Cerrar sesión", onclick: async () => { await endSession(); auth.clear(); toast("Sesión cerrada"); renderRoute(); } },
        h("span", { html: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>' }))
    );
  } else {
    actions.appendChild(h("button", { class: "btn btn--ghost", onclick: () => openAuthModal("login", renderRoute) }, "Entrar"));
    actions.appendChild(h("button", { class: "btn", onclick: () => openAuthModal("register", renderRoute) }, "Registrarse"));
  }
}

/* ------------------------------------------------------------- mobile ---- */

const burger = document.getElementById("burger");
function closeMobileNav() {
  nav.classList.remove("is-open");
  burger.setAttribute("aria-expanded", "false");
}
burger.addEventListener("click", () => {
  const open = nav.classList.toggle("is-open");
  burger.setAttribute("aria-expanded", String(open));
});

/* ----------------------------------------------------------- listeners ---- */

window.addEventListener("hashchange", () => {
  if (location.hash === "#/login") {
    location.hash = "#/home";
    openAuthModal("login", renderRoute);
    return;
  }
  renderRoute();
});
auth.onChange(() => {
  // Actualiza cabecera cuando cambia la sesión.
  updateNav(currentRoute());
});
document.getElementById("docs-link").href = DOCS_URL;

// Arranque.
if (!location.hash) location.hash = "#/home";
renderRoute();
