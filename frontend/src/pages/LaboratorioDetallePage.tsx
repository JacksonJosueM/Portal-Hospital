import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { laboratoriosService } from '../services';
import type { ResultadoLaboratorio } from '../types';
import { Layout } from '../components/Layout';
import { Loader } from '../components/Loader';
import { Alert } from '../components/Alert';

export const LaboratorioDetallePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [resultado, setResultado] = useState<ResultadoLaboratorio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    const fetchResultado = async () => {
      try {
        const res = await laboratoriosService.detalle(Number(id));
        setResultado(res.data);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Error al cargar el resultado');
      } finally {
        setLoading(false);
      }
    };
    fetchResultado();
  }, [id]);

  const handleDescargar = async () => {
    if (!resultado) return;
    setPdfLoading(true);
    try {
      await laboratoriosService.descargarPdf(
        resultado.id,
        `laboratorio_${resultado.tipo_examen}_${resultado.fecha}.pdf`
      );
    } catch {
      alert('Error al descargar el PDF');
    } finally {
      setPdfLoading(false);
    }
  };

  const formatFecha = (fecha: string) =>
    new Date(fecha).toLocaleDateString('es-CO', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

  if (loading) return <Layout><Loader text="Cargando resultado..." className="py-16" /></Layout>;
  if (error) return <Layout><Alert type="error" message={error} /></Layout>;
  if (!resultado) return null;

  return (
    <Layout>
      <div className="animate-fade-in-up" style={{ maxWidth: 760 }}>
        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, fontSize: 14, color: '#6b7280' }}>
          <button
            onClick={() => navigate('/laboratorios')}
            style={{ background: 'none', border: 'none', color: '#0369a1', cursor: 'pointer', fontWeight: 600, padding: 0 }}
          >
            ← Laboratorios
          </button>
          <span>/</span>
          <span>Resultado #{resultado.id}</span>
        </div>

        {/* Card principal */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 20 }}>
          {/* Header */}
          <div style={{
            background: 'linear-gradient(135deg, #0369a1, #0ea5e9)',
            padding: '24px 28px',
            color: 'white',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>
                  🧪 RESULTADO DE LABORATORIO · #{resultado.id}
                </div>
                <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>
                  {resultado.tipo_examen}
                </h1>
                <p style={{ margin: '4px 0 0', fontSize: 14, color: 'rgba(255,255,255,0.8)' }}>
                  {formatFecha(resultado.fecha)}
                </p>
              </div>
              <button
                id="btn-descargar-lab-pdf"
                onClick={handleDescargar}
                disabled={pdfLoading}
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  color: 'white',
                  border: '2px solid rgba(255,255,255,0.4)',
                  borderRadius: 10,
                  padding: '10px 20px',
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: pdfLoading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  whiteSpace: 'nowrap',
                  backdropFilter: 'blur(10px)',
                }}
              >
                {pdfLoading ? <span className="spinner" /> : '⬇️'}
                Descargar PDF
              </button>
            </div>
          </div>

          {/* Body */}
          <div style={{ padding: 28 }}>
            {/* Resultado */}
            <div style={{ marginBottom: 24 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                marginBottom: 12,
                paddingBottom: 10,
                borderBottom: '2px solid #f0f9ff',
              }}>
                <span style={{ fontSize: 18 }}>📊</span>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0369a1' }}>
                  Resultado del examen
                </h2>
              </div>
              <div style={{
                fontSize: 15,
                color: '#1f2937',
                lineHeight: 1.8,
                padding: '20px',
                background: '#f8fafc',
                borderRadius: 12,
                border: '1px solid #e0f2fe',
                whiteSpace: 'pre-wrap',
                fontFamily: 'inherit',
              }}>
                {resultado.resultado}
              </div>
            </div>

            {/* Observaciones */}
            {resultado.observaciones && (
              <div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  marginBottom: 12,
                  paddingBottom: 10,
                  borderBottom: '2px solid #fffbeb',
                }}>
                  <span style={{ fontSize: 18 }}>📝</span>
                  <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#d97706' }}>
                    Observaciones
                  </h2>
                </div>
                <p style={{
                  fontSize: 15,
                  color: '#1f2937',
                  lineHeight: 1.7,
                  margin: 0,
                  padding: '16px',
                  background: '#fffbeb',
                  borderRadius: 10,
                  border: '1px solid #fde68a',
                }}>
                  {resultado.observaciones}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Aviso */}
        <div style={{
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: 12,
          padding: '14px 18px',
          display: 'flex', alignItems: 'center', gap: 10,
          fontSize: 13, color: '#1e40af',
        }}>
          <span>ℹ️</span>
          <span>Los resultados de laboratorio deben ser interpretados por tu médico tratante. Si tienes dudas, consulta a tu especialista.</span>
        </div>
      </div>
    </Layout>
  );
};
