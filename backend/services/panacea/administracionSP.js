/**
 * ════════════════════════════════════════════════════════════════════════════
 *  WRAPPERS · esquema PANACEA.Administracion.*
 * ════════════════════════════════════════════════════════════════════════════
 *  Profesional de la salud (datos del médico) y su firma digital.
 *  También un módulo funcional auxiliar que la traza consulta (id=8).
 * ════════════════════════════════════════════════════════════════════════════
 */

const { sql, panaceaPool } = require('../../config/db');
const { applyAudit } = require('./auditContext');

async function pool() {
  return panaceaPool;
}

async function getModulosFuncionales(idModulo = 8) {
  const p = await pool();
  const result = await p.request()
    .input('ID_MODULO_FUNCIONAL', sql.SmallInt, idModulo)
    .execute('Administracion.QRY_MODULOS_FUNCIONALES');
  return result.recordset;
}

async function getUsuario(userName) {
  const p = await pool();
  const r = applyAudit(p.request(), 3).input('USER_NAME', sql.VarChar(50), userName);
  const result = await r.execute('Administracion.STP_USUARIOS');
  return result.recordset[0] || null;
}

async function getUsuarioImagenes(idUsuario) {
  const p = await pool();
  const r = applyAudit(p.request(), 4)
    .input('ID', sql.Int, null)
    .input('ID_USUARIO', sql.VarChar(50), String(idUsuario));
  const result = await r.execute('Administracion.STP_USUARIO_IMAGENES');
  return result.recordset;
}

module.exports = {
  getModulosFuncionales,
  getUsuario,
  getUsuarioImagenes,
};
