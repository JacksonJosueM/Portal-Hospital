/**
 * ════════════════════════════════════════════════════════════════════════════
 *  ENVÍO HISTORIA SERVICE · Orquestador de flujo paciente -> PDF -> Mail
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Este servicio coordina:
 *   1. Búsqueda del paciente en el portal.
 *   2. Identificación de la última atención cerrada (si no se provee una).
 *   3. Verificación de duplicados (idempotencia).
 *   4. Generación de la historia clínica (Panacea SPs -> HTML -> PDF).
 *   5. Cifrado del PDF (AES-128 con documento del paciente).
 *   6. Envío por correo electrónico.
 *   7. Auditoría del envío.
 * ════════════════════════════════════════════════════════════════════════════
 */

const { portalPool, sql } = require('../config/db');
const HistoriaPrintService = require('./historia.print.service');
const PlantillaRender = require('./plantilla.render');
const PdfService = require('./pdf.service');
const PdfEncrypt = require('./pdf.encrypt');
const MailService = require('./mail.service');

/**
 * Registra el resultado de un envío en la tabla portal.envios_historia
 */
async function registrarEnvio({
  idAtencion,
  tipo_documento,
  numero_documento,
  destino,
  estado,
  error_mensaje = null,
  fuente = 'CLI',
}) {
  const p = await portalPool;
  await p.request()
    .input('id_atencion', sql.BigInt, idAtencion)
    .input('tipo_documento', sql.VarChar(10), tipo_documento)
    .input('numero_documento', sql.VarChar(50), numero_documento)
    .input('destino', sql.VarChar(200), destino)
    .input('estado', sql.VarChar(20), estado)
    .input('error_mensaje', sql.VarChar(sql.MAX), error_mensaje)
    .input('fuente', sql.VarChar(20), fuente)
    .query(`
      INSERT INTO envios_historia (id_atencion, tipo_documento, numero_documento, destino, estado, error_mensaje, fuente)
      VALUES (@id_atencion, @tipo_documento, @numero_documento, @destino, @estado, @error_mensaje, @fuente)
    `);
}

/**
 * Verifica si una atención ya fue enviada con éxito previamente
 */
async function yaEnviada(idAtencion) {
  const p = await portalPool;
  const result = await p.request()
    .input('id_atencion', sql.BigInt, idAtencion)
    .query("SELECT TOP 1 id, fecha_envio FROM envios_historia WHERE id_atencion = @id_atencion AND estado = 'OK' ORDER BY fecha_envio DESC");
  return result.recordset[0];
}

/**
 * Busca al paciente en la vista del portal para obtener su correo y documento
 */
// Mapa texto → código numérico usado en vw_pacientes_portal
const TIPO_DOC_CODIGO = {
  CC: 1, CE: 2, PA: 5, RC: 6, TI: 7, AS: 8, MS: 9,
  NU: 10, PE: 11, CN: 12, SC: 13, PT: 14, DE: 15, SI: 16, SN: 17,
};

async function buscarPaciente(tipo_documento, numero_documento) {
  const p = await portalPool;
  // tipo_documento puede llegar como texto (CC, PT...) o ya como número
  const codigoTipo = isNaN(tipo_documento)
    ? (TIPO_DOC_CODIGO[tipo_documento.toUpperCase()] ?? null)
    : parseInt(tipo_documento, 10);

  if (codigoTipo === null) {
    throw new Error(`Tipo de documento desconocido: '${tipo_documento}'. Use CC, TI, CE, PT, PA, etc.`);
  }

  const result = await p.request()
    .input('td', sql.SmallInt, codigoTipo)
    .input('nd', sql.VarChar(50), numero_documento)
    .query('SELECT TOP 1 id_paciente, NOMBRE_COMPLETO, numero_documento, email FROM vw_pacientes_portal WHERE tipo_documento = @td AND numero_documento = @nd');
  return result.recordset[0];
}

/**
 * Identifica la última atención cerrada del paciente
 */
async function obtenerUltimaAtencion(idPaciente) {
  const { panaceaPool } = require('../config/db');
  const p = await panaceaPool;
  // Buscamos en STM_ATENCIONES (solo cerradas: ESTADO = 2)
  const result = await p.request()
    .input('id_paciente', sql.BigInt, idPaciente)
    .query('SELECT TOP 1 ID FROM Historia.TM_ATENCIONES WHERE ID_PACIENTE = @id_paciente AND ID_ESTADO = 2 ORDER BY FECHA_ATENCION DESC');
  return result.recordset[0]?.ID;
}

const fechaLegible = (d) => new Date(d).toLocaleString('es-CO');

/**
 * FLUJO PRINCIPAL: Envía la historia clínica de un paciente
 * 
 * @param {object} params
 * @param {string} params.tipo_documento
 * @param {string} params.numero_documento
 * @param {string|number} [params.idAtencion] Si no se provee, usa la última cerrada
 * @param {boolean} [params.forzar=false]     Si true, ignora si ya fue enviada
 * @param {string} [params.fuente='CLI']      Origen de la petición
 */
async function enviarHistoria({
  tipo_documento,
  numero_documento,
  idAtencion = null,
  forzar = false,
  fuente = 'CLI',
}) {
  console.log(`🔍 Buscando paciente ${tipo_documento} ${numero_documento}...`);
  const paciente = await buscarPaciente(tipo_documento, numero_documento);

  if (!paciente) {
    return { ok: false, error: `Paciente ${tipo_documento} ${numero_documento} no registrado en el portal.` };
  }

  if (!paciente.email) {
    return { ok: false, error: `El paciente ${paciente.NOMBRE_COMPLETO} no tiene correo registrado.` };
  }

  // ── Paso 2 · Resolver Atención ──────────────────────────────────────────
  if (!idAtencion) {
    console.log(`🔍 Identificando última atención cerrada de ${paciente.NOMBRE_COMPLETO}...`);
    idAtencion = await obtenerUltimaAtencion(paciente.id_paciente);
  }

  if (!idAtencion) {
    return { ok: false, error: `No se encontraron atenciones cerradas para el paciente.` };
  }

  // ── Paso 3 · Idempotencia ───────────────────────────────────────────────
  if (!forzar) {
    const previo = await yaEnviada(idAtencion);
    if (previo) {
      return {
        ok: true, omitido: true, idAtencion,
        destino: paciente.email,
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
        destino: paciente.email, estado: 'ERROR',
        error_mensaje: msg, fuente,
      });
    } catch (_) { /* noop */ }
    return { ok: false, idAtencion, destino: paciente.email, error: msg };
  }

  // ── Paso 5 · Enviar Mail ────────────────────────────────────────────────
  try {
    await MailService.enviarConAdjunto({
      to: paciente.email,
      subject: `Historia Clínica - Atención ${idAtencion}`,
      text: `Hola ${paciente.NOMBRE_COMPLETO},\n\nAdjunto encontrarás tu historia clínica correspondiente a la atención ${idAtencion}.\n\nPor seguridad, el archivo está cifrado. Tu contraseña es tu número de documento (${paciente.numero_documento}).`,
      filename: nombreArchivo,
      content: pdfCifrado,
    });

    // ── Paso 6 · Auditoría OK ─────────────────────────────────────────────
    try {
      await registrarEnvio({
        idAtencion, tipo_documento, numero_documento,
        destino: paciente.email, estado: 'OK', fuente,
      });
    } catch (auditErr) {
      console.warn(`⚠️  [EnvioHistoria] Atención ${idAtencion}: correo enviado pero falló el INSERT de auditoría: ${auditErr.message}`);
    }

    return { ok: true, idAtencion, destino: paciente.email };
  } catch (err) {
    const msg = `Error enviando correo: ${err.message}`;
    try {
      await registrarEnvio({
        idAtencion, tipo_documento, numero_documento,
        destino: paciente.email, estado: 'ERROR',
        error_mensaje: msg, fuente,
      });
    } catch (_) { /* noop */ }
    return { ok: false, idAtencion, destino: paciente.email, error: msg };
  }
}

module.exports = { enviarHistoria };
