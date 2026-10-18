import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { api, describeDetail } from "../lib/api.js";
import { RULES } from "../lib/config.js";
import { hhmm, minutesToTime, money } from "../lib/format.js";
import { Field, Modal } from "./ui.jsx";

// Cuántos minutos seguidos libres hay desde el índice dado.
function freeRun(slots, index) {
  let minutes = 0;
  for (let i = index; i < slots.length; i++) {
    if (slots[i].status !== "free") break;
    minutes += RULES.slotMinutes;
  }
  return minutes;
}

const durationText = (m) => (m === 60 ? "1 hora" : m === 90 ? "1 h 30 min" : m === 120 ? "2 horas" : `${m} min`);

export function BookingModal({ court, date, slots, startTime, onClose, onBooked }) {
  const { isLoggedIn } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const durations = useMemo(() => {
    const startIndex = slots.findIndex((s) => hhmm(s.start) === startTime);
    const maxRun = startIndex >= 0 ? freeRun(slots, startIndex) : RULES.minBookingMinutes;
    const maxDuration = Math.min(maxRun, RULES.maxBookingHours * 60);
    const out = [];
    for (let m = RULES.minBookingMinutes; m <= maxDuration; m += RULES.slotMinutes) out.push(m);
    return out;
  }, [slots, startTime]);

  const [duration, setDuration] = useState(durations.includes(90) ? 90 : durations[0] || RULES.minBookingMinutes);
  const [players, setPlayers] = useState(4);
  const [method, setMethod] = useState("card");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const end = minutesToTime(startTime, duration);
  const price = (Number(court.price_per_hour) * duration) / 60;

  async function submit(e) {
    e.preventDefault();
    if (!isLoggedIn) {
      onClose();
      toast("Inicia sesión para reservar", "warn");
      navigate("/login");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const booking = await api.post("/bookings", {
        court_id: court.id,
        booking_date: date,
        start_time: startTime,
        end_time: end,
        players_count: Number(players),
        payment_method: method,
        notes: notes || null,
      });
      onClose();
      toast("¡Reserva confirmada! 🎾");
      onBooked?.(booking);
    } catch (err) {
      setError(describeDetail(err.detail || err.message));
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Reservar pista"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--ghost" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn--lg" type="submit" form="booking-form" disabled={busy}>
            {busy ? "Reservando…" : "Confirmar reserva"}
          </button>
        </>
      }
    >
      <form id="booking-form" className="stack" onSubmit={submit}>
        <div className="summary">
          <div className="summary__row">
            <span>Pista</span>
            <b>
              {court.name} · Nº {court.court_number}
            </b>
          </div>
          <div className="summary__row">
            <span>Fecha</span>
            <b>{date}</b>
          </div>
          <div className="summary__row">
            <span>Horario</span>
            <b>
              {startTime} – {end} ({durationText(duration)})
            </b>
          </div>
          <div className="summary__row summary__total">
            <span>Total</span>
            <b>{money(price)}</b>
          </div>
        </div>

        {error ? (
          <div className="toast toast--error" style={{ marginBottom: 6 }}>
            {error}
          </div>
        ) : null}

        <div className="row">
          <Field label="Duración">
            <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              {durations.map((m) => (
                <option key={m} value={m}>
                  {durationText(m)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Jugadores">
            <select value={players} onChange={(e) => setPlayers(Number(e.target.value))}>
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n} jugador{n > 1 ? "es" : ""}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Método de pago">
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="card">Tarjeta</option>
            <option value="bizum">Bizum</option>
            <option value="cash">Efectivo en el club</option>
            <option value="transfer">Transferencia</option>
            <option value="credit">Bono / saldo</option>
          </select>
        </Field>

        <Field label="Notas (opcional)">
          <textarea
            maxLength={500}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ej.: necesitamos alquilar palas"
          />
        </Field>
      </form>
    </Modal>
  );
}
