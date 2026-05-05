#!/usr/bin/env node
/**
 * ════════════════════════════════════════════════════════════════════════════
 *  CLI · Envío automatizado de Historia Clínica por correo
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Punto de entrada único usado por los 3 .bat:
 *    • backend/bin/enviar-historia-single.bat       (--modo single)
 *    • backend/bin/enviar-historia-bulk.bat         (--modo csv)
 *    • backend/bin/enviar-historia-programado.bat   (--modo programado)
 *
 *  Modos:
 *    1) single      → un paciente puntual
 *       --tipo CC --doc 12345 [--atencion 359695] [--forzar]
 *
 *    2) csv         → procesa un CSV con columnas
 *                       tipo_documento,numero_documento[,id_atencion]
 *       --archivo ruta/al/archivo.csv [--forzar]
 *
 *    3) programado  → busca atenciones cerradas no enviadas desde --desde
 *       --desde 2026-05-01 [--max 200]
 *
 *  Códigos de salida:
 *      0  → todo OK
 *      1  → argumentos inválidos
 *      2  → error fatal de conexión / configuración
 *      3  → procesamiento parcial (al menos un fallo, otros enviados)
 * ════════════════════════════════════════════════════════════════════════════
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const pLimit = require('p-limit');

const EnvioService = require('../services/envio.historia.service');
const { verifyTransporter } = require('../config/mailer');
const { testConnection } = require('../config/db');
const PdfService = require('../services/pdf.service');

// ── Parser mínimo de argumentos (--clave valor | --flag) ────────────────────
function parseArgs(argv) {
  const out = {};
  const arr = argv.slice(2);
  for (let i = 0; i < arr.length; i++) {
    const a = arr[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = arr[i + 1];
      if (next == null || next.startsWith('--')) {
        out[key] = true;
      } else {
        out[key] = next;
        i++;
      }
    }
  }
  return out;
}

// ── Logger a consola + archivo ──────────────────────────────────────────────
function abrirLogger() {
  const dir = path.resolve(__dirname, '..', 'logs');
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) { /* noop */ }
  const fecha = new Date().toISOString().slice(0, 10);
  const file = path.join(dir, `envios-${fecha}.log`);
  const stream = fs.createWriteStream(file, { flags: 'a' });

  function fmt(...args) {
    return args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  }

  return {
    file,
    info: (...args) => {
      const linea = `[${new Date().toISOString()}] [INFO] ${fmt(...args)}`;
      console.log(linea);
      stream.write(linea + '\n');
    },
    warn: (...args) => {
      const linea = `[${new Date().toISOString()}] [WARN] ${fmt(...args)}`;
      console.warn(linea);
      stream.write(linea + '\n');
    },
    error: (...args) => {
      const linea = `[${new Date().toISOString()}] [ERR ] ${fmt(...args)}`;
      console.error(linea);
      stream.write(linea + '\n');
    },
    cerrar: () => new Promise((resolve) => stream.end(resolve)),
  };
}

// ── Lectura de CSV simple (sin dependencias) ────────────────────────────────
function leerCsv(rutaArchivo) {
  if (!fs.existsSync(rutaArchivo)) {
    throw new Error(`No se encuentra el archivo CSV: ${rutaArchivo}`);
  }
  const contenido = fs.readFileSync(rutaArchivo, 'utf8').replace(/^\uFEFF/, '');
  const lineas = contenido.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lineas.length === 0) return [];

  // Detectar si la primera línea es encabezado
  const primera = lineas[0].toLowerCase();
  const tieneEncabezado = primera.includes('tipo') && primera.includes('numero');
  const filas = tieneEncabezado ? lineas.slice(1) : lineas;

  const registros = [];
  for (let i = 0; i < filas.length; i++) {
    const cols = filas[i].split(/[,;\t]/).map(c => c.trim().replace(/^"|"$/g, ''));
    if (cols.length < 2) continue;
    registros.push({
      tipo_documento: cols[0],
      numero_documento: cols[1],
      idAtencion: cols[2] && cols[2].length ? cols[2] : null,
    });
  }
  return registros;
}

// ── Modos ───────────────────────────────────────────────────────────────────
async function modoSingle(args, log) {
  const tipo = (args.tipo || args.t || '').toString().trim().toUpperCase();
  const doc = (args.doc || args.d || '').toString().trim();
  const atencion = args.atencion || args.a || null;
  const forzar = !!args.forzar;

  if (!tipo || !doc) {
    log.error('Faltan argumentos: --tipo CC --doc 12345 [--atencion 359695]');
    return { exit: 1, total: 0, ok: 0, err: 0 };
  }

  log.info(`Modo SINGLE → tipo=${tipo} doc=${doc} atencion=${atencion || '(última cerrada)'}`);
  const r = await EnvioService.enviarHistoria({
    tipo_documento: tipo,
    numero_documento: doc,
    idAtencion: atencion,
    fuente: 'manual',
    forzar,
  });

  if (r.ok && r.omitido) {
    log.warn(`OMITIDO atención=${r.idAtencion} → ${r.error}`);
    return { exit: 0, total: 1, ok: 1, err: 0, omitidos: 1 };
  }
  if (r.ok) {
    log.info(`OK atención=${r.idAtencion} → ${r.destino}`);
    return { exit: 0, total: 1, ok: 1, err: 0 };
  }
  log.error(`ERROR atención=${r.idAtencion || '?'} → ${r.error}`);
  return { exit: 3, total: 1, ok: 0, err: 1 };
}

async function modoCsv(args, log) {
  const archivo = args.archivo || args.f;
  if (!archivo) {
    log.error('Falta argumento: --archivo ruta/al/archivo.csv');
    return { exit: 1, total: 0, ok: 0, err: 0 };
  }
  const ruta = path.resolve(archivo);
  let registros;
  try {
    registros = leerCsv(ruta);
  } catch (err) {
    log.error(`No se pudo leer CSV: ${err.message}`);
    return { exit: 1, total: 0, ok: 0, err: 0 };
  }

  log.info(`Modo CSV → archivo=${ruta} registros=${registros.length}`);
  if (registros.length === 0) {
    log.warn('CSV vacío, nada que enviar');
    return { exit: 0, total: 0, ok: 0, err: 0 };
  }

  const concurrencia = parseInt(process.env.ENVIO_CONCURRENCIA, 10) || 3;
  const limit = pLimit(concurrencia);
  const forzar = !!args.forzar;

  let ok = 0, err = 0, omitidos = 0;
  const tareas = registros.map((r, idx) =>
    limit(async () => {
      const tipo = (r.tipo_documento || '').toUpperCase();
      const doc = r.numero_documento;
      try {
        const res = await EnvioService.enviarHistoria({
          tipo_documento: tipo,
          numero_documento: doc,
          idAtencion: r.idAtencion,
          fuente: 'csv',
          forzar,
        });
        if (res.ok && res.omitido) {
          omitidos++;
          log.warn(`[${idx + 1}/${registros.length}] OMITIDO ${tipo}-${doc} atención=${res.idAtencion} → ${res.error}`);
        } else if (res.ok) {
          ok++;
          log.info(`[${idx + 1}/${registros.length}] OK ${tipo}-${doc} atención=${res.idAtencion} → ${res.destino}`);
        } else {
          err++;
          log.error(`[${idx + 1}/${registros.length}] ERROR ${tipo}-${doc} → ${res.error}`);
        }
      } catch (e) {
        err++;
        log.error(`[${idx + 1}/${registros.length}] EXCEPCIÓN ${tipo}-${doc}: ${e.message}`);
      }
    })
  );
  await Promise.all(tareas);

  log.info(`Resumen CSV → total=${registros.length} ok=${ok} omitidos=${omitidos} err=${err}`);
  return {
    exit: err > 0 ? 3 : 0,
    total: registros.length, ok, err, omitidos,
  };
}

async function modoProgramado(args, log) {
  const desdeRaw = args.desde;
  if (!desdeRaw) {
    log.error('Falta argumento: --desde 2026-05-01');
    return { exit: 1, total: 0, ok: 0, err: 0 };
  }
  const desde = new Date(desdeRaw);
  if (isNaN(desde.getTime())) {
    log.error(`Fecha inválida en --desde: ${desdeRaw}`);
    return { exit: 1, total: 0, ok: 0, err: 0 };
  }
  const max = parseInt(args.max, 10) || parseInt(process.env.ENVIO_MAX_PROGRAMADO, 10) || 200;

  log.info(`Modo PROGRAMADO → desde=${desde.toISOString()} max=${max}`);
  let pendientes;
  try {
    pendientes = await EnvioService.listarPendientes({ desde, max });
  } catch (e) {
    log.error(`No se pudieron listar atenciones pendientes: ${e.message}`);
    return { exit: 2, total: 0, ok: 0, err: 0 };
  }
  log.info(`Atenciones pendientes detectadas: ${pendientes.length}`);
  if (pendientes.length === 0) return { exit: 0, total: 0, ok: 0, err: 0 };

  const concurrencia = parseInt(process.env.ENVIO_CONCURRENCIA, 10) || 3;
  const limit = pLimit(concurrencia);

  let ok = 0, err = 0, omitidos = 0;
  const tareas = pendientes.map((p, idx) =>
    limit(async () => {
      try {
        const res = await EnvioService.enviarHistoria({
          tipo_documento: p.tipo_documento,
          numero_documento: p.numero_documento,
          idAtencion: p.idAtencion,
          fuente: 'programado',
        });
        if (res.ok && res.omitido) {
          omitidos++;
          log.warn(`[${idx + 1}/${pendientes.length}] OMITIDO atención=${p.idAtencion} → ${res.error}`);
        } else if (res.ok) {
          ok++;
          log.info(`[${idx + 1}/${pendientes.length}] OK atención=${p.idAtencion} → ${res.destino}`);
        } else {
          err++;
          log.error(`[${idx + 1}/${pendientes.length}] ERROR atención=${p.idAtencion} → ${res.error}`);
        }
      } catch (e) {
        err++;
        log.error(`[${idx + 1}/${pendientes.length}] EXCEPCIÓN atención=${p.idAtencion}: ${e.message}`);
      }
    })
  );
  await Promise.all(tareas);

  log.info(`Resumen PROGRAMADO → total=${pendientes.length} ok=${ok} omitidos=${omitidos} err=${err}`);
  return {
    exit: err > 0 ? 3 : 0,
    total: pendientes.length, ok, err, omitidos,
  };
}

// ── Main ────────────────────────────────────────────────────────────────────
function uso() {
  console.log(`Uso:
  node cli/enviar-historia.js --modo single --tipo CC --doc 12345 [--atencion 359695] [--forzar]
  node cli/enviar-historia.js --modo csv --archivo ruta/pacientes.csv [--forzar]
  node cli/enviar-historia.js --modo programado --desde 2026-05-01 [--max 200]
`);
}

(async () => {
  const args = parseArgs(process.argv);
  const modo = (args.modo || args.m || '').toString().toLowerCase();

  if (!modo) {
    uso();
    process.exit(1);
  }

  const log = abrirLogger();
  log.info(`============================================================`);
  log.info(`Iniciando envío automatizado de historias clínicas | modo=${modo}`);
  log.info(`Log: ${log.file}`);

  // ── Verificación de infraestructura ──────────────────────────────────────
  try {
    await testConnection();
    await verifyTransporter();
  } catch (err) {
    log.error(`Falla de infraestructura: ${err.message}`);
    await log.cerrar();
    process.exit(2);
  }

  let resultado;
  try {
    if (modo === 'single') resultado = await modoSingle(args, log);
    else if (modo === 'csv') resultado = await modoCsv(args, log);
    else if (modo === 'programado') resultado = await modoProgramado(args, log);
    else {
      log.error(`Modo desconocido: ${modo}`);
      uso();
      resultado = { exit: 1 };
    }
  } catch (err) {
    log.error(`Error fatal en ejecución: ${err.message}`);
    log.error(err.stack || '');
    resultado = { exit: 2 };
  } finally {
    try { await PdfService.cerrarBrowser(); } catch (_) { /* noop */ }
  }

  log.info(`Finalizado con exit=${resultado.exit}`);
  await log.cerrar();
  process.exit(resultado.exit);
})();
