/**
 * ════════════════════════════════════════════════════════════════════════════
 *  WRAPPERS · esquema PANACEA.Historia.*
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Cada función reproduce 1:1 una llamada SP de la traza original de Panacea.
 *  Los resultados se normalizan a UPPER_SNAKE_CASE mediante normalizeColumns
 *  para compatibilidad con el motor de render.
 * ════════════════════════════════════════════════════════════════════════════
 */

const { sql, panaceaPool } = require('../../config/db');
const { applyAudit, getIdIps } = require('./auditContext');
const { normalizeRecordset, normalizeRecordsets, normalizeFirst } = require('./normalizeColumns');

async function pool() {
  return panaceaPool;
}

// ── Parámetros de impresión por IPS ───────────────────────────────────────
async function getParametrosImpresion(idIps = getIdIps()) {
  const p = await pool();
  const r = applyAudit(p.request(), 4)
    .input('ID', sql.SmallInt, null)
    .input('TAMANIO_FUENTE', sql.SmallInt, null)
    .input('ID_FUENTE', sql.SmallInt, null)
    .input('MARGEN_SUPERIOR', sql.SmallInt, null)
    .input('MARGEN_INFERIOR', sql.SmallInt, null)
    .input('MARGEN_DERECHO', sql.SmallInt, null)
    .input('MARGEN_IZQUIERDO', sql.SmallInt, null)
    .input('INTERLINEADO', sql.SmallInt, null)
    .input('PAPEL_HISTORIA', sql.SmallInt, null)
    .input('PAPEL_ORDEN', sql.SmallInt, null)
    .input('ID_IPS', sql.SmallInt, idIps);
  const result = await r.execute('Historia.STP_PARAMETROS_IMPRESION');
  return normalizeRecordset(result.recordset);
}

// ── Atención (objeto principal) ───────────────────────────────────────────
async function getAtencion(idAtencion) {
  const p = await pool();
  const r = applyAudit(p.request(), 3).input('ID', sql.BigInt, idAtencion);
  const result = await r.execute('Historia.STM_ATENCIONES');
  return normalizeFirst(result.recordset);
}

async function getAtencionBasico(idAtencion, op = 5) {
  const p = await pool();
  const r = applyAudit(p.request(), op)
    .input('ID_ATENCION', sql.BigInt, idAtencion)
    .input('FECHA_REGISTRO', sql.DateTime, null)
    .input('FECHA_ATENCION', sql.DateTime, null)
    .input('UBICACION', sql.VarChar(100), null)
    .input('ID_IPS', sql.SmallInt, null);
  const result = await r.execute('Historia.STM_ATENCIONES_BASICO');
  return normalizeFirst(result.recordset);
}

async function getConsultaAtenciones(idSede, op = 5) {
  const p = await pool();
  const result = await p.request()
    .input('ID_SEDE', sql.SmallInt, idSede)
    .input('OPERACION', sql.SmallInt, op)
    .execute('Historia.QRY_CONSULTA_ATENCIONES');
  return normalizeRecordset(result.recordset);
}

async function poblarTokenAtencion({
  idPaciente,
  idPrestador,
  idEspecialidad,
  idProcedimiento,
  idLegalizacionProc,
  idAutorizacion = 0,
  idAdmision = 0,
  idAiu = 0,
  idAtencion,
  idConvenio = 0,
  imprimeResultado = 0,
}) {
  const p = await pool();
  const result = await p.request()
    .input('ID_PACIENTE', sql.BigInt, idPaciente)
    .input('ID_PRESTADOR', sql.Int, idPrestador)
    .input('ID_ESPECIALIDAD', sql.Int, idEspecialidad)
    .input('ID_PROCEDIMIENTO', sql.Int, idProcedimiento)
    .input('ID_LEGALIZACION_PROC', sql.BigInt, idLegalizacionProc)
    .input('ID_AUTORIZACION', sql.BigInt, idAutorizacion)
    .input('ID_ADMISION', sql.BigInt, idAdmision)
    .input('ID_AIU', sql.BigInt, idAiu)
    .input('ID_ATENCION', sql.BigInt, idAtencion)
    .input('ID_CONVENIO', sql.Int, idConvenio)
    .input('OPERACION', sql.SmallInt, 1)
    .input('IMPRIME_RESULTADO', sql.SmallInt, imprimeResultado)
    .execute('Historia.QRY_POBLAR_TOKEN_ATENCION');
  return normalizeRecordsets(result.recordsets);
}

// ── Auditoría de copias impresas ──────────────────────────────────────────
async function getCopiasImpresion(idAtencion) {
  const p = await pool();
  const r = applyAudit(p.request(), 5)
    .input('ID', sql.Int, null)
    .input('ID_ATENCION', sql.BigInt, idAtencion)
    .input('ID_ORDEN', sql.BigInt, null)
    .input('ID_FORMATO', sql.SmallInt, null)
    .input('NUMERO_COPIAS', sql.SmallInt, null);
  const result = await r.execute('Historia.STM_COPIAS_IMPRESION');
  return normalizeRecordset(result.recordset);
}

async function registrarCopiaImpresion(idAtencion, numeroCopias = 1) {
  const p = await pool();
  const r = applyAudit(p.request(), 1)
    .input('ID', sql.Int, null)
    .input('ID_ATENCION', sql.BigInt, idAtencion)
    .input('ID_ORDEN', sql.BigInt, null)
    .input('ID_FORMATO', sql.SmallInt, null)
    .input('NUMERO_COPIAS', sql.SmallInt, numeroCopias);
  const result = await r.execute('Historia.STM_COPIAS_IMPRESION');
  return normalizeFirst(result.recordset);
}

// ── Catálogos clínicos ────────────────────────────────────────────────────
async function getAlergiasPaciente(idPaciente, idIps = getIdIps()) {
  const p = await pool();
  const r = applyAudit(p.request(), 4)
    .input('ID', sql.BigInt, null)
    .input('ID_ATENCION', sql.BigInt, null)
    .input('ID_PACIENTE', sql.BigInt, idPaciente)
    .input('ID_TIPO_ALERGIA', sql.SmallInt, null)
    .input('ID_PRINCIPIO_ACTIVO', sql.Int, null)
    .input('ID_ARTICULO_ALIMENTO', sql.Int, null)
    .input('ID_MENU_PLATO', sql.Int, null)
    .input('ID_OTRA_ALERGIA', sql.Int, null)
    .input('CODIGO', sql.VarChar(50), null)
    .input('NOMBRE', sql.VarChar(200), null)
    .input('ADICION', sql.VarChar(500), null)
    .input('ESTADO', sql.SmallInt, null)
    .input('FECHA_REGISTRO', sql.DateTime, null)
    .input('ID_IPS', sql.SmallInt, idIps);
  const result = await r.execute('Historia.STM_PACIENTE_ALERGIAS');
  return normalizeRecordset(result.recordset);
}

async function getAntecedentesPaciente(idPaciente, idIps = getIdIps()) {
  const p = await pool();
  const r = applyAudit(p.request(), 7)
    .input('ID', sql.BigInt, null)
    .input('ID_ATENCION', sql.BigInt, null)
    .input('ID_PACIENTE', sql.BigInt, idPaciente)
    .input('ANTECEDENTE', sql.VarChar(sql.MAX), null)
    .input('FECHA_REGISTRO', sql.DateTime, null)
    .input('ID_DATO', sql.Int, null)
    .input('ESTADO', sql.SmallInt, null)
    .input('ID_IPS', sql.SmallInt, idIps)
    .input('JUSTIFICACION', sql.VarChar(sql.MAX), null)
    .input('FECHA_INACTIVACION', sql.DateTime, null);
  const result = await r.execute('Historia.STM_PACIENTE_ANTECEDENTES');
  return normalizeRecordset(result.recordset);
}

async function getDiagnosticos(idAtencion) {
  const p = await pool();
  const r = applyAudit(p.request(), 4)
    .input('ID', sql.BigInt, null)
    .input('ID_ATENCION', sql.BigInt, idAtencion);
  const result = await r.execute('Historia.STM_DATOS_DIAGNOSTICOS');
  return normalizeRecordset(result.recordset);
}

async function getSintomas(idAtencion) {
  const p = await pool();
  const r = applyAudit(p.request(), 4)
    .input('ID', sql.BigInt, null)
    .input('ID_ATENCION', sql.BigInt, idAtencion);
  const result = await r.execute('Historia.STM_DATOS_SINTOMAS');
  return normalizeRecordset(result.recordset);
}

// ── Datos por tipo (Op=4 lee toda la atención) ────────────────────────────
async function getDatosTipo(spName, idAtencion, op = 4) {
  const p = await pool();
  const r = applyAudit(p.request(), op)
    .input('ID', sql.BigInt, null)
    .input('ID_ATENCION', sql.BigInt, idAtencion);
  const result = await r.execute(`Historia.${spName}`);
  return normalizeRecordset(result.recordset);
}

const getDatosDecimal = (idAtencion) => getDatosTipo('STM_DATOS_DECIMAL', idAtencion, 4);
const getDatosEnteros = (idAtencion) => getDatosTipo('STM_DATOS_ENTEROS', idAtencion, 4);
const getDatosTexto = (idAtencion) => getDatosTipo('STM_DATOS_TEXTO', idAtencion, 4);
const getDatosLista = (idAtencion) => getDatosTipo('STM_DATOS_LISTA', idAtencion, 4);
const getDatosFecha = (idAtencion) => getDatosTipo('STM_DATOS_FECHA', idAtencion, 4);
const getDatosTabla = (idAtencion) => getDatosTipo('STM_DATOS_TABLA', idAtencion, 7);

// ── Extras ────────────────────────────────────────────────────────────────
async function getCalculosRiesgo(idAtencion) {
  const p = await pool();
  const r = applyAudit(p.request(), 4)
    .input('ID', sql.BigInt, null)
    .input('ID_ATENCION', sql.BigInt, idAtencion);
  const result = await r.execute('Historia.STM_CALCULOS_RIESGO');
  return normalizeRecordset(result.recordset);
}

async function getOrdenesImpresion(idAtencion) {
  const p = await pool();
  const result = await p.request()
    .input('ID_ATENCION', sql.BigInt, idAtencion)
    .input('OPERACION', sql.SmallInt, 0)
    .execute('Historia.QRY_ORDENES_IMPRESION');
  return normalizeRecordsets(result.recordsets);
}

async function getOrdenesFecha(idOrden) {
  const p = await pool();
  const r = applyAudit(p.request(), 4)
    .input('ID', sql.BigInt, null)
    .input('ID_ORDEN', sql.BigInt, idOrden);
  const result = await r.execute('Historia.STM_ORDENES_FECHA');
  return normalizeRecordset(result.recordset);
}

async function getOrdenesImpresionFormatos(idItem, operacion = 1) {
  const p = await pool();
  const result = await p.request()
    .input('ID_ITEM', sql.BigInt, idItem)
    .input('OPERACION', sql.SmallInt, operacion)
    .execute('Historia.QRY_IMPRESION_ORDENES_FORMATOS');
  return normalizeRecordset(result.recordset);
}

// Datos estructurados completos de un formato de orden (OPERACION=0).
// Devuelve el registro maestro con FechaInicio, FechaTerminacion, DiasIncapacidad,
// Prorroga, CausaExterna, TipoVinculacion, TipoUsuario, Item, NumeroOrden, etc.
async function getOrdenesFormatos(idItem, idGrupoPlantilla, idTipoPlantilla) {
  const p = await pool();
  const result = await p.request()
    .input('ID_ITEM', sql.BigInt, idItem)
    .input('ID_GRUPO_PLANTILLA', sql.SmallInt, idGrupoPlantilla)
    .input('ID_TIPO_PLANTILLA', sql.SmallInt, idTipoPlantilla)
    .input('OPERACION', sql.SmallInt, 0)
    .execute('Historia.QRY_IMPRESION_ORDENES_FORMATOS');
  return normalizeRecordset(result.recordset);
}

async function getOrdenesLista(idOrden) {
  const p = await pool();
  const r = applyAudit(p.request(), 4)
    .input('ID', sql.BigInt, null)
    .input('ID_ORDEN', sql.BigInt, idOrden);
  const result = await r.execute('Historia.STM_ORDENES_LISTA');
  return normalizeRecordset(result.recordset);
}

async function getOrdenesTexto(idOrden) {
  const p = await pool();
  const r = applyAudit(p.request(), 4)
    .input('ID', sql.BigInt, null)
    .input('ID_ORDEN', sql.BigInt, idOrden);
  const result = await r.execute('Historia.STM_ORDENES_TEXTO');
  return normalizeRecordset(result.recordset);
}

async function getNotasAtencion(idAtencion) {
  const p = await pool();
  const r = applyAudit(p.request(), 4)
    .input('ID', sql.BigInt, null)
    .input('ID_ATENCION', sql.BigInt, idAtencion);
  const result = await r.execute('Historia.STM_ATENCION_NOTAS');
  return normalizeRecordset(result.recordset);
}

async function getGraficasImagen(idAtencion) {
  const p = await pool();
  const r = applyAudit(p.request(), 4)
    .input('ID', sql.BigInt, null)
    .input('ID_ATENCION', sql.BigInt, idAtencion)
    .input('ID_GRAFICA', sql.BigInt, null)
    .input('ID_PACIENTE', sql.BigInt, null)
    .input('GRAFICA_BYTES', sql.VarBinary(sql.MAX), null)
    .input('NOMBRE', sql.VarChar(200), null)
    .input('TIPO_MIME', sql.VarChar(100), null)
    .input('ID_IPS', sql.SmallInt, null);
  const result = await r.execute('Historia.STM_GRAFICA_IMAGEN_ATENCION');
  return normalizeRecordset(result.recordset);
}

async function getFormulacionMedica(idAtencion) {
  const p = await pool();
  const result = await p.request()
    .input('ID_ATENCION', sql.BigInt, idAtencion)
    .input('OPERACION', sql.SmallInt, 1)
    .execute('Historia.QRY_IMPRIME_FORMULACION_MEDICA');
  return normalizeRecordsets(result.recordsets);
}

module.exports = {
  getParametrosImpresion,
  getAtencion,
  getAtencionBasico,
  getConsultaAtenciones,
  poblarTokenAtencion,
  getCopiasImpresion,
  registrarCopiaImpresion,
  getAlergiasPaciente,
  getAntecedentesPaciente,
  getDiagnosticos,
  getSintomas,
  getDatosDecimal,
  getDatosEnteros,
  getDatosTexto,
  getDatosLista,
  getDatosFecha,
  getDatosTabla,
  getCalculosRiesgo,
  getOrdenesImpresion,
  getOrdenesFecha,
  getOrdenesImpresionFormatos,
  getOrdenesFormatos,
  getOrdenesLista,
  getOrdenesTexto,
  getNotasAtencion,
  getGraficasImagen,
  getFormulacionMedica,
};
