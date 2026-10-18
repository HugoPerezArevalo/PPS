import { useEffect } from "react";

import { labels } from "../lib/labels.js";

// Modal reutilizable (usa los estilos .modal del design system).
export function Modal({ title, children, footer, wide = false, onClose }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className={`modal${wide ? " modal--wide" : ""}`} role="dialog" aria-modal="true">
        <div className="modal__head">
          <h2>{title}</h2>
          <button className="modal__close" aria-label="Cerrar" onClick={() => onClose?.()}>
            ×
          </button>
        </div>
        <div className="modal__body">{children}</div>
        {footer ? <div className="modal__foot">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Spinner() {
  return <div className="spinner" role="status" aria-label="Cargando" />;
}

export function EmptyState({ title, message, action }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p>{message || ""}</p>
      {action || null}
    </div>
  );
}

const BADGE_LABELS = {
  booking: labels.bookingStatus,
  match: labels.matchStatus,
  payment: labels.paymentStatus,
  application: labels.applicationStatus,
};

export function StatusBadge({ kind, status, text }) {
  const label = text || (BADGE_LABELS[kind]?.(status) ?? status);
  return <span className={`badge badge--${status}`}>{label}</span>;
}

export function RatingStars({ rating, count }) {
  const value = Number(rating) || 0;
  return (
    <span className="rating" title={`${value.toFixed(1)} / 5`}>
      <span className="star" aria-hidden="true">
        ★
      </span>
      <span>{value ? value.toFixed(1) : "Nuevo"}</span>
      {typeof count === "number" ? <span className="muted small">({count})</span> : null}
    </span>
  );
}

export function CourtTags({ court }) {
  return (
    <div className="chips">
      <span className="chip chip--brand">{labels.environment(court.environment)}</span>
      <span className="chip">{labels.surface(court.surface)}</span>
      {court.has_lighting ? <span className="chip">💡 Iluminación</span> : null}
      {court.is_covered ? <span className="chip">🏠 Cubierta</span> : null}
    </div>
  );
}

export function Field({ label, hint, children }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}
