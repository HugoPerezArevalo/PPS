import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// La app React es un proyecto independiente del backend FastAPI.
// En desarrollo, Vite hace de proxy hacia el backend para evitar CORS:
//   /api/*  -> http://127.0.0.1:8000/api/*
//   /docs   -> http://127.0.0.1:8000/docs
// En producción, define VITE_API_BASE con la URL real de la API.
const BACKEND = process.env.VITE_BACKEND_URL || "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: BACKEND, changeOrigin: true },
      "/docs": { target: BACKEND, changeOrigin: true },
      "/redoc": { target: BACKEND, changeOrigin: true },
      "/openapi.json": { target: BACKEND, changeOrigin: true },
    },
  },
});
