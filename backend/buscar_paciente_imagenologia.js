/**
 * SCRIPT DE BÚSQUEDA — Pacientes con órdenes de imagenología en Panacea
 * ─────────────────────────────────────────────────────────────────────
 * Busca en Historia.TM_ORDENES con ID_TIPO_ORDEN = 39 (Imagenología)
 * y también en Imaginologia.TM_ATENCIONES_IMAGINOLOGIA.
 *
 * Ejecución:  node buscar_paciente_imagenologia.js
 * ─────────────────────────────────────────────────────────────────────
 */

require('dotenv').config();
const { panaceaPool } = require('./config/db');

async function main() {
  console.log('\n📡 Conectando a Panacea...');
  const pool = await panaceaPool;

  // ── Método 1: Órdenes con ID_TIPO_ORDEN = 39 (Imagenología) ──────────────
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('📋 Método 1 — Historia.TM_ORDENES  (ID_TIPO_ORDEN = 39)\n');

  const ordResult = await pool.request().query(`
    SELECT TOP 10
      o.ID              AS ID_ORDEN,
      o.ID_ATENCION,
      o.NUMERO_ORDEN,
      o.FECHA_EXPEDICION,
      p.NOMBRE_COMPLETO,
      p.NUMERO_IDENTIFICACION,
      ti.DESCRIPCION    AS TIPO_IDENTIFICACION,
      a.ID_ESTADO,
      ea.DESCRIPCION    AS ESTADO_ATENCION,
      a.FECHA_ATENCION
    FROM Historia.TM_ORDENES o
    JOIN Historia.TM_ATENCIONES a             ON a.ID = o.ID_ATENCION
    JOIN Historia.TR_ESTADOS_ATENCIONES ea    ON ea.ID = a.ID_ESTADO
    JOIN Parametrizacion.TP_PACIENTES p       ON p.ID = o.ID_PACIENTE
    JOIN Parametrizacion.TP_TIPOS_IDENTIFICACION ti ON ti.ID = p.ID_TIPO_IDENTIFICACION
    WHERE o.ID_TIPO_ORDEN = 39
    ORDER BY o.FECHA_EXPEDICION DESC
  `);

  if (ordResult.recordset.length > 0) {
    console.log(`✅ ${ordResult.recordset.length} órdenes de imagenología encontradas:\n`);
    ordResult.recordset.forEach((row, i) => {
      console.log(`  [${i + 1}] ID_ATENCION:   ${row.ID_ATENCION}`);
      console.log(`       ID_ORDEN:      ${row.ID_ORDEN}  (N° ${row.NUMERO_ORDEN || 'sin número'})`);
      console.log(`       Paciente:      ${(row.NOMBRE_COMPLETO || '').trim()}`);
      console.log(`       Documento:     ${row.TIPO_IDENTIFICACION} ${row.NUMERO_IDENTIFICACION}`);
      console.log(`       Estado:        ${row.ESTADO_ATENCION}`);
      console.log(`       Fecha:         ${row.FECHA_EXPEDICION ? row.FECHA_EXPEDICION.toISOString().split('T')[0] : 'N/A'}`);
      console.log('');
    });
  } else {
    console.log('ℹ️  No se encontraron órdenes de imagenología en Historia.TM_ORDENES.');
  }

  // ── Método 2: Atenciones en el módulo Imaginología ────────────────────────
  console.log('══════════════════════════════════════════════════════════');
  console.log('📋 Método 2 — Imaginologia.TM_ATENCIONES_IMAGINOLOGIA\n');

  const imgResult = await pool.request().query(`
    SELECT TOP 10
      img.ID_ATENCION,
      img.FECHA_RESULTADO,
      img.OBSERVACIONES_VALIDACION,
      p.NOMBRE_COMPLETO,
      p.NUMERO_IDENTIFICACION,
      ti.DESCRIPCION    AS TIPO_IDENTIFICACION,
      ea.DESCRIPCION    AS ESTADO_ATENCION,
      a.FECHA_ATENCION
    FROM Imaginologia.TM_ATENCIONES_IMAGINOLOGIA img
    JOIN Historia.TM_ATENCIONES a             ON a.ID = img.ID_ATENCION
    JOIN Historia.TR_ESTADOS_ATENCIONES ea    ON ea.ID = a.ID_ESTADO
    JOIN Parametrizacion.TP_PACIENTES p       ON p.ID = a.ID_PACIENTE
    JOIN Parametrizacion.TP_TIPOS_IDENTIFICACION ti ON ti.ID = p.ID_TIPO_IDENTIFICACION
    ORDER BY img.ULTIMA_MODIFICACION DESC
  `);

  if (imgResult.recordset.length > 0) {
    console.log(`✅ ${imgResult.recordset.length} atenciones en módulo Imaginología encontradas:\n`);
    imgResult.recordset.forEach((row, i) => {
      console.log(`  [${i + 1}] ID_ATENCION:   ${row.ID_ATENCION}`);
      console.log(`       Paciente:      ${(row.NOMBRE_COMPLETO || '').trim()}`);
      console.log(`       Documento:     ${row.TIPO_IDENTIFICACION} ${row.NUMERO_IDENTIFICACION}`);
      console.log(`       Estado:        ${row.ESTADO_ATENCION}`);
      console.log(`       Fecha:         ${row.FECHA_ATENCION ? row.FECHA_ATENCION.toISOString().split('T')[0] : 'N/A'}`);
      if (row.OBSERVACIONES_VALIDACION) {
        console.log(`       Observación:   ${String(row.OBSERVACIONES_VALIDACION).substring(0, 80)}`);
      }
      console.log('');
    });
  } else {
    console.log('ℹ️  No hay registros en Imaginologia.TM_ATENCIONES_IMAGINOLOGIA.\n');
  }
}

main()
  .then(() => {
    console.log('🏁 Búsqueda finalizada.');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ Error:', err.message || err);
    process.exit(1);
  });
