/**
 * Script de diagnóstico: Inspecciona las vistas del portal
 * para entender qué campos de antecedentes están disponibles.
 * 
 * USO: node inspect_views.js
 */
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

async function inspeccionar() {
  let pool;
  try {
    pool = await sql.connect(dbConfig);
    console.log('✅ Conectado a SQL Server\n');

    // 1. Ver la definición de la vista vw_datos_clinicos_portal
    console.log('═══════════════════════════════════════════════════════');
    console.log('1. DEFINICIÓN DE vw_datos_clinicos_portal');
    console.log('═══════════════════════════════════════════════════════');
    try {
      const viewDef = await pool.request().query(`
        SELECT definition 
        FROM sys.sql_modules 
        WHERE object_id = OBJECT_ID('vw_datos_clinicos_portal')
      `);
      if (viewDef.recordset.length > 0) {
        console.log(viewDef.recordset[0].definition);
      } else {
        console.log('⚠️ Vista no encontrada');
      }
    } catch (e) {
      console.log('Error al leer definición:', e.message);
    }

    // 2. Ver la definición de vw_atenciones_portal
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('2. DEFINICIÓN DE vw_atenciones_portal');
    console.log('═══════════════════════════════════════════════════════');
    try {
      const viewDef2 = await pool.request().query(`
        SELECT definition 
        FROM sys.sql_modules 
        WHERE object_id = OBJECT_ID('vw_atenciones_portal')
      `);
      if (viewDef2.recordset.length > 0) {
        console.log(viewDef2.recordset[0].definition);
      } else {
        console.log('⚠️ Vista no encontrada');
      }
    } catch (e) {
      console.log('Error al leer definición:', e.message);
    }

    // 3. Tomar una atención de ejemplo y ver TODOS sus campos clínicos
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('3. CAMPOS CLÍNICOS DE UNA ATENCIÓN DE EJEMPLO');
    console.log('═══════════════════════════════════════════════════════');
    try {
      // Buscar una atención que tenga datos
      const atencion = await pool.request().query(`
        SELECT TOP 1 id_atencion 
        FROM vw_datos_clinicos_portal
      `);
      
      if (atencion.recordset.length > 0) {
        const idAtencion = atencion.recordset[0].id_atencion;
        console.log(`\nUsando atención ID: ${idAtencion}\n`);

        const datos = await pool.request()
          .input('id', sql.BigInt, idAtencion)
          .query(`
            SELECT id_campo, nombre_campo, valor
            FROM vw_datos_clinicos_portal
            WHERE id_atencion = @id
            ORDER BY id_campo
          `);

        console.log(`Total campos encontrados: ${datos.recordset.length}\n`);
        
        // Filtrar solo antecedentes
        console.log('--- TODOS LOS CAMPOS QUE CONTIENEN "ANTECEDENTE" ---');
        const antecedentes = datos.recordset.filter(r => 
          r.nombre_campo && r.nombre_campo.toLowerCase().includes('antecedente')
        );
        if (antecedentes.length > 0) {
          antecedentes.forEach(r => {
            console.log(`  [${r.id_campo}] ${r.nombre_campo} = ${(r.valor || '').substring(0, 80)}`);
          });
        } else {
          console.log('  ❌ No se encontraron campos con "antecedente" en el nombre');
        }

        console.log('\n--- LISTA COMPLETA DE NOMBRES DE CAMPO ---');
        datos.recordset.forEach(r => {
          const val = (r.valor || '').substring(0, 60);
          console.log(`  [${r.id_campo}] ${r.nombre_campo} = ${val}${val.length >= 60 ? '...' : ''}`);
        });
      } else {
        console.log('⚠️ No hay datos en vw_datos_clinicos_portal');
      }
    } catch (e) {
      console.log('Error al consultar datos:', e.message);
    }

    // 4. Contar cuántas atenciones distintas tienen antecedentes
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('4. ESTADÍSTICAS DE ANTECEDENTES EN TODAS LAS ATENCIONES');
    console.log('═══════════════════════════════════════════════════════');
    try {
      const stats = await pool.request().query(`
        SELECT nombre_campo, COUNT(DISTINCT id_atencion) AS total_atenciones
        FROM vw_datos_clinicos_portal
        WHERE nombre_campo LIKE '%antecedente%' 
           OR nombre_campo LIKE '%Antecedente%'
        GROUP BY nombre_campo
        ORDER BY total_atenciones DESC
      `);
      if (stats.recordset.length > 0) {
        stats.recordset.forEach(r => {
          console.log(`  ${r.nombre_campo}: ${r.total_atenciones} atenciones`);
        });
      } else {
        console.log('  ❌ Ningún campo contiene "antecedente" en toda la vista');
      }
    } catch (e) {
      console.log('Error al consultar stats:', e.message);
    }

    // 5. Ver TODAS las vistas disponibles en la base de datos
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('5. TODAS LAS VISTAS EN LA BASE DE DATOS');
    console.log('═══════════════════════════════════════════════════════');
    try {
      const vistas = await pool.request().query(`
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.VIEWS 
        ORDER BY TABLE_NAME
      `);
      vistas.recordset.forEach(r => console.log(`  - ${r.TABLE_NAME}`));
    } catch (e) {
      console.log('Error:', e.message);
    }

  } catch (err) {
    console.error('❌ Error de conexión:', err.message);
  } finally {
    if (pool) await pool.close();
    process.exit(0);
  }
}

inspeccionar();
