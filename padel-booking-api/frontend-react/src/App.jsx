import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { Layout } from "./components/Layout.jsx";
import { useAuth } from "./context/AuthContext.jsx";
import { Admin } from "./pages/Admin.jsx";
import { Bookings } from "./pages/Bookings.jsx";
import { Home } from "./pages/Home.jsx";
import { Login } from "./pages/Login.jsx";
import { Matches } from "./pages/Matches.jsx";
import { Profile } from "./pages/Profile.jsx";
import { Register } from "./pages/Register.jsx";

function RequireAuth({ children }) {
  const { isLoggedIn } = useAuth();
  const location = useLocation();
  if (!isLoggedIn) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return children;
}

function RequireStaff({ children }) {
  const { isStaff } = useAuth();
  if (!isStaff) {
    return (
      <div className="empty">
        <h3>Área restringida</h3>
        <p>Esta sección está disponible para monitores y administradores.</p>
      </div>
    );
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="matches" element={<RequireAuth><Matches /></RequireAuth>} />
        <Route path="bookings" element={<RequireAuth><Bookings /></RequireAuth>} />
        <Route path="profile" element={<RequireAuth><Profile /></RequireAuth>} />
        <Route path="admin" element={<RequireAuth><RequireStaff><Admin /></RequireStaff></RequireAuth>} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
