const { poolPromise, sql } = require('../config/db');

const PacienteModel = {
  /**
   * Busca un paciente por tipo y número de documento para login
   */
  async findByDocument(tipo_documento, numero_documento) {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('tipo', sql.VarChar(10), tipo_documento)
      .input('numero', sql.VarChar(30), numero_documento)
      .query(`
        SELECT p.*, td.codigo as codigo_tipo_doc
        FROM pacientes p
        INNER JOIN tipos_documento td ON p.tipo_documento = td.id
        WHERE td.codigo = @tipo 
          AND p.numero_documento = @numero 
          AND p.activo = 1
      `);
    return result.recordset[0] || null;
  },

  /**
   * Actualiza el correo de un paciente
   */
  async updateCorreo(tipo_documento, numero_documento, correo) {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('correo', sql.VarChar(150), correo)
      .input('tipo', sql.VarChar(10), tipo_documento)
      .input('numero', sql.VarChar(30), numero_documento)
      .query(`
        UPDATE p 
        SET p.correo = @correo, p.fecha_actualizacion = GETDATE()
        OUTPUT inserted.*
        FROM pacientes p
        INNER JOIN tipos_documento td ON p.tipo_documento = td.id
        WHERE td.codigo = @tipo AND p.numero_documento = @numero
      `);
    return result.recordset[0] || null;
  },
};

module.exports = PacienteModel;
