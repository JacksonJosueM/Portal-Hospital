/**
 * ════════════════════════════════════════════════════════════════════════════
 *  WRAPPERS · esquema PANACEA.Laboratorio.*
 * ════════════════════════════════════════════════════════════════════════════
 *  Datos de texto vinculados a resultados de laboratorio dentro de una
 *  atención (la traza ejecuta sólo `STM_DATOS_TEXTO` aquí).
 * ════════════════════════════════════════════════════════════════════════════
 */

const { sql, panaceaPool } = require('../../config/db');
const { applyAudit } = require('./auditContext');

async function pool() {
  return panaceaPool;
}

async function getDatosTexto(idAtencion) {
  const p = await pool();
  const r = applyAudit(p.request(), 4)
    .input('ID', sql.BigInt, null)
    .input('ID_ATENCION', sql.BigInt, idAtencion);
  const result = await r.execute('Laboratorio.STM_DATOS_TEXTO');
  return result.recordset;
}

module.exports = {
  getDatosTexto,
};
