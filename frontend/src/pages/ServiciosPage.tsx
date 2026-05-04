import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { AuthModal } from '../components/AuthModal';

export const ServiciosPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  
  const [showModal, setShowModal] = useState(false);
  const [targetRoute, setTargetRoute] = useState('');

  const handleSelectService = (route: string) => {
    setTargetRoute(route);
    setShowModal(true);
  };

  const handeAuthSuccess = (paciente: any, token: string) => {
    login(token, paciente);
    setShowModal(false);
    navigate(targetRoute);
  };

  return (
    <div className="servicios-page fade-in-up">
      <header className="servicios-header fade-in-up-delay-1">
        <button className="servicios-header-back" onClick={() => navigate('/')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
          Volver al Inicio
        </button>
        <h1 className="servicios-header-title">Servicios en Línea</h1>
        <p className="servicios-header-sub">Selecciona qué documento deseas consultar</p>
      </header>

      <main className="servicios-grid fade-in-up-delay-2">
        <div className="servicio-card" onClick={() => handleSelectService('/historias')}>
          <div className="servicio-icon blue">
            <span>📋</span>
          </div>
          <div style={{width: '100%'}}>
            <h2 className="servicio-card-title">Historia Clínica</h2>
            <p className="servicio-card-desc">Consulta, descarga y gestiona el historial médico de tus atenciones pasadas.</p>
          </div>
          <div className="servicio-card-arrow">&rarr;</div>
        </div>

        <div className="servicio-card" onClick={() => handleSelectService('/laboratorios')}>
          <div className="servicio-icon teal">
            <span>🧪</span>
          </div>
          <div style={{width: '100%'}}>
            <h2 className="servicio-card-title">Resultados de Laboratorio</h2>
            <p className="servicio-card-desc">Accede a los reportes de tus exámenes de sangre, orina y otros análisis.</p>
          </div>
          <div className="servicio-card-arrow">&rarr;</div>
        </div>
      </main>

      {showModal && (
        <AuthModal 
          onSuccess={handeAuthSuccess}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
};
