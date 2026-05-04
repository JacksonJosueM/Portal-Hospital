require('dotenv').config();
const sql = require('mssql');

const dbConfig = {
  server: process.env.DB_SERVER || 'localhost',
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true },
  port: parseInt(process.env.DB_PORT) || 1433,
  requestTimeout: 30000,
  connectionTimeout: 30000
};

async function checkAntecedentes() {
  let pool;
  try {
    pool = await sql.connect(dbConfig);
    console.log('✅ Conectado a SQL Server');

    // Find the attention by the specific "Motivo de consulta"
    const result = await pool.request().query(`
      SELECT TOP 1 id_atencion 
      FROM vw_datos_clinicos_portal 
      WHERE valor LIKE '%SIGUE SANGRANDO POR EL RECTO Y ESTA PALIDO%'
    `);

    if (result.recordset.length === 0) {
      console.log('No se encontró la atención con ese motivo de consulta.');
      
      // Let's just find any recent attention with Antecedentes hospitalarios = 'NINGUNA'
      const fallback = await pool.request().query(`
        SELECT TOP 1 id_atencion 
        FROM vw_datos_clinicos_portal 
        WHERE nombre_campo = 'Antecedentes hospitalarios' AND valor = 'NINGUNA'
      `);
      if (fallback.recordset.length > 0) {
        console.log('Usando atención alternativa:', fallback.recordset[0].id_atencion);
        await inspectAttention(pool, fallback.recordset[0].id_atencion);
      }
    } else {
      const idAtencion = result.recordset[0].id_atencion;
      console.log('Atención encontrada:', idAtencion);
      await inspectAttention(pool, idAtencion);
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    if (pool) await pool.close();
  }
}

async function inspectAttention(pool, idAtencion) {
  console.log('\\n--- DATOS EN LA VISTA (vw_datos_clinicos_portal) ---');
  const viewData = await pool.request()
    .input('id', sql.BigInt, idAtencion)
    .query(`
      SELECT id_campo, nombre_campo, valor 
      FROM vw_datos_clinicos_portal 
      WHERE id_atencion = @id
    `);
  console.table(viewData.recordset.filter(r => r.nombre_campo && r.nombre_campo.toLowerCase().includes('antecedente')));

  console.log('\\n--- DATOS CRUDOS EN PANACEA (TM_DATOS_TEXTO) ---');
  // Raw data from Panacea
  const rawData = await pool.request()
    .input('id', sql.BigInt, idAtencion)
    .query(`
      SELECT 
        dt.ID_ESTRUCTURA_PLANTILLA,
        ep.ID_ESTRUCTURA,
        d.NOMBRE AS nombre_estructura,
        CAST(dt.VALOR AS VARCHAR(MAX)) AS valor
      FROM PANACEA.Historia.TM_DATOS_TEXTO dt
      LEFT JOIN PANACEA.Dinamico.TP_ESTRUCTURAS_PLANTILLAS ep ON dt.ID_ESTRUCTURA_PLANTILLA = ep.ID
      LEFT JOIN PANACEA.Dinamico.TP_DATOS d ON ep.ID_ESTRUCTURA = d.ID
      WHERE dt.ID_ATENCION = @id
    `);
  
  const antecedentes = rawData.recordset.filter(r => r.nombre_estructura && r.nombre_estructura.toLowerCase().includes('antecedente'));
  if (antecedentes.length > 0) {
    console.table(antecedentes);
  } else {
    console.log('No hay campos de antecedentes en los datos crudos para esta atención.');
    console.log('Mostrando todos los campos raw:');
    console.table(rawData.recordset);
  }
}

checkAntecedentes();
