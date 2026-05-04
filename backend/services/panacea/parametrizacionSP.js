/**
 * ════════════════════════════════════════════════════════════════════════════
 *  WRAPPERS · esquema PANACEA.Parametrizacion.*
 * ════════════════════════════════════════════════════════════════════════════
 *  Datos institucionales: IPS, sede y logo corporativo.
 * ════════════════════════════════════════════════════════════════════════════
 */

const { sql, panaceaPool } = require('../../config/db');
const { applyAudit, getIdIps } = require('./auditContext');

async function pool() {
  return panaceaPool;
}

async function getSede(idSede) {
  const p = await pool();
  const result = await p.request()
    .input('ID', sql.SmallInt, idSede)
    .input('OPERACION', sql.SmallInt, 13)
    .execute('Parametrizacion.STP_SEDES');
  return result.recordset[0] || null;
}

async function getIps(idIps = getIdIps()) {
  const p = await pool();
  const r = applyAudit(p.request(), 3).input('ID', sql.SmallInt, idIps);
  const result = await r.execute('Parametrizacion.STP_IPS');
  return result.recordset[0] || null;
}

async function getPrimerLogoIps(idIps = getIdIps()) {
  const p = await pool();
  const result = await p.request()
    .input('ID_IPS', sql.SmallInt, idIps)
    .execute('Parametrizacion.QRY_PRIMER_LOGO_IPS');
  return result.recordset[0] || null;
}

module.exports = {
  getSede,
  getIps,
  getPrimerLogoIps,
};
