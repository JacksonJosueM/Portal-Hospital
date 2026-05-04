import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Loader } from './components/Loader';

// Lazy loading de páginas
const LandingPage            = lazy(() => import('./pages/LandingPage').then(m => ({ default: m.LandingPage })));
const ServiciosPage          = lazy(() => import('./pages/ServiciosPage').then(m => ({ default: m.ServiciosPage })));
const HistoriasPage          = lazy(() => import('./pages/HistoriasPage').then(m => ({ default: m.HistoriasPage })));
const HistoriaDetallePage    = lazy(() => import('./pages/HistoriaDetallePage').then(m => ({ default: m.HistoriaDetallePage })));
const LaboratoriosPage       = lazy(() => import('./pages/LaboratoriosPage').then(m => ({ default: m.LaboratoriosPage })));
const LaboratorioDetallePage = lazy(() => import('./pages/LaboratorioDetallePage').then(m => ({ default: m.LaboratorioDetallePage })));

// Ruta protegida
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/servicios" replace />;
};

const PageFallback = () => (
  <div className="page-loader">
    <div className="spinner"></div>
    <div className="page-loader-text">Cargando...</div>
  </div>
);

function AppRoutes() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        {/* Públicas */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/servicios" element={<ServiciosPage />} />

        {/* Protegidas (Solo después del OTP) */}
        {/* Historias clínicas */}
        <Route path="/historias" element={
          <ProtectedRoute>
            <HistoriasPage />
          </ProtectedRoute>
        } />
        <Route path="/historias/:id" element={
          <ProtectedRoute>
            <HistoriaDetallePage />
          </ProtectedRoute>
        } />

        {/* Laboratorios */}
        <Route path="/laboratorios" element={
          <ProtectedRoute>
            <LaboratoriosPage />
          </ProtectedRoute>
        } />
        <Route path="/laboratorios/:id" element={
          <ProtectedRoute>
            <LaboratorioDetallePage />
          </ProtectedRoute>
        } />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
