/**
 * ════════════════════════════════════════════════════════════════════════════
 *  WRAPPERS · esquema PANACEA.Dinamico.*
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Estos SPs definen la "espina dorsal" del render: la plantilla, los datos
 *  que la componen, sus rangos de validación, sus valores posibles y sus
 *  imágenes/columnas asociadas.
 *
 *  El loop que se ve en la traza por cada `id_dato` (51, 17, 373, 374, 4, …)
 *  está implementado en `getMetadataDato(idDato)` que ejecuta en paralelo
 *  los 5 SPs (DATOS, CAMPOS_TABLAS, IMAGENES, RANGOS x10 tipos, VALORES).
 * ════════════════════════════════════════════════════════════════════════════
 */

const { sql, panaceaPool } = require('../../config/db');
const { applyAudit, getUsuario, getIpOrigen } = require('./auditContext');
const { normalizeRecordset, normalizeFirst } = require('./normalizeColumns');

// Tipos de rango que la traza recorre por cada id_dato (orden EXACTO)
const TIPOS_RANGO = [2, 3, 5, 4, 6, 7, 8, 9, 10, 14];

async function pool() {
  return panaceaPool;
}

async function getPlantilla(idPlantilla) {
  const p = await pool();
  const r = applyAudit(p.request(), 3).input('ID', sql.Int, idPlantilla);
  const result = await r.execute('Dinamico.STP_PLANTILLAS');
  return normalizeFirst(result.recordset);
}

async function getEstructuraPlanaPlantilla(idPlantilla) {
  const p = await pool();
  const result = await p.request()
    .input('ID_PLANTILLA', sql.Int, idPlantilla)
    .input('OPERACION', sql.SmallInt, 0)
    .execute('Dinamico.QRY_ESTRUCTURA_PLANA_PLANTILLA');
  return normalizeRecordset(result.recordset);
}

async function getDato(idDato) {
  const p = await pool();
  const r = applyAudit(p.request(), 3).input('ID', sql.Int, idDato);
  const result = await r.execute('Dinamico.STP_DATOS');
  return normalizeFirst(result.recordset);
}

async function getDatoCamposTablas(idDato) {
  const p = await pool();
  const r = applyAudit(p.request(), 4)
    .input('ID', sql.Int, null)
    .input('ID_DATO', sql.Int, idDato);
  const result = await r.execute('Dinamico.STP_DATOS_CAMPOS_TABLAS');
  return normalizeRecordset(result.recordset);
}

async function getDatoImagenes(idDato) {
  const p = await pool();
  const r = applyAudit(p.request(), 4)
    .input('ID', sql.SmallInt, null)
    .input('ID_DATO', sql.Int, idDato);
  const result = await r.execute('Dinamico.STP_DATOS_IMAGENES');
  return normalizeRecordset(result.recordset);
}

async function getDatoValores(idDato) {
  const p = await pool();
  const r = applyAudit(p.request(), 4)
    .input('ID', sql.SmallInt, null)
    .input('ID_DATO', sql.Int, idDato);
  const result = await r.execute('Dinamico.STP_DATOS_VALORES');
  return normalizeRecordset(result.recordset);
}

/**
 * STP_RANGOS_HISTORIA recibe @Usuario/@IP_Origen/@Timestamp/@Operacion como
 * cualquier otro SP, pero sus parámetros funcionales son @ID_TIPO_ORIGEN,
 * @ID_ORIGEN (= id_dato), @ID_TIPO_RANGO, @ID_TIPO_ATENCION, @CONDICION.
 * En la traza siempre usa @ID_TIPO_ORIGEN=1, @Operacion=6.
 */
async function getRangoHistoria(idDato, idTipoRango) {
  const p = await pool();
  const result = await p.request()
    .input('ID', sql.Int, null)
    .input('ID_TIPO_ORIGEN', sql.SmallInt, 1)
    .input('ID_ORIGEN', sql.Int, idDato)
    .input('ID_TIPO_RANGO', sql.SmallInt, idTipoRango)
    .input('ID_TIPO_ATENCION', sql.SmallInt, null)
    .input('CONDICION', sql.VarChar(sql.MAX), null)
    .input('Usuario', sql.VarChar(100), getUsuario())
    .input('IP_Origen', sql.VarChar(50), getIpOrigen())
    .input('Timestamp', sql.VarBinary, null)
    .input('Operacion', sql.SmallInt, 6)
    .execute('Dinamico.STP_RANGOS_HISTORIA');
  return normalizeRecordset(result.recordset);
}

/**
 * Reproduce el bloque que la traza ejecuta por cada `id_dato` referenciado
 * en la estructura de la plantilla. Devuelve un objeto consolidado.
 */
async function getMetadataDato(idDato) {
  const [meta, camposTabla, imagenes, valoresPosibles, ...rangos] = await Promise.all([
    getDato(idDato),
    getDatoCamposTablas(idDato),
    getDatoImagenes(idDato),
    getDatoValores(idDato),
    ...TIPOS_RANGO.map((t) => getRangoHistoria(idDato, t)),
  ]);

  const rangosByTipo = {};
  TIPOS_RANGO.forEach((tipo, i) => {
    rangosByTipo[tipo] = rangos[i];
  });

  return {
    idDato,
    meta,
    camposTabla,
    imagenes,
    valoresPosibles,
    rangos: rangosByTipo,
  };
}

module.exports = {
  TIPOS_RANGO,
  getPlantilla,
  getEstructuraPlanaPlantilla,
  getDato,
  getDatoCamposTablas,
  getDatoImagenes,
  getDatoValores,
  getRangoHistoria,
  getMetadataDato,
};
