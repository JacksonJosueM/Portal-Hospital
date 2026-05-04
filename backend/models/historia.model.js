const { poolPromise, sql } = require('../config/db');

/**
 * Modelo de Historia Clínica
 * Lee datos en tiempo real desde las vistas de PortalPacientes
 * (que a su vez leen de Panacea via linked server)
 */
const HistoriaModel = {
  /**
   * Lista todas las atenciones (historias clínicas) de un paciente
   * Consulta: vw_atenciones_portal (vista en PortalPacientes)
   */
  async findByDocument(tipo_documento, numero_documento) {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('tipo', sql.SmallInt, parseInt(tipo_documento))
      .input('numero', sql.VarChar(30), numero_documento)
      .query(`
        SELECT 
          id_atencion AS id,
          fecha_atencion AS fecha,
          especialidad,
          nombre_medico AS medico,
          id_estado
        FROM vw_atenciones_portal
        WHERE tipo_documento = @tipo 
          AND numero_documento = @numero
        ORDER BY fecha_atencion DESC
      `);
    return result.recordset;
  },

  /**
   * Busca atenciones por código de tipo_documento (CC, TI, etc.)
   * Hace JOIN con tipos_documento para traducir código → id numérico
   */
  async findByDocumentCode(codigo_tipo, numero_documento) {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('codigo', sql.VarChar(10), codigo_tipo)
      .input('numero', sql.VarChar(30), numero_documento)
      .query(`
        SELECT 
          a.id_atencion AS id,
          a.fecha_atencion AS fecha,
          a.especialidad,
          a.nombre_medico AS medico,
          a.id_estado
        FROM vw_atenciones_portal a
        INNER JOIN tipos_documento td ON a.tipo_documento = td.id
        WHERE td.codigo = @codigo 
          AND a.numero_documento = @numero
        ORDER BY a.fecha_atencion DESC
      `);
    return result.recordset;
  },

  /**
   * Obtiene los datos básicos de una atención por ID
   */
  async findById(id_atencion, codigo_tipo, numero_documento) {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('id', sql.BigInt, id_atencion)
      .input('codigo', sql.VarChar(10), codigo_tipo)
      .input('numero', sql.VarChar(30), numero_documento)
      .query(`
        SELECT 
          a.id_atencion AS id,
          a.fecha_atencion AS fecha,
          a.especialidad,
          a.nombre_medico AS medico,
          a.nombre_paciente,
          a.numero_documento,
          a.registro_medico,
          a.id_estado,
          a.id_plantilla
        FROM vw_atenciones_portal a
        INNER JOIN tipos_documento td ON a.tipo_documento = td.id
        WHERE a.id_atencion = @id
          AND td.codigo = @codigo
          AND a.numero_documento = @numero
      `);
    return result.recordset[0] || null;
  },

  /**
   * Obtiene TODOS los datos clínicos dinámicos de una atención
   * Devuelve array de { id_campo, nombre_campo, valor }
   * NO hardcodea IDs — usa la relación dinámica con TP_DATOS
   */
  async getDatosClinicos(id_atencion) {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('id', sql.BigInt, id_atencion)
      .query(`
        SELECT 
          id_campo,
          nombre_campo,
          valor
        FROM vw_datos_clinicos_portal
        WHERE id_atencion = @id
        ORDER BY id_campo
      `);
    return result.recordset;
  },

  /**
   * Obtiene datos del paciente desde vw_pacientes_portal
   * para completar la información del PDF
   */
  async getPacienteCompleto(codigo_tipo, numero_documento) {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('codigo', sql.VarChar(10), codigo_tipo)
      .input('numero', sql.VarChar(30), numero_documento)
      .query(`
        SELECT 
          p.id_paciente AS id,
          p.NOMBRE_COMPLETO AS nombre,
          p.numero_documento,
          p.FECHA_NACIMIENTO AS fecha_nacimiento,
          p.email AS correo,
          p.telefono,
          td.codigo AS tipo_documento
        FROM vw_pacientes_portal p
        INNER JOIN tipos_documento td ON p.tipo_documento = td.id
        WHERE td.codigo = @codigo 
          AND p.numero_documento = @numero
      `);
    return result.recordset[0] || null;
  }
};

module.exports = HistoriaModel;
