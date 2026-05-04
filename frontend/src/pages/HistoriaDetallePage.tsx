import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { historiasService } from '../services';
import type { HistoriaClinica } from '../types';
import { useAuth } from '../contexts/AuthContext';

/**
 * Configuración de secciones clínicas.
 * ESCALABLE: Para agregar nuevos campos, solo agrega strings al array 'campos'.
 * Los campos se buscan por coincidencia parcial case-insensitive.
 * Si Panacea agrega un campo nuevo, se muestra automáticamente en "Otros Datos Clínicos".
 */
const SECCIONES_CONFIG = [
  {
    titulo: 'Datos del Paciente',
    icono: '👤',
    color: '#1e40af',
    bg: '#eff6ff',
    border: '#bfdbfe',
    campos: [
      'Nombre paciente', 'Tipo identificación', 'Número de identificación',
      'Género', 'Estado civil', 'Ocupación', 'Dirección', 'Teléfono domicilio',
      'Teléfono Móvil', 'Correo Electrónico', 'País nacimiento', 'Municipio nacimiento',
      'Nivel educación', 'Discapacidad', 'Pertenencia étnica',
    ],
  },
  {
    titulo: 'Responsable',
    icono: '🧑‍🤝‍🧑',
    color: '#6d28d9',
    bg: '#f5f3ff',
    border: '#c4b5fd',
    campos: [
      'Nombre responsable', 'Parentesco responsable', 'Teléfono responsable',
    ],
  },
  {
    titulo: 'Aseguramiento',
    icono: '🏥',
    color: '#0891b2',
    bg: '#ecfeff',
    border: '#a5f3fc',
    campos: [
      'Nombre cliente', 'EAPB', 'Nombre convenio', 'Ambito de atención',
      'Causa externa', 'Finalidad',
    ],
  },
  {
    titulo: 'Anamnesis',
    icono: '🩺',
    color: '#dc2626',
    bg: '#fef2f2',
    border: '#fca5a5',
    campos: [
      'Motivo de consulta', 'Enfermedad actual',
    ],
  },
  {
    titulo: 'Antecedentes',
    icono: '📋',
    color: '#7c3aed',
    bg: '#faf5ff',
    border: '#d8b4fe',
    campos: [
      'Antecedentes personales describir', 'Antecedentes patológicos',
      'Antecedentes quirúrgicos', 'Antecedentes alérgicos',
      'Antecedentes inmunológicos',
      'Antecedentes psiquiátricos', 'Antecedentes tóxicos',
      'Antecedentes transfusionales', 'Antecedentes traumáticos',
      'Antecedentes hospitalarios', 'Antecedentes ETS',
      'Antecedentes familiares', 'Antecedentes perinatales',
      'Antecedentes nutricionales', 'Antecedentes Farmacologicos',
    ],
  },
  {
    titulo: 'Ginecobstétricos',
    icono: '🤰',
    color: '#db2777',
    bg: '#fdf2f8',
    border: '#f9a8d4',
    campos: [
      'Planifica', 'Método planificación', 'Vida sexual', 'Vida Sexual',
      'Menarquia', 'Ciclos',
    ],
  },
  {
    titulo: 'Signos Vitales',
    icono: '❤️',
    color: '#059669',
    bg: '#ecfdf5',
    border: '#86efac',
    campos: [
      'Peso', 'Talla', 'Índice de masa corporal', 'IMC',
      'Temperatura', 'Tensión arterial sistólica', 'Tensión arterial diastólica',
      'TAM', 'Saturación de Oxigeno', 'Frecuencia Respiratoria',
      'Frecuencia Cardíaca', 'Frecuencia cardiaca',
      'Circunferencia de cintura', 'Fecha del peso', 'Fecha de la talla',
    ],
  },
  {
    titulo: 'Examen Físico',
    icono: '🔍',
    color: '#ca8a04',
    bg: '#fefce8',
    border: '#fde047',
    campos: [
      'Cabeza', 'Neurológico', 'Ojos', 'Otorrinolaringológico', 'ORL',
      'Cuello', 'Cardiopulmonar', 'Respiratoria', 'Abdomen',
      'Genitourinario', 'Aparato locomotor', 'Locomotor', 'Piel y Anexos',
    ],
  },
  {
    titulo: 'Laboratorios y Paraclínicos',
    icono: '🧪',
    color: '#2563eb',
    bg: '#eff6ff',
    border: '#93c5fd',
    campos: [
      'Hemograma', 'Parcial de Orina', 'GLICEMIA', 'Electrocardiograma',
      'Fecha de últimos exámenes', 'Puntaje Findrisc',
      'Resultado ecocardiograma', 'Otros resultados',
    ],
  },
  {
    titulo: 'Diagnóstico',
    icono: '🎯',
    color: '#ea580c',
    bg: '#fff7ed',
    border: '#fdba74',
    campos: [
      'Diagnóstico principal', 'Diagnóstico', 'Tipo principal',
      'Tipo diagnóstico', 'Relacionado 1', 'Diagnóstico relacionado',
      'Clasificación',
    ],
  },
  {
    titulo: 'Conducta y Plan',
    icono: '💊',
    color: '#16a34a',
    bg: '#f0fdf4',
    border: '#86efac',
    campos: [
      'Conducta', 'Evolución', 'Órdenes de la atención', 'Órdenes',
      'Instrucciones', 'Tratamiento actual', 'Tratamiento Actual Hipertensión',
      'Tratamiento actual Diabetes',
    ],
  },
  {
    titulo: 'Profesional de Salud',
    icono: '👨‍⚕️',
    color: '#4338ca',
    bg: '#eef2ff',
    border: '#a5b4fc',
    campos: [
      'Nombre profesional', 'Registro médico', 'Especialidad',
      'Tipo identificación.', 'Número de identificación.',
    ],
  },
  {
    titulo: 'Educación al Paciente',
    icono: '📚',
    color: '#0d9488',
    bg: '#f0fdfa',
    border: '#5eead4',
    campos: [
      'deberes y derechos', 'Remitido a programa PYP', 'programa de PYP',
    ],
  },
];

/**
 * Busca un campo en el objeto de campos de Panacea.
 * Usa coincidencia parcial para ser flexible ante variaciones de nombre.
 */
function matchCampo(campoKey: string, nombreBuscado: string): boolean {
  const a = campoKey.toLowerCase().trim();
  const b = nombreBuscado.toLowerCase().trim();
  return a.includes(b) || b.includes(a);
}

function buscarValor(campos: Record<string, string>, nombre: string): string | null {
  for (const [key, val] of Object.entries(campos)) {
    if (matchCampo(key, nombre)) {
      if (val && val.trim() && val.trim() !== '') {
        return val.trim();
      }
    }
  }
  return null;
}

/**
 * Identifica los campos que NO fueron clasificados en ninguna sección.
 * Estos aparecen en "Otros Datos Clínicos" automáticamente.
 */
function getCamposNoClasificados(campos: Record<string, string>): Array<{nombre: string, valor: string}> {
  const clasificados = new Set<string>();

  for (const seccion of SECCIONES_CONFIG) {
    for (const campoConfig of seccion.campos) {
      for (const key of Object.keys(campos)) {
        if (matchCampo(key, campoConfig)) {
          clasificados.add(key);
        }
      }
    }
  }

  return Object.entries(campos)
    .filter(([key, val]) => !clasificados.has(key) && val && val.trim() !== '')
    .map(([nombre, valor]) => ({ nombre, valor: valor.trim() }));
}

export const HistoriaDetallePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { paciente, logout } = useAuth();
  const [historia, setHistoria] = useState<HistoriaClinica | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // OTP + PDF
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpSentMsg, setOtpSentMsg] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [intentosRestantes, setIntentosRestantes] = useState<number | null>(null);

  useEffect(() => {
    const fetchHistoria = async () => {
      try {
        const res = await historiasService.detalle(Number(id));
        setHistoria(res.data);
      } catch (err: any) {
        if (err.response?.status === 401) { logout(); navigate('/'); }
        else setError(err.response?.data?.error || 'Error al cargar la historia clínica');
      } finally {
        setLoading(false);
      }
    };
    fetchHistoria();
  }, [id]);

  const handleSolicitar = async () => {
    if (!historia) return;
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

  const handleDescargar = async () => {
    if (!historia || !otp.trim()) return;
    setPdfLoading(true);
    setOtpError('');
    try {
      await historiasService.descargarPdf(historia.id, otp, `historia_clinica_${historia.id}.pdf`);
      setShowOtpModal(false);
      setOtp('');
      setIntentosRestantes(null);
    } catch (err: any) {
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const errorData = JSON.parse(text);
          setOtpError(errorData.error || 'Código incorrecto');
          if (errorData.intentosRestantes !== undefined) setIntentosRestantes(errorData.intentosRestantes);
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

  const formatFecha = (fecha: string) => {
    try {
      return new Date(fecha).toLocaleDateString('es-CO', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch { return fecha; }
  };

  if (loading) return (
    <div className="page-loader">
      <div className="spinner"></div>
      <div className="page-loader-text">Cargando historia clínica...</div>
    </div>
  );

  if (error) return (
    <div style={{ maxWidth: 600, margin: '80px auto', textAlign: 'center' }}>
      <div className="alert error">{error}</div>
      <button className="btn-secondary" onClick={() => navigate('/historias')} style={{ marginTop: 16 }}>← Volver</button>
    </div>
  );
  if (!historia) return null;

  const campos = historia.campos || {};
  const totalCampos = Object.keys(campos).length;
  const camposNoClasificados = getCamposNoClasificados(campos);

  return (
    <div className="registros-page fade-in-up">
      {/* Topbar */}
      <div className="registros-topbar">
        <div className="registros-topbar-left">
          <div className="registros-topbar-avatar">👤</div>
          <div className="registros-topbar-info">
            <span className="registros-topbar-name">{paciente?.nombre}</span>
            <span className="registros-topbar-doc">{paciente?.tipo_documento} {paciente?.numero_documento}</span>
          </div>
        </div>
        <button className="registros-topbar-salir" onClick={() => { logout(); navigate('/'); }}>Salir</button>
      </div>

      <main className="registros-content" style={{ maxWidth: 900 }}>
        {/* Breadcrumb */}
        <button
          className="servicios-header-back"
          onClick={() => navigate('/historias')}
          style={{ color: 'var(--blue-800)', marginBottom: 16 }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
          Volver a Historias Clínicas
        </button>

        {/* Header Card */}
        <div style={{
          background: 'linear-gradient(135deg, #1e3a8a, #2563eb, #3b82f6)',
          borderRadius: 20,
          padding: '28px 32px',
          color: 'white',
          marginBottom: 24,
          boxShadow: '0 20px 40px rgba(37, 99, 235, 0.3)',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>
                📋 Atención #{historia.id}
              </div>
              <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 6px' }}>
                {historia.especialidad || 'Atención Médica'}
              </h1>
              <p style={{ margin: 0, fontSize: 14, opacity: 0.85 }}>
                {formatFecha(historia.fecha)}
              </p>
              <p style={{ margin: '8px 0 0', fontSize: 14, opacity: 0.85 }}>
                👨‍⚕️ Dr. {historia.medico || 'No disponible'}
                {historia.registro_medico && <span style={{ opacity: 0.6 }}> · Reg. {historia.registro_medico}</span>}
              </p>
            </div>
            <button
              id="btn-descargar-pdf"
              onClick={handleSolicitar}
              disabled={otpLoading}
              style={{
                background: 'rgba(255,255,255,0.15)',
                backdropFilter: 'blur(10px)',
                color: 'white',
                border: '2px solid rgba(255,255,255,0.3)',
                borderRadius: 12,
                padding: '12px 24px',
                fontWeight: 700,
                fontSize: 14,
                cursor: otpLoading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                whiteSpace: 'nowrap',
                transition: 'all 0.2s',
              }}
            >
              {otpLoading ? <span className="spinner" style={{ width: 18, height: 18 }} /> : '⬇️'}
              Descargar PDF
            </button>
          </div>
          <div style={{ marginTop: 12, fontSize: 12, opacity: 0.6 }}>
            {totalCampos} campos clínicos registrados en esta atención
          </div>
        </div>

        {/* Secciones clínicas dinámicas */}
        {totalCampos === 0 ? (
          <div style={{
            padding: 32,
            background: '#fffbeb',
            borderRadius: 16,
            border: '1px solid #fde68a',
            textAlign: 'center',
            color: '#92400e',
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
            <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>Datos clínicos no disponibles</h3>
            <p style={{ margin: 0, fontSize: 14 }}>
              Esta atención aún no tiene datos clínicos registrados para visualización web.
              Puede descargar el PDF para obtener el documento completo.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {SECCIONES_CONFIG.map((seccion) => {
              const camposConValor = seccion.campos
                .map(nombre => ({ nombre, valor: buscarValor(campos, nombre) }))
                .filter((c): c is { nombre: string; valor: string } => c.valor !== null);

              if (camposConValor.length === 0) return null;

              return (
                <SeccionClinica
                  key={seccion.titulo}
                  titulo={seccion.titulo}
                  icono={seccion.icono}
                  color={seccion.color}
                  bg={seccion.bg}
                  border={seccion.border}
                  campos={camposConValor}
                />
              );
            })}

            {/* Campos no clasificados = ESCALABILIDAD automática */}
            {camposNoClasificados.length > 0 && (
              <SeccionClinica
                titulo="Otros Datos Clínicos"
                icono="📝"
                color="#6b7280"
                bg="#f9fafb"
                border="#d1d5db"
                campos={camposNoClasificados}
              />
            )}
          </div>
        )}

        {/* Aviso de confidencialidad */}
        <div style={{
          marginTop: 32,
          background: '#fffbeb',
          border: '1px solid #fde68a',
          borderRadius: 12,
          padding: '14px 18px',
          display: 'flex', alignItems: 'center', gap: 10,
          fontSize: 13, color: '#92400e',
        }}>
          <span>🔒</span>
          <span>Este documento es confidencial. Solo el paciente y el personal médico autorizado pueden acceder a él.</span>
        </div>
      </main>

      {/* Modal OTP */}
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
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6b7280' }}>{otpSentMsg}</p>

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
                    handleSolicitar();
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
                    onClick={handleDescargar}
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

/**
 * Componente reutilizable de sección clínica.
 * Escalable: recibe campos dinámicamente.
 */
const SeccionClinica: React.FC<{
  titulo: string;
  icono: string;
  color: string;
  bg: string;
  border: string;
  campos: Array<{ nombre: string; valor: string }>;
}> = ({ titulo, icono, color, bg, border, campos }) => {
  const [abierto, setAbierto] = useState(true);

  return (
    <div style={{
      borderRadius: 16,
      border: `1px solid ${border}`,
      overflow: 'hidden',
      background: 'white',
      boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
    }}>
      {/* Header clickeable para colapsar/expandir */}
      <button
        onClick={() => setAbierto(!abierto)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          background: bg,
          border: 'none',
          cursor: 'pointer',
          transition: 'background 0.2s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>{icono}</span>
          <span style={{ fontSize: 15, fontWeight: 700, color }}>
            {titulo}
          </span>
          <span style={{
            fontSize: 11, fontWeight: 600,
            background: color, color: 'white',
            borderRadius: 10, padding: '2px 8px',
          }}>
            {campos.length}
          </span>
        </div>
        <span style={{
          transform: abierto ? 'rotate(180deg)' : 'rotate(0)',
          transition: 'transform 0.2s',
          fontSize: 16, color: '#9ca3af',
        }}>
          ▼
        </span>
      </button>

      {/* Body */}
      {abierto && (
        <div style={{ padding: '12px 20px 16px' }}>
          {campos.map(({ nombre, valor }) => (
            <div key={nombre} style={{
              padding: '10px 14px',
              background: '#fafafa',
              borderRadius: 10,
              border: '1px solid #f3f4f6',
              marginBottom: 6,
            }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: '#9ca3af',
                textTransform: 'uppercase', letterSpacing: 0.3,
                marginBottom: 4,
              }}>
                {nombre}
              </div>
              <div style={{
                fontSize: 14, color: '#1f2937',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {valor}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
