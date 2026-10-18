import { useCallback, useEffect, useState } from "react";

import { useConfirm } from "../components/ConfirmProvider.jsx";
import { EmptyState, Field, Modal, Spinner, StatusBadge } from "../components/ui.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { api, describeDetail } from "../lib/api.js";
import { fmtLongDate, hhmm, isoDate, money, today } from "../lib/format.js";

const FILTERS = [
  ["", "Todas"],
  ["confirmed", "Confirmadas"],
  ["pending", "Pendientes"],
  ["completed", "Completadas"],
  ["cancelled", "Canceladas"],
];

function RescheduleModal({ booking, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    booking_date: booking.booking_date,
    start_time: hhmm(booking.start_time),
    end_time: hhmm(booking.end_time),
    notes: booking.notes || "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (form.start_time >= form.end_time) {
      setError("La hora de fin debe ser posterior a la de inicio");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.patch(`/bookings/${booking.id}`, {
        booking_date: form.booking_date,
        start_time: form.start_time,
        end_time: form.end_time,
        notes: form.notes || null,
      });
      toast("Reserva reprogramada");
      onSaved();
    } catch (err) {
      setError(describeDetail(err.detail || err.message));
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Reprogramar reserva"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--ghost" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn" type="submit" form="resched-form" disabled={busy}>
            {busy ? "Guardando…" : "Guardar cambios"}
          </button>
        </>
      }
    >
      <form id="resched-form" className="stack" onSubmit={submit}>
        {error ? <div className="toast toast--error">{error}</div> : null}
        <div className="row">
          <Field label="Fecha">
            <input
              type="date"
              min={isoDate(today())}
              required
              value={form.booking_date}
              onChange={(e) => setForm({ ...form, booking_date: e.target.value })}
            />
          </Field>
          <Field label="Jugadores">
            <input type="text" value={booking.players_count} disabled readOnly />
          </Field>
        </div>
        <div className="row">
          <Field label="Inicio">
            <input
              type="time"
              step={1800}
              required
              value={form.start_time}
              onChange={(e) => setForm({ ...form, start_time: e.target.value })}
            />
          </Field>
          <Field label="Fin">
            <input
              type="time"
              step={1800}
              required
              value={form.end_time}
              onChange={(e) => setForm({ ...form, end_time: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Notas">
          <textarea maxLength={500} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
      </form>
    </Modal>
  );
}

function ReviewModal({ booking, onClose }) {
  const toast = useToast();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.post(`/courts/${booking.court_id}/reviews`, { rating, comment: comment || null });
      toast("¡Gracias por tu valoración!");
      onClose();
    } catch (err) {
      setError(describeDetail(err.detail || err.message));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Valorar ${booking.court?.name ?? "pista"}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--ghost" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn" type="submit" form="review-form" disabled={busy}>
            Publicar valoración
          </button>
        </>
      }
    >
      <form id="review-form" className="stack" onSubmit={submit}>
        {error ? <div className="toast toast--error">{error}</div> : null}
        <Field label="Puntuación">
          <div style={{ display: "flex", gap: 6, fontSize: "1.9rem" }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <button
                key={i}
                type="button"
                aria-label={`${i} estrellas`}
                onClick={() => setRating(i)}
                style={{
                  background: "none",
                  border: 0,
                  cursor: "pointer",
                  fontSize: "1.9rem",
                  lineHeight: 1,
                  color: i <= rating ? "#f5a524" : "#d5ddd8",
                }}
              >
                ★
              </button>
            ))}
          </div>
        </Field>
        <Field label="Comentario (opcional)">
          <textarea
            maxLength={1000}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="¿Qué te pareció la pista?"
          />
        </Field>
      </form>
    </Modal>
  );
}

export function Bookings() {
  const confirm = useConfirm();
  const toast = useToast();
  const [status, setStatus] = useState("");
  const [bookings, setBookings] = useState(null);
  const [error, setError] = useState("");
  const [reschedule, setReschedule] = useState(null);
  const [review, setReview] = useState(null);

  const load = useCallback(async () => {
    setBookings(null);
    setError("");
    try {
      const query = { scope: "mine", limit: 100 };
      if (status) query.status = status;
      setBookings(await api.get("/bookings", query));
    } catch (err) {
      setError(describeDetail(err.detail || err.message));
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  async function cancel(booking) {
    const ok = await confirm({
      title: "Cancelar reserva",
      message: `¿Seguro que quieres cancelar la reserva #${booking.id} del ${fmtLongDate(
        booking.booking_date
      )} a las ${hhmm(booking.start_time)}?`,
      confirmLabel: "Sí, cancelar",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.post(`/bookings/${booking.id}/cancel`, { reason: "Cancelada por el jugador" });
      toast("Reserva cancelada");
      load();
    } catch (err) {
      toast(describeDetail(err.detail || err.message), "error");
    }
  }

  async function pay(payment) {
    const ok = await confirm({
      title: "Pagar reserva",
      message: `Vas a marcar como pagado ${money(payment.amount)}. En una integración real aquí se abriría la pasarela de pago.`,
      confirmLabel: "Pagar",
    });
    if (!ok) return;
    try {
      await api.post(`/payments/${payment.id}/pay`, { transaction_ref: `web-${Date.now()}` });
      toast("Pago registrado ✅");
      load();
    } catch (err) {
      toast(describeDetail(err.detail || err.message), "error");
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>Mis reservas</h1>
        <p>Consulta, reprograma o cancela tus reservas y gestiona tus pagos.</p>
      </div>

      <div className="between" style={{ marginBottom: 18 }}>
        <div className="segmented">
          {FILTERS.map(([value, text]) => (
            <button key={value} type="button" className={status === value ? "is-active" : ""} onClick={() => setStatus(value)}>
              {text}
            </button>
          ))}
        </div>
      </div>

      <div className="list">
        {error ? (
          <EmptyState title="No se pudieron cargar las reservas" message={error} />
        ) : bookings === null ? (
          <Spinner />
        ) : bookings.length === 0 ? (
          <EmptyState title="Todavía no tienes reservas" message="Reserva tu primera pista desde la pantalla de inicio." />
        ) : (
          bookings.map((b) => {
            const pendingPayment = (b.payments || []).find((p) => p.status === "pending");
            const canCancel = b.status === "pending" || b.status === "confirmed";
            const canReview = b.status === "completed" || b.status === "confirmed";
            return (
              <article className="rowcard" key={b.id}>
                <div className="rowcard__main">
                  <div className="between">
                    <span className="rowcard__title">
                      #{b.id} · {b.court?.name ?? `Pista ${b.court_id}`}
                    </span>
                    <StatusBadge kind="booking" status={b.status} />
                  </div>
                  <div className="rowcard__meta">
                    <span>
                      📅 <b>{fmtLongDate(b.booking_date)}</b>
                    </span>
                    <span>
                      ⏰ <b>{`${hhmm(b.start_time)}–${hhmm(b.end_time)}`}</b>
                    </span>
                    <span>
                      👥 <b>{b.players_count}</b>
                    </span>
                  </div>
                  {b.notes ? <p className="small muted" style={{ margin: 0 }}>📝 {b.notes}</p> : null}
                </div>
                <div className="rowcard__side">
                  <span className="price-tag">{money(b.total_price)}</span>
                  {pendingPayment ? (
                    <button className="btn btn--sm" onClick={() => pay(pendingPayment)}>
                      Pagar {money(pendingPayment.amount)}
                    </button>
                  ) : null}
                  {canReview ? (
                    <button className="btn btn--sm btn--ghost" onClick={() => setReview(b)}>
                      Valorar
                    </button>
                  ) : null}
                  {canCancel ? (
                    <button className="btn btn--sm btn--ghost" onClick={() => setReschedule(b)}>
                      Reprogramar
                    </button>
                  ) : null}
                  {canCancel ? (
                    <button className="btn btn--sm btn--danger" onClick={() => cancel(b)}>
                      Cancelar
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })
        )}
      </div>

      {reschedule ? (
        <RescheduleModal
          booking={reschedule}
          onClose={() => setReschedule(null)}
          onSaved={() => {
            setReschedule(null);
            load();
          }}
        />
      ) : null}

      {review ? <ReviewModal booking={review} onClose={() => setReview(null)} /> : null}
    </>
  );
}
