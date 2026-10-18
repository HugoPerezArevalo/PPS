// Modal de inicio de sesión / registro.

import { api, describeDetail } from "../api.js";
import { auth } from "../store.js";
import { h, openModal, toast } from "../ui.js";

export function openAuthModal(mode = "login", onSuccess) {
  let current = mode;

  const form = h("form", { class: "stack" });
  const errorBox = h("div", {
    class: "toast toast--error",
    style: "display:none;margin-bottom:6px",
  });

  const modal = openModal({
    title: current === "login" ? "Inicia sesión" : "Crea tu cuenta",
    body: form,
  });

  function render() {
    modal.modal.querySelector(".modal__head h2").textContent =
      current === "login" ? "Inicia sesión" : "Crea tu cuenta";
    while (form.firstChild) form.removeChild(form.firstChild);

    form.appendChild(errorBox);

    if (current === "register") {
      form.appendChild(
        field("Nombre completo", h("input", { name: "full_name", required: "", minlength: "2", placeholder: "Ana García" }))
      );
    }
    form.appendChild(
      field("Email", h("input", { name: "email", type: "email", required: "", placeholder: "tu@email.com", autocomplete: "email" }))
    );
    form.appendChild(
      field("Contraseña", h("input", { name: "password", type: "password", required: "", minlength: "8", placeholder: "Mínimo 8 caracteres", autocomplete: current === "login" ? "current-password" : "new-password" }))
    );

    if (current === "register") {
      form.appendChild(
        field(
          "Nivel de juego",
          h("select", { name: "level" }, [
            h("option", { value: "1" }, "1.0 · Principiante"),
            h("option", { value: "2" }, "2.0"),
            h("option", { value: "3", selected: "" }, "3.0 · Intermedio"),
            h("option", { value: "4" }, "4.0"),
            h("option", { value: "5" }, "5.0 · Avanzado"),
            h("option", { value: "6" }, "6.0"),
            h("option", { value: "7" }, "7.0 · Profesional"),
          ]),
          "Puedes cambiarlo más tarde en tu perfil."
        )
      );
    }

    form.appendChild(
      h("button", { class: "btn btn--block btn--lg", type: "submit" }, current === "login" ? "Entrar" : "Registrarme")
    );

    form.appendChild(
      h("p", { class: "small", style: "text-align:center;margin:4px 0 0" }, [
        current === "login" ? "¿Aún no tienes cuenta? " : "¿Ya tienes cuenta? ",
        h(
          "a",
          {
            href: "#",
            onclick: (e) => {
              e.preventDefault();
              current = current === "login" ? "register" : "login";
              errorBox.style.display = "none";
              render();
            },
          },
          current === "login" ? "Regístrate" : "Inicia sesión"
        ),
      ])
    );
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorBox.style.display = "none";
    const submit = form.querySelector("button[type=submit]");
    submit.disabled = true;
    submit.textContent = "Un momento…";

    const data = Object.fromEntries(new FormData(form).entries());
    try {
      if (current === "register") {
        await api.post("/auth/register", {
          email: data.email,
          password: data.password,
          full_name: data.full_name,
          level: Number(data.level || 3),
        }, { auth: false });
      }
      const session = await api.post("/auth/login", { email: data.email, password: data.password }, { auth: false });
      auth.setSession(session);
      modal.close();
      toast(`¡Bienvenido, ${session.user.full_name.split(" ")[0]}!`);
      onSuccess?.(session.user);
    } catch (err) {
      errorBox.textContent = describeDetail(err.detail || err.message);
      errorBox.style.display = "block";
      submit.disabled = false;
      submit.textContent = current === "login" ? "Entrar" : "Registrarme";
    }
  });

  render();
  return modal;
}

function field(label, input, hint) {
  return h("div", { class: "field" }, [
    h("label", {}, label),
    input,
    hint ? h("span", { class: "hint" }, hint) : null,
  ]);
}
