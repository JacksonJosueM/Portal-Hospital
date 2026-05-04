const jwt = require('jsonwebtoken');
const { poolPromise, sql } = require('../config/db');

const TIPOS_DOCUMENTO = ['CC', 'TI', 'CE', 'PT', 'PA', 'OTRO'];

/**
 * Enmascara un correo: juan.perez@gmail.com → jua*****@gmail.com
 */
function enmascararCorreo(correo) {
  if (!correo) return null;
  const [usuario, dominio] = correo.split('@');
  if (!dominio) return correo;
  const visible = usuario.slice(0, 3);
  return `${visible}${'*'.repeat(Math.max(4, usuario.length - 3))}@${dominio}`;
}

/**
 * Enmascara un teléfono: 3201234567 → 3200****
 */
function enmascararTelefono(telefono) {
  if (!telefono) return null;
  const t = String(telefono).replace(/\D/g, '');
  return `${t.slice(0, 4)}${'*'.repeat(Math.max(4, t.length - 4))}`;
}

const ServiciosController = {
  /**
   * POST /servicios/autenticar
   * Verifica paciente por tipo_doc + numero_doc + fecha_nacimiento
   * Si existe, envía OTP por correo/WhatsApp y devuelve token temporal
   */
  async autenticar(req, res) {
    try {
      const { tipo_documento, numero_documento, fecha_nacimiento } = req.body;

      if (!tipo_documento || !numero_documento || !fecha_nacimiento) {
        return res.status(400).json({ error: 'Todos los campos son requeridos.' });
      }
      if (!TIPOS_DOCUMENTO.includes(tipo_documento)) {
        return res.status(400).json({ error: 'Tipo de documento inválido.' });
      }

      const pool = await poolPromise;

      // Comparación de fechas delegada a SQL Server para evitar bugs de zona horaria en NodeJS
      const result = await pool.request()
        .input('tipo', sql.VarChar(10), tipo_documento)
        .input('numero', sql.VarChar(30), numero_documento)
        .input('fecha', sql.Date, fecha_nacimiento)
        .query(`
          SELECT 
            p.id_paciente AS id, 
            p.NOMBRE_COMPLETO AS nombre, 
            p.email AS correo, 
            p.telefono, 
            p.fecha_nacimiento
          FROM vw_pacientes_portal p
          INNER JOIN tipos_documento td ON p.tipo_documento = td.id
          WHERE td.codigo = @tipo
            AND p.numero_documento = @numero
            AND (p.fecha_nacimiento IS NULL OR CAST(p.fecha_nacimiento AS DATE) = CAST(@fecha AS DATE))
        `);

      const paciente = result.recordset[0];
      if (!paciente) {
        console.log(`[DEBUG LOGIN] Falla: No se encontro match exacto para Tipo: ${tipo_documento}, Doc: ${numero_documento}, Fecha: ${fecha_nacimiento}`);
        
        // Ejecutar una query de depuracion solo para ver si existe el documento sin filtros extra
        const debugResult = await pool.request()
          .input('numero', sql.VarChar(30), numero_documento)
          .query(`SELECT p.id_paciente as id, td.codigo as tipo_bd, p.numero_documento as doc_bd FROM vw_pacientes_portal p LEFT JOIN tipos_documento td ON p.tipo_documento = td.id WHERE p.numero_documento = @numero`);
        
        console.log(`[DEBUG LOGIN] Que hay en BD con documento ${numero_documento}? →`, debugResult.recordset);

        return res.status(401).json({
          error: 'No se encontró un paciente con los datos ingresados. Verifique su información.'
        });
      }

      // Generar OTP
      const OtpModel = require('../models/otp.model');
      const codigo = await OtpModel.crear({
        tipo_documento: tipo_documento,
        numero_documento: numero_documento,
        fecha_nacimiento: paciente.fecha_nacimiento,
        correo: paciente.correo
      });

      const { transporter } = require('../config/mailer');
      const WhatsAppService = require('../services/sms.service');

      // 1. Correo electrónico
      if (paciente.correo) {
        try {
          await transporter.sendMail({
            from: process.env.EMAIL_FROM || '"E.S.E Hospital San Juan de Dios Marinilla" <no-reply@hospitalmarinilla.gov.co>',
            to: paciente.correo,
            subject: 'Codigo de verificacion — Portal del Paciente',
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px; border: 1px solid #e5e7eb; border-radius: 12px;">
                <div style="text-align: center; margin-bottom: 24px;">
                  <h2 style="color: #1B4F8A; margin: 0;">E.S.E Hospital San Juan de Dios</h2>
                  <p style="color: #00A8B5; margin: 4px 0 0; font-weight: 600;">Marinilla, Antioquia</p>
                </div>
                <p style="color: #374151;">Estimado(a) <strong>${paciente.nombre}</strong>,</p>
                <p style="color: #374151;">Su codigo de acceso al Portal del Paciente es:</p>
                <div style="text-align: center; margin: 28px 0;">
                  <span style="
                    display: inline-block;
                    font-size: 38px;
                    font-weight: bold;
                    letter-spacing: 10px;
                    color: #fff;
                    background: linear-gradient(135deg, #1B4F8A, #00A8B5);
                    padding: 14px 28px;
                    border-radius: 12px;
                    box-shadow: 0 4px 15px rgba(27,79,138,0.3);
                  ">${codigo}</span>
                </div>
                <p style="color: #DC2626; font-size: 14px; text-align: center;">
                  <strong>Este codigo es valido por 5 minutos unicamente.</strong><br>
                  No lo comparta con nadie.
                </p>
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
                <p style="color: #9CA3AF; font-size: 11px; text-align: center; margin: 0;">
                  Portal del Paciente · E.S.E Hospital San Juan de Dios Marinilla · NIT 890980752-3
                </p>
              </div>
            `,
          });
          console.log(`📧 OTP enviado a: ${paciente.correo}`);
        } catch (e) {
          console.warn('⚠️ Error enviando correo:', e.message);
        }
      }

      // 2. WhatsApp
      if (paciente.telefono) {
        try {
          await WhatsAppService.enviarOtp(paciente.telefono, codigo);
          console.log(`📲 OTP WhatsApp: ${paciente.telefono}`);
        } catch (e) {
          console.warn('⚠️ Error WhatsApp:', e.message);
        }
      }

      console.log(`✅ OTP generado para paciente ${paciente.id}: ${codigo}`);

      // Token temporal de sesión (no es el OTP, es para identificar a quién pertenece el OTP)
      const tempToken = jwt.sign(
        { paciente_id: paciente.id, tipo_documento, numero_documento, fase: 'pre_otp' },
        process.env.JWT_SECRET || 'hospital_secret',
        { expiresIn: '10m' }
      );

      let mediosEnvio = [];
      if (paciente.correo) mediosEnvio.push('su correo electronico');
      if (paciente.telefono) mediosEnvio.push('su WhatsApp');
      let mensajeTexto = mediosEnvio.length > 0
        ? `Se ha enviado un codigo de verificacion a ${mediosEnvio.join(' y ')}. Valido por 5 minutos.`
        : 'No tiene medios de contacto vinculados.';

      return res.status(200).json({
        mensaje: mensajeTexto,
        temp_token: tempToken,
        correo_mascara: enmascararCorreo(paciente.correo),
        telefono_mascara: enmascararTelefono(paciente.telefono)
      });
    } catch (err) {
      console.error('❌ [Servicios] autenticar:', err.message);
      return res.status(500).json({ error: 'Error interno del servidor.' });
    }
  },

  /**
   * POST /servicios/verificar-otp
   * Verifica el OTP y devuelve token de acceso final
   */
  async verificarOtp(req, res) {
    try {
      const { temp_token, codigo_otp } = req.body;

      if (!temp_token || !codigo_otp) {
        return res.status(400).json({ error: 'Token y codigo son requeridos.' });
      }

      // Validar token temporal
      let payload;
      try {
        payload = jwt.verify(temp_token, process.env.JWT_SECRET || 'hospital_secret');
      } catch {
        return res.status(401).json({ error: 'El codigo ha expirado. Solicite uno nuevo.' });
      }

      if (payload.fase !== 'pre_otp') {
        return res.status(401).json({ error: 'Token invalido.' });
      }

      // Verificar OTP en BD cruzando por número de documento en lugar de paciente_id
      const OtpModel = require('../models/otp.model');
      const resultadoOtp = await OtpModel.verificar({
        tipo_documento: payload.tipo_documento,
        numero_documento: payload.numero_documento
      }, codigo_otp);

      if (!resultadoOtp.valido) {
        return res.status(401).json({ 
          error: resultadoOtp.error, 
          intentosMaximos: 3, 
          intentosRestantes: resultadoOtp.intentosRestantes 
        });
      }

      // Obtener datos del paciente
      const pool = await poolPromise;
      const result = await pool.request()
        .input('id', sql.Int, payload.paciente_id)
        .query(`
          SELECT 
            p.id_paciente AS id, 
            p.NOMBRE_COMPLETO AS nombre, 
            p.numero_documento, 
            p.email AS correo, 
            td.codigo as tipo_documento
          FROM vw_pacientes_portal p
          INNER JOIN tipos_documento td ON p.tipo_documento = td.id
          WHERE p.id_paciente = @id
        `);
      const paciente = result.recordset[0];

      // Token de acceso final (30 min)
      const accessToken = jwt.sign(
        {
          id: paciente.id,
          tipo_documento: paciente.tipo_documento,
          numero_documento: paciente.numero_documento,
          nombre: paciente.nombre,
        },
        process.env.JWT_SECRET || 'hospital_secret',
        { expiresIn: '30m' }
      );

      return res.status(200).json({
        token: accessToken,
        paciente: {
          nombre: paciente.nombre,
          tipo_documento: paciente.tipo_documento,
          numero_documento: paciente.numero_documento,
        },
        mensaje: 'Acceso autorizado.'
      });
    } catch (err) {
      console.error('❌ [Servicios] verificarOtp:', err.message);
      return res.status(500).json({ error: 'Error interno del servidor.' });
    }
  },
};

// Fix typo: proceso variable
const proceso = process.env.NODE_ENV;

module.exports = ServiciosController;
