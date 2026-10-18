// Vista "Mi perfil": datos, contraseña y pagos.

import { api, describeDetail, endSession } from "../api.js";
import { RULES } from "../config.js";
import { auth } from "../store.js";
import {
  clear,
  emptyState,
  fmtDateTime,
  h,
  labels,
  money,
  spinner,
  statusBadge,
  toast,
} from "../ui.js";
import { openAuthModal } from "../components/auth.js";

export async function renderProfile(root) {
  clear(root);
  if (!auth.isLoggedIn()) {
    root.appendChild(
      h("div", { class: "empty" }, [
        h("h3", {}, "Tu perfil"),
        h("p", {}, "Inicia sesión para ver y editar tus datos."),
        h("button", { class: "btn", onclick: () => openAuthModal("login", () => window.dispatchEvent(new HashChangeEvent("hashchange"))) }, "Iniciar sesión"),
      ])
    );
    return;
  }

  let user = auth.user();
  try {
    user = await api.get("/auth/me");
    auth.setUser(user);
  } catch {
    /* usa el usuario en caché */
  }

  root.appendChild(
    h("div", { class: "page-head between" }, [
      h("div", {}, [
        h("h1", {}, user.full_name),
        h("p", {}, `${user.email} · ${labels.role(user.role)} · nivel ${user.level}`),
      ]),
      h("button", { class: "btn btn--ghost", onclick: logout }, "Cerrar sesión"),
    ])
  );

  root.appendChild(
    h("div", { class: "grid grid--two" }, [dataCard(user), passwordCard()])
  );

  const paymentsHost = h("section", { class: "section" }, [h("div", { class: "section__head" }, [h("h2", {}, "Mis pagos")]), h("div", { class: "payments" }, spinner())]);
  root.appendChild(paymentsHost);
  await loadPayments(paymentsHost.querySelector(".payments"));
}

function dataCard(user) {
  const form = h("form", { class: "stack" }, [
    field("Nombre completo", h("input", { name: "full_name", value: user.full_name, minlength: "2", maxlength: "120", required: "" })),
    field("Teléfono", h("input", { name: "phone", value: user.phone || "", maxlength: "30", placeholder: "+34 600 000 000" })),
    field("Nivel de juego", h("input", { type: "number", name: "level", value: String(user.level), min: RULES.minLevel, max: RULES.maxLevel, step: "0.5" })),
  ]);
  const errorBox = h("div", { class: "toast toast--error", style: "display:none" });
  form.prepend(errorBox);
  const submit = h("button", { class: "btn", type: "submit" }, "Guardar cambios");
  form.appendChild(submit);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form).entries());
    submit.disabled = true;
    submit.textContent = "Guardando…";
    try {
      const updated = await api.patch("/users/me", {
        full_name: f.full_name,
        phone: f.phone || null,
        level: Number(f.level),
      });
      auth.setUser(updated);
      toast("Perfil actualizado");
    } catch (err) {
      errorBox.textContent = describeDetail(err.detail || err.message);
      errorBox.style.display = "block";
    } finally {
      submit.disabled = false;
      submit.textContent = "Guardar cambios";
    }
  });

  return h("div", { class: "card card--pad" }, [h("h3", { style: "margin-bottom:16px" }, "Datos personales"), form]);
}

function passwordCard() {
  const form = h("form", { class: "stack" }, [
    field("Contraseña actual", h("input", { type: "password", name: "current_password", minlength: "8", required: "" })),
    field("Nueva contraseña", h("input", { type: "password", name: "new_password", minlength: "8", required: "" })),
  ]);
  const errorBox = h("div", { class: "toast toast--error", style: "display:none" });
  form.prepend(errorBox);
  const submit = h("button", { class: "btn btn--dark", type: "submit" }, "Cambiar contraseña");
  form.appendChild(submit);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form).entries());
    submit.disabled = true;
    try {
      await api.post("/users/me/password", { current_password: f.current_password, new_password: f.new_password });
      form.reset();
      toast("Contraseña actualizada");
    } catch (err) {
      errorBox.textContent = describeDetail(err.detail || err.message);
      errorBox.style.display = "block";
    } finally {
      submit.disabled = false;
    }
  });

  return h("div", { class: "card card--pad" }, [h("h3", { style: "margin-bottom:16px" }, "Seguridad"), form]);
}

async function loadPayments(host) {
  clear(host);
  host.appendChild(spinner());
  try {
    const payments = await api.get("/payments/me");
    clear(host);
    if (!payments.length) {
      host.appendChild(emptyState("Sin pagos", "Aquí aparecerán los pagos de tus reservas."));
      return;
    }
    const wrap = h("div", { class: "table-wrap" });
    const table = h("table", { class: "data" }, [
      h("thead", {}, h("tr", {}, [h("th", {}, "Reserva"), h("th", {}, "Importe"), h("th", {}, "Método"), h("th", {}, "Estado"), h("th", {}, "Fecha"), h("th", {}, "")])),
    ]);
    const tbody = h("tbody");
    for (const p of payments) {
      tbody.appendChild(
        h("tr", {}, [
          h("td", {}, `#${p.booking_id}`),
          h("td", {}, h("b", {}, money(p.amount))),
          h("td", {}, labels.paymentMethod(p.method)),
          h("td", {}, statusBadge("payment", p.status)),
          h("td", { class: "muted" }, fmtDateTime(p.paid_at || p.created_at)),
          h(
            "td",
            {},
            p.status === "pending"
              ? h("button", { class: "btn btn--sm", onclick: () => payNow(p, host) }, "Pagar")
              : h("span", { class: "muted small" }, p.transaction_ref || "—")
          ),
        ])
      );
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    host.appendChild(wrap);
  } catch (err) {
    clear(host);
    host.appendChild(emptyState("No se pudieron cargar los pagos", describeDetail(err.detail || err.message)));
  }
}

async function payNow(payment, host) {
  try {
    await api.post(`/payments/${payment.id}/pay`, { transaction_ref: `web-${Date.now()}` });
    toast("Pago registrado ✅");
    loadPayments(host);
  } catch (err) {
    toast(describeDetail(err.detail || err.message), "error");
  }
}

async function logout() {
  await endSession();
  auth.clear();
  toast("Sesión cerrada");
  location.hash = "#/home";
}

function field(labelText, input) {
  return h("div", { class: "field" }, [h("label", {}, labelText), input]);
}
