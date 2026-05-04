const { poolPromise, sql } = require('../config/db');

const LaboratorioModel = {
  /**
   * Lista todos los resultados de laboratorio de un paciente
   */
  async findByDocument(tipo_documento, numero_documento) {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('tipo', sql.VarChar(10), tipo_documento)
      .input('numero', sql.VarChar(30), numero_documento)
      .query(`
        SELECT rl.id, rl.fecha, rl.tipo_examen, rl.resultado, rl.archivo_pdf, rl.observaciones
        FROM resultados_laboratorio rl
        INNER JOIN tipos_documento td ON rl.tipo_documento = td.id
        WHERE td.codigo = @tipo AND rl.numero_documento = @numero
        ORDER BY rl.fecha DESC
      `);
    return result.recordset;
  },

  /**
   * Obtiene el detalle de un resultado por ID
   */
  async findById(id, tipo_documento, numero_documento) {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('tipo', sql.VarChar(10), tipo_documento)
      .input('numero', sql.VarChar(30), numero_documento)
      .query(`
        SELECT rl.* 
        FROM resultados_laboratorio rl
        INNER JOIN tipos_documento td ON rl.tipo_documento = td.id
        WHERE rl.id = @id AND td.codigo = @tipo AND rl.numero_documento = @numero
      `);
    return result.recordset[0] || null;
  },
};

module.exports = LaboratorioModel;
