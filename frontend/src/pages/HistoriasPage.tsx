import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { historiasService } from '../services';
import { useAuth } from '../contexts/AuthContext';

export const HistoriasPage: React.FC = () => {
  const [historias, setHistorias] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  // OTP modal state para descarga directa desde la lista
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [selectedHistoria, setSelectedHistoria] = useState<any>(null);
  const [otp, setOtp] = useState('');
  const [otpSentMsg, setOtpSentMsg] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [intentosRestantes, setIntentosRestantes] = useState<number | null>(null);

  const { paciente, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchHistorias();
  }, []);

  const fetchHistorias = async () => {
    try {
      const data = await historiasService.listar();
      setHistorias(data);
    } catch (err: any) {
      if (err.response?.status === 401) {
        logout();
        navigate('/');
      } else {
        setError('Error al cargar las historias clínicas');
      }
    } finally {
      setLoading(false);
    }
  };

  /** Solicita OTP para descargar PDF desde la lista */
  const handleSolicitarPdf = async (historia: any) => {
    setSelectedHistoria(historia);
    setOtpLoading(true);
    setOtpError('');
    setOtp('');
    setIntentosRestantes(3);
    try {
      const res = await historiasService.solicitarPdf(historia.id);
      setOtpSentMsg(res.message);
      setShowOtpModal(true);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Error al solicitar el código');
    } finally {
      setOtpLoading(false);
    }
  };

  /** Descarga el PDF con el OTP */
  const handleDescargarConOtp = async () => {
    if (!selectedHistoria || !otp.trim()) return;
    setPdfLoading(true);
    setOtpError('');
    try {
      await historiasService.descargarPdf(
        selectedHistoria.id,
        otp,
        `historia_clinica_${selectedHistoria.id}.pdf`
      );
      setShowOtpModal(false);
      setOtp('');
      setSelectedHistoria(null);
      setIntentosRestantes(null);
    } catch (err: any) {
      if (err.response?.data instanceof Blob) {
        const text = await err.response.data.text();
        try {
          const errorData = JSON.parse(text);
          setOtpError(errorData.error || 'Código incorrecto o expirado');
          if (errorData.intentosRestantes !== undefined) {
            setIntentosRestantes(errorData.intentosRestantes);
          }
        } catch {
          setOtpError('Error al validar el código.');
        }
      } else {
        setOtpError(err.response?.data?.error || 'Código incorrecto o expirado');
      }
    } finally {
      setPdfLoading(false);
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
      <div className="page-loader-text">Cargando tus historias...</div>
    </div>
  );

  const historiasFiltradas = historias.filter(h => {
    if (!fechaDesde && !fechaHasta) return true;
    if (!h.fecha) return true;
    const dObj = new Date(h.fecha);
    if (isNaN(dObj.getTime())) return true;
    const hDateStr = dObj.toISOString().split('T')[0];
    if (fechaDesde && hDateStr < fechaDesde) return false;
    if (fechaHasta && hDateStr > fechaHasta) return false;
    return true;
  });

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
        <button className="servicios-header-back" onClick={() => navigate('/servicios')} style={{color: 'var(--blue-800)', marginBottom: '24px'}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
          Volver a Servicios
        </button>

        {/* Bienvenida y Filtros */}
        <div style={{ marginBottom: 32 }} className="fade-in-up-delay-1">
          <h1 className="registros-section-title" style={{ fontSize: 28 }}>
            ¡Bienvenido, <span style={{ color: 'var(--blue-600)' }}>{paciente?.nombre?.split(' ')[0] || 'Paciente'}</span>! 👋
          </h1>
          <p className="registros-section-sub">
            Aquí encontrarás todo tu historial de atenciones clínicas. ({historias.length} atenciones encontradas)
          </p>

          <div style={{
            background: 'white',
            padding: 20,
            borderRadius: 16,
            border: '1px solid #e5e7eb',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
            marginTop: 24,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 16,
            alignItems: 'flex-end'
          }}>
            <div style={{ flex: '1 1 200px' }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#4b5563', marginBottom: 6 }}>
                📅 Consultar Desde:
              </label>
              <input 
                type="date" 
                className="form-input" 
                value={fechaDesde}
                onChange={e => setFechaDesde(e.target.value)}
              />
            </div>
            <div style={{ flex: '1 1 200px' }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#4b5563', marginBottom: 6 }}>
                📅 Consultar Hasta:
              </label>
              <input 
                type="date" 
                className="form-input" 
                value={fechaHasta}
                onChange={e => setFechaHasta(e.target.value)}
              />
            </div>
            
            <button 
              className="btn-secondary" 
              style={{ padding: '12px 20px', height: 46 }}
              onClick={() => { setFechaDesde(''); setFechaHasta(''); }}
            >
              Limpiar Filtro
            </button>
          </div>
        </div>

        {error && <div className="alert error">{error}</div>}

        <div className="registros-list fade-in-up-delay-2">
          {historiasFiltradas.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📂</div>
              <h3 className="empty-state-title">No hay historias clínicas</h3>
              <p className="empty-state-text">
                {historias.length > 0 
                  ? 'No hay atenciones en el rango de fechas seleccionado.'
                  : 'No encontramos registros clínicos asociados a su documento.'}
              </p>
            </div>
          ) : (
            historiasFiltradas.map(historia => (
              <div key={historia.id} className="record-card">
                <div className="record-card-body">
                  <div className="record-card-icon">📋</div>
                  <div className="record-card-info">
                    <div className="record-card-fecha">{formatearFecha(historia.fecha)}</div>
                    <div className="record-card-titulo">{historia.especialidad || 'Atención Médica'}</div>
                    <div className="record-card-meta">Dr. {historia.medico || 'No disponible'}</div>
                  </div>
                  <div className="record-card-actions">
                    <button 
                      className="btn-icon blue" 
                      onClick={() => navigate(`/historias/${historia.id}`)}
                      title="Ver Detalles en pantalla"
                    >
                      👁️
                    </button>
                    <button 
                      className="btn-icon teal" 
                      onClick={() => handleSolicitarPdf(historia)}
                      title="Descargar PDF"
                      disabled={otpLoading}
                    >
                      {otpLoading && selectedHistoria?.id === historia.id ? (
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

      {/* Modal OTP para descarga de PDF */}
      {showOtpModal && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 50,
          backdropFilter: 'blur(4px)',
        }}>
          <div style={{
            background: 'white', padding: 28, borderRadius: 20, width: 420, maxWidth: '90vw',
            boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
          }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 18, color: '#111827' }}>🔐 Clave dinámica</h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6b7280' }}>
              {otpSentMsg}
            </p>
            
            {intentosRestantes !== null && intentosRestantes > 0 && !otpError && (
              <div style={{ marginBottom: 16, fontSize: 13, color: '#059669', background: '#ecfdf5', padding: '10px 14px', borderRadius: 8, border: '1px solid #10b981' }}>
                💡 Tienes <strong>{intentosRestantes} intentos</strong> permitidos.
              </div>
            )}
            
            {otpError && (
              <div style={{ marginBottom: 16, fontSize: 13, color: '#dc2626', background: '#fef2f2', padding: '10px 14px', borderRadius: 8, border: '1px solid #ef4444' }}>
                {otpError}
                {intentosRestantes !== null && intentosRestantes > 0 && (
                  <div style={{ marginTop: 4, fontWeight: 700 }}>
                    👉 Intentos restantes: {intentosRestantes}
                  </div>
                )}
              </div>
            )}

            {/* Estado BLOQUEADO: 3 intentos fallidos */}
            {intentosRestantes === 0 ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
                <p style={{ fontSize: 14, color: '#dc2626', fontWeight: 600, margin: '0 0 16px' }}>
                  Has agotado los 3 intentos permitidos.<br/>
                  Debes solicitar un nuevo código de verificación.
                </p>
                <button
                  className="btn-primary"
                  style={{ width: '100%', marginBottom: 8 }}
                  onClick={() => {
                    setShowOtpModal(false);
                    setOtp('');
                    setOtpError('');
                    setIntentosRestantes(null);
                    if (selectedHistoria) handleSolicitarPdf(selectedHistoria);
                  }}
                  disabled={otpLoading}
                >
                  {otpLoading ? <span className="spinner" /> : '🔄 Solicitar nuevo código'}
                </button>
                <button
                  className="btn-secondary"
                  style={{ width: '100%' }}
                  onClick={() => { setShowOtpModal(false); setOtp(''); setOtpError(''); setIntentosRestantes(null); }}
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  placeholder="000000"
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '14px', fontSize: 28, letterSpacing: 8, textAlign: 'center',
                    border: '2px solid #e5e7eb', borderRadius: 12, marginBottom: 16,
                    fontWeight: 700, color: '#1e40af', outline: 'none',
                  }}
                  maxLength={6}
                  autoFocus
                />
                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                  <button className="btn-secondary" onClick={() => { setShowOtpModal(false); setOtp(''); setOtpError(''); }}>
                    Cancelar
                  </button>
                  <button
                    className="btn-primary"
                    style={{ width: 'auto' }}
                    onClick={handleDescargarConOtp}
                    disabled={pdfLoading || otp.length !== 6}
                  >
                    {pdfLoading ? <span className="spinner" /> : '⬇️ Descargar'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
