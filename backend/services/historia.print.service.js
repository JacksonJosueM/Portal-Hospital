/**
 * ════════════════════════════════════════════════════════════════════════════
 *  HISTORIA PRINT SERVICE · Orquestador de impresión estilo Panacea
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Reproduce **exactamente** la secuencia de stored procedures que la
 *  aplicación Silverlight de Panacea ejecuta cuando un médico imprime una
 *  historia clínica (ver traza original sobre la atención 359695).
 *
 *  La traza marca dos secciones:
 *
 *    1) BLOQUE FIJO POR ATENCIÓN (siempre se llama, en este orden):
 *       PARAMETROS_IMPRESION → STM_ATENCIONES → STM_COPIAS_IMPRESION (read+insert)
 *       → STP_PLANTILLAS → QRY_MODULOS_FUNCIONALES
 *       → STM_ATENCIONES_BASICO (5 y 3) → QRY_POBLAR_TOKEN_ATENCION
 *       → STM_PACIENTE_ALERGIAS → STM_DATOS_DIAGNOSTICOS → STM_DATOS_SINTOMAS
 *       → STP_SEDES → QRY_PRIMER_LOGO_IPS → QRY_CONSULTA_ATENCIONES
 *       → STP_IPS → QRY_ESTRUCTURA_PLANA_PLANTILLA
 *       → Laboratorio.STM_DATOS_TEXTO → STM_PACIENTE_ANTECEDENTES
 *       → STM_DATOS_DECIMAL/ENTEROS/TEXTO/TABLA/LISTA/FECHA
 *
 *    2) BUCLE POR `id_dato` referenciado en la estructura:
 *       STP_DATOS → STP_DATOS_CAMPOS_TABLAS → STP_DATOS_IMAGENES
 *       → STP_RANGOS_HISTORIA × 10 (tipos 2,3,4,5,6,7,8,9,10,14)
 *       → STP_DATOS_VALORES
 *
 *    3) CIERRE:
 *       STM_CALCULOS_RIESGO → QRY_ORDENES_IMPRESION → STM_ATENCION_NOTAS
 *       → STM_GRAFICA_IMAGEN_ATENCION → Odontologia.STM_TRATAMIENTOS
 *       → QRY_IMPRIME_FORMULACION_MEDICA
 *       → STP_USUARIO_IMAGENES → STP_USUARIOS
 *
 *  El resultado es un `printPayload` que el motor de render
 *  (`plantilla.render.js`) consume para producir HTML.
 * ════════════════════════════════════════════════════════════════════════════
 */

const Historia = require('./panacea/historiaSP');
const Dinamico = require('./panacea/dinamicoSP');
const Parametrizacion = require('./panacea/parametrizacionSP');
const Administracion = require('./panacea/administracionSP');
const Laboratorio = require('./panacea/laboratorioSP');
const Odontologia = require('./panacea/odontologiaSP');
const { getIdIps } = require('./panacea/auditContext');

/**
 * Recorre la estructura plana de la plantilla y devuelve los IDs de dato
 * únicos que se usan para renderizar el documento.
 */
function extraerIdsDatoDeEstructura(estructura) {
  if (!Array.isArray(estructura)) return [];
  const ids = new Set();
  for (const nodo of estructura) {
    // El nombre exacto de la columna depende del SP; cubrimos las variantes
    // más comunes (ID_DATO, IdDato, id_dato).
    const idDato = nodo.ID_DATO ?? nodo.IdDato ?? nodo.id_dato ?? nodo.ID_ORIGEN ?? null;
    if (idDato != null && Number.isInteger(idDato)) ids.add(idDato);
  }
  return Array.from(ids);
}

/**
 * Imprime la atención completa siguiendo la traza de Panacea.
 *
 * @param {number|string} idAtencion
 * @param {object} [opts]
 * @param {number} [opts.numeroCopias=1]   Número de copias a registrar en STM_COPIAS_IMPRESION
 * @param {boolean} [opts.registrarCopia=true] Si false, no inserta auditoría de copia
 * @returns {Promise<object>} printPayload normalizado
 */
async function imprimirAtencion(idAtencion, opts = {}) {
  const { numeroCopias = 1, registrarCopia = true } = opts;
  const startTime = Date.now();
  const idIpsDefault = getIdIps();

  console.log(`📄 [HistoriaPrint] Iniciando impresión de atención ${idAtencion}`);

  // ── PASO 0 · Parámetros de impresión + atención principal ────────────
  const [parametros, atencion] = await Promise.all([
    Historia.getParametrosImpresion(idIpsDefault),
    Historia.getAtencion(idAtencion),
  ]);

  if (!atencion) {
    throw new Error(`Atención ${idAtencion} no encontrada en Panacea`);
  }

  // Resolver IDs derivados de la atención
  const idIps = atencion.ID_IPS ?? atencion.id_ips ?? idIpsDefault;
  const idSede = atencion.ID_SEDE ?? atencion.id_sede ?? 1;
  const idPaciente = atencion.ID_PACIENTE ?? atencion.id_paciente;
  const idPrestador = atencion.ID_PRESTADOR ?? atencion.id_prestador;
  const idEspecialidad = atencion.ID_ESPECIALIDAD ?? atencion.id_especialidad ?? 0;
  const idProcedimiento = atencion.ID_PROCEDIMIENTO ?? atencion.id_procedimiento ?? 0;
  const idLegalizacionProc = atencion.ID_LEGALIZACION_PROCEDIMIENTO ?? atencion.id_legalizacion_procedimiento ?? 0;
  const idAutorizacion = atencion.ID_AUTORIZACION ?? atencion.id_autorizacion ?? 0;
  const idAdmision = atencion.ID_ADMISION ?? atencion.id_admision ?? 0;
  const idAiu = atencion.ID_ATENCION_INICIAL_URGENCIAS ?? atencion.id_aiu ?? 0;
  const idPlantilla = atencion.ID_PLANTILLA ?? atencion.id_plantilla;

  if (!idPlantilla) {
    throw new Error(`Atención ${idAtencion} no tiene ID_PLANTILLA asociada`);
  }

  // ── PASO 1 · Auditoría de copia impresa (read + insert) ──────────────
  let copiaPrevia = [];
  let copiaInsertada = null;
  if (registrarCopia) {
    copiaPrevia = await Historia.getCopiasImpresion(idAtencion);
    copiaInsertada = await Historia.registrarCopiaImpresion(idAtencion, numeroCopias);
  }

  // ── PASO 2 · Plantilla, módulos, atención básico (paralelo) ──────────
  const [plantilla, modulos, atencionBasicoOp5, atencionBasicoOp3] = await Promise.all([
    Dinamico.getPlantilla(idPlantilla),
    Administracion.getModulosFuncionales(8),
    Historia.getAtencionBasico(idAtencion, 5),
    Historia.getAtencionBasico(idAtencion, 3),
  ]);

  // ── PASO 3 · Token de atención (macros tipo {{paciente.nombre}}) ─────
  const tokensRecordsets = await Historia.poblarTokenAtencion({
    idPaciente,
    idPrestador,
    idEspecialidad,
    idProcedimiento,
    idLegalizacionProc,
    idAutorizacion,
    idAdmision,
    idAiu,
    idAtencion,
    idConvenio: atencion.ID_CONVENIO ?? 0,
  });

  // Aplanar los recordsets de tokens en un Map<nombre,valor>
  const tokens = {};
  for (const rs of tokensRecordsets || []) {
    for (const row of rs || []) {
      // Cubrir variantes comunes de nombres de columnas
      const key = row.NOMBRE ?? row.TOKEN ?? row.MACRO ?? row.nombre;
      const val = row.VALOR ?? row.VALUE ?? row.valor;
      if (key != null) tokens[String(key)] = val;
    }
  }

  // ── PASO 4 · Catálogos clínicos del paciente, sede, IPS, logo,
  //            estructura de la plantilla y datos por tipo (paralelo) ──
  const [
    alergias,
    diagnosticos,
    sintomas,
    sede,
    logoIps,
    consultaAtenciones,
    ips,
    estructura,
    labDatosTexto,
    antecedentes,
    datosDecimal,
    datosEnteros,
    datosTexto,
    datosTabla,
    datosLista,
    datosFecha,
  ] = await Promise.all([
    Historia.getAlergiasPaciente(idPaciente, idIps),
    Historia.getDiagnosticos(idAtencion),
    Historia.getSintomas(idAtencion),
    Parametrizacion.getSede(idSede),
    Parametrizacion.getPrimerLogoIps(idIps),
    Historia.getConsultaAtenciones(idSede, 5),
    Parametrizacion.getIps(idIps),
    Dinamico.getEstructuraPlanaPlantilla(idPlantilla),
    Laboratorio.getDatosTexto(idAtencion),
    Historia.getAntecedentesPaciente(idPaciente, idIps),
    Historia.getDatosDecimal(idAtencion),
    Historia.getDatosEnteros(idAtencion),
    Historia.getDatosTexto(idAtencion),
    Historia.getDatosTabla(idAtencion),
    Historia.getDatosLista(idAtencion),
    Historia.getDatosFecha(idAtencion),
  ]);

  // ── PASO 5 · Por cada id_dato referenciado en la estructura,
  //            descargar metadatos (loop de la traza) ──────────────────
  const idsDato = extraerIdsDatoDeEstructura(estructura);
  const metadataList = await Promise.all(idsDato.map((id) => Dinamico.getMetadataDato(id)));
  const datosMeta = new Map();
  for (const m of metadataList) datosMeta.set(m.idDato, m);

  // ── PASO 6 · Indexar valores por id_dato para acceso O(1) ────────────
  function indexBy(records, key = 'ID_ESTRUCTURA_PLANTILLA') {
    const map = new Map();
    for (const r of records || []) {
      const k = r[key] ?? r[key.toLowerCase()];
      if (k == null) continue;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    }
    return map;
  }

  // Los STM_DATOS_* normalmente vienen ligados al ID_ESTRUCTURA_PLANTILLA
  // (que apunta a un nodo de la estructura). El render usa este índice.
  const valoresPorEstructura = {
    decimal: indexBy(datosDecimal, 'ID_ESTRUCTURA_PLANTILLA'),
    enteros: indexBy(datosEnteros, 'ID_ESTRUCTURA_PLANTILLA'),
    texto: indexBy(datosTexto, 'ID_ESTRUCTURA_PLANTILLA'),
    lista: indexBy(datosLista, 'ID_ESTRUCTURA_PLANTILLA'),
    fecha: indexBy(datosFecha, 'ID_ESTRUCTURA_PLANTILLA'),
    tabla: indexBy(datosTabla, 'ID_ESTRUCTURA_PLANTILLA'),
    laboratorioTexto: indexBy(labDatosTexto, 'ID_ESTRUCTURA_PLANTILLA'),
  };

  // ── PASO 7 · Bloque de cierre: riesgo, órdenes, notas, gráficas,
  //            tratamientos odontológicos, formulación médica ─────────
  const [
    calculosRiesgo,
    ordenesImpresion,
    notas,
    graficas,
    tratamientosOdonto,
    formulacionMedica,
  ] = await Promise.all([
    Historia.getCalculosRiesgo(idAtencion),
    Historia.getOrdenesImpresion(idAtencion),
    Historia.getNotasAtencion(idAtencion),
    Historia.getGraficasImagen(idAtencion),
    Odontologia.getTratamientos(idAtencion),
    Historia.getFormulacionMedica(idAtencion),
  ]);

  // ── PASO 8 · Profesional + firma ─────────────────────────────────────
  let profesional = null;
  let firma = [];
  const userName =
    atencion.USER_NAME ??
    atencion.USUARIO ??
    atencion.user_name ??
    atencion.USUARIO_CREA ??
    null;
  if (userName) {
    [profesional, firma] = await Promise.all([
      Administracion.getUsuario(userName),
      Administracion.getUsuarioImagenes(userName),
    ]);
  }

  const elapsed = Date.now() - startTime;
  console.log(
    `✅ [HistoriaPrint] Atención ${idAtencion} consolidada en ${elapsed}ms ` +
      `(${idsDato.length} datos dinámicos)`
  );

  return {
    parametros,
    atencion: {
      ...atencion,
      basico_op5: atencionBasicoOp5,
      basico_op3: atencionBasicoOp3,
    },
    consultaAtenciones,
    plantilla: {
      meta: plantilla,
      estructura,
      idsDato,
    },
    tokens,
    ips,
    sede,
    logoIps,
    paciente: {
      id: idPaciente,
      alergias,
      antecedentes,
    },
    clinico: {
      diagnosticos,
      sintomas,
      calculosRiesgo,
      notas,
      graficas,
      formulacion: formulacionMedica,
      ordenes: ordenesImpresion,
      tratamientosOdonto,
    },
    datos: datosMeta,
    valoresPorEstructura,
    profesional: {
      meta: profesional,
      firma,
      userName,
    },
    auditoria: {
      modulos,
      copiaPrevia,
      copiaInsertada,
      numeroCopias,
    },
  };
}

module.exports = { imprimirAtencion };
