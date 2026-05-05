import React, { useState } from 'react';
import { serviciosService } from '../services';

interface AuthModalProps {
  onSuccess: (paciente: any, token: string) => void;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onSuccess, onClose }) => {
  const [fase, setFase] = useState<'DATOS' | 'OTP'>('DATOS');
  
  // Datos del paciente
  const [tipo_documento, setTipoDocumento] = useState('CC');
  const [numero_documento, setNumeroDocumento] = useState('');
  const [fecha_nacimiento, setFechaNacimiento] = useState('');
  
  // OTP
  const [codigo_otp, setCodigoOtp] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [contactMsg, setContactMsg] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleVerificarDatos = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!numero_documento || !fecha_nacimiento) {
      setError('Complete todos los campos por favor.');
      return;
    }
    setError('');
    setLoading(true);

    try {
      const res = await serviciosService.autenticar(tipo_documento, numero_documento, fecha_nacimiento);
      if (!res.correo_mascara && !res.telefono_mascara) {
        setError('Lo sentimos, notamos que no tienes correo electrónico ni número de teléfono celular registrados en la base de datos del hospital. Por favor, acércate personalmente a registrar tus datos para que puedas acceder a tus servicios en línea en el futuro.');
        return;
      }

      setTempToken(res.temp_token);
      
      let msg = '';
      if (res.correo_mascara && res.telefono_mascara) {
        msg = `Hemos enviado un código de seguridad a tu correo electrónico (${res.correo_mascara}) y a tu WhatsApp (${res.telefono_mascara}).`;
      } else if (res.correo_mascara) {
        msg = `Se envió un mensaje de validación a tu correo electrónico (${res.correo_mascara}). Notamos que no tienes número de WhatsApp registrado.`;
      } else if (res.telefono_mascara) {
        msg = `Se envió un mensaje de validación a tu número de WhatsApp (${res.telefono_mascara}). Notamos que no tienes correo electrónico registrado.`;
      }
      
      setContactMsg(msg);
      setFase('OTP');
    } catch (err: any) {
      if (err.response?.status === 401) {
        setError('Estimado paciente, la información ingresada no concuerda con nuestra base de datos institucional. Por favor, verifique cuidadosamente los datos digitados.');
      } else {
        setError(err.response?.data?.error || 'Ocurrió un error de conexión al validar su identidad. Intente nuevamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleValidarOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (codigo_otp.length !== 6) {
      setError('El código debe tener 6 dígitos.');
      return;
    }
    setError('');
    setLoading(true);

    try {
      const res = await serviciosService.verificarOtp(tempToken, codigo_otp);
      onSuccess(res.paciente, res.token);
    } catch (err: any) {
      console.error('❌ [Auth OTP] Error:', err);
      if (err.response?.data?.error) {
        setError(err.response.data.error);
      } else {
        setError(err.message ? `Error de conexión: ${err.message}` : 'Código incorrecto o expirado.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        
        <div className="modal-header">
          <div className="modal-header-icon">{fase === 'DATOS' ? '🔒' : '✉️'}</div>
          <h2 className="modal-header-title">
            {fase === 'DATOS' ? 'Validación de Identidad' : 'Clave Dinámica'}
          </h2>
          <p className="modal-header-sub">
            {fase === 'DATOS' 
              ? 'Por seguridad, ingresa tus datos para acceder.' 
              : 'Ingresa el código que enviamos a tus medios de contacto.'}
          </p>
        </div>

        <div className="modal-body">
          <div className="modal-step-indicator">
            <div className={`modal-step-dot ${fase === 'DATOS' ? 'active' : 'done'}`}></div>
            <div className={`modal-step-dot ${fase === 'OTP' ? 'active' : ''}`}></div>
          </div>

          {error && <div className="alert error">⚠️ {error}</div>}

          {fase === 'DATOS' ? (
            <form onSubmit={handleVerificarDatos}>
              <div className="form-group">
                <label className="form-label">Tipo de documento</label>
                <select 
                  className="form-input form-select"
                  value={tipo_documento}
                  onChange={(e) => setTipoDocumento(e.target.value)}
                >
                  <option value="CC">Cédula de Ciudadanía</option>
                  <option value="TI">Tarjeta de Identidad</option>
                  <option value="CE">Cédula de Extranjería</option>
                  <option value="PA">Pasaporte</option>
                  <option value="PT">Permiso por Protección Temporal</option>
                </select>
              </div>
              
              <div className="form-group">
                <label className="form-label">Número de documento</label>
                <input 
                  type="text" 
                  className="form-input"
                  placeholder="Ej: 1002345678"
                  value={numero_documento}
                  onChange={(e) => setNumeroDocumento(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 24 }}>
                <label className="form-label">Fecha de nacimiento</label>
                <input 
                  type="date" 
                  className="form-input"
                  value={fecha_nacimiento}
                  onChange={(e) => setFechaNacimiento(e.target.value)}
                />
              </div>

              <div className="modal-info-box">
                ℹ️ Nunca te pediremos una contraseña. Tu identidad se valida con un código único que enviamos a tu información de contacto registrada.
              </div>

              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? <span className="spinner"></span> : 'Siguiente →'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleValidarOtp}>
              <div className="modal-otp-box" style={{ lineHeight: '1.5', textAlign: 'center' }}>
                <span style={{ fontSize: '24px', display: 'block', marginBottom: '8px' }}>✉️</span>
                {contactMsg}
              </div>

              <div className="form-group" style={{ marginBottom: 24 }}>
                <label className="form-label">Código OTP (6 dígitos)</label>
                <input 
                  type="text" 
                  className="form-input form-input-otp"
                  placeholder="------"
                  maxLength={6}
                  value={codigo_otp}
                  onChange={(e) => setCodigoOtp(e.target.value)}
                />
                <div className="otp-timer">Expira en <span className="time">5 minutos</span></div>
              </div>

              <button type="submit" className="btn-primary" disabled={loading || codigo_otp.length !== 6}>
                {loading ? <span className="spinner"></span> : 'Acceder a los registros'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
