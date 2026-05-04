/**
 * ════════════════════════════════════════════════════════════════════════════
 *  WRAPPERS · esquema PANACEA.Odontologia.*
 * ════════════════════════════════════════════════════════════════════════════
 *  Tratamientos odontológicos asociados a la atención inicial. La traza
 *  ejecuta `STM_TRATAMIENTOS @OPERACION=12` (lectura por id_atencion_inicial).
 * ════════════════════════════════════════════════════════════════════════════
 */

const { sql, panaceaPool } = require('../../config/db');

async function pool() {
  return panaceaPool;
}

async function getTratamientos(idAtencionInicial) {
  const p = await pool();
  const result = await p.request()
    .input('ID_ATENCION_INICIAL', sql.BigInt, idAtencionInicial)
    .input('OPERACION', sql.SmallInt, 12)
    .execute('Odontologia.STM_TRATAMIENTOS');
  return result.recordset;
}

module.exports = {
  getTratamientos,
};
