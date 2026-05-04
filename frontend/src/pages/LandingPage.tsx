import React from 'react';
import { useNavigate } from 'react-router-dom';

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="landing-hero fade-in-up">
      <nav className="landing-nav fade-in-up-delay-1">
        <div className="landing-nav-logo">
          <div className="landing-nav-logo-text">
            <span>E.S.E. Hospital</span>
            <span>San Juan de Dios</span>
          </div>
        </div>
        <div className="landing-nav-badge">Portal del Paciente</div>
      </nav>

      <main className="landing-content">
        <div className="landing-tag fade-in-up-delay-2">
          <span>🏥</span> Tu salud, a un clic de distancia
        </div>
        
        <h1 className="landing-title fade-in-up-delay-3">
          Bienvenido a los<br/>
          <span className="highlight">Servicios en Línea</span>
        </h1>
        
        <p className="landing-subtitle fade-in-up-delay-4">
          Accede de forma segura y rápida a tus historias clínicas y resultados de laboratorio sin necesidad de crear contraseñas.
        </p>

        <div className="landing-cta-group fade-in-up-delay-4">
          <button 
            className="btn-cta-primary"
            onClick={() => navigate('/servicios')}
          >
            <span>Consultar mis registros</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
          </button>
        </div>

        <div className="landing-stats fade-in-up-delay-4">
          <div className="landing-stat">
            <div className="landing-stat-number">24/7</div>
            <div className="landing-stat-label">Disponibilidad</div>
          </div>
          <div className="landing-stat-divider"></div>
          <div className="landing-stat">
            <div className="landing-stat-number">+10k</div>
            <div className="landing-stat-label">Pacientes</div>
          </div>
          <div className="landing-stat-divider"></div>
          <div className="landing-stat">
            <div className="landing-stat-number">0</div>
            <div className="landing-stat-label">Filas de espera</div>
          </div>
        </div>
      </main>
    </div>
  );
};
