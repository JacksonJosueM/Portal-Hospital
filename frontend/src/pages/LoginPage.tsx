import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authService } from '../services';
import { TIPOS_DOCUMENTO } from '../types';
import { Alert } from '../components/Alert';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [tipoDoc, setTipoDoc] = useState('CC');
  const [numDoc, setNumDoc] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!numDoc.trim()) return setError('Ingresa tu número de documento');
    if (!contrasena.trim()) return setError('Ingresa tu contraseña');

    setLoading(true);
    try {
      const res = await authService.login(tipoDoc, numDoc.trim(), contrasena);
      login(res.token, res.paciente);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 40%, #2563eb 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      /* FIX: padding horizontal más generoso en móvil */
      padding: '20px 16px',
    }}>

      {/* Círculos decorativos de fondo */}
      <div style={{
        position: 'fixed', top: -100, right: -100,
        width: 400, height: 400,
        background: 'rgba(255,255,255,0.05)',
        borderRadius: '50%', pointerEvents: 'none',
      }} />
      <div style={{
        position: 'fixed', bottom: -150, left: -100,
        width: 500, height: 500,
        background: 'rgba(255,255,255,0.03)',
        borderRadius: '50%', pointerEvents: 'none',
      }} />

      <div style={{ width: '100%', maxWidth: 440, animation: 'fadeInUp 0.6s ease-out' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 68, height: 68,
            background: 'rgba(255,255,255,0.15)',
            borderRadius: 18,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 34, margin: '0 auto 14px',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.2)',
          }}>🏥</div>
          <h1 style={{ color: 'white', fontSize: 24, fontWeight: 800, margin: 0 }}>
            Portal del Paciente
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', marginTop: 6, fontSize: 14 }}>
            Accede a tu historia clínica y resultados
          </p>
        </div>

        {/* Card del formulario */}
        {/* FIX: clase login-card → el CSS de móvil reduce el padding a 24px 20px */}
        <div
          className="login-card"
          style={{
            background: 'white',
            borderRadius: 20,
            /* Desktop: 36px; móvil: sobrescrito por .login-card en CSS */
            padding: '36px',
            boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
          }}
        >
          <form onSubmit={handleLogin} id="form-login">
            <div style={{ marginBottom: 22 }}>
              <h2 style={{ fontSize: 19, fontWeight: 700, color: '#111827', margin: '0 0 4px' }}>
                Iniciar sesión
              </h2>
              <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
                Ingresa tus credenciales de acceso
              </p>
            </div>

            {/* Tipo de documento */}
            <div style={{ marginBottom: 14 }}>
              <label style={{
                display: 'block', fontSize: 13, fontWeight: 600,
                color: '#374151', marginBottom: 6,
              }}>
                Tipo de documento
              </label>
              <select
                id="select-tipo-documento"
                className="input-field"
                value={tipoDoc}
                onChange={(e) => setTipoDoc(e.target.value)}
                style={{ cursor: 'pointer' }}
              >
                {TIPOS_DOCUMENTO.map((t) => (
                  <option key={t.codigo} value={t.codigo}>{t.label}</option>
                ))}
              </select>
            </div>

            {/* Número de documento */}
            <div style={{ marginBottom: 14 }}>
              <label style={{
                display: 'block', fontSize: 13, fontWeight: 600,
                color: '#374151', marginBottom: 6,
              }}>
                Número de documento
              </label>
              <input
                id="input-numero-documento"
                type="text"
                className="input-field"
                placeholder="Ej: 1234567890"
                value={numDoc}
                onChange={(e) => setNumDoc(e.target.value)}
                maxLength={30}
                inputMode="numeric"
              />
            </div>

            {/* Contraseña */}
            <div style={{ marginBottom: 22 }}>
              <label style={{
                display: 'block', fontSize: 13, fontWeight: 600,
                color: '#374151', marginBottom: 6,
              }}>
                Contraseña
              </label>
              <input
                id="input-contrasena"
                type="password"
                className="input-field"
                placeholder="Ingresa tu contraseña"
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
              />
            </div>

            {error && (
              <Alert type="error" message={error} style={{ marginBottom: 16 }} />
            )}

            <button
              type="submit"
              id="btn-iniciar-sesion"
              className="btn-primary"
              disabled={loading}
            >
              {loading && <span className="spinner" />}
              {loading ? 'Ingresando...' : 'Iniciar sesión →'}
            </button>
          </form>
        </div>

        <p style={{
          textAlign: 'center',
          color: 'rgba(255,255,255,0.45)',
          fontSize: 12,
          marginTop: 20,
        }}>
          © 2025 Portal del Paciente · Todos los derechos reservados
        </p>
      </div>
    </div>
  );
};
