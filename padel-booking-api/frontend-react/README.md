# PadelClub · Frontend React (SPA)

Frontend **separado** del backend, construido con **React 18 + Vite**. Consume la
API REST del backend FastAPI mediante **JWT** (`Bearer` en la cabecera
`Authorization`), con renovación automática del access token.

> El backend (FastAPI) es un proyecto independiente, en la carpeta
> `padel-booking-api/` del repositorio. Esta carpeta es la aplicación de cliente:
> se ejecuta y se despliega por separado.

## Requisitos

- Node.js 18+ y npm.

## Puesta en marcha (desarrollo)

1. Arranca primero el backend (en la raíz del repo):

   ```bash
   uvicorn app.main:app --reload --port 8000
   ```

2. En otra terminal, arranca esta SPA:

   ```bash
   cd frontend-react
   npm install
   npm run dev
   ```

3. Abre <http://localhost:5173>.

En desarrollo, **Vite hace de proxy** de `/api`, `/docs`, `/redoc` y
`/openapi.json` hacia `http://127.0.0.1:8000`, por lo que no hay problemas de
CORS. La app usa la ruta relativa `/api/v1` por defecto.

## Configuración

Copia `.env.example` a `.env` y ajusta si lo necesitas:

| Variable | Por defecto | Descripción |
|----------|-------------|-------------|
| `VITE_API_BASE` | *(vacío → `/api/v1`)* | URL base de la API. En producción usa una URL absoluta, p. ej. `https://api.midominio.com/api/v1`. |
| `VITE_BACKEND_URL` | `http://127.0.0.1:8000` | Destino del proxy de desarrollo de Vite. |

Si sirves la SPA en un dominio distinto al de la API, recuerda añadir ese
origen a `CORS_ORIGINS` en el backend (por defecto ya incluye
`http://localhost:5173`).

## Compilar para producción

```bash
npm run build      # genera dist/
npm run preview    # sirve dist/ localmente para comprobar
```

El contenido de `dist/` es estático y puede servirse con cualquier servidor
web (Nginx, Caddy, Netlify, Vercel…). Recuerda fijar `VITE_API_BASE` antes de
compilar y añadir el origen del frontend a `CORS_ORIGINS` del backend.

## Estructura

```
frontend-react/
├── index.html
├── vite.config.js          # proxy /api -> backend
├── .env.example
└── src/
    ├── main.jsx            # punto de entrada (providers + router)
    ├── App.jsx             # rutas protegidas por sesión/rol
    ├── styles.css          # design system verde/blanco (Playtomic)
    ├── lib/
    │   ├── config.js       # API_BASE, reglas de negocio
    │   ├── auth.js         # store de sesión (localStorage) + useSyncExternalStore
    │   ├── api.js          # cliente HTTP + refresco automático de JWT
    │   ├── format.js       # fechas, horas e importes en es
    │   └── labels.js       # etiquetas de estados/roles
    ├── context/
    │   ├── AuthContext.jsx # login/register/logout/refreshUser
    │   └── ToastContext.jsx
    ├── components/
    │   ├── Layout.jsx      # cabecera, navegación, sesión y footer
    │   ├── ui.jsx          # Modal, Spinner, badges, campos, estados vacíos
    │   ├── BookingModal.jsx
    │   └── ConfirmProvider.jsx
    └── pages/
        ├── Home.jsx        # buscador + catálogo + disponibilidad + reserva
        ├── Bookings.jsx    # mis reservas (pagar, valorar, reprogramar, cancelar)
        ├── Matches.jsx     # partidos (buscar, publicar, solicitar plaza)
        ├── Profile.jsx     # datos, contraseña y pagos
        ├── Admin.jsx       # panel (métricas, reservas, usuarios, pistas)
        ├── Login.jsx
        └── Register.jsx
```

## Autenticación (JWT)

- El login guarda el par `access`/`refresh` en `localStorage`.
- Cada petición añade `Authorization: Bearer <access>`.
- Ante un **401**, el cliente intenta **refrescar** con el refresh token
  (rotación de un solo uso en el backend) y reintenta la petición una vez.
- Si el refresco falla, se limpia la sesión y se pide login de nuevo.
- El **logout** revoca los tokens en el servidor (`POST /auth/logout`).

## Rutas

| Ruta | Acceso | Descripción |
|------|--------|-------------|
| `/` | Público | Reservar: catálogo y disponibilidad |
| `/matches` | Autenticado | Partidos / matchmaking |
| `/bookings` | Autenticado | Mis reservas |
| `/profile` | Autenticado | Mi perfil y pagos |
| `/admin` | staff (admin/coach) | Panel de gestión |
| `/login`, `/register` | Público | Acceso y registro |

## Credenciales de demo

- `admin@padel.com` / `Admin123!` (administrador)
- `player@padel.com` / `Player123!` (jugador)
