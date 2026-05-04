const HistoriaModel = require('../models/historia.model');
const PdfService = require('../services/pdf.service');
const HistoriaPrintService = require('../services/historia.print.service');
const PlantillaRender = require('../services/plantilla.render');

const HistoriaController = {
  /**
   * GET /historias
   * Lista todas las atenciones del paciente autenticado
   */
  async listar(req, res) {
    try {
      const { tipo_documento, numero_documento } = req.paciente;
      const historias = await HistoriaModel.findByDocumentCode(tipo_documento, numero_documento);
      return res.status(200).json({ data: historias, total: historias.length });
    } catch (err) {
      console.error('❌ [Historia] listar:', err.message);
      return res.status(500).json({ error: 'Error al obtener historias clínicas' });
    }
  },

  /**
   * GET /historias/:id
   * Detalle de una atención. Usa el orquestador estilo Panacea para devolver
   * un resumen con la atención, plantilla, paciente y datos clínicos.
   */
  async detalle(req, res) {
    try {
      const payload = await HistoriaPrintService.imprimirAtencion(req.params.id, {
        registrarCopia: false, // No registrar copia en la mera consulta
      });

      return res.status(200).json({
        data: {
          atencion: payload.atencion,
          plantilla: payload.plantilla.meta,
          ips: payload.ips,
          sede: payload.sede,
          paciente: payload.paciente,
          diagnosticos: payload.clinico.diagnosticos,
          alergias: payload.paciente.alergias,
          antecedentes: payload.paciente.antecedentes,
          notas: payload.clinico.notas,
        },
      });
    } catch (err) {
      console.error('❌ [Historia] detalle:', err.message);
      return res.status(500).json({ error: 'Error al obtener la historia clínica' });
    }
  },

  /**
   * POST /historias/:id/solicitar-pdf
   * Envía un código OTP al correo/WhatsApp del paciente
   */
  async solicitarPdf(req, res) {
    try {
      const { tipo_documento, numero_documento } = req.paciente;
      const paciente = await HistoriaModel.getPacienteCompleto(tipo_documento, numero_documento);
      if (!paciente) return res.status(404).json({ error: 'Paciente no encontrado' });

      const correoDestino = paciente.correo;
      const telefonoDestino = paciente.telefono;

      if (!correoDestino && !telefonoDestino) {
        return res.status(400).json({ error: 'Lo sentimos, notamos que no tienes correo electrónico ni número de celular registrados. Por favor, acércate a la E.S.E para actualizar tus datos de contacto y poder validar tu identidad para descargar el documento.' });
      }

      // Generar OTP
      const OtpModel = require('../models/otp.model');
      const codigo = await OtpModel.crear({
        tipo_documento,
        numero_documento,
        fecha_nacimiento: paciente.fecha_nacimiento,
        correo: correoDestino
      });

      const { transporter } = require('../config/mailer');
      const WhatsAppService = require('../services/sms.service');

      // 1. Envio por Correo electronico
      if (correoDestino) {
        try {
          await transporter.sendMail({
            from: process.env.EMAIL_FROM || '"E.S.E Hospital San Juan de Dios Marinilla" <no-reply@hospitalmarinilla.gov.co>',
            to: correoDestino,
            subject: 'Codigo de seguridad - Descarga de Historia Clinica',
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 8px;">
                <h2 style="color: #1e40af; margin-top: 0;">E.S.E Hospital San Juan de Dios Marinilla</h2>
                <p>Estimado(a) <strong>${paciente.nombre}</strong>,</p>
                <p>Ha solicitado descargar su historia clinica del Portal del Paciente. Su codigo de verificacion es:</p>
                <div style="text-align: center; margin: 24px 0;">
                  <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #1e40af; background: #eff6ff; padding: 12px 24px; border-radius: 8px;">${codigo}</span>
                </div>
                <p style="color: #dc2626;"><strong>Importante:</strong> Este codigo es valido unicamente por <strong>5 minutos</strong> a partir de la recepcion de este mensaje. No lo comparta con nadie.</p>
                <p style="color: #6b7280; font-size: 13px;">Si usted no realizo esta solicitud, ignore este mensaje. Su cuenta permanece segura.</p>
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
                <p style="color: #9ca3af; font-size: 11px; text-align: center;">Portal del Paciente - E.S.E Hospital San Juan de Dios Marinilla - NIT 890980752-3</p>
              </div>
            `,
          });
          console.log(`📧 Correo enviado a: ${correoDestino}`);
        } catch (e) {
          console.warn('⚠️ No se pudo enviar el correo:', e.message);
        }
      }

      // 2. Envio por WhatsApp (Meta Business API)
      if (telefonoDestino) {
        try {
          await WhatsAppService.enviarOtp(telefonoDestino, codigo);
          console.log(`📲 WhatsApp enviado al numero: ${telefonoDestino}`);
        } catch (e) {
          console.warn('⚠️ No se pudo enviar el WhatsApp:', e.message);
        }
      }

      console.log('✅ OTP generado para descargar historia:', codigo);

      let medios = [];
      if (correoDestino) medios.push('tu correo electrónico');
      if (telefonoDestino) medios.push('tu WhatsApp');
      let mensajeEnvio = `Hemos enviado un código de verificación a ${medios.join(' y a ')}. Dicho código tiene una validez de 5 minutos.`;

      return res.status(200).json({
        message: mensajeEnvio
      });
    } catch (err) {
      console.error('❌ [Historia] solicitarPdf:', err.message);
      return res.status(500).json({ error: 'Error al solicitar el codigo' });
    }
  },

  /**
   * GET /historias/:id/pdf
   * Descarga PDF de una historia clínica replicando el flujo completo de
   * Panacea: ejecuta TODOS los SPs de la traza original (Historia.*,
   * Dinamico.*, Parametrizacion.*, Administracion.*, Laboratorio.*,
   * Odontologia.*) y construye el HTML dinámicamente desde la plantilla
   * configurada para la atención.
   */
  async descargarPdf(req, res) {
    try {
      const { tipo_documento, numero_documento } = req.paciente;

      const { otp } = req.query;
      if (!otp) {
        return res.status(400).json({ error: 'Código de seguridad requerido para la descarga.' });
      }

      const OtpModel = require('../models/otp.model');
      const resultadoOtp = await OtpModel.verificar(
        { tipo_documento, numero_documento },
        otp
      );

      if (!resultadoOtp.valido) {
        return res.status(401).json({
          error: resultadoOtp.error,
          intentosRestantes: resultadoOtp.intentosRestantes,
        });
      }

      // ── Pipeline completo estilo Panacea ────────────────────────────────
      const payload = await HistoriaPrintService.imprimirAtencion(req.params.id, {
        numeroCopias: 1,
        registrarCopia: true,
      });

      const { html, parametros } = PlantillaRender.renderHtml(payload);

      const nombreArchivo = `historia_clinica_${numero_documento || 'paciente'}_${req.params.id}.pdf`;

      await PdfService.generarPdfDesdeHtml({
        html,
        parametros,
        nombreArchivo,
        res,
      });
    } catch (err) {
      console.error('❌ [Historia] descargarPdf:', err.message);
      console.error(err.stack);
      if (!res.headersSent) {
        return res.status(500).json({ error: 'Error al generar el documento PDF' });
      }
    }
  }
};

module.exports = HistoriaController;
