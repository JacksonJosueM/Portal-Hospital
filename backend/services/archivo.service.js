/**
 * ════════════════════════════════════════════════════════════════════════════
 *  ARCHIVO SERVICE · Módulo de envío para personal de Archivo/Correspondencia
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Flujo:
 *   1. Buscar paciente por número de documento (vw_pacientes_portal).
 *   2. Listar atenciones cerradas del paciente (Historia.TM_ATENCIONES).
 *   3. Verificar / actualizar correo en Parametrizacion.TP_PACIENTE_CONTACTOS.
 *   4. Generar PDFs (reutiliza HistoriaPrintService, PdfService, PdfEncrypt).
 *   5. Enviar por correo (reutiliza MailService).
 *   6. Registrar en AuditoriaEnviosArchivo (PortalPacientes) — tabla exclusiva.
 *
 *  IMPORTANTE: No modifica nada del módulo médico existente.
 *  Auditoría: usa AuditoriaEnviosArchivo, NUNCA AuditoriaEnvios.
 * ════════════════════════════════════════════════════════════════════════════
 */

const { portalPool, panaceaPool, sql } = require('../config/db');
const HistoriaPrintService = require('./historia.print.service');
const {
  renderHtml,
  clasificarTodasLasOrdenes,
  renderHtmlOrdenPorTipo,
  renderHtmlFormula,
  renderHtmlIncapacidades,
  renderHtmlOrdenImagenologia,
  renderHtmlAutorizacion,
} = require('./plantilla.render');
const AutorizacionSP = require('./panacea/autorizacionSP');
const PdfService    = require('./pdf.service');
const PdfEncrypt    = require('./pdf.encrypt');
const MailService   = require('./mail.service');
const HistoriaSP    = require('./panacea/historiaSP');
const pLimit        = require('p-limit');

// ── Helpers ────────────────────────────────────────────────────────────────

const TIPO_DOC_CODIGO = {
  CC: 1, CE: 2, PA: 5, RC: 6, TI: 7, AS: 8, MS: 9,
  NU: 10, PE: 11, CN: 12, SC: 13, PT: 14, DE: 15, SI: 16, SN: 17,
};

// ── 1. Buscar paciente ─────────────────────────────────────────────────────

/**
 * Busca el paciente en vw_pacientes_portal (PortalPacientes).
 * Devuelve: { id_paciente, NOMBRE_COMPLETO, numero_documento, email }
 */
async function buscarPacienteArchivo(numero_documento) {
  const p = await portalPool;
  const result = await p.request()
    .input('nd', sql.VarChar(50), numero_documento.toString().trim())
    .query(`
      SELECT TOP 1
        id_paciente,
        NOMBRE_COMPLETO,
        numero_documento,
        email
      FROM vw_pacientes_portal
      WHERE numero_documento = @nd
    `);
  return result.recordset[0] || null;
}

// ── 2. Listar atenciones cerradas ──────────────────────────────────────────

/**
 * Retorna todas las atenciones cerradas (ID_ESTADO = 2) del paciente
 * ordenadas de más reciente a más antigua.
 * Devuelve: [{ ID, FECHA_ATENCION, NOMBRE_PROFESIONAL }]
 */
async function listarAtencionesPaciente(idPaciente) {
  const p = await panaceaPool;
  const result = await p.request()
    .input('id_paciente', sql.BigInt, idPaciente)
    .query(`
      SELECT TOP 50
        a.ID,
        a.FECHA_ATENCION,
        ISNULL(u.NOMBRES + ' ' + u.APELLIDOS, 'Médico no especificado') AS NOMBRE_PROFESIONAL,
        e.NOMBRE AS ESPECIALIDAD
      FROM Historia.TM_ATENCIONES a WITH (NOLOCK)
      LEFT JOIN Administracion.TM_USUARIOS u WITH (NOLOCK)
        ON u.ID = a.ID_PRESTADOR
      LEFT JOIN Parametrizacion.TM_ESPECIALIDADES e WITH (NOLOCK)
        ON e.ID = a.ID_ESPECIALIDAD
      WHERE a.ID_PACIENTE = @id_paciente
        AND a.ID_ESTADO = 2
      ORDER BY a.FECHA_ATENCION DESC
    `);
  return result.recordset;
}

// ── 3. Verificar y actualizar correo ──────────────────────────────────────

/**
 * Obtiene el correo actual del paciente directamente desde Panacea
 * (Parametrizacion.TP_PACIENTE_CONTACTOS).
 * Devuelve: { ID, EMAIL, EMAIL_ALTERNO } o null si no tiene registro de contacto.
 */
async function obtenerContactoPaciente(idPaciente) {
  const p = await panaceaPool;
  const result = await p.request()
    .input('id_paciente', sql.BigInt, idPaciente)
    .query(`
      SELECT TOP 1 ID, EMAIL, EMAIL_ALTERNO
      FROM Parametrizacion.TP_PACIENTE_CONTACTOS WITH (NOLOCK)
      WHERE ID_PACIENTE = @id_paciente
        AND ESTADO = 0
      ORDER BY ID DESC
    `);
  return result.recordset[0] || null;
}

/**
 * Actualiza el correo del paciente en Parametrizacion.TP_PACIENTE_CONTACTOS (PRUEBAS/Panacea).
 * Solo modifica el campo EMAIL. No toca ninguna otra columna ni tabla.
 *
 * @param {number} idPaciente  - ID del paciente en Panacea
 * @param {string} emailNuevo  - Nuevo correo validado
 * @param {string} operador    - Usuario del operador de archivo (para auditoría Panacea)
 * @param {string} ipOrigen    - IP del equipo del operador
 * @returns {{ ok: boolean, mensaje: string }}
 */
async function actualizarCorreoPaciente(idPaciente, emailNuevo, operador, ipOrigen) {
  const p = await panaceaPool;

  // Verificar que existe el registro de contacto
  const contacto = await obtenerContactoPaciente(idPaciente);
  if (!contacto) {
    return { ok: false, mensaje: 'El paciente no tiene registro de contacto en el sistema.' };
  }

  await p.request()
    .input('id_paciente', sql.BigInt, idPaciente)
    .input('email_nuevo', sql.VarChar(200), emailNuevo.trim())
    .input('usuario', sql.VarChar(30), (operador || 'ARCHIVO').substring(0, 30))
    .input('ip_origen', sql.VarChar(45), (ipOrigen || '0.0.0.0').substring(0, 45))
    .query(`
      UPDATE Parametrizacion.TP_PACIENTE_CONTACTOS
      SET
        EMAIL            = @email_nuevo,
        USUARIO          = @usuario,
        IP_ORIGEN        = @ip_origen,
        ULTIMA_MODIFICACION = GETDATE()
      WHERE ID_PACIENTE = @id_paciente
        AND ESTADO = 0
    `);

  return { ok: true, mensaje: `Correo actualizado correctamente a ${emailNuevo}` };
}

// ── 4. Auditoría exclusiva del módulo de Archivo ──────────────────────────

/**
 * Registra el resultado en AuditoriaEnviosArchivo (PortalPacientes).
 * NUNCA escribe en AuditoriaEnvios.
 */
async function registrarAuditoriaArchivo(datos) {
  try {
    const p = await portalPool;
    await p.request()
      .input('IdAtencion',       sql.BigInt,        datos.IdAtencion       || null)
      .input('DocumentoPaciente',sql.VarChar(50),   datos.DocumentoPaciente|| null)
      .input('NombrePaciente',   sql.NVarChar(200), datos.NombrePaciente   || null)
      .input('FechaAtencion',    sql.DateTime,      datos.FechaAtencion    || null)
      .input('CorreoOriginal',   sql.VarChar(200),  datos.CorreoOriginal   || null)
      .input('CorreoDestino',    sql.VarChar(200),  datos.CorreoDestino    || null)
      .input('CorreoModificado', sql.Bit,           datos.CorreoModificado ? 1 : 0)
      .input('OperadorArchivo',  sql.NVarChar(100), datos.OperadorArchivo  || null)
      .input('EquipoOrigen',     sql.VarChar(100),  datos.EquipoOrigen     || 'Desconocido')
      .input('IpOrigen',         sql.VarChar(50),   datos.IpOrigen         || 'Desconocido')
      .input('Estado',           sql.VarChar(20),   datos.Estado)
      .input('MotivoError',      sql.NVarChar(sql.MAX), datos.MotivoError  || null)
      .query(`
        INSERT INTO AuditoriaEnviosArchivo (
          IdAtencion, DocumentoPaciente, NombrePaciente, FechaAtencion,
          CorreoOriginal, CorreoDestino, CorreoModificado,
          OperadorArchivo, EquipoOrigen, IpOrigen, Estado, MotivoError
        ) VALUES (
          @IdAtencion, @DocumentoPaciente, @NombrePaciente, @FechaAtencion,
          @CorreoOriginal, @CorreoDestino, @CorreoModificado,
          @OperadorArchivo, @EquipoOrigen, @IpOrigen, @Estado, @MotivoError
        )
      `);
  } catch (err) {
    console.warn(`⚠️  [AuditoriaEnviosArchivo] Falló inserción: ${err.message}`);
  }
}

// ── 5. Flujo principal de envío ────────────────────────────────────────────

/**
 * Envía la historia clínica seleccionada al correo del paciente.
 *
 * @param {object} params
 * @param {string}  params.numero_documento
 * @param {number}  params.idAtencion       - ID de la atención seleccionada
 * @param {string}  [params.operador]       - Usuario del operador de archivo
 * @param {string}  [params.clientIp]
 * @param {string}  [params.clientHostname]
 */
async function enviarHistoriaArchivo({
  numero_documento,
  idAtencion,
  operador = 'ARCHIVO',
  clientIp,
  clientHostname,
}) {
  const auditoriaBase = {
    DocumentoPaciente: numero_documento,
    OperadorArchivo:   operador,
    IpOrigen:          clientIp,
    EquipoOrigen:      clientHostname,
    IdAtencion:        idAtencion,
  };

  // ── Paso 1 · Buscar paciente ─────────────────────────────────────────────
  const paciente = await buscarPacienteArchivo(numero_documento);
  if (!paciente) {
    const msg = `El paciente con documento ${numero_documento} no está registrado en el sistema.`;
    await registrarAuditoriaArchivo({ ...auditoriaBase, Estado: 'ERROR', MotivoError: msg });
    return { ok: false, error: msg };
  }

  auditoriaBase.NombrePaciente = paciente.NOMBRE_COMPLETO;

  // Obtener correo actual desde Panacea (fuente real)
  const contacto = await obtenerContactoPaciente(paciente.id_paciente);
  const correoActual = contacto?.EMAIL || paciente.email || null;

  if (!correoActual) {
    const msg = `El paciente ${paciente.NOMBRE_COMPLETO} no tiene correo registrado.`;
    await registrarAuditoriaArchivo({ ...auditoriaBase, Estado: 'ERROR', MotivoError: msg });
    return { ok: false, error: msg, paciente: { ...paciente, email: null } };
  }

  // Normalizar correo (corregir errores comunes de digitación)
  const correoNormalizado = correoActual.trim()
    .replace(/@gmai\.com$/i,    '@gmail.com')
    .replace(/@gmail\.con$/i,   '@gmail.com')
    .replace(/@gmil\.com$/i,    '@gmail.com')
    .replace(/@hotmai\.com$/i,  '@hotmail.com')
    .replace(/@hotmail\.con$/i, '@hotmail.com');

  auditoriaBase.CorreoOriginal = correoActual;

  // ── Paso 2 · Validar que la atención existe ──────────────────────────────
  if (!idAtencion) {
    const msg = 'Debe seleccionar una atención para enviar.';
    await registrarAuditoriaArchivo({ ...auditoriaBase, Estado: 'ERROR', MotivoError: msg });
    return { ok: false, error: msg };
  }

  // ── Paso 3 · Generar PDFs ────────────────────────────────────────────────
  const adjuntos = [];
  let payload;
  let nombreBase = paciente.numero_documento;

  try {
    payload = await HistoriaPrintService.imprimirAtencion(idAtencion, {
      registrarCopia: false, // Archivo no registra copia en Panacea
      numeroCopias:   1,
    });

    nombreBase = String(paciente.NOMBRE_COMPLETO || paciente.numero_documento)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').toUpperCase();

    // Historia clínica principal
    const { html, parametros } = renderHtml(payload);
    const pdfBuffer   = await PdfService.generarPdfBuffer({ html, parametros });
    const pdfCifrado  = await PdfEncrypt.cifrarPdf(pdfBuffer, paciente.numero_documento);
    adjuntos.push({ filename: `Historia_Clinica_${nombreBase}.pdf`, content: pdfCifrado });

    // Órdenes adicionales
    const clasificados = clasificarTodasLasOrdenes(
      payload.clinico.ordenes    || [],
      payload.clinico.formulacion|| []
    );

    const tiposOrden = [
      { key: 'laboratorio', tituloDoc: 'ORDEN DE LABORATORIO', tituloTabla: 'ORDEN DE LABORATORIO', sufijo: 'Orden_Laboratorio' },
      { key: 'otras',       tituloDoc: 'ORDEN MÉDICA',         tituloTabla: 'ORDEN MÉDICA',         sufijo: 'Orden_Medica'      },
    ];

    for (const tipo of tiposOrden) {
      const rs = clasificados[tipo.key];
      if (rs && rs.length) {
        const resultado = renderHtmlOrdenPorTipo(payload, tipo.tituloDoc, tipo.tituloTabla, rs);
        if (resultado) {
          const buf = await PdfService.generarPdfBuffer(resultado);
          const enc = await PdfEncrypt.cifrarPdf(buf, paciente.numero_documento);
          adjuntos.push({ filename: `${tipo.sufijo}_${nombreBase}.pdf`, content: enc });
        }
      }
    }

    // Imagenología
    const rsImg = clasificados.imagenologia || [];
    if (rsImg.length) {
      let datosImg = null, op1Img = [];
      try {
        const allRows = rsImg.flatMap(r => r || []);
        const primera = allRows[0];
        if (primera && primera.ID_ORDEN != null) {
          const idO = Number(primera.ID_ORDEN);
          const idGP = Number(primera.ID_GRUPO_PLANTILLA || 12);
          const idTP = Number(primera.ID_TIPO_PLANTILLA  || 39);
          const [op0, op1] = await Promise.all([
            HistoriaSP.getOrdenesFormatos(idO, idGP, idTP),
            HistoriaSP.getOrdenesFormatosOp1(idO),
          ]);
          datosImg = op0[0] || null;
          op1Img   = op1   || [];
        }
      } catch (e) { console.warn('[Archivo/Imagenología]', e.message); }
      const res = renderHtmlOrdenImagenologia(payload, rsImg, datosImg, op1Img);
      if (res) {
        const buf = await PdfService.generarPdfBuffer(res);
        const enc = await PdfEncrypt.cifrarPdf(buf, paciente.numero_documento);
        adjuntos.push({ filename: `Orden_Imagenologia_${nombreBase}.pdf`, content: enc });
      }
    }

    // Incapacidades
    const rsInc = clasificados.incapacidades || [];
    if (rsInc.length) {
      const ordenesInfo = new Map();
      const idIps = payload.atencion?.ID_IPS || 21;
      for (const rs of rsInc) {
        for (const row of rs || []) {
          if (row.ID_ORDEN != null) {
            const idOrden = Number(row.ID_ORDEN);
            if (!ordenesInfo.has(idOrden))
              ordenesInfo.set(idOrden, { idTipoOrden: Number(row.ID_TIPO_ORDEN || 58) });
          }
        }
      }
      if (ordenesInfo.size > 0) {
        const lim = pLimit(3);
        const mDatos = new Map(), mFechas = new Map(), mLista = new Map(),
              mTexto = new Map(), mEstruc = new Map();
        await Promise.all([...ordenesInfo.entries()].map(([id, info]) => lim(async () => {
          const [datos, fechas, lista, texto, estruc] = await Promise.all([
            HistoriaSP.getOrdenesFormatos(id, idIps, info.idTipoOrden),
            HistoriaSP.getOrdenesFecha(id),
            HistoriaSP.getOrdenesLista(id),
            HistoriaSP.getOrdenesTexto(id),
            HistoriaSP.getOrdenesImpresionFormatos(id, 1),
          ]);
          mDatos.set(id, datos[0] || null);
          mFechas.set(id, fechas);
          mLista.set(id, lista);
          mTexto.set(id, texto);
          mEstruc.set(id, estruc);
        })));
        const res = renderHtmlIncapacidades(payload, rsInc, {
          ordenesDatosPorId: mDatos, ordenesFechasPorId: mFechas,
          ordenesListaPorId: mLista, ordenesTextoPorId: mTexto,
          ordenesEstructuraPorId: mEstruc,
        });
        if (res) {
          const buf = await PdfService.generarPdfBuffer(res);
          const enc = await PdfEncrypt.cifrarPdf(buf, paciente.numero_documento);
          adjuntos.push({ filename: `Orden_Incapacidad_${nombreBase}.pdf`, content: enc });
        }
      }
    }

    // Fórmula médica
    const rsMed = clasificados.medicamentos || [];
    if (rsMed.length) {
      let datosForm = null, op2Form = [];
      try {
        const allRows = rsMed.flatMap(r => r || []);
        const primera = allRows[0];
        if (primera && primera.ID_ORDEN != null) {
          op2Form   = await HistoriaSP.getOrdenesFormatosOp2(Number(primera.ID_ORDEN));
          datosForm = op2Form[0] || null;
        }
      } catch (e) { console.warn('[Archivo/Fórmula]', e.message); }
      const res = renderHtmlFormula(payload, rsMed, datosForm, op2Form);
      if (res) {
        const buf = await PdfService.generarPdfBuffer(res);
        const enc = await PdfEncrypt.cifrarPdf(buf, paciente.numero_documento);
        adjuntos.push({ filename: `Formula_Medica_${nombreBase}.pdf`, content: enc });
      }
    }

    // Autorizaciones (no crítico)
    try {
      const idPac   = payload.atencion?.ID_PACIENTE;
      const fechaAt = payload.atencion?.FECHA_ATENCION
        || payload.atencion?.basico_op5?.FECHA_ATENCION
        || payload.atencion?.basico_op3?.FECHA_ATENCION;
      if (idPac && fechaAt) {
        const autorizaciones = await AutorizacionSP.getAutorizacionesPorPacienteYFecha(idPac, fechaAt);
        if (autorizaciones && autorizaciones.length > 0) {
          const limA  = pLimit(3);
          const bloques = await Promise.all(autorizaciones.map(a => limA(async () => {
            try {
              const [ab, am, ad, aa] = await Promise.all([
                AutorizacionSP.getAutorizacion(Number(a.ID)),
                AutorizacionSP.getRptSolicitudMin(Number(a.ID)),
                AutorizacionSP.getRptSolicitudDx(Number(a.ID)),
                AutorizacionSP.getRptSolicitudAtencion(Number(a.ID)),
              ]);
              return { idAutor: Number(a.ID), autorBase: ab, autorMin: am, autorDx: ad, autorAten: aa };
            } catch (e) { return null; }
          })));
          const validos = bloques.filter(Boolean);
          if (validos.length > 0) {
            const p0 = validos[0];
            const allDx = [], allAten = [];
            validos.forEach(b => {
              b.autorDx.forEach(dx => {
                const cod = dx.CODIGO_CIE || dx.CODIGO || dx.CODIGOCIE;
                if (!allDx.find(x => (x.CODIGO_CIE || x.CODIGO || x.CODIGOCIE) === cod)) allDx.push(dx);
              });
              (b.autorAten || []).forEach(s => {
                const cCod = s.CODIGO_SERVICIO || s.CODIGOSERVICIO || '';
                const cDes = s.DESCRIPCION_SERVICIO || s.DESCRIPCIONSERVICIO || '';
                if (!allAten.find(x => (x.CODIGO_SERVICIO||x.CODIGOSERVICIO||'') === cCod && (x.DESCRIPCION_SERVICIO||x.DESCRIPCIONSERVICIO||'') === cDes))
                  allAten.push(s);
              });
            });
            const res = renderHtmlAutorizacion(payload, {
              autorizacion: p0.autorBase, min: p0.autorMin, dx: allDx, atencion: allAten,
              pacienteEmail: correoNormalizado,
            });
            if (res) {
              const par = (payload.parametros && payload.parametros[0]) || {};
              const buf = await PdfService.generarPdfBuffer({ html: res.html, parametros: par });
              const enc = await PdfEncrypt.cifrarPdf(buf, paciente.numero_documento);
              adjuntos.push({ filename: `Autorizaciones_${nombreBase}.pdf`, content: enc });
            }
          }
        }
      }
    } catch (e) { console.warn('[Archivo/Autorizaciones]', e.message); }

  } catch (err) {
    const msg = `Error generando PDF: ${err.message}`;
    const fechaAt = payload?.atencion?.FECHA_ATENCION || payload?.atencion?.basico_op5?.FECHA_ATENCION;
    await registrarAuditoriaArchivo({
      ...auditoriaBase,
      FechaAtencion:  fechaAt,
      CorreoDestino:  correoNormalizado,
      CorreoModificado: false,
      Estado: 'ERROR', MotivoError: msg,
    });
    return { ok: false, idAtencion, destino: correoNormalizado, error: msg };
  }

  // ── Paso 4 · Enviar correo ───────────────────────────────────────────────
  try {
    const listaDoc = adjuntos.map((a, i) => `  ${i + 1}. ${a.filename}`).join('\n');
    await MailService.enviarConMultiplesAdjuntos({
      to:      correoNormalizado,
      subject: 'Envío de historia clínica y documentos médicos — Área de Archivo',
      text:    `Estimado(a) ${paciente.NOMBRE_COMPLETO},\n\nDesde el Área de Archivo le remitimos los documentos generados en su atención médica:\n\n${listaDoc}\n\nPor seguridad, cada archivo está protegido con contraseña. Para abrirlos, utilice su número de documento.\n\nEste es un mensaje generado automáticamente por el sistema. Por favor, no responda a este correo.`,
      adjuntos,
    });

    const fechaAt = payload?.atencion?.FECHA_ATENCION || payload?.atencion?.basico_op5?.FECHA_ATENCION;
    await registrarAuditoriaArchivo({
      ...auditoriaBase,
      FechaAtencion:    fechaAt,
      CorreoDestino:    correoNormalizado,
      CorreoModificado: correoNormalizado !== correoActual,
      Estado: 'ENVIADO',
    });

    return { ok: true, idAtencion, destino: correoNormalizado };

  } catch (err) {
    const msg = `Error enviando correo: ${err.message}`;
    const fechaAt = payload?.atencion?.FECHA_ATENCION || payload?.atencion?.basico_op5?.FECHA_ATENCION;
    await registrarAuditoriaArchivo({
      ...auditoriaBase,
      FechaAtencion:    fechaAt,
      CorreoDestino:    correoNormalizado,
      CorreoModificado: correoNormalizado !== correoActual,
      Estado: 'ERROR', MotivoError: msg,
    });
    return { ok: false, idAtencion, destino: correoNormalizado, error: msg };
  }
}

// ── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  buscarPacienteArchivo,
  listarAtencionesPaciente,
  obtenerContactoPaciente,
  actualizarCorreoPaciente,
  enviarHistoriaArchivo,
};
