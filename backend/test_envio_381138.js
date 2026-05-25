/**
 * ⚠️  SCRIPT TEMPORAL DE PRUEBA DE ENVÍO — NO ES PARTE DEL SISTEMA
 * ─────────────────────────────────────────────────────────────────
 *  Envía el correo completo de la atención 381138 (JULIAN VASCO MUÑOZ)
 *  directamente a un correo de prueba que tú defines abajo.
 *
 *  ✅ Genera los PDFs reales (Historia, Órdenes, Fórmula)
 *  ✅ Los cifra con el documento del paciente como contraseña
 *  ✅ Los envía por correo a CORREO_DESTINO_PRUEBA
 *  ⚠️  Registra la auditoría en la BD (forzar=true para reenvíos)
 *
 *  Ejecución:  node test_envio_381138.js
 *  (Borra este archivo cuando termines la prueba)
 * ─────────────────────────────────────────────────────────────────
 */

require('dotenv').config();

// ══════════════════════════════════════════════════════
//  ✏️  CONFIGURA AQUÍ ANTES DE EJECUTAR
// ══════════════════════════════════════════════════════
const ID_ATENCION        = 57552;
const NUMERO_DOCUMENTO   = '5369102';   // número de documento del paciente
const TIPO_DOCUMENTO     = 'AUTO';   // CC, TI, CE, etc. o 'AUTO'
const CORREO_DESTINO_PRUEBA = null;  // ← pon tu correo aquí: 'tucorreo@gmail.com'
                                     //   null = usa el correo que tiene el paciente en la BD
const FORZAR_REENVIO     = true;     // true = envía aunque ya haya sido enviado antes
// ══════════════════════════════════════════════════════

const { portalPool, panaceaPool, sql } = require('./config/db');
const HistoriaPrintService = require('./services/historia.print.service');
const HistoriaSP = require('./services/panacea/historiaSP');
const pLimit = require('p-limit');
const { renderHtml, clasificarTodasLasOrdenes, renderHtmlOrdenPorTipo, renderHtmlFormula, renderHtmlIncapacidades } = require('./services/plantilla.render');
const PdfService  = require('./services/pdf.service');
const PdfEncrypt  = require('./services/pdf.encrypt');
const MailService = require('./services/mail.service');

function nombreParaArchivo(nombreCompleto) {
  return String(nombreCompleto || 'PACIENTE')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, '').trim()
    .replace(/\s+/g, '_').toUpperCase().substring(0, 50);
}

function tieneRegistros(recordsets) {
  if (!recordsets || !Array.isArray(recordsets)) return false;
  return recordsets.some(rs => Array.isArray(rs) && rs.length > 0);
}

async function obtenerPacienteDeAtencion(idAtencion) {
  // Busca el paciente directamente por el id_atencion en la vista del portal
  const p = await portalPool;
  const r = await p.request()
    .input('id_atencion', sql.BigInt, idAtencion)
    .query(`
      SELECT TOP 1
        pac.id_paciente,
        pac.NOMBRE_COMPLETO,
        pac.numero_documento,
        pac.email,
        pac.tipo_documento
      FROM vw_atenciones_portal a
      INNER JOIN vw_pacientes_portal pac ON pac.id_paciente = a.id_paciente
      WHERE a.id_atencion = @id_atencion
    `);
  return r.recordset[0];
}

async function main() {
  console.log('\n🏥 ══════════════════════════════════════════════════════════════════');
  console.log(`📧  PRUEBA ENVÍO COMPLETO — ID ATENCIÓN: ${ID_ATENCION}`);
  console.log('🏥 ══════════════════════════════════════════════════════════════════\n');

  // ── Paso 1: Obtener datos del paciente ──────────────────────────────────
  console.log('🔍 Buscando paciente de la atención...');
  let paciente;
  try {
    paciente = await obtenerPacienteDeAtencion(ID_ATENCION);
  } catch (err) {
    console.error('❌ Error buscando paciente:', err.message);
    process.exit(1);
  }

  if (!paciente) {
    console.error('❌ No se encontró el paciente para esta atención en la BD del portal.');
    process.exit(1);
  }

  // Sobreescribir correo destino si se definió uno de prueba
  const correoFinal = CORREO_DESTINO_PRUEBA || paciente.email;

  console.log(`✅ Paciente encontrado:`);
  console.log(`   Nombre    : ${paciente.NOMBRE_COMPLETO}`);
  console.log(`   Documento : ${paciente.numero_documento}`);
  console.log(`   Correo BD : ${paciente.email || '(sin correo en BD)'}`);
  console.log(`   Correo destino PRUEBA: ${correoFinal}`);

  if (!correoFinal) {
    console.error('\n❌ No hay correo destino.');
    console.error('   → El paciente no tiene correo en la BD y CORREO_DESTINO_PRUEBA es null.');
    console.error('   → Edita el script y pon un correo en CORREO_DESTINO_PRUEBA.');
    process.exit(1);
  }

  // ── Paso 2: Obtener todos los datos de la atención ──────────────────────
  console.log('\n📄 Consultando datos completos de la atención en Panacea...');
  let payload;
  try {
    payload = await HistoriaPrintService.imprimirAtencion(ID_ATENCION, {
      registrarCopia: false,  // no registrar copia impresa en esta prueba
      numeroCopias: 0,
    });
  } catch (err) {
    console.error('❌ Error obteniendo datos de la atención:', err.message);
    process.exit(1);
  }
  console.log('✅ Datos de atención obtenidos correctamente.');

  // ── Paso 3: Generar PDFs ────────────────────────────────────────────────
  console.log('\n📄 Generando PDFs...');
  const adjuntos = [];
  const nombreArchivo = nombreParaArchivo(paciente.NOMBRE_COMPLETO);
  const docPaciente   = paciente.numero_documento;

  try {
    // 1️⃣ Historia Clínica (siempre)
    console.log('   📋 Generando Historia Clínica...');
    const { html: htmlHC, parametros: paramsHC } = renderHtml(payload);
    const pdfHC = await PdfService.generarPdfBuffer({ html: htmlHC, parametros: paramsHC });
    const pdfHCCifrado = await PdfEncrypt.cifrarPdf(pdfHC, docPaciente);
    adjuntos.push({ filename: `Historia_Clinica_${nombreArchivo}.pdf`, content: pdfHCCifrado });
    console.log(`   ✅ Historia Clínica generada (${Math.round(pdfHCCifrado.length / 1024)} KB)`);

    // 2️⃣ + 3️⃣  Clasificar TODAS las órdenes (ordenes + formulacion) → un PDF por tipo
    const clasificados = clasificarTodasLasOrdenes(
      payload.clinico.ordenes    || [],
      payload.clinico.formulacion || []
    );

    const tiposOrden = [
      { key: 'laboratorio',  tituloDoc: 'ORDEN DE LABORATORIO',  tituloTabla: 'ORDEN DE LABORATORIO',  sufijo: 'Orden_Laboratorio' },
      { key: 'imagenologia', tituloDoc: 'ORDEN DE IMAGENOLOGÍA', tituloTabla: 'ORDEN DE IMAGENOLOGÍA', sufijo: 'Orden_Imagenologia' },
      { key: 'otras',        tituloDoc: 'ORDEN MÉDICA',          tituloTabla: 'ORDEN MÉDICA',          sufijo: 'Orden_Medica' },
    ];

    for (const tipo of tiposOrden) {
      const rsDelTipo = clasificados[tipo.key];
      if (!rsDelTipo || !rsDelTipo.length) {
        console.log(`   ⏭️  Sin ${tipo.tituloDoc} — se omite`);
        continue;
      }
      console.log(`   📋 Generando ${tipo.tituloDoc}...`);
      const resultado = renderHtmlOrdenPorTipo(payload, tipo.tituloDoc, tipo.tituloTabla, rsDelTipo);
      if (resultado) {
        const pdfBuffer = await PdfService.generarPdfBuffer(resultado);
        const pdfCifrado = await PdfEncrypt.cifrarPdf(pdfBuffer, docPaciente);
        adjuntos.push({ filename: `${tipo.sufijo}_${nombreArchivo}.pdf`, content: pdfCifrado });
        console.log(`   ✅ ${tipo.tituloDoc} generada (${Math.round(pdfCifrado.length / 1024)} KB)`);
      }
    }

    // 🏥 Orden de Incapacidad — bloque de texto formato Panacea
    const rsIncapacidades = clasificados.incapacidades || [];
    if (rsIncapacidades.length) {
      console.log('   📋 Generando Orden de Incapacidad...');

      // Cargar datos dinámicos por ID_ORDEN para cada incapacidad
      const ordenesInfo = new Map();
      const idIps = (payload.atencion && payload.atencion.ID_IPS) || 21;
      for (const rs of rsIncapacidades) {
        for (const row of rs || []) {
          if (row.ID_ORDEN != null) {
            const idOrden = Number(row.ID_ORDEN);
            if (!ordenesInfo.has(idOrden)) {
              ordenesInfo.set(idOrden, { idTipoOrden: Number(row.ID_TIPO_ORDEN || 58) });
            }
          }
        }
      }
      const ordenesDatosPorId = new Map();
      const ordenesFechasPorId = new Map();
      const ordenesListaPorId = new Map();
      const ordenesTextoPorId = new Map();
      const ordenesEstructuraPorId = new Map();
      if (ordenesInfo.size > 0) {
        const limitInc = pLimit(3);
        await Promise.all([...ordenesInfo.entries()].map(([idOrden, info]) => limitInc(async () => {
          const [datos, fechas, lista, texto, estructura] = await Promise.all([
            HistoriaSP.getOrdenesFormatos(idOrden, idIps, info.idTipoOrden),
            HistoriaSP.getOrdenesFecha(idOrden),
            HistoriaSP.getOrdenesLista(idOrden),
            HistoriaSP.getOrdenesTexto(idOrden),
            HistoriaSP.getOrdenesImpresionFormatos(idOrden, 1),
          ]);
          ordenesDatosPorId.set(idOrden, datos[0] || null);
          ordenesFechasPorId.set(idOrden, fechas);
          ordenesListaPorId.set(idOrden, lista);
          ordenesTextoPorId.set(idOrden, texto);
          ordenesEstructuraPorId.set(idOrden, estructura);
        })));
      }

      const resultado = renderHtmlIncapacidades(payload, rsIncapacidades, {
        ordenesDatosPorId,
        ordenesFechasPorId,
        ordenesListaPorId,
        ordenesTextoPorId,
        ordenesEstructuraPorId,
      });
      if (resultado) {
        const pdfBuffer = await PdfService.generarPdfBuffer(resultado);
        const pdfCifrado = await PdfEncrypt.cifrarPdf(pdfBuffer, docPaciente);
        adjuntos.push({ filename: `Orden_Incapacidad_${nombreArchivo}.pdf`, content: pdfCifrado });
        console.log(`   ✅ Orden de Incapacidad generada (${Math.round(pdfCifrado.length / 1024)} KB)`);
      }
    } else {
      console.log('   ⏭️  Sin orden de incapacidad — se omite');
    }

    // Fórmula Médica — solo medicamentos clasificados
    const rsMedicamentos = clasificados.medicamentos || [];
    if (rsMedicamentos.length) {
      console.log('   📋 Generando Fórmula Médica...');
      const resultado = renderHtmlFormula(payload, rsMedicamentos);
      if (resultado) {
        const pdfBuffer = await PdfService.generarPdfBuffer(resultado);
        const pdfFormulaCifrado = await PdfEncrypt.cifrarPdf(pdfBuffer, docPaciente);
        adjuntos.push({ filename: `Formula_Medica_${nombreArchivo}.pdf`, content: pdfFormulaCifrado });
        console.log(`   ✅ Fórmula Médica generada (${Math.round(pdfFormulaCifrado.length / 1024)} KB)`);
      }
    } else {
      console.log('   ⏭️  Sin fórmula médica — se omite ese PDF');
    }

  } catch (err) {
    console.error('❌ Error generando PDFs:', err.message);
    console.error(err.stack);
    process.exit(1);
  }

  console.log(`\n✅ Total PDFs generados: ${adjuntos.length}`);
  adjuntos.forEach((a, i) => console.log(`   ${i + 1}. ${a.filename}`));

  // ── Paso 4: Enviar correo ───────────────────────────────────────────────
  console.log(`\n📧 Enviando correo a: ${correoFinal}`);
  const listaDocumentos = adjuntos.map((a, i) => `  ${i + 1}. ${a.filename}`).join('\n');

  try {
    await MailService.enviarConMultiplesAdjuntos({
      to: correoFinal,
      subject: `[PRUEBA] Historia Clínica — Atención ${ID_ATENCION}`,
      text: [
        `Estimado(a) ${paciente.NOMBRE_COMPLETO},`,
        '',
        `Adjunto encontrará los documentos generados en su atención médica:`,
        listaDocumentos,
        '',
        'Por seguridad, cada archivo está protegido con contraseña.',
        `Para abrirlos, utilice su número de documento: ${docPaciente}`,
        '',
        '--- MENSAJE DE PRUEBA GENERADO MANUALMENTE ---',
      ].join('\n'),
      adjuntos,
    });
  } catch (err) {
    console.error('❌ Error enviando correo:', err.message);
    process.exit(1);
  }

  // ── Resumen final ───────────────────────────────────────────────────────
  console.log('\n');
  console.log('✅ ══════════════════════════════════════════════════════════════════');
  console.log('   ENVÍO EXITOSO');
  console.log('✅ ══════════════════════════════════════════════════════════════════');
  console.log(`   Correo enviado a : ${correoFinal}`);
  console.log(`   Documentos       : ${adjuntos.length}`);
  adjuntos.forEach((a, i) => console.log(`     ${i + 1}. ${a.filename}`));
  console.log(`   Contraseña PDF   : ${docPaciente}  ← usa esto para abrir los PDFs`);
  console.log('\n');

  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});
