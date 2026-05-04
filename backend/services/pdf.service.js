const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

// ══════════════════════════════════════════════════════════════
// POOL DE NAVEGADOR PUPPETEER (Singleton)
// Reutiliza la misma instancia de Chrome para todas las peticiones
// de PDF, evitando el costo de arrancar un navegador nuevo (~3-5s)
// cada vez que un paciente solicita su historia clínica.
// ══════════════════════════════════════════════════════════════
let _browser = null;
let _browserLaunchPromise = null;

async function getBrowser() {
  if (_browser && _browser.isConnected()) {
    return _browser;
  }
  // Evitar lanzar múltiples instancias simultáneas
  if (_browserLaunchPromise) {
    return _browserLaunchPromise;
  }
  _browserLaunchPromise = puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions',
      '--no-first-run',
    ]
  }).then(browser => {
    _browser = browser;
    _browserLaunchPromise = null;
    // Si el navegador se desconecta, limpiar la referencia
    browser.on('disconnected', () => {
      _browser = null;
      console.log('🔄 Puppeteer browser desconectado, se reiniciará en la próxima petición');
    });
    console.log('🚀 Puppeteer browser pool inicializado (reutilizable)');
    return browser;
  }).catch(err => {
    _browserLaunchPromise = null;
    throw err;
  });
  return _browserLaunchPromise;
}

// Cerrar browser al apagar el servidor
process.on('SIGINT', async () => { if (_browser) await _browser.close(); });
process.on('SIGTERM', async () => { if (_browser) await _browser.close(); });

/**
 * Carga el logo y lo convierte a base64 para incrustar en el PDF
 */
function cargarLogoBase64() {
  try {
    const logoPath = path.join(__dirname, '..', 'templates', 'Logo.png');
    if (fs.existsSync(logoPath)) {
      const logoBuffer = fs.readFileSync(logoPath);
      return `data:image/png;base64,${logoBuffer.toString('base64')}`;
    }
    console.warn('⚠️ logo.png no encontrado en templates/');
    return '';
  } catch (err) {
    console.warn('⚠️ Error cargando logo:', err.message);
    return '';
  }
}

/**
 * Formatea una fecha para mostrar en formato dd/mm/yyyy HH:mm
 */
function formatDate(value) {
  if (!value) return '';
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleString('es-CO', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  } catch {
    return String(value);
  }
}

/**
 * Obtiene un campo clínico del objeto dinámico.
 * Función auxiliar para buscar un campo. Intenta coincidencia exacta, 
 * luego coincidencia por palabra completa para evitar que "Edad" coincida con "Enfermedad actual".
 */
function getCampo(campos, ...keywords) {
  if (!campos) return '';
  
  // 1. Coincidencia exacta (ignorando mayúsculas)
  for (const kw of keywords) {
    const kwLower = kw.trim().toLowerCase();
    for (const key of Object.keys(campos)) {
      if (key.trim().toLowerCase() === kwLower) {
        return campos[key];
      }
    }
  }

  // 2. Coincidencia de palabra completa (ej: \bedad\b no coincide con enfermedad)
  for (const kw of keywords) {
    const regex = new RegExp(`\\b${kw.trim()}\\b`, 'i');
    for (const key of Object.keys(campos)) {
      if (regex.test(key)) {
        return campos[key];
      }
    }
  }

  // 3. Ya no usamos includes simple para evitar falsos positivos peligrosos.
  return '';
}

/**
 * Helper para dividir un nombre completo en apellidos y nombres
 * Panacea suele guardar los nombres como "APELLIDO1 APELLIDO2 NOMBRE1 NOMBRE2"
 */
function extraerApellidosNombres(nombreCompleto) {
  if (!nombreCompleto) return { apellidos: '', nombres: '' };
  const partes = nombreCompleto.trim().split(/\s+/);
  
  if (partes.length >= 4) {
    // 2 nombres, 2 apellidos (ej: JUAN PEREZ GOMEZ LOPEZ -> asume JUAN PEREZ nombres, GOMEZ LOPEZ apellidos)
    // OJO: En Colombia el formato suele ser NOMBRES APELLIDOS. 
    return { apellidos: partes.slice(2).join(' '), nombres: partes.slice(0, 2).join(' ') };
  } else if (partes.length === 3) {
    // Usualmente 1 nombre, 2 apellidos (ej: JACKSON MORILLO RODRIGUEZ)
    return { apellidos: partes.slice(1).join(' '), nombres: partes[0] };
  } else if (partes.length === 2) {
    // 1 nombre, 1 apellido
    return { apellidos: partes[1], nombres: partes[0] };
  }
  return { apellidos: nombreCompleto, nombres: '' };
}

/**
 * Calcula la edad exacta en años, meses y días entre dos fechas
 */
function calcularEdadExacta(fechaNacimiento, fechaConsulta) {
  if (!fechaNacimiento) return '';
  
  const inicio = new Date(fechaNacimiento);
  const fin = fechaConsulta ? new Date(fechaConsulta) : new Date();
  
  if (isNaN(inicio.getTime())) return '';

  let anios = fin.getFullYear() - inicio.getFullYear();
  let meses = fin.getMonth() - inicio.getMonth();
  let dias = fin.getDate() - inicio.getDate();

  if (dias < 0) {
    meses -= 1;
    // Obtener días del mes anterior
    const mesAnterior = new Date(fin.getFullYear(), fin.getMonth(), 0);
    dias += mesAnterior.getDate();
  }

  if (meses < 0) {
    anios -= 1;
    meses += 12;
  }

  let edadStr = [];
  if (anios > 0) edadStr.push(`${anios} Años`);
  if (meses > 0) edadStr.push(`${meses} Meses`);
  if (dias > 0 || (anios === 0 && meses === 0)) edadStr.push(`${dias} Dias`);

  return edadStr.join('/');
}

/**
 * Construye el objeto de datos completo a partir de los registros de BD
 * Usa los campos clínicos dinámicos de Panacea (sin hardcodear IDs)
 */
function buildData(paciente, historia) {
  const campos = historia?.campos || {};

  // Construir filas de medicamentos si existen
  let medicamentosFilas = '';
  if (historia?.medicamentos && Array.isArray(historia.medicamentos)) {
    medicamentosFilas = historia.medicamentos.map(med =>
      `<tr>
        <td>${med.descripcion || med.nombre || ''}</td>
        <td style="text-align:center">${med.cantidad || ''}</td>
        <td style="text-align:center">${med.dias_tratamiento || med.dias || ''}</td>
        <td style="text-align:center">${med.via_administracion || med.via || ''}</td>
      </tr>`
    ).join('');
  }

  const { apellidos, nombres } = extraerApellidosNombres(paciente?.nombre || historia?.nombre_paciente);
  const edadCalculada = calcularEdadExacta(paciente?.fecha_nacimiento, historia?.fecha);

  return {
    // ══════════════════════════════════════════
    // DATOS DEL PACIENTE (desde vw_pacientes_portal + campos dinámicos)
    // ══════════════════════════════════════════
    apellidos: apellidos,
    nombres: nombres,
    tipo_id: getCampo(campos, 'Tipo identificación') || paciente?.tipo_documento || "",
    numero: getCampo(campos, 'Número de identificación') || paciente?.numero_documento || "",

    fecha_nacimiento: formatDate(paciente?.fecha_nacimiento),
    edad: edadCalculada,
    genero: getCampo(campos, 'Género', 'Sexo'),
    telefono: getCampo(campos, 'Teléfono domicilio', 'Teléfono Móvil') || paciente?.telefono || "",
    direccion: getCampo(campos, 'Dirección', 'Dirección domicilio'),

    ocupacion: getCampo(campos, 'Ocupación'),
    eps: getCampo(campos, 'Nombre cliente', 'EAPB', 'Aseguradora'),
    convenio: getCampo(campos, 'Nombre convenio', 'Convenio'),
    fecha_registro: getCampo(campos, 'Fecha registro'),

    estado_civil: getCampo(campos, 'Estado civil'),
    responsable: getCampo(campos, 'Nombre responsable', 'Responsable'),
    parentesco: getCampo(campos, 'Parentesco responsable', 'Parentesco'),
    telefono_responsable: getCampo(campos, 'Teléfono responsable'),
    etnia: getCampo(campos, 'Pertenencia étnica', 'Etnia'),
    pais: getCampo(campos, 'País nacimiento', 'País'),

    // ══════════════════════════════════════════
    // CONSULTA
    // ══════════════════════════════════════════
    fecha_consulta: historia
      ? formatDate(historia.fecha)
      : formatDate(new Date()),

    ambito: getCampo(campos, 'Ambito de atención', 'Ámbito'),
    causa: getCampo(campos, 'Causa externa'),
    finalidad: getCampo(campos, 'Finalidad'),

    // ══════════════════════════════════════════
    // ANAMNESIS
    // ══════════════════════════════════════════
    motivo: getCampo(campos, 'Motivo de consulta'),
    enfermedad_actual: getCampo(campos, 'Enfermedad actual'),

    // ══════════════════════════════════════════
    // ANTECEDENTES PERSONALES
    // ══════════════════════════════════════════
    patologicos: getCampo(campos, 'Antecedentes patológicos'),
    quirurgicos: getCampo(campos, 'Antecedentes quirúrgicos'),
    alergicos: getCampo(campos, 'Antecedentes alérgicos'),
    tratamiento_lepra: getCampo(campos, 'Tratamiento para Lepra', 'Lepra'),
    inmunologicos: getCampo(campos, 'Antecedentes inmunológicos'),
    psiquiatricos: getCampo(campos, 'Antecedentes psiquiátricos'),
    toxicos: getCampo(campos, 'Antecedentes tóxicos'),
    transfusionales: getCampo(campos, 'Antecedentes transfusionales'),
    traumaticos: getCampo(campos, 'Antecedentes traumáticos'),
    hospitalarios: getCampo(campos, 'Antecedentes hospitalarios'),
    ets: getCampo(campos, 'Antecedentes ETS'),
    familiares: getCampo(campos, 'Antecedentes familiares'),
    perinatales: getCampo(campos, 'Antecedentes perinatales'),
    nutricionales: getCampo(campos, 'Antecedentes nutricionales'),
    farmacologicos: getCampo(campos, 'Antecedentes Farmacologicos', 'Antecedentes farmacológicos'),
    personales_describir: getCampo(campos, 'Antecedentes personales describir'),

    // ══════════════════════════════════════════
    // ANTECEDENTES GINECOBSTETRICOS
    // ══════════════════════════════════════════
    planifica: getCampo(campos, 'Planifica'),
    metodo_planificacion: getCampo(campos, 'Método', 'Método planificación'),
    vida_sexual: getCampo(campos, 'Vida Sexual', 'Vida sexual'),

    // ══════════════════════════════════════════
    // SIGNOS VITALES
    // ══════════════════════════════════════════
    fecha_peso: getCampo(campos, 'Fecha del peso'),
    peso: getCampo(campos, 'Peso'),
    fecha_talla: getCampo(campos, 'Fecha de la talla'),
    talla: getCampo(campos, 'Talla'),
    imc: getCampo(campos, 'Índice de masa corporal', 'IMC'),
    temperatura: getCampo(campos, 'Temperatura'),
    circunferencia_cintura: getCampo(campos, 'Circunferencia de cintura', 'Circunferencia'),
    tas: getCampo(campos, 'Tensión arterial sistólica', 'TAS'),
    tad: getCampo(campos, 'Tensión arterial diastólica', 'TAD'),
    tam: getCampo(campos, 'TAM', 'Tensión arterial media'),
    saturacion_oxigeno: getCampo(campos, 'Saturación de Oxigeno', 'Saturación'),
    frecuencia_respiratoria: getCampo(campos, 'Frecuencia Respiratoria'),
    fc: getCampo(campos, 'Frecuencia Cardíaca', 'Frecuencia cardiaca'),

    // ══════════════════════════════════════════
    // EXAMEN FISICO CEFALO CAUDAL
    // ══════════════════════════════════════════
    cabeza: getCampo(campos, 'Cabeza'),
    neurologico: getCampo(campos, 'Neurológico'),
    ojos: getCampo(campos, 'Ojos'),
    otorrino: getCampo(campos, 'Otorrinolaringológico', 'ORL'),
    cuello: getCampo(campos, 'Cuello'),
    cardiopulmonar: getCampo(campos, 'Cardiopulmonar'),
    respiratoria: getCampo(campos, 'Respiratoria'),
    abdomen: getCampo(campos, 'Abdomen'),
    genitourinario: getCampo(campos, 'Genitourinario'),
    aparato_locomotor: getCampo(campos, 'Aparato locomotor', 'Locomotor'),
    piel_anexos: getCampo(campos, 'Piel y Anexos', 'Piel'),

    // ══════════════════════════════════════════
    // CONDUCTA
    // ══════════════════════════════════════════
    conducta: getCampo(campos, 'Conducta'),

    // ══════════════════════════════════════════
    // DEMANDA INDUCIDA
    // ══════════════════════════════════════════
    remitido_pyp: getCampo(campos, 'Remitido a programa PYP', 'PYP') || "No",
    cual_pyp: getCampo(campos, 'programa de PYP', 'Cual programa'),

    // ══════════════════════════════════════════
    // EDUCACION
    // ══════════════════════════════════════════
    instrucciones: getCampo(campos, 'Instrucciones'),
    deberes_derechos: getCampo(campos, 'deberes y derechos') || "Si",

    // ══════════════════════════════════════════
    // DIAGNÓSTICOS
    // ══════════════════════════════════════════
    diagnostico_principal: getCampo(campos, 'Diagnóstico principal', 'Diagnóstico'),
    tipo_diagnostico: getCampo(campos, 'Tipo principal', 'Tipo diagnóstico'),
    diagnostico_relacionado: getCampo(campos, 'Relacionado 1', 'Diagnóstico relacionado'),

    // ══════════════════════════════════════════
    // PROFESIONAL DE LA SALUD
    // ══════════════════════════════════════════
    medico: getCampo(campos, 'Nombre profesional') || historia?.medico || "",
    medico_tipo_id: getCampo(campos, 'Tipo identificación.') || "CC",
    medico_numero_id: getCampo(campos, 'Número de identificación.') || historia?.registro_medico || "",
    registro_medico: getCampo(campos, 'Registro médico') || historia?.registro_medico || "",
    especialidad: getCampo(campos, 'Especialidad') || historia?.especialidad || "",

    // ══════════════════════════════════════════
    // ORDENES
    // ══════════════════════════════════════════
    orden_incapacidad: getCampo(campos, 'Incapacidad'),
    orden_medicamento_header: getCampo(campos, 'Órdenes de la atención'),
    medicamentos_filas: medicamentosFilas,
    ordenes: getCampo(campos, 'Órdenes', 'Plan'),

    // ══════════════════════════════════════════
    // EVOLUCIÓN (campo adicional frecuente)
    // ══════════════════════════════════════════
    evolucion: getCampo(campos, 'Evolución'),

    // ══════════════════════════════════════════
    // METADATOS
    // ══════════════════════════════════════════
    fecha_impresion: new Date().toLocaleString("es-CO", {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    }),
    logo: cargarLogoBase64(),
    usuario_impresion: `Usuario ${paciente?.numero_documento || 'personal'}`
  };
}

/**
 * Reemplaza los {{placeholders}} en el template HTML con los datos reales
 */
function renderTemplate(html, data) {
  return html.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return data[key] !== undefined ? data[key] : '';
  });
}

/**
 * Genera un PDF de la historia clínica y lo envía como respuesta HTTP
 * @param {Object} historia - Registro de historia clínica con campos dinámicos
 * @param {Object} paciente - Registro del paciente
 * @param {Object} res - Objeto response de Express
 */
async function generarHistoriaPdf(historia, paciente, res) {
  let page;

  try {
    const startTime = Date.now();

    // 1. Leer el template HTML
    const templatePath = path.join(__dirname, '..', 'templates', 'historia_clinica.html');
    const templateHtml = fs.readFileSync(templatePath, 'utf-8');

    // 2. Construir datos y renderizar el HTML
    const data = buildData(paciente, historia);
    const htmlFinal = renderTemplate(templateHtml, data);

    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 paciente:', !!paciente ? 'OK' : 'NULL/UNDEFINED');
      console.log('🔍 historia:', !!historia ? 'OK' : 'NULL/UNDEFINED');
      console.log('🔍 campos dinámicos:', Object.keys(historia?.campos || {}).length);
    }

    // 3. Generar PDF con Puppeteer (reutilizando instancia del pool)
    const browser = await getBrowser();
    page = await browser.newPage();

    // Deshabilitar recursos innecesarios para mayor velocidad
    await page.setRequestInterception(true);
    page.on('request', req => {
      const type = req.resourceType();
      if (['stylesheet', 'font', 'script'].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.setContent(htmlFinal, { waitUntil: 'domcontentloaded' });

    const pdfBuffer = await page.pdf({
      format: 'Letter',
      margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' },
      printBackground: true
    });

    await page.close();
    page = null;

    const elapsed = Date.now() - startTime;
    console.log(`📄 PDF generado en ${elapsed}ms (${(pdfBuffer.length / 1024).toFixed(0)} KB)`);

    // 4. Enviar el PDF como respuesta
    const nombreArchivo = `historia_clinica_${data.numero || 'paciente'}.pdf`;

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
      'Content-Length': pdfBuffer.length
    });

    return res.send(pdfBuffer);

  } catch (err) {
    if (page) {
      try { await page.close(); } catch (_) {}
    }
    console.error('❌ Error generando PDF:', err.message);
    throw err;
  }
}

module.exports = { generarHistoriaPdf };