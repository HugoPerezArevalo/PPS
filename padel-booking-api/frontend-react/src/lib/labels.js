// Etiquetas en español para los valores que devuelve la API.

const SURFACE = { panoramic: "Panorámica", prefabricated: "Prefabricada", concrete: "Hormigón" };
const ENVIRONMENT = { indoor: "Indoor", outdoor: "Outdoor" };
const BOOKING_STATUS = {
  pending: "Pendiente",
  confirmed: "Confirmada",
  cancelled: "Cancelada",
  completed: "Completada",
  no_show: "No presentado",
};
const PAYMENT_STATUS = { pending: "Pendiente", paid: "Pagado", refunded: "Reembolsado", failed: "Fallido" };
const PAYMENT_METHOD = { cash: "Efectivo", card: "Tarjeta", bizum: "Bizum", transfer: "Transferencia", credit: "Bono" };
const MATCH_STATUS = { open: "Abierto", full: "Completo", cancelled: "Cancelado", completed: "Completado" };
const APPLICATION_STATUS = { pending: "Pendiente", accepted: "Aceptada", rejected: "Rechazada" };
const ROLE = { admin: "Administrador", coach: "Monitor", player: "Jugador" };
const COURT_STATUS = { available: "Disponible", maintenance: "Mantenimiento", closed: "Cerrada" };

export const labels = {
  surface: (v) => SURFACE[v] || v,
  environment: (v) => ENVIRONMENT[v] || v,
  bookingStatus: (v) => BOOKING_STATUS[v] || v,
  paymentStatus: (v) => PAYMENT_STATUS[v] || v,
  paymentMethod: (v) => PAYMENT_METHOD[v] || v,
  matchStatus: (v) => MATCH_STATUS[v] || v,
  applicationStatus: (v) => APPLICATION_STATUS[v] || v,
  role: (v) => ROLE[v] || v,
  courtStatus: (v) => COURT_STATUS[v] || v,
};
