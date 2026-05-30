/**
 * ════════════════════════════════════════════════════════════════════════════
 *  ENVÍO HISTORIA SERVICE · Orquestador de flujo paciente -> PDF -> Mail
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Este servicio coordina:
 *   1. Búsqueda del paciente en el portal.
 *   2. Identificación de la última atención cerrada (si no se provee una).
 *   3. Verificación de duplicados (idempotencia).
 *   4. Generación de la historia clínica (Panacea SPs -> HTML -> PDF).
 *   5. Cifrado del PDF (AES-128 con documento del paciente).
 *   6. Envío por correo electrónico.
 *   7. Auditoría del envío.
 * ════════════════════════════════════════════════════════════════════════════
 */

const { portalPool, sql } = require('../config/db');
const HistoriaPrintService = require('./historia.print.service');
const { renderHtml, clasificarTodasLasOrdenes, renderHtmlOrdenPorTipo, renderHtmlFormula, renderHtmlIncapacidades, renderHtmlOrdenImagenologia, renderHtmlAutorizacion } = require('./plantilla.render');
const AutorizacionSP = require('./panacea/autorizacionSP');
const PdfService = require('./pdf.service');
const PdfEncrypt = require('./pdf.encrypt');
const MailService = require('./mail.service');
const HistoriaSP = require('./panacea/historiaSP');
const pLimit = require('p-limit');

/**
 * Registra el resultado de un envío en la tabla portal.envios_historia
 */
async function registrarEnvio({
  idAtencion,
  tipo_documento,
  numero_documento,
  destino,
  estado,
  error_mensaje = null,
  fuente = 'CLI',
}) {
  const p = await portalPool;
  await p.request()
    .input('id_atencion', sql.BigInt, idAtencion)
    .input('tipo_documento', sql.VarChar(10), tipo_documento)
    .input('numero_documento', sql.VarChar(50), numero_documento)
    .input('destino', sql.VarChar(200), destino)
    .input('estado', sql.VarChar(20), estado)
    .input('error_mensaje', sql.VarChar(sql.MAX), error_mensaje)
    .input('fuente', sql.VarChar(20), fuente)
    .query(`
      INSERT INTO envios_historia (id_atencion, tipo_documento, numero_documento, destino, estado, error_mensaje, fuente)
      VALUES (@id_atencion, @tipo_documento, @numero_documento, @destino, @estado, @error_mensaje, @fuente)
    `);
}

/**
 * Verifica si una atención ya fue enviada con éxito previamente
 */
async function yaEnviada(idAtencion) {
  const p = await portalPool;
  const result = await p.request()
    .input('id_atencion', sql.BigInt, idAtencion)
    .query("SELECT TOP 1 id, fecha_envio FROM envios_historia WHERE id_atencion = @id_atencion AND estado = 'OK' ORDER BY fecha_envio DESC");
  return result.recordset[0];
}

/**
 * Busca al paciente en la vista del portal para obtener su correo y documento
 */
// Mapa texto → código numérico usado en vw_pacientes_portal
const TIPO_DOC_CODIGO = {
  CC: 1, CE: 2, PA: 5, RC: 6, TI: 7, AS: 8, MS: 9,
  NU: 10, PE: 11, CN: 12, SC: 13, PT: 14, DE: 15, SI: 16, SN: 17,
};

async function buscarPaciente(tipo_documento, numero_documento) {
  const p = await portalPool;
  const tipo = (tipo_documento || '').toString().toUpperCase();
  
  if (tipo === 'AUTO' || !tipo) {
    const result = await p.request()
      .input('nd', sql.VarChar(50), numero_documento)
      .query('SELECT TOP 1 id_paciente, NOMBRE_COMPLETO, numero_documento, email FROM vw_pacientes_portal WHERE numero_documento = @nd');
    return result.recordset[0];
  }

  // tipo_documento puede llegar como texto (CC, PT...) o ya como número
  const codigoTipo = isNaN(tipo_documento)
    ? (TIPO_DOC_CODIGO[tipo] ?? null)
    : parseInt(tipo_documento, 10);

  if (codigoTipo === null) {
    throw new Error(`Tipo de documento desconocido: '${tipo_documento}'. Use CC, TI, CE, PT, PA, etc.`);
  }

  const result = await p.request()
    .input('td', sql.SmallInt, codigoTipo)
    .input('nd', sql.VarChar(50), numero_documento)
    .query('SELECT TOP 1 id_paciente, NOMBRE_COMPLETO, numero_documento, email FROM vw_pacientes_portal WHERE tipo_documento = @td AND numero_documento = @nd');
  return result.recordset[0];
}

/**
 * Identifica la última atención cerrada del paciente
 */
async function obtenerUltimaAtencion(idPaciente) {
  const { panaceaPool } = require('../config/db');
  const p = await panaceaPool;
  // Buscamos en STM_ATENCIONES (solo cerradas: ESTADO = 2)
  const result = await p.request()
    .input('id_paciente', sql.BigInt, idPaciente)
    .query('SELECT TOP 1 ID FROM Historia.TM_ATENCIONES WHERE ID_PACIENTE = @id_paciente AND ID_ESTADO = 2 ORDER BY FECHA_ATENCION DESC');
  return result.recordset[0]?.ID;
}

const fechaLegible = (d) => new Date(d).toLocaleString('es-CO');

/**
 * FLUJO PRINCIPAL: Envía la historia clínica de un paciente
 * 
 * @param {object} params
 * @param {string} params.tipo_documento
 * @param {string} params.numero_documento
 * @param {string|number} [params.idAtencion] Si no se provee, usa la última cerrada
 * @param {boolean} [params.forzar=false]     Si true, ignora si ya fue enviada
 * @param {string} [params.fuente='CLI']      Origen de la petición
 */
async function enviarHistoria({
  tipo_documento,
  numero_documento,
  idAtencion = null,
  forzar = false,
  fuente = 'CLI',
}) {
  console.log(`🔍 Buscando paciente ${tipo_documento} ${numero_documento}...`);
  const paciente = await buscarPaciente(tipo_documento, numero_documento);

  if (!paciente) {
    return { ok: false, error: `El paciente con el número de documento ${numero_documento} no está registrado en el sistema.` };
  }

  if (!paciente.email) {
    return { ok: false, error: `El paciente ${paciente.NOMBRE_COMPLETO} no tiene correo registrado.` };
  }

  // Corregir posibles errores tipográficos en el correo (muy común en registros manuales)
  paciente.email = paciente.email.trim()
    .replace(/@gmai\.com$/i, '@gmail.com')
    .replace(/@gmail\.con$/i, '@gmail.com')
    .replace(/@gmil\.com$/i, '@gmail.com')
    .replace(/@hotmai\.com$/i, '@hotmail.com')
    .replace(/@hotmail\.con$/i, '@hotmail.com');

  // ── Paso 2 · Resolver Atención ──────────────────────────────────────────
  if (!idAtencion) {
    console.log(`🔍 Identificando última atención cerrada de ${paciente.NOMBRE_COMPLETO}...`);
    idAtencion = await obtenerUltimaAtencion(paciente.id_paciente);
  }

  if (!idAtencion) {
    return { ok: false, error: `No se encontraron atenciones cerradas para el paciente.` };
  }

  // ── Paso 3 · Idempotencia ───────────────────────────────────────────────
  if (!forzar) {
    const previo = await yaEnviada(idAtencion);
    if (previo) {
      return {
        ok: true, omitido: true, idAtencion,
        destino: paciente.email,
        error: `Ya enviada el ${fechaLegible(previo.fecha_envio)} (id=${previo.id})`,
      };
    }
  }

  // ── Paso 4 · Generar PDF ────────────────────────────────────────────────
  const adjuntos = [];
  let payload;
  let nombreBase = `JHON_JAIRO`; // default
  try {
    payload = await HistoriaPrintService.imprimirAtencion(idAtencion, {
      registrarCopia: true,
      numeroCopias: 1,
    });
    
    // Normalizar nombre para archivo
    nombreBase = String(paciente.NOMBRE_COMPLETO || paciente.numero_documento)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').toUpperCase();

    // 1. Historia Clinica Principal
    const { html, parametros } = renderHtml(payload);
    const pdfBuffer = await PdfService.generarPdfBuffer({ html, parametros });
    const pdfCifrado = await PdfEncrypt.cifrarPdf(pdfBuffer, paciente.numero_documento);
    adjuntos.push({ filename: `Historia_Clinica_${nombreBase}.pdf`, content: pdfCifrado });

    // 2. Clasificar órdenes y generar PDFs adicionales
    const clasificados = clasificarTodasLasOrdenes(
      payload.clinico.ordenes || [],
      payload.clinico.formulacion || []
    );

    const tiposOrden = [
      { key: 'laboratorio', tituloDoc: 'ORDEN DE LABORATORIO', tituloTabla: 'ORDEN DE LABORATORIO', sufijo: 'Orden_Laboratorio' },
      { key: 'otras',       tituloDoc: 'ORDEN MÉDICA',         tituloTabla: 'ORDEN MÉDICA',         sufijo: 'Orden_Medica' },
    ];

    for (const tipo of tiposOrden) {
      const rsDelTipo = clasificados[tipo.key];
      if (rsDelTipo && rsDelTipo.length) {
        const resultado = renderHtmlOrdenPorTipo(payload, tipo.tituloDoc, tipo.tituloTabla, rsDelTipo);
        if (resultado) {
          const pdfBufferOrd = await PdfService.generarPdfBuffer(resultado);
          const pdfCifradoOrd = await PdfEncrypt.cifrarPdf(pdfBufferOrd, paciente.numero_documento);
          adjuntos.push({ filename: `${tipo.sufijo}_${nombreBase}.pdf`, content: pdfCifradoOrd });
        }
      }
    }

    // 2b. Orden de Imagenología — formato completo estilo Panacea
    // Llama QRY_IMPRESION_ORDENES_FORMATOS OPERACION=0 (datos maestros: Orden N°, Tipo usuario,
    // Vía ingreso, Vigencia, etc.) y OPERACION=1 (filas de procedimientos con Área corporal,
    // Lateralidad, Estado, Prioridad, Tipo uso, Comentario).
    const rsImagenologia = clasificados.imagenologia || [];
    if (rsImagenologia.length) {
      let datosOrdenImg = null;
      let op1RowsImg    = [];
      try {
        const allImgRows = rsImagenologia.flatMap(rs => rs || []);
        const primeraFilaImg = allImgRows[0];
        if (primeraFilaImg && primeraFilaImg.ID_ORDEN != null) {
          const idOrdenI         = Number(primeraFilaImg.ID_ORDEN);
          const idGrupoPlantilla = Number(primeraFilaImg.ID_GRUPO_PLANTILLA || 12);
          const idTipoPlantilla  = Number(primeraFilaImg.ID_TIPO_PLANTILLA  || 39);
          const [op0Rows, op1] = await Promise.all([
            HistoriaSP.getOrdenesFormatos(idOrdenI, idGrupoPlantilla, idTipoPlantilla),
            HistoriaSP.getOrdenesFormatosOp1(idOrdenI),
          ]);
          datosOrdenImg = op0Rows[0] || null;
          op1RowsImg    = op1 || [];
        }
      } catch (errI) {
        console.warn('[Imagenologia] No se pudo obtener datos de orden:', errI.message);
      }
      const resultado = renderHtmlOrdenImagenologia(payload, rsImagenologia, datosOrdenImg, op1RowsImg);
      if (resultado) {
        const pdfBufferImg  = await PdfService.generarPdfBuffer(resultado);
        const pdfCifradoImg = await PdfEncrypt.cifrarPdf(pdfBufferImg, paciente.numero_documento);
        adjuntos.push({ filename: `Orden_Imagenologia_${nombreBase}.pdf`, content: pdfCifradoImg });
      }
    }

    // 3. Orden de Incapacidad — bloque de texto formato Panacea
    const rsIncapacidades = clasificados.incapacidades || [];
    if (rsIncapacidades.length) {
      // Recopilar IDs únicos con su tipo de orden para llamar los SPs correctos
      const ordenesInfo = new Map(); // idOrden -> { idTipoOrden }
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

      const ordenesDatosPorId = new Map();     // QRY_IMPRESION_ORDENES_FORMATOS op=0
      const ordenesFechasPorId = new Map();    // STM_ORDENES_FECHA
      const ordenesListaPorId = new Map();     // STM_ORDENES_LISTA
      const ordenesTextoPorId = new Map();     // STM_ORDENES_TEXTO
      const ordenesEstructuraPorId = new Map(); // QRY_IMPRESION_ORDENES_FORMATOS op=1

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
        const pdfBufferInc = await PdfService.generarPdfBuffer(resultado);
        const pdfCifradoInc = await PdfEncrypt.cifrarPdf(pdfBufferInc, paciente.numero_documento);
        adjuntos.push({ filename: `Orden_Incapacidad_${nombreBase}.pdf`, content: pdfCifradoInc });
      }
    }

    // 4. Fórmula Médica
    const rsMedicamentos = clasificados.medicamentos || [];
    if (rsMedicamentos.length) {
      // Obtener datos completos de la orden vía QRY_IMPRESION_ORDENES_FORMATOS OPERACION=2
      // (confirmado por traza SQL: Panacea llama este SP con OPERACION=2 al imprimir fórmulas)
      // Devuelve: TIPO_USUARIO, CATEGORIA_CONVENIO, ID_ORIGEN_VIA_INGRESO, ID_AMBITO,
      //           TIPO_USO, FECHA_INICIO, FECHA_TERMINACION, DISTANCIA (dosis por med), etc.
      let datosOrdenFormula = null;
      let op2RowsFormula    = [];
      try {
        const allMedRows = rsMedicamentos.flatMap(rs => rs || []);
        const primeraFilaFormula = allMedRows[0];
        if (primeraFilaFormula && primeraFilaFormula.ID_ORDEN != null) {
          const idOrdenF = Number(primeraFilaFormula.ID_ORDEN);
          op2RowsFormula = await HistoriaSP.getOrdenesFormatosOp2(idOrdenF);
          datosOrdenFormula = op2RowsFormula[0] || null;
        }
      } catch (errF) {
        console.warn('[Formula] No se pudo obtener Op2 datos:', errF.message);
      }

      const resultado = renderHtmlFormula(payload, rsMedicamentos, datosOrdenFormula, op2RowsFormula);
      if (resultado) {
        const pdfBufferForm = await PdfService.generarPdfBuffer(resultado);
        const pdfCifradoForm = await PdfEncrypt.cifrarPdf(pdfBufferForm, paciente.numero_documento);
        adjuntos.push({ filename: `Formula_Medica_${nombreBase}.pdf`, content: pdfCifradoForm });
      }
    }

    // 5. Autorizaciones de servicios de salud
    // Solo trae "Autorización directa" (ID_ORIGEN_AUTORIZACION=6), excluyendo Órdenes.
    // Todas las autorizaciones del día se consolidan en UN SOLO PDF.
    // Este paso es completamente opcional: si falla, el envío continúa.
    try {
      const idPaciente    = payload.atencion?.ID_PACIENTE;
      const fechaAtencion = payload.atencion?.FECHA_ATENCION
        || payload.atencion?.basico_op5?.FECHA_ATENCION
        || payload.atencion?.basico_op3?.FECHA_ATENCION;

      if (idPaciente && fechaAtencion) {
        console.log(`🔍 [Autorizaciones] Buscando autorizaciones directas paciente ${idPaciente} fecha ${fechaAtencion}...`);
        const autorizaciones = await AutorizacionSP.getAutorizacionesPorPacienteYFecha(idPaciente, fechaAtencion);

        if (autorizaciones && autorizaciones.length > 0) {
          console.log(`📋 [Autorizaciones] Encontradas ${autorizaciones.length} autorización(es) directa(s).`);

          // Obtener datos de cada autorización en paralelo (máximo 3 a la vez)
          const limitAutor = pLimit(3);
          const bloques = await Promise.all(autorizaciones.map(autor => limitAutor(async () => {
            const idAutor = Number(autor.ID);
            try {
              const [autorBase, autorMin, autorDx, autorAten] = await Promise.all([
                AutorizacionSP.getAutorizacion(idAutor),
                AutorizacionSP.getRptSolicitudMin(idAutor),
                AutorizacionSP.getRptSolicitudDx(idAutor),
                AutorizacionSP.getRptSolicitudAtencion(idAutor),
              ]);
              return { idAutor, autorBase, autorMin, autorDx, autorAten };
            } catch (errAutor) {
              console.warn(`⚠️  [Autorizaciones] No se pudo obtener datos de autorización ${idAutor}: ${errAutor.message}`);
              return null;
            }
          })));

          // Filtrar bloques fallidos
          const bloquesValidos = bloques.filter(Boolean);

          if (bloquesValidos.length > 0) {
            // UNIFICAR todos los datos en UNA sola autorización
            const primerBloque = bloquesValidos[0];
            
            // Combinar diagnósticos (sin duplicar códigos)
            const allDx = [];
            bloquesValidos.forEach(b => {
              b.autorDx.forEach(dx => {
                const cod = dx.CODIGO_CIE || dx.CODIGO || dx.CODIGOCIE;
                if (!allDx.find(x => (x.CODIGO_CIE || x.CODIGO || x.CODIGOCIE) === cod)) {
                  allDx.push(dx);
                }
              });
            });

            // Combinar atenciones (servicios) evitando duplicados
            let allAten = [];
            bloquesValidos.forEach(b => {
              const servicios = b.autorAten || [];
              servicios.forEach(serv => {
                const cod = serv.CODIGO_SERVICIO || serv.CODIGOSERVICIO || '';
                const desc = serv.DESCRIPCION_SERVICIO || serv.DESCRIPCIONSERVICIO || serv.NOMBRE_SERVICIO || serv.NOMBRESERVICIO || '';
                
                // Buscar si ya existe el mismo servicio
                const existe = allAten.find(x => {
                  const xCod = x.CODIGO_SERVICIO || x.CODIGOSERVICIO || '';
                  const xDesc = x.DESCRIPCION_SERVICIO || x.DESCRIPCIONSERVICIO || x.NOMBRE_SERVICIO || x.NOMBRESERVICIO || '';
                  return xCod === cod && xDesc === desc;
                });

                if (!existe) {
                  allAten.push(serv);
                }
              });
            });

            const autorDataUnificada = {
              autorizacion: primerBloque.autorBase,
              min:          primerBloque.autorMin,
              dx:           allDx,
              atencion:     allAten,
              pacienteEmail: paciente.email
            };

            // Renderizar UN SOLO HTML con todos los servicios
            const resultado = renderHtmlAutorizacion(payload, autorDataUnificada);
            
            if (resultado) {
              const parametros = (payload.parametros && payload.parametros[0]) || {};
              const pdfBufCombinado = await PdfService.generarPdfBuffer({ html: resultado.html, parametros });
              const pdfCifCombinado = await PdfEncrypt.cifrarPdf(pdfBufCombinado, paciente.numero_documento);
              adjuntos.push({ filename: `Autorizaciones_${nombreBase}.pdf`, content: pdfCifCombinado });
              console.log(`✅ [Autorizaciones] PDF único generado agrupando ${bloquesValidos.length} autorización(es) y ${allAten.length} servicio(s).`);
            }
          }
        } else {
          console.log(`ℹ️  [Autorizaciones] No se encontraron autorizaciones directas para la fecha de la atención.`);
        }
      }
    } catch (errAutorizaciones) {
      // Error no crítico: el envío continúa aunque falle el módulo de autorizaciones
      console.warn(`⚠️  [Autorizaciones] Error al buscar autorizaciones (no crítico): ${errAutorizaciones.message}`);
    }
  } catch (err) {
    const msg = `Error generando/cifrando PDF: ${err.message}`;
    try {
      await registrarEnvio({
        idAtencion, tipo_documento, numero_documento,
        destino: paciente.email, estado: 'ERROR',
        error_mensaje: msg, fuente,
      });
    } catch (_) { /* noop */ }
    return { ok: false, idAtencion, destino: paciente.email, error: msg };
  }

  // ── Paso 5 · Enviar Mail ────────────────────────────────────────────────
  try {
    const listaDocumentos = adjuntos.map((a, i) => `  ${i + 1}. ${a.filename}`).join('\n');

    await MailService.enviarConMultiplesAdjuntos({
      to: paciente.email,
      subject: 'Envío de historia clínica y órdenes médicas',
      text: `Estimado(a) ${paciente.NOMBRE_COMPLETO},\n\nAdjunto encontrará los documentos generados en su atención médica:\n\n${listaDocumentos}\n\nPor seguridad, cada archivo está protegido con contraseña. Para abrirlos, utilice su número de documento.\n\nEste es un mensaje generado automáticamente por el sistema. Por favor, no responda a este correo.`,
      adjuntos,
    });

    // ── Paso 6 · Auditoría OK ─────────────────────────────────────────────
    try {
      await registrarEnvio({
        idAtencion, tipo_documento, numero_documento,
        destino: paciente.email, estado: 'OK', fuente,
      });
    } catch (auditErr) {
      console.warn(`⚠️  [EnvioHistoria] Atención ${idAtencion}: correo enviado pero falló el INSERT de auditoría: ${auditErr.message}`);
    }

    return { ok: true, idAtencion, destino: paciente.email };
  } catch (err) {
    const msg = `Error enviando correo: ${err.message}`;
    try {
      await registrarEnvio({
        idAtencion, tipo_documento, numero_documento,
        destino: paciente.email, estado: 'ERROR',
        error_mensaje: msg, fuente,
      });
    } catch (_) { /* noop */ }
    return { ok: false, idAtencion, destino: paciente.email, error: msg };
  }
}

module.exports = { enviarHistoria };
