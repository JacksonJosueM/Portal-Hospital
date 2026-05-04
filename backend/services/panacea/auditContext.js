/**
 * ════════════════════════════════════════════════════════════════════════════
 *  AUDIT CONTEXT (Panacea)
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Todos los SPs de Panacea reciben los parámetros transversales:
 *      @Usuario   VARCHAR(100)
 *      @IP_Origen VARCHAR(50)
 *      @Timestamp VARBINARY (rowversion en updates; NULL en lecturas)
 *      @Operacion SMALLINT  (verbo de la acción: 3=read by id, 4=read by parent, …)
 *
 *  En la traza original, Panacea Silverlight envía:
 *      @Usuario='IIS APPPOOL\Silverligth'
 *      @IP_Origen='10.10.0.20'
 *      @Timestamp=NULL (excepto en STM_COPIAS_IMPRESION operacion=1)
 *
 *  Para el portal usamos un usuario dedicado (configurable por env) de modo
 *  que el DBA pueda auditar fácilmente qué tráfico viene del portal:
 *      PANACEA_DB_USUARIO_AUDIT='Portal_Pacientes'
 *      PANACEA_DB_IP_ORIGEN='10.10.0.20'   (IP del Servidor 2)
 *      PANACEA_ID_IPS=21
 * ════════════════════════════════════════════════════════════════════════════
 */

const { sql } = require('../../config/db');

const USUARIO = process.env.PANACEA_DB_USUARIO_AUDIT || 'Portal_Pacientes';
const IP_ORIGEN = process.env.PANACEA_DB_IP_ORIGEN || '10.10.0.20';
const ID_IPS = parseInt(process.env.PANACEA_ID_IPS || '21', 10);

function getUsuario() {
  return USUARIO;
}

function getIpOrigen() {
  return IP_ORIGEN;
}

function getIdIps() {
  return ID_IPS;
}

/**
 * Inyecta los 4 parámetros transversales en un `mssql.Request`.
 *
 * @param {import('mssql').Request} request
 * @param {number} operacion       Valor del @Operacion / @OPERACION del SP
 * @param {Buffer|null} timestamp  rowversion para UPDATEs (null para lecturas/inserts)
 * @returns {import('mssql').Request}
 */
function applyAudit(request, operacion, timestamp = null) {
  return request
    .input('Usuario', sql.VarChar(100), USUARIO)
    .input('IP_Origen', sql.VarChar(50), IP_ORIGEN)
    .input('Timestamp', sql.VarBinary, timestamp)
    .input('Operacion', sql.SmallInt, operacion);
}

module.exports = {
  applyAudit,
  getUsuario,
  getIpOrigen,
  getIdIps,
};
