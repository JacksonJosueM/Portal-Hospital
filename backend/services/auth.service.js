const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const OtpModel = require('../models/otp.model');
const PacienteModel = require('../models/paciente.model');
const { transporter } = require('../config/mailer');

const MAX_INTENTOS = 5;
const JWT_EXPIRES = '2h';

const AuthService = {
  /**
   * Genera un código OTP de 6 dígitos
   */
  generarCodigo() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  },

  /**
   * Proceso de envío de OTP:
   * 1. Verifica que el paciente exista
   * 2. Si no tiene correo, retorna flag para pedirlo
   * 3. Genera OTP y lo envía al correo
   */
  async enviarOtp(tipo_documento, numero_documento, correoOverride = null) {
    const paciente = await PacienteModel.findByDocument(tipo_documento, numero_documento);

    if (!paciente) {
      const error = new Error('Paciente no encontrado en el sistema');
      error.statusCode = 404;
      throw error;
    }

    // Si no tiene correo registrado y no se proporcionó uno
    const correo = correoOverride || paciente.correo;
    if (!correo) {
      return { requiereCorreo: true, nombre: paciente.nombre };
    }

    // Si se proporcionó un correo nuevo, actualizarlo
    if (correoOverride && !paciente.correo) {
      await PacienteModel.updateCorreo(tipo_documento, numero_documento, correoOverride);
    }

    // Generar y guardar OTP
    const codigo = this.generarCodigo();
    await OtpModel.create(tipo_documento, numero_documento, codigo);

    // Enviar correo
    await this.enviarCorreoOtp(correo, codigo, paciente.nombre);

    // Retornar correo enmascarado por seguridad
    const correoMascarado = this.enmascararCorreo(correo);

    return {
      requiereCorreo: false,
      correoMascarado,
      nombre: paciente.nombre,
    };
  },

  /**
   * Valida el OTP ingresado por el usuario
   */
  async validarOtp(tipo_documento, numero_documento, codigoIngresado) {
    const otp = await OtpModel.findActive(tipo_documento, numero_documento);

    if (!otp) {
      const error = new Error('Código expirado o no existe. Solicita uno nuevo.');
      error.statusCode = 400;
      throw error;
    }

    // Verificar límite de intentos
    if (otp.intentos >= MAX_INTENTOS) {
      const error = new Error('Superaste el límite de intentos. Solicita un nuevo código.');
      error.statusCode = 429;
      throw error;
    }

    // Validar código
    if (otp.codigo !== codigoIngresado.trim()) {
      const intentos = await OtpModel.incrementAttempts(otp.id);
      const restantes = MAX_INTENTOS - intentos;
      const error = new Error(`Código incorrecto. Te quedan ${restantes} intento(s).`);
      error.statusCode = 401;
      error.intentosRestantes = restantes;
      throw error;
    }

    // Marcar OTP como usado
    await OtpModel.markAsUsed(otp.id);

    // Obtener datos del paciente
    const paciente = await PacienteModel.findByDocument(tipo_documento, numero_documento);

    // Generar JWT
    const token = jwt.sign(
      {
        tipo_documento,
        numero_documento,
        nombre: paciente.nombre,
      },
      process.env.JWT_SECRET || 'hospital_secret',
      { expiresIn: JWT_EXPIRES }
    );

    return { token, paciente: { nombre: paciente.nombre, correo: paciente.correo } };
  },

  /**
   * Envía el correo con el código OTP usando plantilla HTML
   */
  async enviarCorreoOtp(correo, codigo, nombre) {
    const html = `
    <!DOCTYPE html>
    <html>
    <body style="margin:0;padding:0;background:#f0f4f8;font-family:Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:40px 0;">
        <tr><td align="center">
          <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
            <tr>
              <td style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:32px;text-align:center;">
                <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;">🏥 Portal del Paciente</h1>
                <p style="color:#bfdbfe;margin:8px 0 0;font-size:14px;">Verificación de identidad</p>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 40px;">
                <p style="color:#374151;font-size:15px;margin:0 0 16px;">Hola, <strong>${nombre}</strong></p>
                <p style="color:#6b7280;font-size:14px;margin:0 0 28px;line-height:1.6;">
                  Ingresa el siguiente código para acceder a tu historia clínica y resultados de laboratorio:
                </p>
                <div style="background:#eff6ff;border:2px dashed #3b82f6;border-radius:10px;padding:24px;text-align:center;margin:0 0 28px;">
                  <span style="font-size:42px;font-weight:800;letter-spacing:10px;color:#1e40af;font-family:monospace;">${codigo}</span>
                </div>
                <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:4px;margin:0 0 24px;">
                  <p style="color:#92400e;font-size:13px;margin:0;">⏱️ Este código expira en <strong>5 minutos</strong> y solo puede usarse una vez.</p>
                </div>
                <p style="color:#9ca3af;font-size:12px;margin:0;line-height:1.5;">
                  Si no solicitaste este código, ignora este correo. Tu cuenta permanece segura.
                </p>
              </td>
            </tr>
            <tr>
              <td style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
                <p style="color:#9ca3af;font-size:12px;margin:0;">© 2025 Hospital · Portal del Paciente · Acceso seguro</p>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
    </body>
    </html>`;

    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'Portal Hospital <noreply@hospital.com>',
      to: correo,
      subject: `${codigo} - Tu código de verificación | Portal del Paciente`,
      html,
    });
  },

  /**
   * Enmascara el correo: jua***@gmail.com
   */
  enmascararCorreo(correo) {
    const [local, domain] = correo.split('@');
    const visible = local.substring(0, 3);
    return `${visible}***@${domain}`;
  },
};

module.exports = AuthService;
