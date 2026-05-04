import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { historiasService, laboratoriosService } from '../services';
import { Layout } from '../components/Layout';
import { Loader } from '../components/Loader';

interface Stats {
  historias: number;
  laboratorios: number;
}

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { paciente } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [h, l] = await Promise.all([
          historiasService.listar(),
          laboratoriosService.listar(),
        ]);
        setStats({ historias: h.total, laboratorios: l.total });
      } catch {
        setStats({ historias: 0, laboratorios: 0 });
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const hora = new Date().getHours();
  const saludo = hora < 12 ? 'Buenos días' : hora < 18 ? 'Buenas tardes' : 'Buenas noches';
  const firstName = paciente?.nombre?.split(' ')[0] || 'Paciente';

  // Fecha corta para móvil, larga para desktop
  const fechaLarga = new Date().toLocaleDateString('es-CO', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const fechaCorta = new Date().toLocaleDateString('es-CO', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  const CARDS = [
    {
      id: 'card-historias',
      icon: '📋',
      title: 'Historia Clínica',
      desc: 'Consulta tus diagnósticos y consultas médicas',
      count: stats?.historias,
      label: 'consultas registradas',
      color: '#1e40af',
      bg: 'linear-gradient(135deg, #eff6ff, #dbeafe)',
      path: '/historias',
    },
    {
      id: 'card-laboratorios',
      icon: '🧪',
      title: 'Resultados de Laboratorio',
      desc: 'Accede a tus exámenes y análisis clínicos',
      count: stats?.laboratorios,
      label: 'resultados disponibles',
      color: '#0369a1',
      bg: 'linear-gradient(135deg, #f0f9ff, #e0f2fe)',
      path: '/laboratorios',
    },
  ];

  return (
    <Layout>
      <div className="animate-fade-in-up">

        {/* ── Banner de bienvenida ───────────────────────── */}
        <div
          className="welcome-banner"
          style={{
            background: 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)',
            borderRadius: 20,
            /* FIX: padding reducido; en móvil lo sobrescribe .welcome-banner del CSS */
            padding: '28px 32px',
            marginBottom: 28,
            color: 'white',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Círculos decorativos */}
          <div style={{
            position: 'absolute', top: -40, right: -40,
            width: 180, height: 180,
            background: 'rgba(255,255,255,0.06)',
            borderRadius: '50%', pointerEvents: 'none',
          }} />
          <div style={{
            position: 'absolute', bottom: -60, right: 80,
            width: 130, height: 130,
            background: 'rgba(255,255,255,0.04)',
            borderRadius: '50%', pointerEvents: 'none',
          }} />

          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', margin: '0 0 4px' }}>
            {saludo},
          </p>

          {/* FIX: font-size adaptado via clase welcome-title */}
          <h1
            className="welcome-title"
            style={{ fontSize: 26, fontWeight: 800, margin: '0 0 8px' }}
          >
            {firstName} 👋
          </h1>

          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', margin: 0, lineHeight: 1.5 }}>
            Bienvenido a tu portal de salud. Consulta tu información médica de forma segura.
          </p>

          {/* FIX: chips con flex-wrap para móvil */}
          <div
            className="welcome-chips"
            style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 20 }}
          >
            <div
              className="welcome-chip"
              style={{
                background: 'rgba(255,255,255,0.15)',
                borderRadius: 10,
                padding: '10px 14px',
                backdropFilter: 'blur(10px)',
                minWidth: 0,          /* permite que shrinkee */
                flex: '1 1 160px',    /* crece pero se envuelve cuando no cabe */
              }}
            >
              <p style={{ margin: 0, fontSize: 10, color: 'rgba(255,255,255,0.7)' }}>Fecha de hoy</p>
              {/* FIX: fecha corta en móvil, larga en desktop */}
              <p style={{ margin: 0, fontSize: 12, fontWeight: 600 }}>
                <span className="desktop-only">{fechaLarga}</span>
                <span className="mobile-only" style={{ display: 'inline' }}>{fechaCorta}</span>
              </p>
            </div>

            <div
              className="welcome-chip"
              style={{
                background: 'rgba(255,255,255,0.15)',
                borderRadius: 10,
                padding: '10px 14px',
                backdropFilter: 'blur(10px)',
                flex: '1 1 100px',
              }}
            >
              <p style={{ margin: 0, fontSize: 10, color: 'rgba(255,255,255,0.7)' }}>Estado</p>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 600 }}>✅ Acceso activo</p>
            </div>
          </div>
        </div>

        {/* ── Cards de acceso rápido ─────────────────────── */}
        <h2 style={{ fontSize: 15, fontWeight: 600, color: '#374151', marginBottom: 16 }}>
          Acceso rápido
        </h2>

        {loading ? (
          <Loader text="Cargando información..." className="py-12" />
        ) : (
          <div style={{
            display: 'grid',
            /* FIX: minmax más pequeño para que quepan en móvil sin overflow */
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
            gap: 16,
          }}>
            {CARDS.map((card) => (
              <button
                key={card.id}
                id={card.id}
                onClick={() => navigate(card.path)}
                className="card"
                style={{
                  background: card.bg,
                  border: 'none',
                  borderRadius: 16,
                  padding: 22,
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.25s ease',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                  width: '100%',
                }}
              >
                <div style={{ fontSize: 34, marginBottom: 10 }}>{card.icon}</div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: card.color, margin: '0 0 6px' }}>
                  {card.title}
                </h3>
                <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 14px', lineHeight: 1.5 }}>
                  {card.desc}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <span style={{ fontSize: 26, fontWeight: 800, color: card.color }}>
                      {card.count}
                    </span>
                    <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 6 }}>
                      {card.label}
                    </span>
                  </div>
                  <span style={{
                    background: card.color,
                    color: 'white',
                    borderRadius: 8,
                    padding: '6px 12px',
                    fontSize: 13,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}>
                    Ver →
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* ── Aviso de seguridad ────────────────────────── */}
        <div style={{
          background: '#f0fdf4',
          border: '1px solid #bbf7d0',
          borderRadius: 12,
          padding: '14px 18px',
          marginTop: 24,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
        }}>
          <span style={{ fontSize: 22, flexShrink: 0, marginTop: 2 }}>🔒</span>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#166534' }}>
              Tu información está protegida
            </p>
            <p style={{ margin: 0, fontSize: 13, color: '#15803d', marginTop: 2, lineHeight: 1.5 }}>
              Todos tus datos médicos están cifrados y son confidenciales. La sesión expira automáticamente en 2 horas.
            </p>
          </div>
        </div>

      </div>
    </Layout>
  );
};
