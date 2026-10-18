# 🎾 Padel Court Booking API

API REST para la **gestión de reservas de pistas de pádel**, construida con
**FastAPI**, **SQLAlchemy 2.0** y **JWT**.

Incluye gestión de pistas y horarios, disponibilidad por franjas, reservas con
detección de solapamientos, pagos, valoraciones, búsqueda de pareja (*matchmaking*)
y un panel de estadísticas.

---

## ✨ Características

- **Autenticación JWT** (access + refresh) con roles `admin`, `coach` y `player`.
- **Pistas**: superficie (panorámica / prefabricada / hormigón), indoor/outdoor,
  iluminación, cubierta, precio/hora y estado (disponible / mantenimiento / cerrada).
- **Horarios semanales** por pista y **cierres puntuales** (mantenimiento, torneos…).
- **Disponibilidad**: rejilla de franjas por pista/día y buscador de pistas libres.
- **Reservas**: creación, reprogramación y cancelación con validación de conflictos
  y cálculo automático del precio.
- **Participantes** de una reserva (jugadores registrados o invitados).
- **Pagos**: registro por reserva, marcado como pagado y reembolsos.
- **Valoraciones**: solo se puede valorar una pista en la que se ha reservado.
- **Matchmaking**: publicar partidos, recibir solicitudes y aceptarlas/rechazarlas.
- **Estadísticas**: métricas, ingresos y ocupación mensual por pista.
- **Datos de demo** y **datos de semilla** configurables.
- **Documentación interactiva** en `/docs` (Swagger UI) y `/redoc`.
- **29 tests** de extremo a extremo con `pytest`.

---

## 🧱 Stack

| Componente | Tecnología |
|-----------|------------|
| Framework | FastAPI |
| ORM | SQLAlchemy 2.0 (estilo tipado) |
| Validación | Pydantic v2 + pydantic-settings |
| Base de datos | SQLite (por defecto) · cualquier BD vía `DATABASE_URL` |
| Seguridad | PyJWT + bcrypt |
| Servidor | Uvicorn |
| Tests | pytest + httpx (TestClient) |

---

## 📂 Estructura

```
padel-booking-api/
├── app/
│   ├── main.py            # Aplicación FastAPI, CORS, routers y lifespan
│   ├── config.py          # Configuración (variables de entorno)
│   ├── database.py        # Engine, sesión y Base declarativa
│   ├── models.py          # Modelos ORM (users, courts, bookings, ...)
│   ├── schemas.py         # Esquemas Pydantic de entrada/salida
│   ├── security.py        # Hash de contraseñas y JWT
│   ├── dependencies.py    # Dependencias (usuario actual, roles, ...)
│   ├── seed.py            # Datos de demo
│   ├── routers/           # Endpoints por dominio
│   │   ├── auth.py        # Registro, login, refresh
│   │   ├── users.py       # Perfiles y administración
│   │   ├── courts.py      # Pistas, horarios y cierres
│   │   ├── availability.py# Franjas y búsqueda de pistas libres
│   │   ├── bookings.py    # Reservas
│   │   ├── payments.py    # Pagos
│   │   ├── reviews.py     # Valoraciones
│   │   ├── matches.py     # Matchmaking
│   │   └── stats.py       # Panel de estadísticas
│   └── services/          # Lógica de negocio
│       ├── availability.py
│       ├── bookings.py
│       ├── courts.py
│       ├── stats.py
│       └── tokens.py      # Revocación/rotación de JWT
├── frontend/              # SPA estática (verde/blanco, estilo Playtomic)
│   ├── index.html
│   ├── css/styles.css
│   └── js/
│       ├── app.js         # Enrutado por hash y navegación
│       ├── api.js         # Cliente HTTP + refresco de token
│       ├── store.js       # Sesión (tokens/usuario)
│       ├── ui.js          # Componentes y utilidades
│       ├── components/    # Login y modal de reserva
│       └── views/         # home, bookings, matches, profile, admin
├── frontend-react/        # Frontend SEPARADO en React + Vite (proyecto Node)
│   ├── index.html
│   ├── vite.config.js     # proxy /api -> backend en desarrollo
│   ├── package.json
│   └── src/               # componentes, contextos, páginas y cliente API
├── tests/                 # Tests de extremo a extremo
├── requirements.txt
├── requirements-dev.txt
├── Dockerfile
├── docker-compose.yml
├── Makefile
└── .env.example
```

---

## 🚀 Puesta en marcha

### 1. Entorno virtual e instalación

```bash
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
# para desarrollo/pruebas:
pip install -r requirements-dev.txt
```

### 2. Configuración (opcional)

```bash
cp .env.example .env
# edita .env y define, como mínimo, un SECRET_KEY propio
python -c "import secrets; print(secrets.token_hex(32))"
```

### 3. Arrancar el servidor

```bash
uvicorn app.main:app --reload
```

- API: <http://127.0.0.1:8000>
- Swagger UI: <http://127.0.0.1:8000/docs>
- ReDoc: <http://127.0.0.1:8000/redoc>

La base de datos se crea automáticamente y, con `SEED_ON_STARTUP=true`, se cargan
pistas y usuarios de demo.

### Credenciales de demo

| Rol | Email | Contraseña |
|-----|-------|------------|
| Admin | `admin@padel.com` | `Admin123!` |
| Jugador | `player@padel.com` | `Player123!` |

> Si la base de datos está vacía, **el primer usuario registrado pasa a ser admin**.

---

## 🖥️ Frontend web (estilo Playtomic)

El proyecto incluye **dos frontends** que consumen la misma API REST (backend y
frontend están **separados**: el backend es FastAPI y el frontend es una app de
cliente independiente que se comunica por HTTP/JSON con JWT).

### `frontend-react/` — React + Vite (recomendado)

SPA en **React 18 + Vite**, proyecto Node **independiente** del backend. Es la
opción recomendada y la que mejor refleja el enfoque "frontend separado".

```bash
# Terminal 1 — backend
uvicorn app.main:app --reload --port 8000

# Terminal 2 — frontend React
cd frontend-react
npm install
npm run dev          # http://localhost:5173
```

En desarrollo, Vite hace de **proxy** de `/api` hacia el backend (sin CORS).
Para producción, `npm run build` genera `dist/` y se configura la API con
`VITE_API_BASE`. Ver `frontend-react/README.md` para todos los detalles.

### `frontend/` — SPA estática ligera (sin build)

La carpeta `frontend/` contiene además una **SPA** ligera (HTML + CSS + JavaScript con
módulos ES, **sin paso de build ni dependencias**) con la misma estética verde y blanca.
Es útil para una demo rápida sin necesidad de Node.

Incluye:

- **Reservar**: catálogo de pistas con filtros, buscador de hueco libre, tira de
  días, rejilla de franjas y modal de reserva con precio calculado.
- **Mis reservas**: listado con filtros, reprogramar, cancelar, pagar y valorar.
- **Partidos**: matchmaking (buscar, publicar, solicitar plaza y aceptar/rechazar).
- **Mi perfil**: edición de datos, cambio de contraseña y mis pagos.
- **Admin** (staff): dashboard de métricas, agenda global, usuarios y pistas.

### Cómo usarlo

Se sirve automáticamente desde el propio FastAPI (si la carpeta `frontend/` existe):

```bash
uvicorn app.main:app --reload
# Frontend:  http://127.0.0.1:8000/app/
# API docs:  http://127.0.0.1:8000/docs
```

También puedes servirlo por separado con cualquier servidor estático
(el backend debe estar en `http://127.0.0.1:8000`, ya incluido en `CORS_ORIGINS`):

```bash
python -m http.server 3000 --directory frontend
# Frontend:  http://127.0.0.1:3000/
```

> La URL de la API se autodetecta (mismo origen si se sirve en el puerto 8000,
> o `http://127.0.0.1:8000/api/v1` en caso contrario). Para apuntar a otro
> backend, define `localStorage.setItem('padel.apiBase', 'https://mi-api.com/api/v1')`
> desde la consola del navegador.

Credenciales de demo: `admin@padel.com / Admin123!` y `player@padel.com / Player123!`.

---

## ⚙️ Variables de entorno

| Variable | Por defecto | Descripción |
|----------|-------------|-------------|
| `SECRET_KEY` | *(dev)* | Clave para firmar los JWT. Cámbiala en producción. |
| `DATABASE_URL` | `sqlite:///./padel.db` | Cadena de conexión de SQLAlchemy. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `720` | Vida del access token. |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `7` | Vida del refresh token. |
| `BCRYPT_ROUNDS` | `12` | Coste del hash de contraseñas. |
| `SLOT_MINUTES` | `30` | Granularidad de las franjas. |
| `MIN_BOOKING_MINUTES` | `30` | Duración mínima de una reserva. |
| `MAX_BOOKING_HOURS` | `3` | Duración máxima de una reserva. |
| `CANCEL_CUTOFF_HOURS` | `6` | Horas mínimas para cancelar gratis. |
| `DEFAULT_OPEN_TIME` / `DEFAULT_CLOSE_TIME` | `08:00` / `23:00` | Horario por defecto de nuevas pistas. |
| `SEED_ON_STARTUP` | `true` | Carga datos de demo al arrancar. |
| `CORS_ORIGINS` | localhost varios | Orígenes permitidos (lista JSON). |

Todas están definidas en `app/config.py` y pueden sobreescribirse por entorno o `.env`.

---

## 🔐 Autenticación (JWT)

La API usa **JWT** firmados con `SECRET_KEY` (algoritmo `HS256`) enviados en la
cabecera `Authorization: Bearer <token>`. Cada token incluye un `jti` (id único)
y un `type` (`access` o `refresh`):

| Token | `type` | Vida por defecto |
|-------|--------|------------------|
| Access | `access` | 12 h |
| Refresh | `refresh` | 7 días |

Además de la firma y la caducidad, la API implementa **revocación real**:

- **Logout** (`POST /auth/logout`): añade el `jti` del access y del refresh token a
  una lista negra (`revoked_tokens`). A partir de ese momento, aunque el JWT siga
  siendo válido criptográficamente, devuelve **401**.
- **Rotación de refresh** (`POST /auth/refresh`): cada refresh token es de **un solo
  uso**. Al canjearlo se revoca el antiguo y se emite un par nuevo. Si se reutiliza
  un refresh ya consumido, se rechaza con **401** (posible robo de token).
- Los registros de la lista negra cuyo token ya habría caducado se **purgan al
  arrancar** el servidor, por lo que la tabla no crece indefinidamente.

```bash
BASE=http://127.0.0.1:8000/api/v1
LOGIN=$(curl -s -X POST $BASE/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"player@padel.com","password":"Player123!"}')
AT=$(echo "$LOGIN" | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
RT=$(echo "$LOGIN" | python3 -c 'import sys,json;print(json.load(sys.stdin)["refresh_token"])')

# Rotar el refresh (el viejo queda invalidado)
curl -s -X POST $BASE/auth/refresh -H 'Content-Type: application/json' -d "{\"refresh_token\":\"$RT\"}"

# Logout: revoca ambos tokens
curl -s -X POST $BASE/auth/logout -H "Authorization: Bearer $AT" \
  -H 'Content-Type: application/json' -d "{\"refresh_token\":\"$RT\"}"
```

---

## 📏 Reglas de negocio

- **Solapamiento por pista**: una pista no puede tener dos reservas activas
  (`pending`/`confirmed`) que se solapen.
- **Solapamiento por jugador**: un mismo jugador no puede tener dos reservas que
  se solapen, aunque sean en pistas distintas.
- **Rejilla de tiempo**: hora de inicio y fin alineadas a `SLOT_MINUTES`.
- **Duración**: mínimo `MIN_BOOKING_MINUTES`, máximo `MAX_BOOKING_HOURS`.
- **Horario**: la reserva debe caer dentro del horario semanal de la pista y no
  solaparse con un cierre puntual.
- **Precio**: `duración_en_horas × precio_por_hora`.
- **Cancelación**: el propietario puede cancelar gratis hasta
  `CANCEL_CUTOFF_HOURS` antes; un `admin` puede cancelar siempre.
- **Pagos**: cada reserva genera un pago `pending`. Al cancelar una reserva pagada,
  el pago pasa a `refunded`.
- **Valoraciones**: solo se puede valorar una pista en la que exista una reserva
  no cancelada, y una sola vez por usuario y pista.

Flujo de estados de una reserva:

```
pending ──► confirmed ──► completed
   │            │
   └──► cancelled ◄──┘        (──► no_show)
```

---

## 🔌 Endpoints principales

Prefijo de la API: `/api/v1`.

### Autenticación y usuarios
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/auth/register` | Registrar jugador |
| POST | `/auth/login` | Obtener tokens (access + refresh) |
| POST | `/auth/refresh` | Rotar tokens (invalida el refresh usado) |
| POST | `/auth/logout` | Revocar los tokens actuales |
| GET | `/auth/me` | Usuario autenticado |
| PATCH | `/users/me` | Editar mi perfil |
| POST | `/users/me/password` | Cambiar contraseña |
| GET/PATCH/DELETE | `/users` · `/users/{id}` | Administración (admin) |

### Pistas, horarios y cierres
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/courts` | Catálogo (filtros) |
| GET | `/courts/{id}` | Detalle + horario + cierres + valoración |
| POST/PATCH/DELETE | `/courts` · `/courts/{id}` | CRUD (admin) |
| GET/PUT | `/courts/{id}/schedule` | Horario semanal |
| GET/POST | `/courts/{id}/closures` | Cierres puntuales |

### Disponibilidad y reservas
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/availability/slots?court_id=&date=` | Rejilla del día |
| GET | `/availability/courts?date=&start_time=&end_time=` | Pistas libres |
| GET | `/availability/week?court_id=&days=` | Resumen semanal |
| POST | `/bookings` | Crear reserva |
| GET | `/bookings` | Listar (propias / todas para staff) |
| GET/PATCH | `/bookings/{id}` | Ver / reprogramar |
| POST | `/bookings/{id}/cancel` | Cancelar |
| PATCH | `/bookings/{id}/status` | Cambiar estado (staff) |

### Pagos, valoraciones, matchmaking y stats
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/payments` · `/payments/me` | Listar pagos |
| POST | `/payments/{id}/pay` | Marcar como pagado |
| POST | `/payments/{id}/refund` | Reembolsar (admin) |
| GET/POST | `/courts/{id}/reviews` | Valoraciones |
| POST | `/matches` | Publicar partido |
| GET | `/matches` | Buscar partidos abiertos |
| POST | `/matches/{id}/apply` | Solicitar unirme |
| POST | `/matches/{id}/applications/{app}/accept` | Aceptar solicitud |
| GET | `/stats/dashboard` | Métricas y ocupación (staff) |

La lista completa está en `/docs`.

---

## 🧪 Ejemplos con `curl`

```bash
BASE=http://127.0.0.1:8000/api/v1

# 1) Registro
curl -X POST $BASE/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"ana@padel.com","password":"Passw0rd!","full_name":"Ana García"}'

# 2) Login -> guardamos el token
TOKEN=$(curl -s -X POST $BASE/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@padel.com","password":"Admin123!"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')

AUTH="Authorization: Bearer $TOKEN"

# 3) Listar pistas
curl -s $BASE/courts -H "$AUTH"

# 4) Disponibilidad de la pista 1 dentro de dos días
DAY=$(date -d "+2 days" +%F)
curl -s "$BASE/availability/slots?court_id=1&date=$DAY" -H "$AUTH"

# 5) Crear una reserva de 90 minutos
curl -s -X POST $BASE/bookings -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"court_id\":1,\"booking_date\":\"$DAY\",\"start_time\":\"19:00\",\"end_time\":\"20:30\"}"

# 6) Cancelar la reserva 1
curl -s -X POST $BASE/bookings/1/cancel -H "$AUTH" \
  -H 'Content-Type: application/json' -d '{"reason":"No puedo asistir"}'

# 7) Panel de estadísticas (staff)
curl -s $BASE/stats/dashboard -H "$AUTH"
```

---

## 🐳 Docker

```bash
docker compose up --build
# API en http://localhost:8000
```

O manualmente:

```bash
docker build -t padel-api .
docker run -p 8000:8000 -e SECRET_KEY=$(python3 -c "import secrets;print(secrets.token_hex(32))") padel-api
```

---

## ✅ Tests

```bash
pytest -q
```

Los tests usan una base de datos SQLite aislada en `/tmp` y cubren autenticación,
permisos por rol, disponibilidad, conflictos de reserva, cancelación,
reprogramación, pagos, valoraciones, matchmaking y estadísticas.

---

## 🗺️ Posibles siguientes pasos

- Autenticación OAuth2 con proveedores externos y *rate limiting*.
- Integración con pasarela de pago real (Stripe / Redsys / Bizum).
- Notificaciones por email/push y recordatorios.
- Reservas recurrentes (ligas, entrenamientos, abonos).
- Lista de espera automática cuando una franja se libera.
- Migraciones con Alembic y despliegue con PostgreSQL.
- Empaquetado del frontend como PWA y notificaciones push.

---

## 📄 Licencia

MIT.
# pps-ciberseguridad-trabajos-pps-26-27-hugoperezarevalo
