/**
 * ════════════════════════════════════════════════════════════════════════════
 *  AUTORIZACION SP · Wrappers para el esquema Autorizaciones.* de Panacea
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Reproduce las llamadas SP que Panacea ejecuta al consultar e imprimir
 *  una Solicitud de Autorización de Servicios de Salud.
 *
 *  SPs identificados en traza (atención paciente 5369102 – 2026-05-30):
 *   • Autorizaciones.QRY_AUTORIZACION              → datos maestros
 *   • Autorizaciones.RPT_SOLICITUD_AUTORIZACION_MIN   → encabezado reporte
 *   • Autorizaciones.RPT_SOLICITUD_AUTORIZACION_DX    → diagnósticos CIE10
 *   • Autorizaciones.RPT_SOLICITUD_AUTORIZACION_ATENCION → servicios/atención
 *
 *  Vinculación atención → autorización:
 *   La tabla TM_AUTORIZACIONES no tiene FK directa al ID_ATENCION de Historia.
 *   Se busca por ID_PACIENTE + FECHA (mismo día calendario que la atención).
 * ════════════════════════════════════════════════════════════════════════════
 */

const { sql, panaceaPool } = require('../../config/db');
const { normalizeRecordset, normalizeFirst } = require('./normalizeColumns');

async function pool() {
  return panaceaPool;
}

/**
 * Busca autorizaciones de un paciente en la fecha de su atención.
 *
 * @param {number} idPaciente
 * @param {Date|string} fechaAtencion  Fecha de la atención (se compara por día)
 * @returns {object[]}  Filas de TM_AUTORIZACIONES (ID, NUMERO_AUTORIZACION, ID_ESTADO_AUTORIZACION…)
 */
async function getAutorizacionesPorPacienteYFecha(idPaciente, fechaAtencion) {
  const p = await pool();

  // Convertir a objeto Date si viene como string ISO
  const fecha = fechaAtencion instanceof Date ? fechaAtencion : new Date(fechaAtencion);

  const result = await p.request()
    .input('ID_PACIENTE', sql.BigInt, idPaciente)
    .input('FECHA', sql.DateTime, fecha)
    .query(`
      SELECT
        a.ID,
        a.NUMERO_AUTORIZACION,
        a.FECHA,
        a.ID_ESTADO_AUTORIZACION,
        a.ID_ORIGEN_AUTORIZACION,
        a.ID_ORIGEN_PADRE,
        a.ID_PACIENTE,
        a.ID_CONVENIO
      FROM Autorizaciones.TM_AUTORIZACIONES a WITH (NOLOCK)
      WHERE
        a.ID_PACIENTE = @ID_PACIENTE
        AND CAST(a.FECHA AS DATE) = CAST(@FECHA AS DATE)
        AND a.ID_ORIGEN_AUTORIZACION = 6        -- Solo "Autorización directa" (no Órdenes)
        AND a.ID_ESTADO_AUTORIZACION NOT IN (5, 6)  -- Excluir: Anulada, Rechazada
      ORDER BY a.FECHA ASC
    `);

  return normalizeRecordset(result.recordset);
}

/**
 * Datos maestros de una autorización.
 * Traza: exec Autorizaciones.QRY_AUTORIZACION @ID_AUTORIZACION=199850
 *
 * @param {number} idAutorizacion
 */
async function getAutorizacion(idAutorizacion) {
  const p = await pool();
  const result = await p.request()
    .input('ID_AUTORIZACION', sql.BigInt, idAutorizacion)
    .execute('Autorizaciones.QRY_AUTORIZACION');
  return normalizeFirst(result.recordset);
}

/**
 * Encabezado del reporte de solicitud (IPS solicitante, convenio, paciente, número, fecha).
 * Traza: exec Autorizaciones.RPT_SOLICITUD_AUTORIZACION_MIN @ID_AUTORIZACION=199850
 *
 * @param {number} idAutorizacion
 */
async function getRptSolicitudMin(idAutorizacion) {
  const p = await pool();
  const result = await p.request()
    .input('ID_AUTORIZACION', sql.BigInt, idAutorizacion)
    .execute('Autorizaciones.RPT_SOLICITUD_AUTORIZACION_MIN');
  return normalizeRecordset(result.recordset);
}

/**
 * Diagnósticos CIE10 asociados a la autorización.
 * Traza: exec autorizaciones.RPT_SOLICITUD_AUTORIZACION_DX @ID_AUTORIZACION=199850
 *
 * @param {number} idAutorizacion
 */
async function getRptSolicitudDx(idAutorizacion) {
  const p = await pool();
  const result = await p.request()
    .input('ID_AUTORIZACION', sql.BigInt, idAutorizacion)
    .execute('Autorizaciones.RPT_SOLICITUD_AUTORIZACION_DX');
  return normalizeRecordset(result.recordset);
}

/**
 * Datos de atención y servicios solicitados (tabla de procedimientos CUPS).
 * Traza: exec Autorizaciones.RPT_SOLICITUD_AUTORIZACION_ATENCION
 *          @ID_AUTORIZACION=199850, @LISTA_IDS=N'199850|'
 *
 * @param {number} idAutorizacion
 */
async function getRptSolicitudAtencion(idAutorizacion) {
  const p = await pool();
  const listaIds = `${idAutorizacion}|`;
  const result = await p.request()
    .input('ID_AUTORIZACION', sql.BigInt, idAutorizacion)
    .input('LISTA_IDS', sql.NVarChar(sql.MAX), listaIds)
    .execute('Autorizaciones.RPT_SOLICITUD_AUTORIZACION_ATENCION');
  return normalizeRecordset(result.recordset);
}

module.exports = {
  getAutorizacionesPorPacienteYFecha,
  getAutorizacion,
  getRptSolicitudMin,
  getRptSolicitudDx,
  getRptSolicitudAtencion,
};
