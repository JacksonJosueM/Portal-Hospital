import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { laboratoriosService } from '../services';
import { useAuth } from '../contexts/AuthContext';
import { Loader } from '../components/Loader';

export const LaboratoriosPage: React.FC = () => {
  const [laboratorios, setLaboratorios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const { paciente, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchLaboratorios();
  }, []);

  const fetchLaboratorios = async () => {
    try {
      const data = await laboratoriosService.listar();
      setLaboratorios(data);
    } catch (err: any) {
      if (err.response?.status === 401) {
        logout();
        navigate('/');
      } else {
        setError('Error al cargar los laboratorios');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDescargar = async (laboratorio: any) => {
    setDownloadingId(laboratorio.id);
    try {
      await laboratoriosService.descargarPdf(laboratorio.id, `laboratorio_${laboratorio.id}.pdf`);
    } catch (err: any) {
      alert('Error al descargar el PDF del laboratorio');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleSalir = () => {
    logout();
    navigate('/');
  };

  const formatearFecha = (fecha: string) => {
    if (!fecha) return 'Sin fecha';
    const d = new Date(fecha);
    if (isNaN(d.getTime())) return 'Fecha inválida';
    return new Intl.DateTimeFormat('es-CO', {
      day: '2-digit', month: 'short', year: 'numeric'
    }).format(d).toUpperCase();
  };

  if (loading) return (
    <div className="page-loader">
      <div className="spinner"></div>
      <div className="page-loader-text">Cargando resultados...</div>
    </div>
  );

  return (
    <div className="registros-page fade-in-up">
      <div className="registros-topbar">
        <div className="registros-topbar-left">
          <div className="registros-topbar-avatar">👤</div>
          <div className="registros-topbar-info">
            <span className="registros-topbar-name">{paciente?.nombre}</span>
            <span className="registros-topbar-doc">{paciente?.tipo_documento} {paciente?.numero_documento}</span>
          </div>
        </div>
        <button className="registros-topbar-salir" onClick={handleSalir}>Salir</button>
      </div>

      <main className="registros-content">
        <button className="servicios-header-back" onClick={() => navigate('/servicios')} style={{color: 'var(--teal-600)', marginBottom: '24px'}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
          Volver a Servicios
        </button>

        <h1 className="registros-section-title fade-in-up-delay-1">Exámenes de Laboratorio</h1>
        <p className="registros-section-sub fade-in-up-delay-1">Revisa y descarga los resultados de tus análisis médicos.</p>

        {error && <div className="alert error">{error}</div>}

        <div className="registros-list fade-in-up-delay-2">
          {laboratorios.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🧪</div>
              <h3 className="empty-state-title">No hay laboratorios registrados</h3>
              <p className="empty-state-text">No encontramos resultados de exámenes analíticos asociados a su documento.</p>
            </div>
          ) : (
            laboratorios.map(lab => (
              <div key={lab.id} className="record-card">
                <div className="record-card-body">
                  <div className="record-card-icon" style={{background: 'var(--teal-50)'}}>🧪</div>
                  <div className="record-card-info">
                    <div className="record-card-fecha">{formatearFecha(lab.fecha)}</div>
                    <div className="record-card-titulo">Prueba de Laboratorio #{lab.id}</div>
                    <div className="record-card-meta">Análisis clínico</div>
                  </div>
                  <div className="record-card-actions">
                    <button 
                      className="btn-icon blue" 
                      onClick={() => navigate(`/laboratorios/${lab.id}`)}
                      title="Ver Resultados en pantalla"
                    >
                      👁️
                    </button>
                    <button 
                      className="btn-icon teal" 
                      onClick={() => handleDescargar(lab)}
                      title="Descargar PDF"
                      disabled={downloadingId === lab.id}
                    >
                      {downloadingId === lab.id ? (
                        <span className="spinner dark" style={{width: 16, height: 16, borderWidth: 2}}></span>
                      ) : (
                        '⬇️'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
};
