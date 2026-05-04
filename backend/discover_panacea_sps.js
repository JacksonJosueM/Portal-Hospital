/**
 * ════════════════════════════════════════════════════════════════════════════
 *  DESCUBRIMIENTO DE STORED PROCEDURES DE PANACEA
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Ejecuta exactamente la misma secuencia de SPs que la traza de Panacea
 *  (impresión de la atención 359695) y vuelca los recordsets a:
 *
 *      backend/panacea_sp_schemas.json
 *
 *  Este archivo es el "contrato" sobre el que se construyen los wrappers,
 *  el orquestador y el motor de render. Sin esto no se conoce qué columnas
 *  devuelve cada SP.
 *
 *  Uso:
 *      cd backend
 *      node discover_panacea_sps.js
 *
 *  Variables de entorno necesarias (en backend/.env):
 *      PANACEA_DB_SERVER, PANACEA_DB_NAME (=PANACEA), PANACEA_DB_USER,
 *      PANACEA_DB_PASSWORD, PANACEA_DB_PORT
 *      PANACEA_DB_USUARIO_AUDIT  (ej: 'Portal_Pacientes')
 *      PANACEA_DB_IP_ORIGEN      (ej: '10.10.0.20')
 *      PANACEA_ID_IPS            (ej: 21)
 *
 *  IDs de prueba (los mismos de la traza original):
 *      ID_ATENCION = 359695
 *      ID_PACIENTE = 91096
 *      ID_PRESTADOR = 2021
 *      ID_ESPECIALIDAD = 89
 *      ID_PROCEDIMIENTO = 4353
 *      ID_LEGALIZACION_PROC = 351188
 *      ID_PLANTILLA = 572 (se descubre dinámicamente desde STM_ATENCIONES)
 *      ID_SEDE = 1
 * ════════════════════════════════════════════════════════════════════════════
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const TEST = {
  ID_ATENCION: 359695,
  ID_PACIENTE: 91096,
  ID_PRESTADOR: 2021,
  ID_ESPECIALIDAD: 89,
  ID_PROCEDIMIENTO: 4353,
  ID_LEGALIZACION_PROC: 351188,
  ID_AUTORIZACION: 0,
  ID_ADMISION: 0,
  ID_AIU: 0,
  ID_CONVENIO: 0,
  ID_SEDE: 1,
  ID_TIPO_RANGOS: [2, 3, 5, 4, 6, 7, 8, 9, 10, 14],
};

const ID_IPS = parseInt(process.env.PANACEA_ID_IPS || '21', 10);
const USUARIO_AUDIT = process.env.PANACEA_DB_USUARIO_AUDIT || 'Portal_Pacientes';
const IP_ORIGEN = process.env.PANACEA_DB_IP_ORIGEN || '10.10.0.20';

const dbConfig = {
  server: process.env.PANACEA_DB_SERVER || process.env.DB_SERVER || 'localhost',
  database: process.env.PANACEA_DB_NAME || 'PANACEA',
  user: process.env.PANACEA_DB_USER || process.env.DB_USER,
  password: process.env.PANACEA_DB_PASSWORD || process.env.DB_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true },
  port: parseInt(process.env.PANACEA_DB_PORT || process.env.DB_PORT || '1433', 10),
  requestTimeout: 60000,
  connectionTimeout: 30000,
};

const out = {};

function snapshot(name, recordsetsOrSingle) {
  const recordsets = Array.isArray(recordsetsOrSingle) ? recordsetsOrSingle : [recordsetsOrSingle];
  out[name] = recordsets.map((rs) => {
    if (!rs || rs.length === 0) {
      return { columns: [], rowCount: 0, sample: null };
    }
    const columns = Object.keys(rs[0]).map((col) => ({
      name: col,
      jsType: typeof rs[0][col],
      sampleValue: rs[0][col] instanceof Date ? rs[0][col].toISOString() : rs[0][col],
    }));
    return { columns, rowCount: rs.length, sample: rs[0] };
  });
}

function logErr(name, err) {
  out[name] = { error: err.message, code: err.code, number: err.number };
  console.warn(`  ⚠️  ${name}: ${err.message}`);
}

function applyAudit(req, operacion) {
  return req
    .input('Usuario', sql.VarChar(100), USUARIO_AUDIT)
    .input('IP_Origen', sql.VarChar(50), IP_ORIGEN)
    .input('Timestamp', sql.VarBinary, null)
    .input('Operacion', sql.SmallInt, operacion);
}

async function safeExec(label, fn) {
  process.stdout.write(`  • ${label} ... `);
  try {
    const result = await fn();
    snapshot(label, result.recordsets || result.recordset || []);
    console.log('OK');
  } catch (err) {
    logErr(label, err);
  }
}

async function main() {
  console.log('🔌 Conectando a', dbConfig.server, '/', dbConfig.database, 'como', dbConfig.user);
  const pool = await sql.connect(dbConfig);
  console.log('✅ Conectado.\n');

  console.log('▶ Auditoría / parámetros');

  await safeExec('Historia.STP_PARAMETROS_IMPRESION (Op=4)', async () => {
    const r = applyAudit(pool.request(), 4)
      .input('ID', sql.SmallInt, null)
      .input('TAMANIO_FUENTE', sql.SmallInt, null)
      .input('ID_FUENTE', sql.SmallInt, null)
      .input('MARGEN_SUPERIOR', sql.SmallInt, null)
      .input('MARGEN_INFERIOR', sql.SmallInt, null)
      .input('MARGEN_DERECHO', sql.SmallInt, null)
      .input('MARGEN_IZQUIERDO', sql.SmallInt, null)
      .input('INTERLINEADO', sql.SmallInt, null)
      .input('PAPEL_HISTORIA', sql.SmallInt, null)
      .input('PAPEL_ORDEN', sql.SmallInt, null)
      .input('ID_IPS', sql.SmallInt, ID_IPS);
    return r.execute('Historia.STP_PARAMETROS_IMPRESION');
  });

  console.log('\n▶ Atención');

  await safeExec('Historia.STM_ATENCIONES (Op=3)', async () => {
    const r = applyAudit(pool.request(), 3).input('ID', sql.BigInt, TEST.ID_ATENCION);
    return r.execute('Historia.STM_ATENCIONES');
  });

  await safeExec('Historia.STM_ATENCIONES_BASICO (Op=5)', async () => {
    const r = applyAudit(pool.request(), 5)
      .input('ID_ATENCION', sql.BigInt, TEST.ID_ATENCION)
      .input('FECHA_REGISTRO', sql.DateTime, null)
      .input('FECHA_ATENCION', sql.DateTime, null)
      .input('UBICACION', sql.VarChar(100), null)
      .input('ID_IPS', sql.SmallInt, null);
    return r.execute('Historia.STM_ATENCIONES_BASICO');
  });

  await safeExec('Historia.STM_ATENCIONES_BASICO (Op=3)', async () => {
    const r = applyAudit(pool.request(), 3)
      .input('ID_ATENCION', sql.BigInt, TEST.ID_ATENCION)
      .input('FECHA_REGISTRO', sql.DateTime, null)
      .input('FECHA_ATENCION', sql.DateTime, null)
      .input('UBICACION', sql.VarChar(100), null)
      .input('ID_IPS', sql.SmallInt, null);
    return r.execute('Historia.STM_ATENCIONES_BASICO');
  });

  await safeExec('Historia.QRY_CONSULTA_ATENCIONES (Op=5)', async () =>
    pool.request().input('ID_SEDE', sql.SmallInt, TEST.ID_SEDE).input('OPERACION', sql.SmallInt, 5).execute('Historia.QRY_CONSULTA_ATENCIONES')
  );

  await safeExec('Historia.QRY_POBLAR_TOKEN_ATENCION', async () =>
    pool.request()
      .input('ID_PACIENTE', sql.BigInt, TEST.ID_PACIENTE)
      .input('ID_PRESTADOR', sql.Int, TEST.ID_PRESTADOR)
      .input('ID_ESPECIALIDAD', sql.Int, TEST.ID_ESPECIALIDAD)
      .input('ID_PROCEDIMIENTO', sql.Int, TEST.ID_PROCEDIMIENTO)
      .input('ID_LEGALIZACION_PROC', sql.BigInt, TEST.ID_LEGALIZACION_PROC)
      .input('ID_AUTORIZACION', sql.BigInt, TEST.ID_AUTORIZACION)
      .input('ID_ADMISION', sql.BigInt, TEST.ID_ADMISION)
      .input('ID_AIU', sql.BigInt, TEST.ID_AIU)
      .input('ID_ATENCION', sql.BigInt, TEST.ID_ATENCION)
      .input('ID_CONVENIO', sql.Int, TEST.ID_CONVENIO)
      .input('OPERACION', sql.SmallInt, 1)
      .input('IMPRIME_RESULTADO', sql.SmallInt, 0)
      .execute('Historia.QRY_POBLAR_TOKEN_ATENCION')
  );

  // ── Descubrir id_plantilla y id_ips desde la atención
  let idPlantilla = 572;
  let idIps = ID_IPS;
  try {
    const aten = out['Historia.STM_ATENCIONES (Op=3)'];
    const sample = aten && aten[0] && aten[0].sample;
    if (sample) {
      if (sample.ID_PLANTILLA != null) idPlantilla = sample.ID_PLANTILLA;
      if (sample.ID_IPS != null) idIps = sample.ID_IPS;
    }
  } catch (_) {}

  console.log(`\n▶ Plantilla (id=${idPlantilla})`);

  await safeExec('Dinamico.STP_PLANTILLAS (Op=3)', async () => {
    const r = applyAudit(pool.request(), 3).input('ID', sql.Int, idPlantilla);
    return r.execute('Dinamico.STP_PLANTILLAS');
  });

  await safeExec('Dinamico.QRY_ESTRUCTURA_PLANA_PLANTILLA (Op=0)', async () =>
    pool.request().input('ID_PLANTILLA', sql.Int, idPlantilla).input('OPERACION', sql.SmallInt, 0).execute('Dinamico.QRY_ESTRUCTURA_PLANA_PLANTILLA')
  );

  console.log('\n▶ IPS / Sede');

  await safeExec('Parametrizacion.STP_SEDES (Op=13)', async () =>
    pool.request().input('ID', sql.SmallInt, TEST.ID_SEDE).input('OPERACION', sql.SmallInt, 13).execute('Parametrizacion.STP_SEDES')
  );

  await safeExec('Parametrizacion.STP_IPS (Op=3)', async () => {
    const r = applyAudit(pool.request(), 3).input('ID', sql.SmallInt, idIps);
    return r.execute('Parametrizacion.STP_IPS');
  });

  await safeExec('Parametrizacion.QRY_PRIMER_LOGO_IPS', async () =>
    pool.request().input('ID_IPS', sql.SmallInt, idIps).execute('Parametrizacion.QRY_PRIMER_LOGO_IPS')
  );

  console.log('\n▶ Catálogos clínicos');

  await safeExec('Historia.STM_PACIENTE_ALERGIAS (Op=4)', async () => {
    const r = applyAudit(pool.request(), 4)
      .input('ID', sql.BigInt, null)
      .input('ID_ATENCION', sql.BigInt, null)
      .input('ID_PACIENTE', sql.BigInt, TEST.ID_PACIENTE)
      .input('ID_TIPO_ALERGIA', sql.SmallInt, null)
      .input('ID_PRINCIPIO_ACTIVO', sql.Int, null)
      .input('ID_ARTICULO_ALIMENTO', sql.Int, null)
      .input('ID_MENU_PLATO', sql.Int, null)
      .input('ID_OTRA_ALERGIA', sql.Int, null)
      .input('CODIGO', sql.VarChar(50), null)
      .input('NOMBRE', sql.VarChar(200), null)
      .input('ADICION', sql.VarChar(500), null)
      .input('ESTADO', sql.SmallInt, null)
      .input('FECHA_REGISTRO', sql.DateTime, null)
      .input('ID_IPS', sql.SmallInt, idIps);
    return r.execute('Historia.STM_PACIENTE_ALERGIAS');
  });

  await safeExec('Historia.STM_PACIENTE_ANTECEDENTES (Op=7)', async () => {
    const r = applyAudit(pool.request(), 7)
      .input('ID', sql.BigInt, null)
      .input('ID_ATENCION', sql.BigInt, null)
      .input('ID_PACIENTE', sql.BigInt, TEST.ID_PACIENTE)
      .input('ANTECEDENTE', sql.VarChar(sql.MAX), null)
      .input('FECHA_REGISTRO', sql.DateTime, null)
      .input('ID_DATO', sql.Int, null)
      .input('ESTADO', sql.SmallInt, null)
      .input('ID_IPS', sql.SmallInt, idIps)
      .input('JUSTIFICACION', sql.VarChar(sql.MAX), null)
      .input('FECHA_INACTIVACION', sql.DateTime, null);
    return r.execute('Historia.STM_PACIENTE_ANTECEDENTES');
  });

  await safeExec('Historia.STM_DATOS_DIAGNOSTICOS (Op=4)', async () => {
    const r = applyAudit(pool.request(), 4)
      .input('ID', sql.BigInt, null)
      .input('ID_ATENCION', sql.BigInt, TEST.ID_ATENCION);
    return r.execute('Historia.STM_DATOS_DIAGNOSTICOS');
  });

  await safeExec('Historia.STM_DATOS_SINTOMAS (Op=4)', async () => {
    const r = applyAudit(pool.request(), 4)
      .input('ID', sql.BigInt, null)
      .input('ID_ATENCION', sql.BigInt, TEST.ID_ATENCION);
    return r.execute('Historia.STM_DATOS_SINTOMAS');
  });

  console.log('\n▶ Datos por tipo');

  for (const tabla of ['STM_DATOS_DECIMAL', 'STM_DATOS_ENTEROS', 'STM_DATOS_TEXTO', 'STM_DATOS_FECHA']) {
    await safeExec(`Historia.${tabla} (Op=4)`, async () => {
      const r = applyAudit(pool.request(), 4)
        .input('ID', sql.BigInt, null)
        .input('ID_ATENCION', sql.BigInt, TEST.ID_ATENCION);
      return r.execute(`Historia.${tabla}`);
    });
  }

  await safeExec('Historia.STM_DATOS_LISTA (Op=4)', async () => {
    const r = applyAudit(pool.request(), 4)
      .input('ID', sql.BigInt, null)
      .input('ID_ATENCION', sql.BigInt, TEST.ID_ATENCION);
    return r.execute('Historia.STM_DATOS_LISTA');
  });

  await safeExec('Historia.STM_DATOS_TABLA (Op=7)', async () => {
    const r = applyAudit(pool.request(), 7)
      .input('ID', sql.BigInt, null)
      .input('ID_ATENCION', sql.BigInt, TEST.ID_ATENCION);
    return r.execute('Historia.STM_DATOS_TABLA');
  });

  await safeExec('Laboratorio.STM_DATOS_TEXTO (Op=4)', async () => {
    const r = applyAudit(pool.request(), 4)
      .input('ID', sql.BigInt, null)
      .input('ID_ATENCION', sql.BigInt, TEST.ID_ATENCION);
    return r.execute('Laboratorio.STM_DATOS_TEXTO');
  });

  console.log('\n▶ Metadatos por id_dato (muestra: 51, 17, 373, 374, 4)');

  for (const idDato of [51, 17, 373, 374, 4]) {
    await safeExec(`Dinamico.STP_DATOS (Op=3, id_dato=${idDato})`, async () => {
      const r = applyAudit(pool.request(), 3).input('ID', sql.Int, idDato);
      return r.execute('Dinamico.STP_DATOS');
    });
  }

  await safeExec('Dinamico.STP_DATOS_CAMPOS_TABLAS (Op=4, id_dato=51)', async () => {
    const r = applyAudit(pool.request(), 4)
      .input('ID', sql.Int, null)
      .input('ID_DATO', sql.Int, 51);
    return r.execute('Dinamico.STP_DATOS_CAMPOS_TABLAS');
  });

  await safeExec('Dinamico.STP_DATOS_IMAGENES (Op=4, id_dato=51)', async () => {
    const r = applyAudit(pool.request(), 4)
      .input('ID', sql.SmallInt, null)
      .input('ID_DATO', sql.Int, 51);
    return r.execute('Dinamico.STP_DATOS_IMAGENES');
  });

  await safeExec('Dinamico.STP_DATOS_VALORES (Op=4, id_dato=51)', async () => {
    const r = applyAudit(pool.request(), 4)
      .input('ID', sql.SmallInt, null)
      .input('ID_DATO', sql.Int, 51);
    return r.execute('Dinamico.STP_DATOS_VALORES');
  });

  await safeExec('Dinamico.STP_RANGOS_HISTORIA (Op=6, id_dato=51, tipo=2)', async () =>
    pool.request()
      .input('ID', sql.Int, null)
      .input('ID_TIPO_ORIGEN', sql.SmallInt, 1)
      .input('ID_ORIGEN', sql.Int, 51)
      .input('ID_TIPO_RANGO', sql.SmallInt, 2)
      .input('ID_TIPO_ATENCION', sql.SmallInt, null)
      .input('CONDICION', sql.VarChar(sql.MAX), null)
      .input('Usuario', sql.VarChar(100), USUARIO_AUDIT)
      .input('IP_Origen', sql.VarChar(50), IP_ORIGEN)
      .input('Timestamp', sql.VarBinary, null)
      .input('Operacion', sql.SmallInt, 6)
      .execute('Dinamico.STP_RANGOS_HISTORIA')
  );

  console.log('\n▶ Extras');

  await safeExec('Historia.STM_CALCULOS_RIESGO (Op=4)', async () => {
    const r = applyAudit(pool.request(), 4)
      .input('ID', sql.BigInt, null)
      .input('ID_ATENCION', sql.BigInt, TEST.ID_ATENCION);
    return r.execute('Historia.STM_CALCULOS_RIESGO');
  });

  await safeExec('Historia.QRY_ORDENES_IMPRESION (Op=0)', async () =>
    pool.request().input('ID_ATENCION', sql.BigInt, TEST.ID_ATENCION).input('OPERACION', sql.SmallInt, 0).execute('Historia.QRY_ORDENES_IMPRESION')
  );

  await safeExec('Historia.STM_ATENCION_NOTAS (Op=4)', async () => {
    const r = applyAudit(pool.request(), 4)
      .input('ID', sql.BigInt, null)
      .input('ID_ATENCION', sql.BigInt, TEST.ID_ATENCION);
    return r.execute('Historia.STM_ATENCION_NOTAS');
  });

  await safeExec('Historia.STM_GRAFICA_IMAGEN_ATENCION (Op=4)', async () => {
    const r = applyAudit(pool.request(), 4)
      .input('ID', sql.BigInt, null)
      .input('ID_ATENCION', sql.BigInt, TEST.ID_ATENCION)
      .input('ID_GRAFICA', sql.BigInt, null)
      .input('ID_PACIENTE', sql.BigInt, null)
      .input('GRAFICA_BYTES', sql.VarBinary(sql.MAX), null)
      .input('NOMBRE', sql.VarChar(200), null)
      .input('TIPO_MIME', sql.VarChar(100), null)
      .input('ID_IPS', sql.SmallInt, null);
    return r.execute('Historia.STM_GRAFICA_IMAGEN_ATENCION');
  });

  await safeExec('Odontologia.STM_TRATAMIENTOS (Op=12)', async () =>
    pool.request().input('ID_ATENCION_INICIAL', sql.BigInt, TEST.ID_ATENCION).input('OPERACION', sql.SmallInt, 12).execute('Odontologia.STM_TRATAMIENTOS')
  );

  await safeExec('Historia.QRY_IMPRIME_FORMULACION_MEDICA (Op=1)', async () =>
    pool.request().input('ID_ATENCION', sql.BigInt, TEST.ID_ATENCION).input('OPERACION', sql.SmallInt, 1).execute('Historia.QRY_IMPRIME_FORMULACION_MEDICA')
  );

  console.log('\n▶ Misc');

  await safeExec('Administracion.QRY_MODULOS_FUNCIONALES', async () =>
    pool.request().input('ID_MODULO_FUNCIONAL', sql.SmallInt, 8).execute('Administracion.QRY_MODULOS_FUNCIONALES')
  );

  // ── Profesional: descubrir USER_NAME desde la atención
  let userName = 'panacea';
  try {
    const aten = out['Historia.STM_ATENCIONES (Op=3)'];
    const sample = aten && aten[0] && aten[0].sample;
    if (sample && sample.USER_NAME) userName = sample.USER_NAME;
  } catch (_) {}

  console.log(`\n▶ Profesional (USER_NAME="${userName}")`);

  await safeExec('Administracion.STP_USUARIOS (Op=3)', async () => {
    const r = applyAudit(pool.request(), 3).input('USER_NAME', sql.VarChar(50), userName);
    return r.execute('Administracion.STP_USUARIOS');
  });

  await safeExec('Administracion.STP_USUARIO_IMAGENES (Op=4)', async () => {
    const r = applyAudit(pool.request(), 4)
      .input('ID', sql.Int, null)
      .input('ID_USUARIO', sql.VarChar(50), userName);
    return r.execute('Administracion.STP_USUARIO_IMAGENES');
  });

  // ── Volcar resultados
  const outPath = path.join(__dirname, 'panacea_sp_schemas.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
  console.log(`\n📦 Esquemas escritos en ${outPath}`);

  await pool.close();
}

main().catch((err) => {
  console.error('\n💥 Error fatal:', err);
  process.exit(1);
});
