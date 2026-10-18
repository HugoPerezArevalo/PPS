import { useCallback, useEffect, useRef, useState } from "react";

import { BookingModal } from "../components/BookingModal.jsx";
import { CourtTags, EmptyState, Field, RatingStars, Spinner } from "../components/ui.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { api, describeDetail } from "../lib/api.js";
import { addDays, dateParts, fmtLongDate, hhmm, isoDate, money, today } from "../lib/format.js";
import { labels } from "../lib/labels.js";

/* ------------------------------------------------------------- Hero ---- */

function Hero({ onSeeAvailability }) {
  return (
    <section className="hero">
      <h1>Reserva tu pista de pádel en segundos</h1>
      <p>
        Consulta disponibilidad en tiempo real, elige tu horario favorito y confirma. Pistas
        panorámicas, indoor y outdoor con iluminación LED.
      </p>
      <div className="hero__cta">
        <button className="btn btn--white btn--lg btn--keep-label" onClick={onSeeAvailability}>
          Ver disponibilidad
        </button>
      </div>
    </section>
  );
}

/* ----------------------------------------------------- Quick search ---- */

function QuickSearch({ date, onResults, onPickDate }) {
  const toast = useToast();
  const [form, setForm] = useState({ date, start_time: "19:00", end_time: "20:30", environment: "" });
  const [results, setResults] = useState(null);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (form.start_time >= form.end_time) {
      toast("La hora de fin debe ser posterior a la de inicio", "warn");
      return;
    }
    setBusy(true);
    try {
      const data = await api.get("/availability/courts", {
        date: form.date,
        start_time: form.start_time,
        end_time: form.end_time,
        environment: form.environment,
      });
      onPickDate(form.date);
      setResults(data);
      setInfo({ date: form.date, start: form.start_time, end: form.end_time });
      onResults(data);
    } catch (err) {
      toast(describeDetail(err.detail || err.message), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: -18, position: "relative", zIndex: 2 }}>
      <form className="filters" style={{ marginTop: 22 }} onSubmit={submit}>
        <Field label="Día">
          <input
            type="date"
            value={form.date}
            min={isoDate(today())}
            required
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
        </Field>
        <Field label="Desde">
          <input
            type="time"
            value={form.start_time}
            step={1800}
            required
            onChange={(e) => setForm({ ...form, start_time: e.target.value })}
          />
        </Field>
        <Field label="Hasta">
          <input
            type="time"
            value={form.end_time}
            step={1800}
            required
            onChange={(e) => setForm({ ...form, end_time: e.target.value })}
          />
        </Field>
        <Field label="Ambiente">
          <select value={form.environment} onChange={(e) => setForm({ ...form, environment: e.target.value })}>
            <option value="">Cualquiera</option>
            <option value="indoor">Indoor</option>
            <option value="outdoor">Outdoor</option>
          </select>
        </Field>
        <button className="btn btn--lg" type="submit" disabled={busy}>
          {busy ? "Buscando…" : "Buscar pista libre"}
        </button>
      </form>

      {results ? (
        results.length ? (
          <>
            <p className="small" style={{ margin: "16px 2px 10px" }}>
              {results.length} pista(s) libre(s) el {fmtLongDate(info.date)} de {info.start} a {info.end}
            </p>
            <div className="grid grid--courts">
              {results.map((item) => (
                <div className="card court-card" key={item.court.id}>
                  <div className="court-card__body">
                    <div className="between">
                      <h3 className="court-card__title">{item.court.name}</h3>
                      <span className="price-tag">{money(item.total_price)}</span>
                    </div>
                    <CourtTags court={item.court} />
                    <div className="court-card__foot">
                      <span className="small muted">
                        Abierta {hhmm(item.open_time)}–{hhmm(item.close_time)}
                      </span>
                      <a className="btn btn--sm" href={`#court-${item.court.id}`} onClick={(e) => e.preventDefault()}>
                        Ver pistas
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <EmptyState title="Sin pistas libres" message="Prueba otro horario o cambia de día." />
        )
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------- Catalogue ---- */

function Catalogue({ onSelectCourt }) {
  const [filters, setFilters] = useState({ environment: "", surface: "", has_lighting: "", max_price: "" });
  const [courts, setCourts] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async (f) => {
    setCourts(null);
    setError("");
    const query = {};
    if (f.environment) query.environment = f.environment;
    if (f.surface) query.surface = f.surface;
    if (f.has_lighting !== "") query.has_lighting = f.has_lighting;
    if (f.max_price) query.max_price = f.max_price;
    try {
      setCourts(await api.get("/courts", query, { auth: false }));
    } catch (err) {
      setError(describeDetail(err.detail || err.message));
    }
  }, []);

  useEffect(() => {
    load({});
  }, [load]);

  return (
    <section className="section">
      <div className="section__head">
        <h2>Nuestras pistas</h2>
      </div>

      <form
        className="filters"
        style={{ marginBottom: 18 }}
        onSubmit={(e) => {
          e.preventDefault();
          load(filters);
        }}
      >
        <Field label="Ambiente">
          <select value={filters.environment} onChange={(e) => setFilters({ ...filters, environment: e.target.value })}>
            <option value="">Todos</option>
            <option value="indoor">Indoor</option>
            <option value="outdoor">Outdoor</option>
          </select>
        </Field>
        <Field label="Superficie">
          <select value={filters.surface} onChange={(e) => setFilters({ ...filters, surface: e.target.value })}>
            <option value="">Todas</option>
            <option value="panoramic">Panorámica</option>
            <option value="prefabricated">Prefabricada</option>
            <option value="concrete">Hormigón</option>
          </select>
        </Field>
        <Field label="Iluminación">
          <select value={filters.has_lighting} onChange={(e) => setFilters({ ...filters, has_lighting: e.target.value })}>
            <option value="">Indiferente</option>
            <option value="true">Con luz</option>
            <option value="false">Sin luz</option>
          </select>
        </Field>
        <Field label="Precio máx/h">
          <input
            type="number"
            min={1}
            step={1}
            placeholder="Ej. 30"
            value={filters.max_price}
            onChange={(e) => setFilters({ ...filters, max_price: e.target.value })}
          />
        </Field>
        <button className="btn" type="submit">
          Filtrar
        </button>
      </form>

      {error ? (
        <EmptyState title="No se pudieron cargar las pistas" message={error} />
      ) : courts === null ? (
        <div className="grid grid--courts">
          <div className="skeleton" />
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      ) : courts.length === 0 ? (
        <EmptyState title="No hay pistas con estos filtros" message="Modifica los filtros para ver más resultados." />
      ) : (
        <div className="grid grid--courts">
          {courts.map((court) => (
            <article className="card court-card" key={court.id}>
              <div className="court-card__media">
                <span className="court-card__num">Pista {court.court_number}</span>
                <span className="court-card__price">
                  {money(court.price_per_hour)} <small>/h</small>
                </span>
              </div>
              <div className="court-card__body">
                <div className="between">
                  <h3 className="court-card__title">{court.name}</h3>
                  <RatingStars rating={court.average_rating} count={court.review_count} />
                </div>
                <p className="court-card__desc">{court.description || ""}</p>
                <CourtTags court={court} />
                <div className="court-card__foot">
                  <span className={`chip ${court.status === "available" ? "chip--lime" : ""}`}>
                    {labels.courtStatus(court.status)}
                  </span>
                  <button className="btn btn--sm btn--soft" onClick={() => onSelectCourt(court.id)}>
                    Ver horarios
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------- Availability panel ---- */

function AvailabilityPanel({ courtId, date, onDateChange }) {
  const toast = useToast();
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [slots, setSlots] = useState(null);
  const [week, setWeek] = useState(null);
  const [modal, setModal] = useState(null);

  useEffect(() => {
    if (!courtId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetail(null);
    setError("");
    api
      .get(`/courts/${courtId}`, null, { auth: false })
      .then((d) => !cancelled && setDetail(d))
      .catch((err) => !cancelled && setError(describeDetail(err.detail || err.message)));
    return () => {
      cancelled = true;
    };
  }, [courtId]);

  const loadDay = useCallback(async () => {
    if (!courtId) return;
    setSlots(null);
    try {
      setSlots(await api.get("/availability/slots", { court_id: courtId, date }));
    } catch (err) {
      toast(describeDetail(err.detail || err.message), "error");
      setSlots({ is_open: false, slots: [] });
    }
  }, [courtId, date, toast]);

  const loadWeek = useCallback(async () => {
    if (!courtId) return;
    setWeek(null);
    try {
      setWeek(await api.get("/availability/week", { court_id: courtId, start: date, days: 7 }, { auth: false }));
    } catch {
      setWeek({ overview: [] });
    }
  }, [courtId, date]);

  useEffect(() => {
    loadDay();
    loadWeek();
  }, [loadDay, loadWeek]);

  if (!courtId) {
    return (
      <section className="section" id="booking-panel">
        <EmptyState
          title="Elige una pista para ver su disponibilidad"
          message="Pulsa «Ver horarios» en cualquier pista del catálogo, o usa el buscador de arriba."
        />
      </section>
    );
  }

  if (error) {
    return (
      <section className="section" id="booking-panel">
        <EmptyState title="No se pudo cargar la pista" message={error} />
      </section>
    );
  }

  if (!detail) {
    return (
      <section className="section" id="booking-panel">
        <Spinner />
      </section>
    );
  }

  return (
    <section className="section" id="booking-panel">
      <div className="section__head">
        <div>
          <h2>{detail.name}</h2>
          <p className="muted small" style={{ margin: "4px 0 0" }}>
            {money(detail.price_per_hour)} / hora · Pista {detail.court_number}
          </p>
        </div>
        <RatingStars rating={detail.average_rating} count={detail.review_count} />
      </div>

      <div className="datestrip">
        {Array.from({ length: 14 }, (_, i) => {
          const iso = isoDate(addDays(today(), i));
          const p = dateParts(iso);
          return (
            <button
              key={iso}
              className={`datechip${iso === date ? " is-active" : ""}`}
              onClick={() => onDateChange(iso)}
            >
              <div className="datechip__dow">{p.dow}</div>
              <div className="datechip__day">{p.day}</div>
              <div className="datechip__month">{p.month}</div>
            </button>
          );
        })}
      </div>

      <div className="grid grid--two" style={{ marginTop: 20 }}>
        <div className="card card--pad">
          <h3 style={{ marginBottom: 12 }}>Franjas disponibles</h3>
          {slots === null ? (
            <Spinner />
          ) : !slots.is_open ? (
            <EmptyState title="Pista cerrada" message="No hay horario de apertura para este día." />
          ) : (
            <>
              <div className="chips" style={{ marginBottom: 14 }}>
                <span className="chip chip--brand">Libre</span>
                <span className="chip">Ocupada</span>
                <span className="chip">Pasada</span>
              </div>
              <div className="slots">
                {slots.slots.map((slot) => {
                  const cls =
                    slot.status === "free"
                      ? "is-free"
                      : slot.status === "booked"
                      ? slot.booking_id
                        ? "is-mine"
                        : "is-booked"
                      : slot.status === "past"
                      ? "is-past"
                      : "is-closed";
                  return (
                    <button
                      key={slot.start}
                      className={`slot ${cls}`}
                      disabled={slot.status !== "free"}
                      title={slot.status === "booked" ? "Franja ocupada" : slot.status}
                      onClick={() => setModal({ startTime: hhmm(slot.start) })}
                    >
                      <span>{hhmm(slot.start)}</span>
                      <small>{money(slot.price)}</small>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="card card--pad">
          <h3 style={{ marginBottom: 12 }}>Próxima semana</h3>
          {week === null ? (
            <Spinner />
          ) : (
            <>
              <div className="weekbars">
                {week.overview.map((day) => {
                  const pct = day.total_slots ? Math.round((day.available_slots / day.total_slots) * 100) : 0;
                  const p = dateParts(day.date);
                  return (
                    <div className="weekbar" key={day.date}>
                      <div className="weekbar__label">
                        {p.dow} {p.day}
                      </div>
                      <div className="weekbar__track">
                        <div className="weekbar__fill" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="weekbar__val">
                        {day.available_slots}/{day.total_slots}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="small muted" style={{ marginTop: 12 }}>
                Franjas libres sobre el total del día.
              </p>
            </>
          )}
        </div>
      </div>

      {modal ? (
        <BookingModal
          court={detail}
          date={date}
          slots={slots.slots}
          startTime={modal.startTime}
          onClose={() => setModal(null)}
          onBooked={() => {
            setModal(null);
            loadDay();
            loadWeek();
          }}
        />
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------- Page ---- */

export function Home() {
  const [date, setDate] = useState(isoDate(today()));
  const [courtId, setCourtId] = useState(null);
  const panelRef = useRef(null);

  const selectCourt = (id) => {
    setCourtId(id);
    requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  return (
    <>
      <Hero onSeeAvailability={() => panelRef.current?.scrollIntoView({ behavior: "smooth" })} />
      <QuickSearch date={date} onResults={() => {}} onPickDate={setDate} />
      <Catalogue onSelectCourt={selectCourt} />
      <div ref={panelRef}>
        <AvailabilityPanel courtId={courtId} date={date} onDateChange={setDate} />
      </div>
    </>
  );
}
