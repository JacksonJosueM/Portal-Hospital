import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';

const NAV_ITEMS = [
  { path: '/dashboard', label: 'Inicio', icon: '⊞' },
  { path: '/historias', label: 'Historia Clínica', icon: '📋' },
  { path: '/laboratorios', label: 'Laboratorios', icon: '🧪' },
];

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { paciente, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleLogout = () => { logout(); navigate('/'); };
  const closeSidebar = () => setIsSidebarOpen(false);

  return (
    <div style={{ display: 'flex', minHeight: '100dvh', background: '#f0f4f8' }}>

      {/* ── Mobile Header ───────────────────────────────── */}
      <header
        className="mobile-only"
        style={{
          position: 'fixed', top: 0, left: 0, right: 0,
          height: 64,
          background: 'white',
          borderBottom: '1px solid #e5e7eb',
          zIndex: 50,
          padding: '0 16px',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34,
            background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
            borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16,
          }}>🏥</div>
          <span style={{ fontWeight: 700, color: '#1e40af', fontSize: 15 }}>
            Portal Paciente
          </span>
        </div>

        {/* Hamburger → X */}
        <button
          onClick={() => setIsSidebarOpen(v => !v)}
          aria-label="Abrir menú"
          style={{
            background: '#eff6ff',
            border: 'none',
            borderRadius: 8,
            width: 40, height: 40,
            display: 'flex', flexDirection: 'column',
            justifyContent: 'center', alignItems: 'center',
            gap: 5, cursor: 'pointer',
          }}
        >
          <span style={{
            display: 'block', width: 20, height: 2,
            background: '#1e40af', borderRadius: 2,
            transform: isSidebarOpen ? 'rotate(45deg) translate(5px,5px)' : 'none',
            transition: 'transform 0.25s ease',
          }} />
          <span style={{
            display: 'block', width: 20, height: 2,
            background: '#1e40af', borderRadius: 2,
            opacity: isSidebarOpen ? 0 : 1,
            transition: 'opacity 0.2s ease',
          }} />
          <span style={{
            display: 'block', width: 20, height: 2,
            background: '#1e40af', borderRadius: 2,
            transform: isSidebarOpen ? 'rotate(-45deg) translate(5px,-5px)' : 'none',
            transition: 'transform 0.25s ease',
          }} />
        </button>
      </header>

      {/* ── Overlay (mobile) ─────────────────────────────── */}
      {isSidebarOpen && (
        <div className="sidebar-overlay" onClick={closeSidebar} />
      )}

      {/* ── Sidebar ──────────────────────────────────────── */}
      <aside
        className={`sidebar ${isSidebarOpen ? 'open' : ''}`}
        style={{
          width: 240,
          background: 'white',
          borderRight: '1px solid #e5e7eb',
          display: 'flex',
          flexDirection: 'column',
          position: 'fixed',
          top: 0, left: 0,
          height: '100dvh',
          zIndex: 60,
          boxShadow: '2px 0 8px rgba(0,0,0,0.04)',
          overflow: 'hidden', // scroll solo en la zona central
        }}
      >
        {/* ── Zona scrolleable: logo + navegación ── */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px 16px 8px',
          scrollbarWidth: 'none', // oculta scrollbar en Firefox
        }}>
          {/* Logo */}
          <div style={{ marginBottom: 32, padding: '0 8px' }}>
            <div style={{
              width: 42, height: 42,
              background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
              borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, marginBottom: 12,
            }}>🏥</div>
            <h1 style={{ fontSize: 15, fontWeight: 700, color: '#1e40af', margin: 0 }}>Portal del</h1>
            <h1 style={{ fontSize: 15, fontWeight: 700, color: '#1e40af', margin: 0 }}>Paciente</h1>
          </div>

          {/* Navegación */}
          <nav>
            <p style={{
              fontSize: 11, fontWeight: 600, color: '#9ca3af',
              textTransform: 'uppercase', letterSpacing: '0.08em',
              padding: '0 8px', marginBottom: 8,
            }}>
              Menú principal
            </p>
            {NAV_ITEMS.map((item) => (
              <button
                key={item.path}
                className={`sidebar-link ${location.pathname === item.path ? 'active' : ''}`}
                onClick={() => { navigate(item.path); closeSidebar(); }}
                id={`nav-${item.path.replace('/', '')}`}
              >
                <span style={{ fontSize: 18 }}>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        {/* ── Footer FIJO: paciente + cerrar sesión ────────
            flexShrink: 0 → nunca se comprime ni desaparece
            Siempre visible sin importar el tamaño de pantalla  */}
        <div style={{
          flexShrink: 0,
          borderTop: '1px solid #e5e7eb',
          padding: '16px 16px 24px',
          background: 'white',
        }}>
          <div style={{ padding: '0 8px', marginBottom: 10 }}>
            <div style={{
              width: 36, height: 36,
              background: 'linear-gradient(135deg, #dbeafe, #bfdbfe)',
              borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, marginBottom: 8,
            }}>👤</div>
            <p style={{
              fontSize: 13, fontWeight: 600, color: '#1f2937',
              margin: 0, lineHeight: 1.3,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {paciente?.nombre?.split(' ').slice(0, 2).join(' ')}
            </p>
            <p style={{ fontSize: 11, color: '#9ca3af', margin: '2px 0 0' }}>Paciente</p>
          </div>

          <button
            className="sidebar-link"
            onClick={handleLogout}
            id="btn-logout"
            style={{ color: '#ef4444' }}
          >
            <span>🚪</span> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────── */}
      <main
        className="main-content"
        style={{ flex: 1, minHeight: '100vh' }}
      >
        {children}
      </main>
    </div>
  );
};
