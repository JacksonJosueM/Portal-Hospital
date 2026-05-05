/**
 * ════════════════════════════════════════════════════════════════════════════
 *  HISTORIA PRINT SERVICE · Orquestador de impresión estilo Panacea
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Reproduce **exactamente** la secuencia de stored procedures que la
 *  aplicación Silverlight de Panacea ejecuta cuando un médico imprime una
 *  historia clínica (ver traza original sobre la atención 359695).
 *
 *  Todos los SPs devuelven columnas normalizadas a UPPER_SNAKE_CASE
 *  gracias a la capa de wrappers (panacea/*SP.js + normalizeColumns.js).
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
 *
 * Tras la normalización, la estructura tiene columnas como:
 *   ID_ESTRUCTURA  (int)  — identificador numérico del dato/campo
 *   ORIGEN         (int)  — 1=dato, 2=grupo, 3=sección
 *   ID             (GUID) — PK del nodo en la estructura
 */
function extraerIdsDatoDeEstructura(estructura) {
  if (!Array.isArray(estructura)) return [];
  const ids = new Set();
  for (const nodo of estructura) {
    // Solo los nodos con ORIGEN=1 son datos; ORIGEN=2 son grupos, ORIGEN=3 secciones
    if (nodo.ORIGEN !== 1) continue;
    const idDato = nodo.ID_ESTRUCTURA;
    if (idDato != null && Number.isInteger(idDato) && idDato > 0) ids.add(idDato);
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

  // Resolver IDs derivados de la atención (ya normalizados a UPPER_SNAKE_CASE)
  const idIps = atencion.ID_IPS ?? idIpsDefault;
  const idSede = atencion.ID_SEDE ?? 1;
  const idPaciente = atencion.ID_PACIENTE;
  const idPrestador = atencion.ID_PRESTADOR;
  const idEspecialidad = atencion.ID_ESPECIALIDAD ?? 0;
  const idProcedimiento = atencion.ID_PROCEDIMIENTO ?? 0;
  const idLegalizacionProc = atencion.ID_LEGALIZACION_PROCEDIMIENTO ?? 0;
  const idAutorizacion = atencion.ID_AUTORIZACION ?? 0;
  const idAdmision = atencion.ID_ADMISION ?? 0;
  const idAiu = atencion.ID_ATENCION_INICIAL_URGENCIAS ?? 0;
  const idPlantilla = atencion.ID_PLANTILLA;

  if (!idPlantilla) {
    throw new Error(`Atención ${idAtencion} no tiene ID_PLANTILLA asociada (columnas: ${Object.keys(atencion).join(', ')})`);
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
      const key = row.NOMBRE ?? row.TOKEN ?? row.MACRO;
      const val = row.VALOR ?? row.VALUE;
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
  console.log(`📄 [HistoriaPrint] Estructura: ${estructura.length} nodos, ${idsDato.length} datos dinámicos`);
  const metadataList = await Promise.all(idsDato.map((id) => Dinamico.getMetadataDato(id)));
  const datosMeta = new Map();
  for (const m of metadataList) datosMeta.set(m.idDato, m);

  // ── PASO 6 · Indexar valores por ID_ESTRUCTURA_PLANTILLA para acceso O(1) ──
  // Los STM_DATOS_* ahora tienen columnas normalizadas: ID_ESTRUCTURA_PLANTILLA (GUID).
  // El render busca los valores por el GUID del nodo de la estructura (nodo.ID).
  function indexBy(records, key = 'ID_ESTRUCTURA_PLANTILLA') {
    const map = new Map();
    for (const r of records || []) {
      const k = r[key];
      if (k == null) continue;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    }
    return map;
  }

  const valoresPorEstructura = {
    decimal: indexBy(datosDecimal),
    enteros: indexBy(datosEnteros),
    texto: indexBy(datosTexto),
    lista: indexBy(datosLista),
    fecha: indexBy(datosFecha),
    tabla: indexBy(datosTabla),
    laboratorioTexto: indexBy(labDatosTexto),
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
  const userName = atencion.USUARIO ?? atencion.USER_NAME ?? null;
  if (userName) {
    [profesional, firma] = await Promise.all([
      Administracion.getUsuario(userName),
      Administracion.getUsuarioImagenes(userName),
    ]);
  }

  // ── PASO 9 · Extraer campos planos para frontend y plantillas fijas ──
  const camposFront = {};
  function extractCampos(nodo) {
    if (nodo.ORIGEN === 1) { // Dato
      let val = null;
      const guid = nodo.ID;
      if (valoresPorEstructura.texto.has(guid)) val = valoresPorEstructura.texto.get(guid)[0].VALOR_TEXTO;
      else if (valoresPorEstructura.enteros.has(guid)) val = valoresPorEstructura.enteros.get(guid)[0].VALOR_ENTEROS;
      else if (valoresPorEstructura.decimal.has(guid)) val = valoresPorEstructura.decimal.get(guid)[0].VALOR_DECIMAL;
      else if (valoresPorEstructura.fecha.has(guid)) val = valoresPorEstructura.fecha.get(guid)[0].VALOR_FECHA;
      else if (valoresPorEstructura.lista.has(guid)) val = valoresPorEstructura.lista.get(guid)[0].VALOR_TEXTO;
      
      if (val != null && val !== '') {
        camposFront[nodo.NOMBRE || nodo.DESCRIPCION] = String(val);
      }
    }
    for (const child of nodo.children || []) extractCampos(child);
  }
  for (const nodo of estructura) extractCampos(nodo);

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
    campos: camposFront, // <-- Dictionary for easy mapping
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
