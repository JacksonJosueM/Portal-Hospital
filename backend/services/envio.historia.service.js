/**
 * ════════════════════════════════════════════════════════════════════════════
 *  ENVIO HISTORIA SERVICE · Orquestador de envío automatizado por correo
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Reúne todas las piezas existentes (Panacea SPs → HTML → PDF → cifrado →
 *  correo) y registra el resultado en `envios_historia`. Se invoca desde el
 *  CLI `cli/enviar-historia.js` (que a su vez es lanzado por los .bat).
 *
 *  Reglas:
 *    1. Único canal: correo electrónico (Nodemailer).
 *    2. El PDF viaja como adjunto cifrado AES-128.
 *    3. La contraseña del PDF es el `numero_documento` del paciente
 *       (cédula o tarjeta de identidad, sin puntos ni espacios).
 *    4. Idempotencia garantizada por el índice único parcial sobre
 *       `envios_historia(id_atencion) WHERE estado='OK'`.
 *    5. Trazabilidad: se reusa `historia.print.service.js` que ejecuta los
 *       mismos SPs que la app Silverlight de Panacea (incluida la auditoría
 *       de copias impresas en `STM_COPIAS_IMPRESION`).
 * ════════════════════════════════════════════════════════════════════════════
 */

const { sql, portalPool, panaceaPool } = require('../config/db');
const HistoriaModel = require('../models/historia.model');
const HistoriaPrintService = require('./historia.print.service');
const PlantillaRender = require('./plantilla.render');
const PdfService = require('./pdf.service');
const PdfEncrypt = require('./pdf.encrypt');
const { transporter } = require('../config/mailer');

const FUENTES_VALIDAS = new Set(['manual', 'csv', 'programado']);

function fechaLegible(fecha) {
  if (!fecha) return '';
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('es-CO', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function escapeHtml(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Construye el HTML del correo con instrucciones de la contraseña.
 */
function construirCuerpoCorreo({ paciente, atencion }) {
  const nombre = paciente.nombre || 'Paciente';
  const fechaTxt = fechaLegible(atencion.FECHA_ATENCION || atencion.fecha_atencion);
  const especialidad = atencion.ESPECIALIDAD || atencion.especialidad || '';

  return `
  <!DOCTYPE html>
  <html lang="es">
  <body style="margin:0;padding:0;background:#f0f4f8;font-family:Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 0;">
      <tr><td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:28px 32px;text-align:center;">
              <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:700;">E.S.E Hospital San Juan de Dios Marinilla</h1>
              <p style="color:#bfdbfe;margin:6px 0 0;font-size:13px;">Portal del Paciente · Envío de Historia Clínica</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 36px;color:#1f2937;font-size:14px;line-height:1.6;">
              <p style="margin:0 0 14px;">Estimado(a) <strong>${escapeHtml(nombre)}</strong>,</p>
              <p style="margin:0 0 14px;">
                Adjunto a este correo encontrará el documento PDF correspondiente a su historia clínica
                ${especialidad ? 'de <strong>' + escapeHtml(especialidad) + '</strong>' : ''}
                ${fechaTxt ? 'con fecha de atención <strong>' + escapeHtml(fechaTxt) + '</strong>' : ''}.
              </p>
              <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:14px 18px;border-radius:4px;margin:18px 0;">
                <p style="margin:0;color:#92400e;font-size:14px;">
                  <strong>Importante — el documento está cifrado.</strong><br>
                  Para abrirlo, ingrese como contraseña su <strong>número de documento de identidad</strong>
                  (cédula o tarjeta de identidad), sin puntos, espacios ni guiones.
                </p>
              </div>
              <p style="margin:0 0 14px;color:#6b7280;font-size:13px;">
                Por su seguridad, no comparta este correo ni el archivo adjunto. Si usted no solicitó
                este envío, ignore el mensaje y, si lo desea, comuníquese con la E.S.E para reportarlo.
              </p>
              <p style="margin:18px 0 0;color:#9ca3af;font-size:12px;">
                Este correo fue generado automáticamente por el Portal del Paciente.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#f9fafb;padding:16px 36px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="color:#9ca3af;font-size:11px;margin:0;">
                E.S.E Hospital San Juan de Dios Marinilla · NIT 890980752-3
              </p>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
  </html>`;
}

/**
 * Si no se especifica `idAtencion`, busca la última atención cerrada
 * (id_estado IN (2,3)) del paciente.
 */
async function obtenerUltimaAtencion(tipo_documento, numero_documento) {
  const pool = await portalPool;
  const result = await pool.request()
    .input('codigo', sql.VarChar(10), tipo_documento)
    .input('numero', sql.VarChar(30), numero_documento)
    .query(`
      SELECT TOP 1 a.id_atencion AS id, a.fecha_atencion AS fecha, a.especialidad
      FROM vw_atenciones_portal a
      INNER JOIN tipos_documento td ON a.tipo_documento = td.id
      WHERE td.codigo = @codigo
        AND a.numero_documento = @numero
        AND a.id_estado IN (2, 3)
      ORDER BY a.fecha_atencion DESC
    `);
  return result.recordset[0] || null;
}

/**
 * Verifica si la atención ya tiene un envío exitoso registrado.
 */
async function yaEnviada(idAtencion) {
  const pool = await portalPool;
  const result = await pool.request()
    .input('id', sql.BigInt, idAtencion)
    .query(`
      SELECT TOP 1 id, fecha_envio
      FROM envios_historia
      WHERE id_atencion = @id AND estado = 'OK'
    `);
  return result.recordset[0] || null;
}

/**
 * Inserta una entrada en envios_historia.
 */
async function registrarEnvio({ idAtencion, tipo_documento, numero_documento, destino, estado, error_mensaje, fuente }) {
  const pool = await portalPool;
  await pool.request()
    .input('id_atencion', sql.BigInt, idAtencion)
    .input('tipo_documento', sql.VarChar(10), tipo_documento)
    .input('numero_documento', sql.VarChar(30), numero_documento)
    .input('destino', sql.VarChar(200), destino || '')
    .input('estado', sql.VarChar(20), estado)
    .input('error_mensaje', sql.NVarChar(sql.MAX), error_mensaje || null)
    .input('fuente', sql.VarChar(20), fuente)
    .query(`
      INSERT INTO envios_historia
        (id_atencion, tipo_documento, numero_documento, destino, estado, error_mensaje, fuente)
      VALUES
        (@id_atencion, @tipo_documento, @numero_documento, @destino, @estado, @error_mensaje, @fuente)
    `);
}

/**
 * Envía la historia clínica de un paciente por correo electrónico.
 *
 * @param {object} opts
 * @param {string} opts.tipo_documento     Código del tipo de documento (CC, TI, CE, ...)
 * @param {string} opts.numero_documento   Número de documento
 * @param {number|string} [opts.idAtencion] Si no se pasa, se toma la última atención cerrada
 * @param {string} [opts.fuente='manual']  'manual' | 'csv' | 'programado'
 * @param {boolean} [opts.forzar=false]    Reenviar aunque ya exista un envío OK previo
 * @returns {Promise<{ ok: boolean, idAtencion: number|null, destino?: string, error?: string, omitido?: boolean }>}
 */
async function enviarHistoria(opts) {
  const {
    tipo_documento,
    numero_documento,
    idAtencion: idAtencionInput = null,
    fuente = 'manual',
    forzar = false,
  } = opts || {};

  if (!tipo_documento || !numero_documento) {
    return { ok: false, idAtencion: null, error: 'tipo_documento y numero_documento son requeridos' };
  }
  if (!FUENTES_VALIDAS.has(fuente)) {
    return { ok: false, idAtencion: null, error: `fuente inválida: ${fuente}` };
  }

  // ── Paso 1 · Datos del paciente ─────────────────────────────────────────
  let paciente;
  try {
    paciente = await HistoriaModel.getPacienteCompleto(tipo_documento, numero_documento);
  } catch (err) {
    return { ok: false, idAtencion: null, error: `Error consultando paciente: ${err.message}` };
  }
  if (!paciente) {
    return { ok: false, idAtencion: null, error: 'Paciente no encontrado en vw_pacientes_portal' };
  }
  if (!paciente.correo) {
    const msg = 'El paciente no tiene correo registrado en vw_pacientes_portal';
    // Registrar el error solo si tenemos idAtencion concreta
    if (idAtencionInput) {
      try {
        await registrarEnvio({
          idAtencion: idAtencionInput,
          tipo_documento, numero_documento,
          destino: '', estado: 'ERROR', error_mensaje: msg, fuente,
        });
      } catch (_) { /* noop */ }
    }
    return { ok: false, idAtencion: idAtencionInput, error: msg };
  }

  // ── Paso 2 · Resolver atención ──────────────────────────────────────────
  let idAtencion = idAtencionInput;
  if (!idAtencion) {
    const ult = await obtenerUltimaAtencion(tipo_documento, numero_documento);
    if (!ult) {
      return { ok: false, idAtencion: null, error: 'El paciente no tiene atenciones cerradas para enviar' };
    }
    idAtencion = ult.id;
  }

  // ── Paso 3 · Idempotencia ───────────────────────────────────────────────
  if (!forzar) {
    const previo = await yaEnviada(idAtencion);
    if (previo) {
      return {
        ok: true, omitido: true, idAtencion,
        destino: paciente.correo,
        error: `Ya enviada el ${fechaLegible(previo.fecha_envio)} (id=${previo.id})`,
      };
    }
  }

  // ── Paso 4 · Generar PDF ────────────────────────────────────────────────
  let pdfCifrado;
  let nombreArchivo;
  let payload;
  try {
    payload = await HistoriaPrintService.imprimirAtencion(idAtencion, {
      registrarCopia: true,
      numeroCopias: 1,
    });
    const { html, parametros } = PlantillaRender.renderHtml(payload);
    const pdfBuffer = await PdfService.generarPdfBuffer({ html, parametros });
    pdfCifrado = await PdfEncrypt.cifrarPdf(pdfBuffer, paciente.numero_documento);
    nombreArchivo = `historia_clinica_${paciente.numero_documento}_${idAtencion}.pdf`;
  } catch (err) {
    const msg = `Error generando/cifrando PDF: ${err.message}`;
    try {
      await registrarEnvio({
        idAtencion, tipo_documento, numero_documento,
        destino: paciente.correo, estado: 'ERROR',
        error_mensaje: msg, fuente,
      });
    } catch (_) { /* noop */ }
    return { ok: false, idAtencion, destino: paciente.correo, error: msg };
  }

  // ── Paso 5 · Enviar correo ──────────────────────────────────────────────
  try {
    const html = construirCuerpoCorreo({ paciente, atencion: payload.atencion });
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || '"E.S.E Hospital San Juan de Dios Marinilla" <no-reply@hospitalmarinilla.gov.co>',
      to: paciente.correo,
      subject: 'Su historia clínica - E.S.E Hospital San Juan de Dios Marinilla',
      html,
      attachments: [
        {
          filename: nombreArchivo,
          content: pdfCifrado,
          contentType: 'application/pdf',
        },
      ],
    });
  } catch (err) {
    const msg = `Error enviando correo: ${err.message}`;
    try {
      await registrarEnvio({
        idAtencion, tipo_documento, numero_documento,
        destino: paciente.correo, estado: 'ERROR',
        error_mensaje: msg, fuente,
      });
    } catch (_) { /* noop */ }
    return { ok: false, idAtencion, destino: paciente.correo, error: msg };
  }

  // ── Paso 6 · Registrar éxito ────────────────────────────────────────────
  try {
    await registrarEnvio({
      idAtencion, tipo_documento, numero_documento,
      destino: paciente.correo, estado: 'OK',
      error_mensaje: null, fuente,
    });
  } catch (err) {
    // El correo ya salió; el INSERT puede fallar por carrera con el índice único.
    // Lo dejamos como warning sin tumbar el flujo.
    console.warn(`⚠️  [EnvioHistoria] Atención ${idAtencion}: correo enviado pero falló el INSERT de auditoría: ${err.message}`);
  }

  return { ok: true, idAtencion, destino: paciente.correo };
}

/**
 * Lista atenciones pendientes de envío desde una fecha de corte.
 * Sólo trae atenciones en estado cerrado (id_estado IN (2,3)) que aún no
 * tengan un envío 'OK' en `envios_historia`.
 *
 * @param {object} opts
 * @param {Date|string} opts.desde
 * @param {number} [opts.max=200]
 * @returns {Promise<Array<{idAtencion:number, tipo_documento:string, numero_documento:string}>>}
 */
async function listarPendientes({ desde, max = 200 }) {
  if (!desde) throw new Error('listarPendientes: parámetro "desde" es requerido');
  const pool = await portalPool;
  const result = await pool.request()
    .input('desde', sql.DateTime, new Date(desde))
    .input('max', sql.Int, max)
    .query(`
      SELECT TOP (@max)
        a.id_atencion       AS idAtencion,
        td.codigo           AS tipo_documento,
        a.numero_documento  AS numero_documento,
        a.fecha_atencion    AS fecha_atencion
      FROM vw_atenciones_portal a
      INNER JOIN tipos_documento td ON a.tipo_documento = td.id
      LEFT JOIN envios_historia e
        ON e.id_atencion = a.id_atencion AND e.estado = 'OK'
      WHERE a.fecha_atencion >= @desde
        AND a.id_estado IN (2, 3)
        AND e.id IS NULL
      ORDER BY a.fecha_atencion ASC
    `);
  return result.recordset;
}

module.exports = {
  enviarHistoria,
  listarPendientes,
  registrarEnvio,
};
