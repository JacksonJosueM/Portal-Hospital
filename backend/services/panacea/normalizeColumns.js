/**
 * ════════════════════════════════════════════════════════════════════════════
 *  NORMALIZE COLUMNS · camelCase → UPPER_SNAKE_CASE
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Los SPs de Panacea devuelven columnas en camelCase (IdDato, ValorTexto,
 *  CodigoCie, IdEstructuraPlantilla…) pero el motor de render y orquestador
 *  esperan UPPER_SNAKE_CASE (ID_DATO, VALOR_TEXTO, CODIGO_CIE…).
 *
 *  Esta utilidad transforma las claves de los objetos resultado **sin tocar
 *  la base de datos**. Se aplica en la capa de wrappers SP, justo antes
 *  de retornar el resultado al llamador.
 * ════════════════════════════════════════════════════════════════════════════
 */

/**
 * Convierte una cadena camelCase/PascalCase a UPPER_SNAKE_CASE.
 *
 *   IdEstructuraPlantilla  →  ID_ESTRUCTURA_PLANTILLA
 *   ValorTexto             →  VALOR_TEXTO
 *   CodigoCie              →  CODIGO_CIE
 *   codigoModalidadTecnologia → CODIGO_MODALIDAD_TECNOLOGIA
 *   IpOrigen               →  IP_ORIGEN
 *   IdIps                  →  ID_IPS
 *
 * @param {string} key
 * @returns {string}
 */
function toUpperSnake(key) {
  if (!key) return key;

  // Insertar _ antes de cada mayúscula que sigue a una minúscula o dígito,
  // o antes de una mayúscula seguida de una minúscula (para siglas: IPS→IPS).
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')   // camelCase boundary
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2') // acronym boundary (e.g. IPSOrigen→IPS_Origen)
    .toUpperCase();
}

/**
 * Normaliza las claves de un objeto.
 * @param {object} obj
 * @returns {object}
 */
function normalizeRow(obj) {
  if (obj == null || typeof obj !== 'object') return obj;
  // No transformar Buffers, Dates ni arrays
  if (Buffer.isBuffer(obj) || obj instanceof Date) return obj;

  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    out[toUpperSnake(key)] = value;
  }
  return out;
}

/**
 * Normaliza un array de registros (recordset).
 * @param {object[]} rows
 * @returns {object[]}
 */
function normalizeRecordset(rows) {
  if (!Array.isArray(rows)) return rows || [];
  return rows.map(normalizeRow);
}

/**
 * Normaliza múltiples recordsets (recordsets).
 * @param {object[][]} recordsets
 * @returns {object[][]}
 */
function normalizeRecordsets(recordsets) {
  if (!Array.isArray(recordsets)) return recordsets || [];
  return recordsets.map(normalizeRecordset);
}

/**
 * Normaliza el primer registro o devuelve null.
 * @param {object[]} rows
 * @returns {object|null}
 */
function normalizeFirst(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return normalizeRow(rows[0]);
}

module.exports = {
  toUpperSnake,
  normalizeRow,
  normalizeRecordset,
  normalizeRecordsets,
  normalizeFirst,
};
