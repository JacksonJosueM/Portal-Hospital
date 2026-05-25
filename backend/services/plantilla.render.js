/**
 * ════════════════════════════════════════════════════════════════════════════
 *  PLANTILLA RENDER · Motor de impresión dinámico estilo Panacea
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Recibe el `printPayload` que arma `historia.print.service.js` y produce
 *  un HTML listo para Puppeteer, replicando la maqueta que Panacea
 *  Silverlight imprime.
 *
 *  Todas las columnas ya vienen normalizadas a UPPER_SNAKE_CASE por la
 *  capa de wrappers SP (normalizeColumns.js).
 *
 *  Estructura de la plantilla (QRY_ESTRUCTURA_PLANA_PLANTILLA):
 *    ORIGEN          3=pestaña(sección), 2=grupo, 1=dato
 *    ID              GUID — PK del nodo
 *    ID_ESTRUCTURA   int  — ID del dato/grupo/pestaña subyacente
 *    ID_ESTRUCTURA_PADRE  GUID — nodo padre (permite árbol multinivel)
 *    TIPO_DATO_FIJO  int  — tipo fijo (1=texto,2=decimal,...,9=imagen)
 *    TIPO_DATO       int  — tipo genérico (cuando TIPO_DATO_FIJO=0)
 *    NOMBRE          string
 *    ORDEN           int  — orden dentro de su padre
 *
 *  Los STM_DATOS_* usan ID_ESTRUCTURA_PLANTILLA (GUID) = nodo.ID
 * ════════════════════════════════════════════════════════════════════════════
 */

// ── Tipos de dato fijo (TIPO_DATO_FIJO de Panacea) ───────────────────────
const TIPO_FIJO = {
  SISTEMA: 1,       // dato fijo del sistema (rellenado por el token, no por STM_DATOS_*)
  DECIMAL: 2,
  ENTERO: 3,
  SELECCION: 4,     // selección / combo
  LISTA: 5,
  TABLA: 6,
  SECCION: 7,
  TEXTO_LIBRE: 8,
  IMAGEN: 9,
};

// ── Tipos de dato genérico (TIPO_DATO cuando TIPO_DATO_FIJO=0) ───────────
const TIPO_DATO = {
  NUMERICO: 1,
  DECIMAL: 2,
  LISTA_VALORES: 4,
  TEXTO: 5,          // texto multilínea
  FECHA: 8,
  LOGICO: 10,        // booleano
  CALCULADO: 11,
  TEXTO_LARGO: 17,   // texto lista/largo
};

// Rótulos que vienen desde la estructura dinámica pero no deben
// imprimirse en el PDF final porque duplican/ensucian el layout.
const OMITIR_RUBRICAS_ESTRUCTURA = new Set([
  'RIPS CONSULTA',
  'DIAGNOSTICO',
  'DIAGNÓSTICO',
  'DIAGNOSTICOS',
  'DIAGNÓSTICOS',
]);

// ── Helpers de formato ────────────────────────────────────────────────────
function escapeHtml(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\r?\n/g, '<br>');
}

function formatFecha(value) {
  if (!value) return '';
  // Si es un objeto Date, usamos sus componentes UTC para evitar el shift de zona horaria local (Bogotá -5h).
  // Si es string, el constructor new Date() lo interpretará; luego extraemos los componentes UTC.
  const d = value instanceof Date ? value : new Date(value);
  
  if (isNaN(d.getTime())) return String(value);

  const pad = (n) => String(n).padStart(2, '0');
  const day = pad(d.getUTCDate());
  const month = pad(d.getUTCMonth() + 1);
  const year = d.getUTCFullYear();
  let hours = d.getUTCHours();
  const minutes = pad(d.getUTCMinutes());
  
  const ampm = hours >= 12 ? 'p. m.' : 'a. m.';
  hours = hours % 12;
  hours = hours ? hours : 12; // el 0 es 12
  
  // Formato: DD/MM/YYYY, HH:mm a. m. (usando valores literales de la DB)
  return `${day}/${month}/${year}, ${pad(hours)}:${minutes} ${ampm}`;
}

function formatDecimal(value, decimales = 2) {
  if (value == null || value === '') return '';
  const n = Number(value);
  if (isNaN(n)) return String(value);
  return n.toLocaleString('es-CO', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

function bytesToDataUrl(bytes, mime = 'image/png') {
  if (!bytes) return '';
  if (typeof bytes === 'string' && bytes.startsWith('data:')) return bytes;
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  return `data:${mime};base64,${buf.toString('base64')}`;
}

function buildFormat(parametros = {}) {
  // PAPEL_HISTORIA puede venir como código (1=Carta, 2=Oficio, etc.).
  switch (parametros.PAPEL_HISTORIA) {
    case 2: return 'Legal';
    case 3: return 'A4';
    default: return 'Letter';
  }
}

// ── Resolución de macros tipo {{NOMBRE_TOKEN}} ────────────────────────────
function resolverTokens(texto, tokens) {
  if (!texto || typeof texto !== 'string') return texto || '';
  return texto.replace(/\{\{\s*([^}\s]+)\s*\}\}/g, (m, key) => {
    const v = tokens[key];
    return v == null ? '' : escapeHtml(v);
  });
}

function esTituloGinecoObstetrico(texto = '') {
  const t = String(texto).toUpperCase();
  return t.includes('GINECO') || t.includes('OBSTETRI');
}

/** Bloque ya renderizado por renderProfesionalInfo + renderFirma; omitir el de la plantilla para evitar duplicado y solapamiento en PDF. */
function esTituloProfesionalSalud(texto = '') {
  const t = String(texto || '')
    .toUpperCase()
    .replace(/:$/, '')
    .trim();
  if (!t.includes('PROFESIONAL')) return false;
  return t.includes('SALUD') || t.includes('LA SALUD');
}

function normalizeKey(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getCampo(payload, posiblesClaves = []) {
  const campos = (payload && payload.campos) || {};
  const byNorm = new Map();
  for (const [k, v] of Object.entries(campos)) {
    byNorm.set(normalizeKey(k), v);
  }
  for (const key of posiblesClaves) {
    const val = byNorm.get(normalizeKey(key));
    if (val != null && String(val).trim() !== '') return val;
  }
  return '';
}

function formatSoloFecha(value) {
  if (!value) return '';
  if (typeof value === 'string' && value.includes('T')) {
    const [yyyy, mm, dd] = value.split('T')[0].split('-');
    return `${dd}/${mm}/${yyyy}`;
  }
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

function getFallbackCampoPorNombre(payload, nombreCampo = '') {
  const n = normalizeKey(String(nombreCampo || '').replace(':', ''));
  const aliases = {
    'fecha del peso': ['Fecha del peso'],
    'peso': ['Peso'],
    'fecha de la talla': ['Fecha de la talla'],
    'talla': ['Talla'],
    'indice de masa corporal': ['Índice de masa corporal', 'Indice de masa corporal'],
    'temperatura': ['Temperatura'],
    'circunferencia de cintura': ['Circunferencia de cintura'],
    'tension arterial sistolica (tas)': ['Tensión arterial sistólica (TAS)', 'Tension arterial sistolica (TAS)'],
    'tension arterial diastolica (tad)': ['Tensión arterial diastólica (TAD)', 'Tension arterial diastolica (TAD)'],
    'tam (tension arterial media)': ['TAM (Tensión arterial media)', 'TAM (Tension arterial media)'],
    'saturacion de oxigeno': ['Saturación de Oxigeno', 'Saturacion de Oxigeno'],
    'frecuencia respiratoria (min)': ['Frecuencia Respitatoria (min)', 'Frecuencia Respiratoria (min)'],
    'frecuencia cardiaca': ['Frecuencia Cárdiaca', 'Frecuencia Cardiaca'],
  };
  const valor = getCampo(payload, aliases[n] || [nombreCampo]);
  if (valor == null || String(valor).trim() === '') return '';
  if (n.startsWith('fecha ')) return formatSoloFecha(valor);
  return String(valor);
}

// ── Árbol de la plantilla ─────────────────────────────────────────────────
/**
 * Reconstruye el árbol de la estructura plana usando ID_ESTRUCTURA_PADRE.
 * Retorna los nodos raíz con propiedad `children` agregada.
 */
function buildTree(estructura) {
  const byId = new Map();
  for (const nodo of estructura) {
    nodo.children = [];
    byId.set(nodo.ID, nodo);
  }

  const roots = [];
  for (const nodo of estructura) {
    const parentId = nodo.ID_ESTRUCTURA_PADRE;
    if (parentId && byId.has(parentId)) {
      byId.get(parentId).children.push(nodo);
    } else {
      roots.push(nodo);
    }
  }

  // Ordenar hijos por ORDEN
  const sortChildren = (nodes) => {
    nodes.sort((a, b) => (a.ORDEN || 0) - (b.ORDEN || 0));
    for (const n of nodes) {
      if (n.children.length) sortChildren(n.children);
    }
  };
  sortChildren(roots);

  return roots;
}

// ── Resolución del valor de un campo ──────────────────────────────────────
function getValor(nodo, payload) {
  const guid = nodo.ID; // GUID del nodo → clave en valoresPorEstructura
  const valores = payload.valoresPorEstructura;
  const tipoFijo = nodo.TIPO_DATO_FIJO || 0;
  const tipoDato = nodo.TIPO_DATO || 0;
  const decimales = nodo.DECIMALES || 2;

  // Si es dato del sistema (TIPO_DATO_FIJO=1), buscar en tokens
  if (tipoFijo === TIPO_FIJO.SISTEMA) {
    const paramSp = nodo.PARAMETRO_SP;
    if (paramSp && payload.tokens[paramSp] != null && payload.tokens[paramSp] !== '') {
      return escapeHtml(payload.tokens[paramSp]);
    }
    return null;
  }

  // Determinar el tipo efectivo
  let efectivo = tipoFijo;
  if (tipoFijo === 0 || tipoFijo == null) {
    // Usar TIPO_DATO para mapear al bucket correcto
    switch (tipoDato) {
      case TIPO_DATO.TEXTO:
      case TIPO_DATO.TEXTO_LARGO:
        efectivo = 'texto';
        break;
      case TIPO_DATO.NUMERICO:
      case TIPO_DATO.CALCULADO:
        efectivo = 'enteros';
        break;
      case TIPO_DATO.DECIMAL:
        efectivo = 'decimal';
        break;
      case TIPO_DATO.LISTA_VALORES:
        efectivo = 'lista';
        break;
      case TIPO_DATO.FECHA:
        efectivo = 'fecha';
        break;
      case TIPO_DATO.LOGICO:
        efectivo = 'enteros';
        break;
      default:
        efectivo = null;
        break;
    }

    // Acceso directo por bucket name
    if (typeof efectivo === 'string') {
      const recs = valores[efectivo].get(guid) || valores.laboratorioTexto.get(guid);
      if (recs && recs.length) {
        if (efectivo === 'fecha') return formatFecha(pickValor(recs));
        if (efectivo === 'decimal') return formatDecimal(pickValor(recs), decimales);
        if (efectivo === 'lista') {
          return recs
            .map(r => escapeHtml(r.VALOR_LISTA ?? r.VALOR ?? r.DESCRIPCION ?? ''))
            .filter(Boolean)
            .join(', ');
        }
        const val = pickValor(recs);
        return val != null ? escapeHtml(val) : '';
      }
      return null;
    }
  }

  // Resolver por TIPO_DATO_FIJO
  switch (efectivo) {
    case TIPO_FIJO.DECIMAL: {
      const recs = valores.decimal.get(guid);
      return recs && recs.length ? formatDecimal(pickValor(recs), decimales) : null;
    }
    case TIPO_FIJO.ENTERO: {
      const recs = valores.enteros.get(guid);
      const v = pickValor(recs);
      return v == null ? null : escapeHtml(parseInt(v, 10));
    }
    case TIPO_FIJO.SELECCION:
    case TIPO_FIJO.LISTA: {
      const recs = valores.lista.get(guid) || [];
      if (!recs.length) return null;
      return recs
        .map(r => escapeHtml(r.VALOR_LISTA ?? r.VALOR ?? r.DESCRIPCION ?? ''))
        .filter(Boolean)
        .join(', ');
    }
    case TIPO_FIJO.TABLA: {
      const datoMeta = nodo.ID_ESTRUCTURA ? payload.datos.get(nodo.ID_ESTRUCTURA) : null;
      const recs = valores.tabla.get(guid) || [];
      return recs.length ? renderTabla(datoMeta, recs) : null;
    }
    case TIPO_FIJO.IMAGEN: {
      const datoMeta = nodo.ID_ESTRUCTURA ? payload.datos.get(nodo.ID_ESTRUCTURA) : null;
      const img = datoMeta && datoMeta.imagenes && datoMeta.imagenes[0];
      if (!img) return null;
      const url = img.IMAGEN
        ? bytesToDataUrl(img.IMAGEN, img.TIPO_MIME || 'image/png')
        : (img.RUTA || '');
      return `<img src="${url}" alt="${escapeHtml(img.NOMBRE || '')}" style="max-width:100%;">`;
    }
    default: {
      // Fallback: probar todos los buckets
      for (const bucket of ['texto', 'decimal', 'enteros', 'fecha', 'lista', 'laboratorioTexto']) {
        const recs = valores[bucket].get(guid);
        if (recs && recs.length) {
          if (bucket === 'fecha') return formatFecha(pickValor(recs));
          if (bucket === 'decimal') return formatDecimal(pickValor(recs), decimales);
          if (bucket === 'lista') {
            return recs.map(r => escapeHtml(r.VALOR_LISTA ?? r.VALOR ?? '')).filter(Boolean).join(', ');
          }
          const val = pickValor(recs);
          return val != null ? escapeHtml(val) : '';
        }
      }
      return null;
    }
  }
}

function pickValor(records) {
  if (!records || records.length === 0) return null;
  const rec = records[0];
  // Intentar todas las variantes de nombre de valor
  return (
    rec.VALOR ?? rec.VALOR_TEXTO ?? rec.VALOR_ENTEROS ??
    rec.VALOR_DECIMAL ?? rec.VALOR_FECHA ?? rec.VALOR_LISTA ?? null
  );
}

function renderTabla(datoMeta, filas) {
  if (!filas || filas.length === 0) return '';
  const columnasMeta = (datoMeta && datoMeta.camposTabla) || [];

  const columnasDetectadas = new Set();
  for (const f of filas) {
    if (f.COLUMNA != null) columnasDetectadas.add(f.COLUMNA);
  }
  const columnas = Array.from(columnasDetectadas).sort((a, b) => a - b);
  const filasIds = Array.from(new Set(filas.map(f => f.FILA))).sort((a, b) => a - b);

  let html = '<table class="tabla-dinamica"><thead><tr>';
  for (const col of columnas) {
    const meta = columnasMeta.find(c => (c.ID_DATO_COLUMNA ?? c.ORDEN) === col);
    html += `<th>${escapeHtml((meta && (meta.NOMBRE || meta.DESCRIPCION)) || `Col ${col}`)}</th>`;
  }
  html += '</tr></thead><tbody>';

  for (const filaId of filasIds) {
    html += '<tr>';
    for (const col of columnas) {
      const celda = filas.find(f => f.FILA === filaId && f.COLUMNA === col);
      html += `<td>${escapeHtml(celda ? (celda.VALOR ?? celda.VALOR_TEXTO ?? '') : '')}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  return html;
}

// ── Recorrido del árbol (depth-first) ─────────────────────────────────────
function renderNodo(nodo, payload, depth, parentNombre, context = {}) {
  const origen = nodo.ORIGEN;
  const nombre = escapeHtml(nodo.NOMBRE || nodo.DESCRIPCION || '');
  const nombrePlano = String(nodo.NOMBRE || nodo.DESCRIPCION || '').trim();
  const nombrePlanoUpper = nombrePlano.toUpperCase();
  const nombrePlanoUpperClean = nombrePlanoUpper.replace(/:$/, '').trim();
  let html = '';

  // Pestaña (sección de nivel superior)
  if (origen === 3) {
    // Si la pestaña es "INFORMACION DEL PACIENTE" o similar, renderizamos el bloque estático y saltamos los hijos
    const upperNombre = nombre.toUpperCase();
    if (upperNombre.includes('INFORMACION DEL PACIENTE') || upperNombre.includes('IDENTIFICACION DEL PACIENTE')) {
      return renderIdentificacionPaciente(payload);
    }
    if (esTituloProfesionalSalud(nombrePlanoUpperClean)) return '';
    if (context.isMale && esTituloGinecoObstetrico(nombrePlanoUpper)) return '';
    if (nombre) html += `<h2 class="seccion">${nombre}</h2>`;
    
    // Propagar contexto de gineco-obstetricia desde la pestaña
    const isGineco = context.isGineco || esTituloGinecoObstetrico(upperNombre);
    const newContext = { ...context, isGineco };

    for (const child of nodo.children) {
      html += renderNodo(child, payload, depth + 1, nombre, newContext);
    }
    return html;
  }

  // Grupo (subsección) — omite el encabezado si repite el nombre de la pestaña padre
  if (origen === 2) {
    if (OMITIR_RUBRICAS_ESTRUCTURA.has(nombrePlanoUpper) || OMITIR_RUBRICAS_ESTRUCTURA.has(nombrePlanoUpperClean)) {
      // Mantener los hijos, omitiendo solo el título redundante.
      for (const child of nodo.children) {
        html += renderNodo(child, payload, depth + 1, parentNombre, context);
      }
      return html;
    }

    if (esTituloProfesionalSalud(nombrePlanoUpperClean)) return '';

    const upperNombre = nombre.toUpperCase();
    if (context.isMale && esTituloGinecoObstetrico(upperNombre)) return '';
    if (upperNombre.includes('INFORMACION DEL PACIENTE') || upperNombre.includes('IDENTIFICACION DEL PACIENTE')) {
      return renderIdentificacionPaciente(payload);
    }
    const mostrarNombre = nombre && nombre !== parentNombre;
    if (mostrarNombre) {
      const tag = depth <= 2 ? 'h3' : 'h4';
      html += `<${tag} class="seccion">${nombre}</${tag}>`;
    }

    // Propagar si estamos dentro de una sección de gineco-obstetricia
    const isGineco = context.isGineco || esTituloGinecoObstetrico(upperNombre);
    const newContext = { ...context, isGineco };

    for (const child of nodo.children) {
      html += renderNodo(child, payload, depth + 1, nombre, newContext);
    }
    return html;
  }

  // Dato (campo con valor)
  if (origen === 1) {
    const tipoFijo = nodo.TIPO_DATO_FIJO || 0;

    // Sección decorativa (TIPO_DATO_FIJO=7)
    if (tipoFijo === TIPO_FIJO.SECCION) {
      if (esTituloProfesionalSalud(nombrePlanoUpperClean)) return '';
      if (context.isMale && esTituloGinecoObstetrico(nombrePlanoUpper)) return '';
      if (
        !OMITIR_RUBRICAS_ESTRUCTURA.has(nombrePlanoUpper)
        && !OMITIR_RUBRICAS_ESTRUCTURA.has(nombrePlanoUpperClean)
        && nombre
        && nombre !== parentNombre
      ) {
        html += `<h4 class="seccion">${nombre}</h4>`;
      }
      for (const child of nodo.children) {
        html += renderNodo(child, payload, depth + 1, nombre, context);
      }
      return html;
    }

    // Texto libre (TIPO_DATO_FIJO=8)
    if (tipoFijo === TIPO_FIJO.TEXTO_LIBRE) {
      const literal = nodo.DESCRIPCION || '';
      html += `<p class="texto-libre">${resolverTokens(literal, payload.tokens)}</p>`;
      return html;
    }

    // Campo con valor (título duplicado de profesional como nodo suelto)
    if (esTituloProfesionalSalud(nombrePlanoUpperClean)) return '';

    let valor = getValor(nodo, payload);
    if (valor === null) valor = ''; // Restaurar la impresión de campos vacíos como Talla, Peso, etc.
    if (valor === '') {
      const fallback = getFallbackCampoPorNombre(payload, nombrePlano);
      if (fallback) valor = escapeHtml(fallback);
    }

    // Evitar que rótulos técnicos/redundantes salgan como líneas vacías.
    if (OMITIR_RUBRICAS_ESTRUCTURA.has(nombrePlanoUpper) || OMITIR_RUBRICAS_ESTRUCTURA.has(nombrePlanoUpperClean)) {
      for (const child of nodo.children) {
        html += renderNodo(child, payload, depth + 1, nombre, context);
      }
      return html;
    }

    const label = nombre.endsWith(':') ? nombre : `${nombre}:`;

    // Filtro para ocultar campos ginecobstétricos exclusivamente a hombres
    // Solo se aplica si estamos dentro de una sección marcada como GINECO/OBSTETRI o si el nombre es claramente femenino
    if (context.isMale) {
      const nUpper = nombre.toUpperCase().replace(':', '').trim();
      const nUpperNoTilde = nUpper
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      const femaleFields = [
        'G', 'P', 'A', 'V', 'C', 'M', 
        'FECHA ÚLTIMO PARTO', 'ÚLTIMA CITOLOGÍA', 'MENARQUIA', 'CICLOS', 
        'F.U.P', 'F.U.R', 'FECHA DE ULTIMO PARTO', 'ULTIMA CITOLOGIA',
        'ULTIMA FECHA DE MENSTRUACION', 'FECHA ULTIMA MENSTRUACION', 'F.U.M', 'FUM', 'FUR',
        'FECHA DE ULTIMA MENSTRUACION'
      ];
      
      const esCampoFemenino = femaleFields.includes(nUpper) || femaleFields.includes(nUpperNoTilde);
      // Solo ocultamos si es campo femenino Y estamos en sección de gineco, o si es un campo largo inequívoco
      if (esCampoFemenino && (context.isGineco || nUpper.length > 5)) {
        return ''; // Omitir el campo completo
      }
    }

    if (tipoFijo === TIPO_FIJO.TABLA || tipoFijo === TIPO_FIJO.IMAGEN) {
      if (valor !== '') {
        html += `<div class="campo-block"><b>${label}</b><div>${valor}</div></div>`;
      }
    } else {
      html += `<div class="campo-line"><b>${label}</b><span class="val">${valor}</span></div>`;
    }

    // Un dato puede tener sub-datos (raro pero posible)
    for (const child of nodo.children) {
      html += renderNodo(child, payload, depth + 1, nombre, context);
    }
    return html;
  }

  return html;
}

function renderEstructura(payload) {
  const estructura = payload.plantilla.estructura || [];
  const tree = buildTree(estructura);

  const at = payload.atencion || {};
  const b3 = at.basico_op3 || {};
  const t = payload.tokens || {};
  const generoVal = b3.GENERO_PACIENTE === 1 ? 'Masculino' : b3.GENERO_PACIENTE === 2 ? 'Femenino' : t['SEXO'] || t['GENERO'] || '';
  const generoNormalizado = (generoVal || '').toString().trim().toUpperCase();
  const isMale = b3.GENERO_PACIENTE === 1
    || ['M', 'MASCULINO', 'HOMBRE', 'MALE'].includes(generoNormalizado);

  let html = '';
  for (const root of tree) {
    html += renderNodo(root, payload, 0, '', { isMale });
  }
  return html;
}

// ── Bloques específicos ──────────────────────────────────────────────────
function renderIdentificacionPaciente(payload) {
  const at = payload.atencion || {};
  const b3 = at.basico_op3 || {};
  const t = payload.tokens || {};
  
  function formatDateOnly(value) {
    if (!value) return '';
    if (typeof value === 'string' && value.includes('T')) {
      const [yyyy, mm, dd] = value.split('T')[0].split('-');
      return `${dd}/${mm}/${yyyy}`;
    }
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
  }

  const apellidos = escapeHtml(b3.APELLIDOS_PACIENTE || t['APELLIDOS_PACIENTE'] || t['APELLIDO_PACIENTE'] || t['APELLIDO'] || '');
  const nombres = escapeHtml(b3.NOMBRES_PACIENTE || t['NOMBRES_PACIENTE'] || t['NOMBRE_PACIENTE'] || t['NOMBRE'] || '');
  const tipoId = escapeHtml(b3.CODIGO_TIPO_IDENTIFICACION || t['TIPO_IDENTIFICACION'] || t['TIPO_ID'] || '');
  const numId = escapeHtml(b3.NUMERO_IDENTIFICACION_PACIENTE || t['IDENTIFICACION_PACIENTE'] || t['IDENTIFICACION'] || t['NUMERO_DOCUMENTO'] || '');
  const fechaNac = escapeHtml(formatDateOnly(b3.FECHA_NACIMIENTO_PACIENTE || t['FECHA_NACIMIENTO']));
  const edad = escapeHtml(b3.EDAD_COMPLETA || (b3.EDAD_PACIENTE ? b3.EDAD_PACIENTE + ' Años' : t['EDAD'] || ''));
  const genero = escapeHtml(b3.GENERO_PACIENTE === 1 ? 'Masculino' : b3.GENERO_PACIENTE === 2 ? 'Femenino' : t['SEXO'] || t['GENERO'] || '');
  const ocupacion = escapeHtml(b3.OCUPACION || t['OCUPACION'] || '');
  const direccion = escapeHtml(b3.DIRECCION || t['DIRECCION'] || '');
  const telefono = escapeHtml(b3.TELEFONO || t['TELEFONO'] || t['TELEFONO_CASA'] || '');
  const cliente = escapeHtml(b3.NOMBRE_CLIENTE_CONVENIO || at.CLIENTE || t['CLIENTE'] || '');
  const convenio = escapeHtml(b3.NOMBRE_CONVENIO || at.CONVENIO || t['CONVENIO'] || '');
  const fechaReg = escapeHtml(formatFecha(b3.FECHA_REGISTRO) || formatFecha(at.FECHA_REGISTRO) || t['FECHA_REGISTRO'] || '');
  const fechaAten = escapeHtml(formatFecha(b3.FECHA_ATENCION) || formatFecha(at.FECHA_ATENCION) || t['FECHA_ATENCION'] || '');

  const estadoCivil = escapeHtml(
    b3.ESTADO_CIVIL
    || b3.ESTADO_CIVIL_PACIENTE
    || b3.NOMBRE_ESTADO_CIVIL
    || t['ESTADO_CIVIL']
    || getCampo(payload, ['Estado civil'])
    || 'No registrado'
  );
  const resp = escapeHtml(
    b3.NOMBRE_RESPONSABLE
    || b3.ACOMPANANTE
    || b3.NOMBRE_ACOMPANANTE
    || t['NOMBRE_ACOMPAÑANTE']
    || t['RESPONSABLE']
    || getCampo(payload, ['Nombre responsable', 'Acompañante'])
    || 'No registrado'
  );
  const parentesco = escapeHtml(
    b3.PARENTESCO_RESPONSABLE
    || b3.PARENTESCO
    || b3.PARENTESCO_ACOMPANANTE
    || t['PARENTESCO_ACOMPAÑANTE']
    || t['PARENTESCO']
    || getCampo(payload, ['Parentesco responsable', 'Parentesco'])
    || 'No registrado'
  );
  const telResp = escapeHtml(
    b3.TELEFONO_RESPONSABLE
    || b3.TELEFONO_ACOMPANANTE
    || t['TELEFONO_ACOMPAÑANTE']
    || t['TELEFONO_RESPONSABLE']
    || getCampo(payload, ['Teléfono responsable', 'Telefono responsable'])
    || 'No registrado'
  );
  const etnia = escapeHtml(
    b3.PERTENENCIA_ETNICA
    || b3.ETNIA
    || t['PERTENENCIA_ETNICA']
    || t['ETNIA']
    || getCampo(payload, ['Pertenencia étnica', 'Pertenencia etnica', 'Etnia'])
    || 'No registrado'
  );
  const pais = escapeHtml(
    b3.PAIS_NACIMIENTO
    || b3.PAIS
    || t['PAIS_NACIMIENTO']
    || getCampo(payload, ['País nacimiento', 'Pais nacimiento'])
    || 'No registrado'
  );
  const codigoProcedimiento = escapeHtml(b3.CODIGO_PROCEDIMIENTO || getCampo(payload, ['Código procedimiento', 'Codigo procedimiento']));
  const nombreProcedimiento = escapeHtml(b3.NOMBRE_PROCEDIMIENTO || getCampo(payload, ['Nombre procedimiento']));
  const lineaProcedimiento = [codigoProcedimiento, nombreProcedimiento].filter(Boolean).join(' - ');

  return `
    ${lineaProcedimiento ? `<div class="campo-line" style="margin: 0 0 4px 0;">${lineaProcedimiento}</div>` : ''}
    <h3 style="font-size: 10px; font-weight: bold; margin: 4px 0 4px 0; text-transform: uppercase; text-decoration: underline; clear: both; display: block; line-height: 1.3;">IDENTIFICACIÓN DEL PACIENTE</h3>
    <table style="width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 4px; table-layout: fixed;">
      <colgroup>
        <col style="width: 18%">
        <col style="width: 32%">
        <col style="width: 18%">
        <col style="width: 32%">
      </colgroup>
      <tbody>
        <tr>
          <td style="padding: 3px 6px 3px 0; vertical-align: top; word-break: break-word;"><b>Apellidos:</b></td>
          <td style="padding: 3px 6px 3px 0; vertical-align: top; word-break: break-word;">${apellidos}</td>
          <td style="padding: 3px 6px 3px 0; vertical-align: top; word-break: break-word;"><b>Nombres:</b></td>
          <td style="padding: 3px 0 3px 0; vertical-align: top; word-break: break-word;">${nombres}</td>
        </tr>
        <tr>
          <td style="padding: 3px 6px 3px 0; vertical-align: top; word-break: break-word;"><b>Tipo Identificación:</b></td>
          <td style="padding: 3px 6px 3px 0; vertical-align: top; word-break: break-word;">${tipoId}</td>
          <td style="padding: 3px 6px 3px 0; vertical-align: top; word-break: break-word;"><b>Número documento:</b></td>
          <td style="padding: 3px 0 3px 0; vertical-align: top; word-break: break-word;">${numId}</td>
        </tr>
        <tr>
          <td style="padding: 3px 6px 3px 0; vertical-align: top; word-break: break-word;"><b>Fecha de Nacimiento:</b></td>
          <td style="padding: 3px 6px 3px 0; vertical-align: top; word-break: break-word;">${fechaNac}</td>
          <td style="padding: 3px 6px 3px 0; vertical-align: top; word-break: break-word;"><b>Edad:</b></td>
          <td style="padding: 3px 0 3px 0; vertical-align: top; word-break: break-word;">${edad}</td>
        </tr>
        <tr>
          <td style="padding: 3px 6px 3px 0; vertical-align: top; word-break: break-word;"><b>Género:</b></td>
          <td style="padding: 3px 6px 3px 0; vertical-align: top; word-break: break-word;">${genero}</td>
          <td style="padding: 3px 6px 3px 0; vertical-align: top; word-break: break-word;"><b>Ocupación:</b></td>
          <td style="padding: 3px 0 3px 0; vertical-align: top; word-break: break-word;">${ocupacion}</td>
        </tr>
        <tr>
          <td style="padding: 3px 6px 3px 0; vertical-align: top; word-break: break-word;"><b>Dirección:</b></td>
          <td style="padding: 3px 6px 3px 0; vertical-align: top; word-break: break-word;">${direccion}</td>
          <td style="padding: 3px 6px 3px 0; vertical-align: top; word-break: break-word;"><b>Teléfono:</b></td>
          <td style="padding: 3px 0 3px 0; vertical-align: top; word-break: break-word;">${telefono}</td>
        </tr>
        <tr>
          <td style="padding: 3px 6px 3px 0; vertical-align: top; word-break: break-word;"><b>Nombre del Cliente:</b></td>
          <td style="padding: 3px 6px 3px 0; vertical-align: top; word-break: break-word;">${cliente}</td>
          <td style="padding: 3px 6px 3px 0; vertical-align: top; word-break: break-word;"><b>Convenio:</b></td>
          <td style="padding: 3px 0 3px 0; vertical-align: top; word-break: break-word;">${convenio}</td>
        </tr>
        <tr>
          <td style="padding: 3px 6px 3px 0; vertical-align: top; word-break: break-word;"><b>Fecha registro :</b></td>
          <td style="padding: 3px 6px 3px 0; vertical-align: top; word-break: break-word;">${fechaReg}</td>
          <td style="padding: 3px 6px 3px 0; vertical-align: top; word-break: break-word;"><b>Fecha atención:</b></td>
          <td style="padding: 3px 0 3px 0; vertical-align: top; word-break: break-word;">${fechaAten}</td>
        </tr>
      </tbody>
    </table>
    <div style="font-size: 10px; margin-bottom: 6px; font-family: Arial, sans-serif; line-height: 1.4;">
      ${estadoCivil !== 'No registrado' ? `<span style="margin-right: 16px;"><b>Estado civil:</b> ${estadoCivil}</span>` : ''}
      ${resp !== 'No registrado' ? `<span style="margin-right: 16px;"><b>Nombre responsable:</b> ${resp}</span>` : ''}
      ${parentesco !== 'No registrado' ? `<span style="margin-right: 16px;"><b>Parentesco responsable:</b> ${parentesco}</span>` : ''}
      ${telResp !== 'No registrado' ? `<span style="margin-right: 16px;"><b>Teléfono responsable:</b> ${telResp}</span>` : ''}
      ${etnia !== 'No registrado' ? `<span style="margin-right: 16px;"><b>Pertenencia étnica:</b> ${etnia}</span>` : ''}
      ${pais !== 'No registrado' ? `<span><b>País nacimiento:</b> ${pais}</span>` : ''}
    </div>
  `;
}

function renderEncabezado(payload) {
  const ips = payload.ips || {};
  const sede = payload.sede || {};
  const logo = payload.logoIps && payload.logoIps.LOGO
    ? bytesToDataUrl(payload.logoIps.LOGO, payload.logoIps.TIPO_MIME || 'image/png')
    : '';

  const razonSocial = ips.RAZON_SOCIAL || '';
  const nit = ips.NUMERO_IDENTIFICACION || ips.NIT || '890980752-3'; // Fallback a NIT del hospital si no llega
  const sigla = ips.SIGLA || '';
  const lema = ips.LEMA || 'Un hospital que siente'; // Lema institucional
  const nombreSede = sede.NOMBRE || '';
  const direccion = sede.DIRECCION || ips.DIRECCION || '';
  const telefono = sede.TELEFONO || ips.TELEFONO || '';

  const fechaImpresion = new Date().toLocaleString('es-CO', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });

  return `
    <table class="header-table" style="table-layout: fixed; width: 100%;">
      <tr>
        <td style="width:25%; vertical-align: middle;">${logo ? `<img src="${logo}" style="max-width:90px;max-height:90px;">` : ''}</td>
        <td class="header-center" style="width:50%; vertical-align: middle;">
          <b>${escapeHtml(razonSocial)}</b><br>
          <b>NIT - ${escapeHtml(nit)}</b><br>
          <b>${escapeHtml(lema)}</b><br>
          ${escapeHtml(direccion)} - ${escapeHtml(telefono)} - Marinilla - Colombia
        </td>
        <td class="header-right" style="width:25%; vertical-align: top;">
          Fecha impresión: ${fechaImpresion}<br>
          Copia
        </td>
      </tr>
    </table>
    <hr class="header-sep">
  `;
}

function renderDiagnosticos(payload) {
  const dx = payload.clinico.diagnosticos || [];
  if (!dx.length) return '';

  const esPrincipal = (d) => {
    const tipo = String(d.DESCRIPCION_TIPO_DX_PPAL || d.TIPO_DX || d.TIPO || '').toUpperCase();
    const tipoRips = d.ID_TIPO_DIAGNOSTICO_RIPS;
    return d.PRINCIPAL === 1
      || d.ES_PRINCIPAL === 1
      || tipoRips === 0
      || tipoRips === '0'
      || tipo.includes('PRINCIPAL')
      || tipo.includes('INGRESO');
  };

  const principal = dx.find(esPrincipal) || dx[0];
  const relacionados = dx.filter(d => d !== principal);

  const codigoPrincipal = principal.CODIGO_CIE || principal.CIE || '';
  const descripcionPrincipal = principal.DESCRIPCION_CIE || principal.DESCRIPCION || '';
  const tipoPrincipal = principal.DESCRIPCION_TIPO_DX_PPAL || principal.TIPO_DX || principal.TIPO || '';

  let html = '<h3 class="seccion">DIAGNÓSTICOS</h3>';
  html += `<div class="campo-line"><b>Principal Ingreso:</b> <span class="val">${escapeHtml(`${codigoPrincipal} - ${descripcionPrincipal}`.trim().replace(/^-\s*/, ''))}</span></div>`;

  if (tipoPrincipal || relacionados.length) {
    let lineaRelacionados = '';
    if (relacionados.length) {
      const rel = relacionados
        .map((d, i) => {
          const cod = d.CODIGO_CIE || d.CIE || '';
          const des = d.DESCRIPCION_CIE || d.DESCRIPCION || '';
          return `Relacionado ${i + 1} Ingreso: ${cod} - ${des}`.replace(/\s-\s$/, '');
        })
        .join('  ');
      lineaRelacionados = rel;
    }

    const baseTipo = tipoPrincipal ? `Tipo principal: ${tipoPrincipal}` : '';
    const contenido = [baseTipo, lineaRelacionados].filter(Boolean).join('    ');
    html += `<div class="campo-line"><span class="val">${escapeHtml(contenido)}</span></div>`;
  }

  return html;
}

function renderAlergias(payload) {
  const al = payload.paciente.alergias || [];
  if (!al.length) return '';
  let html = '<h3 class="seccion">ALERGIAS</h3><ul>';
  for (const a of al) {
    html += `<li>${escapeHtml(a.NOMBRE || a.CODIGO || '')}${a.ADICION ? ' — ' + escapeHtml(a.ADICION) : ''}</li>`;
  }
  html += '</ul>';
  return html;
}

function renderAntecedentes(payload) {
  const ant = payload.paciente.antecedentes || [];
  if (!ant.length) return '';
  let html = '<h3 class="seccion">ANTECEDENTES PERSONALES</h3>';
  for (const a of ant) {
    if (!a.ANTECEDENTE) continue;
    html += `<div class="campo-line">${escapeHtml(a.ANTECEDENTE)}</div>`;
  }
  return html;
}

function renderSintomas(payload) {
  const sin = payload.clinico.sintomas || [];
  if (!sin.length) return '';
  let html = '<h3 class="seccion">SÍNTOMAS</h3><ul>';
  for (const s of sin) {
    html += `<li>${escapeHtml(s.NOMBRE_SINTOMA || s.NOMBRE || '')}</li>`;
  }
  html += '</ul>';
  return html;
}

function renderCalculosRiesgo(payload) {
  const cr = payload.clinico.calculosRiesgo || [];
  if (!cr.length) return '';
  let html = '<h2 class="seccion">CÁLCULOS DE RIESGO</h2><table class="tabla-dinamica"><thead><tr><th>Nombre</th><th>Interpretación</th><th>Puntaje Total</th><th>Observaciones</th></tr></thead><tbody>';
  for (const c of cr) {
    html += `<tr>
      <td>${escapeHtml(c.NOMBRE || '')}</td>
      <td>${escapeHtml(c.INTERPRETACION || '')}</td>
      <td>${escapeHtml(c.TOTAL || '')}</td>
      <td>${escapeHtml(c.OBSERVACIONES || '')}</td>
    </tr>`;
  }
  html += '</tbody></table>';
  return html;
}

function renderNotas(payload) {
  const notas = payload.clinico.notas || [];
  if (!notas.length) return '';
  let html = '<h2 class="seccion">NOTAS ACLARATORIAS</h2>';
  for (const n of notas) {
    html += `<div class="campo-line"><b>${escapeHtml(formatFecha(n.FECHA_REGISTRO))}:</b> <span class="val">${escapeHtml(n.NOTA || '')}</span></div>`;
  }
  return html;
}

function renderGraficas(payload) {
  const graficas = payload.clinico.graficas || [];
  if (!graficas.length) return '';
  let html = '<h2 class="seccion">GRÁFICAS E IMÁGENES DE ATENCIÓN</h2>';
  for (const g of graficas) {
    if (!g.GRAFICA_BYTES) continue;
    const url = bytesToDataUrl(g.GRAFICA_BYTES, g.TIPO_MIME || 'image/png');
    html += `<div class="campo-block"><b>${escapeHtml(g.NOMBRE || 'Gráfica')}</b><br><img src="${url}" style="max-width:100%; margin-top:8px;"></div>`;
  }
  return html;
}

// Columnas que no aportan valor al paciente y ocupan espacio horizontal
const denylist = new Set([
  'CONSECUTIVO', 'ID_ORDEN', 'TIPO_ORDEN', 'ID_PRESTADOR', 'ID_SERVICIO', 
  'ID_ESTRUCTURA', 'ID_PLANTILLA', 'ID_PROCEDIMIENTO', 'ID_ATENCION', 
  'USER_NAME', 'USUARIO', 'ID_EMPLEADO', 'ID_DX', 'ID_ARTICULO', 'ID_BODEGA'
]);

function renderRecordsets(titulo, recordsets) {
  let out = '';
  let primero = true;
  for (const rs of recordsets || []) {
    if (!rs || rs.length === 0) continue;
    if (primero) {
      out += `<h2 class="seccion">${titulo}</h2>`;
      primero = false;
    }
    
    // Filtrar columnas
    const allCols = Object.keys(rs[0]);
    const cols = allCols.filter(c => !denylist.has(c.toUpperCase()));
    
    out += '<table class="tabla-dinamica"><thead><tr>';
    for (const c of cols) {
      // Limpiar nombres de columnas (quitar guiones bajos por espacios para mejor wrap)
      const label = c.replace(/_/g, ' ');
      out += `<th>${escapeHtml(label)}</th>`;
    }
    out += '</tr></thead><tbody>';
    
    for (const r of rs) {
      out += '<tr>';
      for (const c of cols) {
        out += `<td>${escapeHtml(r[c])}</td>`;
      }
      out += '</tr>';
    }
    out += '</tbody></table>';
  }
  return out;
}

function renderOrdenesPanacea(recordsets) {
  let hasData = false;
  let firstTpl = '';
  for (const rs of recordsets) {
    if (rs && rs.length && rs[0].NOMBRE_PLANTILLA) {
       firstTpl = rs[0].NOMBRE_PLANTILLA;
       break;
    }
  }
  const titulo = (firstTpl || 'ORDEN DE LABORATORIO').toUpperCase();

  let htmlTable = `
    <div style="margin-top: 14px; clear: both; display: block; width: 100%;">
      <h3 class="seccion" style="margin-bottom: 6px;">${escapeHtml(titulo)}</h3>
      <table class="orden-table">
        <colgroup>
          <col style="width: 4%">
          <col style="width: 60%">
          <col style="width: 9%">
          <col style="width: 9%">
          <col style="width: 9%">
          <col style="width: 9%">
        </colgroup>
        <thead>
          <tr>
            <th style="text-align:center;">#</th>
            <th>Servicio/Procedimiento</th>
            <th style="text-align:center;">Cantidad</th>
            <th>Estado</th>
            <th>Prioridad</th>
            <th>Tipo uso</th>
          </tr>
        </thead>
        <tbody>
  `;

  let idx = 1;
  for (const rs of recordsets) {
    if (!rs || !rs.length) continue;
    hasData = true;
    const cleanStr = (s) => String(s || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
    
    for (const f of rs) {
      const codigo = cleanStr(f.CODIGO_PROCEDIMIENTO);
      let desc = cleanStr(f.DESCRIPCION_PROCEDIMIENTO || f.PRUEBA || f.NOMBRE_SERVICIO || f.NOMBRE || f.DESCRIPCION || '');

      // Fallback para filas de incapacidad/licencia donde los campos de descripción vienen null.
      // Panacea muestra: "23/04/2025 10:00 - INCAPACIDADES O LICENCIAS - MEDICINA GENERAL - SABRINA JOHANA CAAMANO BANOL"
      if (!desc && f.NOMBRE_PLANTILLA) {
        const partes = [];
        if (f.FECHA_EXPEDICION) {
          const d = new Date(f.FECHA_EXPEDICION);
          if (!isNaN(d)) {
            const pad = (n) => String(n).padStart(2, '0');
            partes.push(`${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`);
          }
        }
        partes.push(cleanStr(f.NOMBRE_PLANTILLA));
        if (f.NOMBRE_ESPECIALIDAD) partes.push(cleanStr(f.NOMBRE_ESPECIALIDAD));
        if (f.NOMBRE_COMPLETO_PRESTADOR) partes.push(cleanStr(f.NOMBRE_COMPLETO_PRESTADOR));
        desc = partes.join(' - ');
      }

      const srv = codigo ? `${codigo} - ${desc}` : desc;
      const cant = cleanStr(f.CANTIDAD || '1');
      const area = cleanStr(f.AREA_CORPORAL);
      const lat = cleanStr(f.LATERALIDAD);
      const est = cleanStr(f.ESTADO_ORDEN || f.ESTADO || 'Solicitada');
      const prio = cleanStr(f.PRIORIDAD || 'Programada');
      const uso = cleanStr(f.TIPO_USO || 'Externo');

      let srvHtml = escapeHtml(srv);
      const obs = cleanStr(f.OBSERVACIONES);
      const com = cleanStr(f.COMENTARIO);
      if (com) srvHtml += `<br><small><b>Comentario:</b> ${escapeHtml(com)}</small>`;
      if (obs) srvHtml += `<br><small><b>Obs:</b> ${escapeHtml(obs)}</small>`;

      htmlTable += `
        <tr>
          <td style="text-align:center;">${idx++}</td>
          <td>${srvHtml}</td>
          <td style="text-align:center;">${escapeHtml(cant)}</td>
          <td>${escapeHtml(est)}</td>
          <td>${escapeHtml(prio)}</td>
          <td>${escapeHtml(uso)}</td>
        </tr>
      `;
    }
  }
  
  htmlTable += `</tbody></table></div>`;
  
  return hasData ? htmlTable : '';
}

function numeroALetras(num) {
  if (num === null || isNaN(num)) return '';
  let n = Math.floor(Number(num));
  if (n === 0) return 'cero';

  const unidades = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
  const decenas = ['', 'diez', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
  const especiales = { 11: 'once', 12: 'doce', 13: 'trece', 14: 'catorce', 15: 'quince', 16: 'dieciséis', 17: 'diecisiete', 18: 'dieciocho', 19: 'diecinueve', 21: 'veintiuno', 22: 'veintidós', 23: 'veintitrés', 24: 'veinticuatro', 25: 'veinticinco', 26: 'veintiséis', 27: 'veintisiete', 28: 'veintiocho', 29: 'veintinueve' };
  const centenas = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

  function decen(x) {
    if (x < 10) return unidades[x];
    if (especiales[x]) return especiales[x];
    let u = x % 10;
    let d = Math.floor(x / 10);
    if (u === 0) return decenas[d];
    return decenas[d] + ' y ' + unidades[u];
  }

  function centen(x) {
    if (x === 100) return 'cien';
    let d = x % 100;
    let c = Math.floor(x / 100);
    if (d === 0) return centenas[c];
    return centenas[c] + ' ' + decen(d);
  }

  function mil(x) {
    let c = x % 1000;
    let m = Math.floor(x / 1000);
    let strC = c > 0 ? centen(c) : '';
    if (m === 0) return strC;
    if (m === 1) return 'mil ' + strC;
    return centen(m) + ' mil ' + strC;
  }

  return mil(n).trim();
}

function getFormaFarmaceutica(nombreMedicamento) {
  const n = String(nombreMedicamento || '').toUpperCase();
  if (n.includes('AMPOLLA')) return 'Ampolla';
  if (n.includes('TABLETA DISPERSABLE')) return 'Tableta dispersable';
  if (n.includes('TABLETA') || n.includes('TAB')) return 'Tableta';
  if (n.includes('CAPSULA') || n.includes('CAP')) return 'Cápsula';
  if (n.includes('JARABE')) return 'Jarabe';
  if (n.includes('SUSPENSION')) return 'Suspensión';
  if (n.includes('GOTAS')) return 'Gotas';
  if (n.includes('CREMA')) return 'Crema';
  if (n.includes('UNGUENTO')) return 'Ungüento';
  if (n.includes('LOCION')) return 'Loción';
  if (n.includes('GEL')) return 'Gel';
  if (n.includes('SOLUCION')) return 'Solución';
  if (n.includes('POLVO')) return 'Polvo';
  if (n.includes('AEROSOL') || n.includes('INHALADOR')) return 'Inhalador';
  if (n.includes('SUPOSITORIO')) return 'Supositorio';
  if (n.includes('INYECCION') || n.includes('INYECTABLE')) return 'Inyectable';
  if (n.includes('SOBRE')) return 'Sobre';
  if (n.includes('JERINGA')) return 'Jeringa';
  if (n.includes('TUBO')) return 'Tubo';
  if (n.includes('VIAL')) return 'Vial';
  if (n.includes('PARCHE')) return 'Parche';
  return '';
}

function renderFormulaMedicaPanacea(formulacionRS, ordenesRS, opts = {}, op2Rows = []) {
  const { showTitle = true } = opts;
  const medRsFromOrdenes = (ordenesRS || []).filter(rs =>
    rs && rs.length && String(rs[0].NOMBRE_PLANTILLA).toUpperCase().includes('MEDICAMENTO')
  );
  const allFormulaRS = [...(formulacionRS || []), ...medRsFromOrdenes];
  
  const filas = [];
  for (const rs of allFormulaRS) {
    if (!rs || !rs.length) continue;
    for (const r of rs) {
      filas.push(r);
    }
  }
  if (!filas.length) return '';

  let html = '';
  if (showTitle) html += '<h3 class="seccion">ORDEN DE MEDICAMENTO:</h3>';
  html += `
    <table class="orden-table">
      <colgroup>
        <col style="width: 4%"/>
        <col style="width: 40%"/>
        <col style="width: 12%"/>
        <col style="width: 24%"/>
        <col style="width: 12%"/>
        <col style="width: 8%"/>
      </colgroup>
      <thead>
        <tr>
          <th style="text-align:center;">#</th>
          <th>Medicamento</th>
          <th style="text-align:center;">Vía<br>administración</th>
          <th style="text-align:center;">Dosis</th>
          <th style="text-align:center;">Cantidad total</th>
          <th style="text-align:center;">Estado</th>
        </tr>
      </thead>
      <tbody>
  `;

  let idx = 1;
  for (const r of filas) {
    const codigo = r.CODIGO_PROCEDIMIENTO || '';
    const desc = r.DESCRIPCION_PROCEDIMIENTO || r.PRUEBA || r.NOMBRE_SERVICIO || '';
    const medicamento = codigo ? `${codigo} - ${desc}` : desc;
    
    const viaAdmin = escapeHtml(r.VIA_ADMINISTRACION || r.VIA || 'Oral');
    
    // Armar Dosis — prioridad: Op2.DISTANCIA > texto descriptivo > valor numérico
    let dosisText = '';
    // Buscar la fila Op2 correspondiente a este medicamento por código de procedimiento
    const codigoMed = (r.CODIGO_PROCEDIMIENTO || '').trim();
    const op2Row = op2Rows.find(row => {
      const itemCode = (String(row.ITEM || '')).split(' - ')[0].trim();
      return itemCode === codigoMed;
    }) || {};
    const dosisTextoRaw = op2Row.DISTANCIA
                       || r.DOSIS_ESPECIAL_TEXTO || r.INDICACIONES || r.POSOLOGIA
                       || r.DESCRIPCION_POSOLOGIA || r.FRECUENCIA_TEXTO || r.DOSIS_DESCRIPCION;
    if (dosisTextoRaw && String(dosisTextoRaw).trim()) {
      dosisText = String(dosisTextoRaw).trim();
    } else {
      const dosisVal = r.DOSIS || r.CANTIDAD || '1';
      dosisText = `${dosisVal} cada 24 horas`;
    }
    // Agregar duración si no viene incluida
    const dias = r.DIAS_TRATAMIENTO;
    if (dias && !dosisText.toLowerCase().includes('durante')) {
      dosisText += ` durante ${dias} d\u00edas`;
    }
    
    // Armar Cantidad total
    let cantTotalVal = r.CANT_DOSIS || r.CANTIDAD_FOFA || r.CANTIDAD_TOTAL || r.CANTIDAD;
    if (cantTotalVal == null) {
      cantTotalVal = '1';
    } else {
      cantTotalVal = Number(cantTotalVal);
    }
    const forma = getFormaFarmaceutica(desc) || (op2Row.FORMA_FARMACEUTICA ? String(op2Row.FORMA_FARMACEUTICA) : '');
    const cantLetras = numeroALetras(cantTotalVal);
    let cantidadTotalText = `${cantTotalVal} (${cantLetras}) ${forma}`.trim();
    // Reemplazar espacios dobles si forma está vacío
    cantidadTotalText = cantidadTotalText.replace(/\s+/g, ' ');

    html += `
      <tr>
        <td style="text-align:center;">${idx++}</td>
        <td>${escapeHtml(medicamento)}</td>
        <td style="text-align:center;">${viaAdmin}</td>
        <td>${escapeHtml(dosisText)}</td>
        <td style="text-align:center;">${escapeHtml(cantidadTotalText)}</td>
        <td style="text-align:center;">Autorizado</td>
      </tr>
    `;
  }

  html += `</tbody></table>`;
  return html;
}

function renderOrdenesYFormulacion(payload) {
  const ordenesRS = payload.clinico.ordenes || [];
  const formulacionRS = payload.clinico.formulacion || [];
  
  // Excluir de ordenesPanacea lo que sea de FÓRMULA MÉDICA o MEDICAMENTOS
  const ordenesSinMeds = ordenesRS.filter(rs => {
    if (!rs || !rs.length) return false;
    const tpl = String(rs[0].NOMBRE_PLANTILLA).toUpperCase();
    return !tpl.includes('MEDICAMENTO');
  });

  let html = '';
  html += renderOrdenesPanacea(ordenesSinMeds);
  html += renderFormulaMedicaPanacea(formulacionRS, ordenesRS);
  return html;
}

function renderTratamientosOdonto(payload) {
  const tratamientos = payload.clinico.tratamientosOdonto || [];
  if (!tratamientos || tratamientos.length === 0) return '';
  return renderRecordsets('TRATAMIENTOS ODONTOLÓGICOS', tratamientos);
}

function renderProfesionalInfo(payload) {
  const prof = payload.profesional && payload.profesional.meta;
  if (!prof) return '';
  const nombre = [
    prof.PRIMER_NOMBRE, prof.SEGUNDO_NOMBRE, prof.PRIMER_APELLIDO, prof.SEGUNDO_APELLIDO,
  ].filter(Boolean).join(' ');

  const especialidad = prof.DESCRIPCION || prof.DESCRIPCION_ROL || '';

  return `
    <div class="profesional-print-block" style="margin-top: 20px; page-break-inside: avoid; clear: both; display: block;">
      <h3 class="seccion">PROFESIONAL DE LA SALUD</h3>
      <div class="campo-line"><b>Tipo identificación:</b> ${escapeHtml(prof.TIPO_IDENTIFICACION || 'CC')}</div>
      <div class="campo-line"><b>Número de identificación:</b> ${escapeHtml(prof.NUMERO_IDENTIFICACION || '')}</div>
      <div class="campo-line"><b>Nombre profesional:</b> ${escapeHtml(nombre)}</div>
      <div class="campo-line"><b>Registro médico:</b> ${escapeHtml(prof.NUMERO_IDENTIFICACION || '')}</div>
      <div class="campo-line"><b>Especialidad:</b> ${escapeHtml(especialidad)}</div>
    </div>
  `;
}

function renderFirma(payload) {
  const prof = payload.profesional && payload.profesional.meta;
  if (!prof) return '';
  const nombre = [
    prof.PRIMER_NOMBRE, prof.SEGUNDO_NOMBRE, prof.PRIMER_APELLIDO, prof.SEGUNDO_APELLIDO,
  ].filter(Boolean).join(' ');
  // CODIGO_TIPO_IDENTIFICACION ya viene como texto ("CC"); ID_TIPO_IDENTIFICACION es numérico (1)
  const TIPO_ID_MAP = { 1: 'CC', 2: 'CE', 3: 'PA', 4: 'RC', 5: 'TI', 6: 'AS', 7: 'MS', 8: 'NI',
                        13: 'PE', 22: 'CD', 31: 'NIT', 41: 'PT', 42: 'CN', 43: 'AN' };
  const tipoIdRaw  = prof.TIPO_IDENTIFICACION || prof.ID_TIPO_IDENTIFICACION || '';
  const tipoIdText = prof.CODIGO_TIPO_IDENTIFICACION
                   || TIPO_ID_MAP[Number(tipoIdRaw)]
                   || String(tipoIdRaw);
  const ident = `${tipoIdText} ${prof.NUMERO_IDENTIFICACION || ''}`.trim();

  // Nombre completo: los campos individuales pueden no tener SEGUNDO_APELLIDO en la BD del portal;
  // b3.NOMBRE_COMPLETO_PRESTADOR viene de Panacea y sí lo incluye.
  const b3Prof = payload.atencion && payload.atencion.basico_op3;
  const nombreCompleto = [
    prof.PRIMER_NOMBRE, prof.SEGUNDO_NOMBRE, prof.PRIMER_APELLIDO, prof.SEGUNDO_APELLIDO,
  ].filter(Boolean).join(' ')
    || (b3Prof && b3Prof.NOMBRE_COMPLETO_PRESTADOR)
    || prof.NOMBRE_COMPLETO
    || nombre;

  const especialidad = prof.DESCRIPCION || prof.DESCRIPCION_ROL || '';

  const firmaRec = (payload.profesional.firma || [])[0];
  const firmaImg = firmaRec && firmaRec.IMAGEN
    ? `<img src="${bytesToDataUrl(firmaRec.IMAGEN, firmaRec.TIPO_MIME || 'image/png')}" style="max-height:70px; margin-bottom: 0;">`
    : '';

  return `
    <div class="firma-block" style="margin-top: 15px;">
      ${firmaImg}
      <div class="firma-line" style="margin-top: 0;"></div>
      <div class="firma-texto"><b>${escapeHtml(nombreCompleto)}</b></div>
      <div class="firma-texto">${escapeHtml(ident)}</div>
      <div class="firma-texto">N° de registro: ${escapeHtml(prof.NUMERO_IDENTIFICACION || '')}</div>
      <div class="firma-texto">${escapeHtml(especialidad)}</div>
    </div>
  `;
}

// ── Estilos ──────────────────────────────────────────────────────────────
function buildEstilos(parametros) {
  const p = (parametros && parametros[0]) || {};
  const tamanio = p.TAMANIO_FUENTE || 9;
  const interlineado = Math.max((p.INTERLINEADO || 14) / 10, 1.2);
  const mt = p.MARGEN_SUPERIOR ?? 12;
  const mb = p.MARGEN_INFERIOR ?? 12;
  const ml = p.MARGEN_IZQUIERDO || 25;
  const mr = p.MARGEN_DERECHO || 25;

  return `
    /* ══ Reset / Base ═════════════════════════════════════════════ */
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: ${tamanio}px;
      color: #000;
      line-height: ${interlineado};
      margin: 0;
      padding: 0;
    }
    img { max-width: 100%; height: auto; }

    /* ══ Encabezado ══════════════════════════════════════════ */
    .header-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 0;
      table-layout: fixed;
    }
    .header-table td { vertical-align: middle; padding: 2px 4px; border: none; line-height: 1.3; }
    .header-sep { border-bottom: 1px solid #000; margin: 2px 0 6px 0; }
    .header-center { text-align: center; font-size: 10px; }
    .header-right  { text-align: right; font-size: 9px; font-weight: bold; white-space: nowrap; line-height: 1.3; vertical-align: top; }

    /* ══ Títulos de sección ══════════════════════════════════════ */
    h1.seccion {
      font-size: ${tamanio + 2}px;
      text-transform: uppercase;
      font-style: normal;
      font-weight: bold;
      text-align: center;
      margin: 8px 0 6px 0;
      page-break-after: avoid;
      page-break-inside: avoid;
      break-inside: avoid;
      clear: both;
      display: block;
      line-height: 1.2;
    }
    h2.seccion {
      font-size: ${tamanio + 1}px;
      text-transform: uppercase;
      font-weight: bold;
      text-decoration: underline;
      margin: 10px 0 4px 0;
      page-break-after: avoid;
      page-break-inside: avoid;
      break-inside: avoid;
      clear: both;
      display: block;
    }
    h3.seccion {
      font-size: ${tamanio}px;
      text-transform: uppercase;
      font-weight: bold;
      text-decoration: underline;
      margin: 8px 0 3px 0;
      page-break-after: avoid;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    h4.seccion {
      font-size: ${tamanio}px;
      font-weight: bold;
      margin: 6px 0 2px 0;
      page-break-after: avoid;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    /* ══ Campos clínicos ═════════════════════════════════════════ */
    .campo-line {
      display: block;
      clear: both;
      margin: 3px 0;
      padding: 1px 0;
      page-break-inside: avoid;
      break-inside: avoid;
      line-height: 1.3;
      word-break: break-word;
      overflow-wrap: break-word;
    }
    .campo-line b  { 
      font-weight: bold; 
      padding-right: 4px; 
      display: inline;
      vertical-align: top;
    }
    .campo-line .val {
      display: inline;
      word-break: break-word;
      overflow-wrap: break-word;
      white-space: pre-wrap;
    }
    .profesional-print-block .campo-line {
      position: relative;
      line-height: 1.35;
      min-height: 1.35em;
    }
    .campo-block {
      display: block;
      clear: both;
      margin: 8px 0;
      padding: 2px 0;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .texto-libre {
      display: block;
      margin: 3px 0;
      padding: 1px 0;
      word-break: break-word;
      overflow-wrap: break-word;
      white-space: pre-wrap;
      line-height: 1.3;
    }

    /* ══ TABLAS — clave para evitar superposición ══════════════════════ */
    .tabla-dinamica {
      width: 100%;
      border-collapse: collapse;
      margin: 6px 0;
      table-layout: fixed;
    }
    .tabla-dinamica th,
    .tabla-dinamica td {
      border: 1px solid #000;
      padding: 4px 6px;
      vertical-align: top;
      font-size: ${tamanio}px;
      word-break: break-word;
      overflow-wrap: break-word;
      white-space: normal;
      line-height: 1.35;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .tabla-dinamica th {
      background: #f3f4f6;
      font-weight: bold;
      text-align: left;
    }
    .tabla-dinamica tr:nth-child(even) { background: #fafafa; }
    .tabla-dinamica tr {
      page-break-inside: avoid;
      break-inside: avoid;
    }

    /* ══ Tablas de órdenes/fórmula (anchos explícitos) ══════════════════ */
    table.orden-table {
      width: 100%;
      border-collapse: collapse;
      margin: 6px 0;
      table-layout: fixed;
      font-size: ${tamanio}px;
    }
    table.orden-table th,
    table.orden-table td {
      border: 1px solid #000;
      padding: 4px 6px;
      vertical-align: top;
      word-break: break-word;
      overflow-wrap: break-word;
      white-space: normal;
      line-height: 1.35;
    }
    table.orden-table th { background: #f3f4f6; font-weight: bold; }

    /* ══ Firma ═══════════════════════════════════════════════ */
    .firma-block {
      margin-top: 24px;
      page-break-inside: avoid;
      break-inside: avoid;
      clear: both;
      display: block;
    }
    .firma-line { border-top: 1px solid #000; width: 200px; margin: 6px 0 4px 0; }
    .firma-texto {
      display: block;
      line-height: 1.3;
      margin: 1px 0;
    }

    /* ══ Pie de página ═══════════════════════════════════════════ */
    .footer {
      margin-top: 12px;
      text-align: right;
      font-size: 7px;
      color: #666;
      border-top: 0.5px solid #ccc;
      padding-top: 2px;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    /* ══ @page: márgenes de impresión (refuerza lo que pasa Puppeteer) ══ */
    @page {
      size: ${buildFormat(parametros)};
      margin: ${mt}mm ${mr}mm ${mb}mm ${ml}mm;
    }

    /* ══ @media print: refuerza reglas solo cuando Chromium imprime ══════ */
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .tabla-dinamica { page-break-inside: auto; }
      .tabla-dinamica tr { page-break-inside: avoid; break-inside: avoid; }
      .campo-line { page-break-inside: avoid; break-inside: avoid; }
      .firma-block { page-break-inside: avoid; break-inside: avoid; }
    }
  `;
}

/**
 * Genera el HTML completo a partir del `printPayload`.
 */
function renderHtml(payload) {
  const estilos = buildEstilos(payload.parametros);
  const plantillaNombre = (payload.plantilla.meta && (payload.plantilla.meta.NOMBRE || payload.plantilla.meta.IDENTIFICADOR)) || 'HISTORIA CLÍNICA';

  const cuerpo = `
    ${renderEncabezado(payload)}
    <h1 class="seccion" style="text-align:center">${escapeHtml(plantillaNombre)}</h1>
    
    ${renderAlergias(payload)}
    ${renderAntecedentes(payload)}
    ${renderSintomas(payload)}
    ${renderCalculosRiesgo(payload)}

    ${renderEstructura(payload)}
    
    ${renderNotas(payload)}
    ${renderTratamientosOdonto(payload)}
    ${renderGraficas(payload)}
    ${renderDiagnosticos(payload)}

    ${renderProfesionalInfo(payload)}
    ${renderOrdenesYFormulacion(payload)}
    ${renderFirma(payload)}
    <div class="footer">Atención: ${escapeHtml(payload.atencion.ID || '')} · Plantilla: ${escapeHtml((payload.plantilla.meta && payload.plantilla.meta.ID) || '')}</div>
  `;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${estilos}</style>
</head>
<body>
${cuerpo}
</body>
</html>`;

  return {
    html,
    parametros: (payload.parametros && payload.parametros[0]) || {},
  };
}

function clasificarTodasLasOrdenes(ordenesRS, formulacionRS) {
  const laboratorio    = [];
  const imagenologia   = [];
  const medicamentos   = [];
  const incapacidades  = [];
  const otras          = [];

  const clasificarRS = (rs, isFormulacion) => {
    if (!rs || !rs.length) return;

    const labRows  = [];
    const imgRows  = [];
    const medRows  = [];
    const incRows  = [];
    const otrRows  = [];

    rs.forEach(row => {
      const plantilla = String(row.NOMBRE_PLANTILLA || '').toUpperCase();
      const servicio  = String(row.NOMBRE_SERVICIO  || '').toUpperCase();
      const desc      = String(row.DESCRIPCION_PROCEDIMIENTO || '').toUpperCase();
      const tipo      = String(row.ID_TIPO_ORDEN    || '').toUpperCase();

      const combined = `${plantilla} ${servicio} ${desc} ${tipo}`;
      console.log('Fila encontrada:', combined);

      if (plantilla.includes('INCAPACIDAD') || plantilla.includes('LICENCIA')) {
        // Las incapacidades/licencias tienen su propio render (bloque de texto, no tabla)
        incRows.push(row);
      } else if (combined.includes('LABORATORIO') || combined.includes('LAB.') || combined.includes('HEMOGRAMA') || combined.includes('ORINA') || combined.includes('VIH') || combined.includes('RPR')) {
        labRows.push(row);
      } else if (combined.includes('IMAGEN') || combined.includes('RADIOLOG') || combined.includes('RADIOGRAFIA') || combined.includes('RX') || combined.includes('ECOGRAF') || combined.includes('TAC') || combined.includes('RESONAN')) {
        imgRows.push(row);
      } else if (combined.includes('MEDICAMENTO') || combined.includes('FARMACIA') || combined.includes('FORMULA') || isFormulacion) {
        medRows.push(row);
      } else {
        otrRows.push(row);
      }
    });

    if (labRows.length > 0) laboratorio.push(labRows);
    if (imgRows.length > 0) imagenologia.push(imgRows);
    if (medRows.length > 0) medicamentos.push(medRows);
    if (incRows.length > 0) incapacidades.push(incRows);
    if (otrRows.length > 0) otras.push(otrRows);
  };

  (ordenesRS     || []).forEach(rs => clasificarRS(rs, false));
  (formulacionRS || []).forEach(rs => clasificarRS(rs, true));

  return { laboratorio, imagenologia, medicamentos, incapacidades, otras };
}

function renderHtmlOrdenPorTipo(payload, tituloDoc, tituloTabla, recordsets) {
  const estilos = buildEstilos(payload.parametros);
  let tablaHtml = renderOrdenesPanacea(recordsets);
  if (!tablaHtml) return null;
  
  const html = `
    ${renderEncabezado(payload)}
    <h1 class="seccion" style="text-align:center">${escapeHtml(tituloDoc)}</h1>
    ${renderIdentificacionPaciente(payload)}
    ${renderDiagnosticos(payload)}
    
    ${tablaHtml}
    
    ${renderFirma(payload)}
    <div class="footer">Atención: ${escapeHtml(payload.atencion.ID || '')}</div>
  `;
  
  const body = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${estilos}</style>
</head>
<body>
${html}
</body>
</html>`;

  return { html: body, parametros: (payload.parametros && payload.parametros[0]) || {} };
}

function renderHtmlFormula(payload, recordsets, datosOrden = null, op2Rows = []) {
  const estilos = buildEstilos(payload.parametros);
  if (!recordsets || !recordsets.length) return null;

  const at  = payload.atencion || {};
  const b3  = at.basico_op3 || {};
  const t   = payload.tokens || {};
  // datosOrden: primera fila de Historia.QRY_IMPRESION_ORDENES_FORMATOS OPERACION=2
  // op2Rows: todas las filas del mismo SP (una por medicamento, para DISTANCIA/dosis)
  const dO  = datosOrden || {};
  const esc = escapeHtml;
  const cl  = (s) => String(s || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();

  const pad2 = n => String(n).padStart(2, '0');
  const fmtDT = (v) => {
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d)) return String(v);
    return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth()+1)}/${d.getUTCFullYear()} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
  };
  const fmtD = (v) => {
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d)) return String(v);
    return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth()+1)}/${d.getUTCFullYear()}`;
  };

  // ── Datos del paciente ─────────────────────────────────────────────────────
  const apellidos = esc(cl(b3.APELLIDOS_PACIENTE  || t['APELLIDOS_PACIENTE']  || ''));
  const nombres   = esc(cl(b3.NOMBRES_PACIENTE    || t['NOMBRES_PACIENTE']    || ''));
  const tipoId    = esc(cl(b3.CODIGO_TIPO_IDENTIFICACION || t['TIPO_IDENTIFICACION'] || ''));
  const numId     = esc(cl(b3.NUMERO_IDENTIFICACION_PACIENTE || t['IDENTIFICACION_PACIENTE'] || ''));
  const fechaNac  = esc(fmtD(b3.FECHA_NACIMIENTO_PACIENTE || t['FECHA_NACIMIENTO']));
  const edad      = esc(cl(b3.EDAD_COMPLETA || (b3.EDAD_PACIENTE ? String(b3.EDAD_PACIENTE) + ' A\u00f1os' : '') || t['EDAD'] || ''));
  const genN      = b3.GENERO_PACIENTE;
  const genero    = esc(genN === 1 ? 'Masculino' : genN === 2 ? 'Femenino' : cl(b3.SEXO_PACIENTE || t['SEXO'] || ''));
  const ocupacion = esc(cl(b3.OCUPACION || t['OCUPACION'] || ''));
  const direccion = esc(cl(b3.DIRECCION || t['DIRECCION'] || ''));
  const telefono  = esc(cl(b3.TELEFONO  || t['TELEFONO']  || ''));
  const cliente   = esc(cl(b3.NOMBRE_CLIENTE_CONVENIO || at.CLIENTE  || t['CLIENTE']  || ''));
  const convenio  = esc(cl(b3.NOMBRE_CONVENIO         || at.CONVENIO || t['CONVENIO'] || ''));
  const fechaReg  = esc(fmtDT(b3.FECHA_REGISTRO  || at.FECHA_REGISTRO));
  const fechaAten = esc(fmtDT(b3.FECHA_ATENCION  || at.FECHA_ATENCION));

  // ── Datos de la orden (primer renglón del primer recordset) ────────────────
  // IMPORTANTE: las filas de formulación traen datos del encuentro (TIPO_USO, VIA_INGRESO, etc.)
  const allRows     = (recordsets || []).flatMap(rs => rs || []);
  const pFila       = allRows[0] || {};
  // NUMERO_ORDEN: usar el número público de la orden (NUMERO_ORDEN de Op2), no el ID interno
  const ordenNum    = esc(cl(String(dO.NUMERO_ORDEN || pFila.NUMERO_ORDEN || pFila.ID_ORDEN || '')));
  const ordenTipo   = esc(cl(pFila.NOMBRE_PLANTILLA   || 'Orden Medicamentos'));
  const ordenCodigo = esc(cl(String(pFila.ID_TIPO_PLANTILLA || pFila.ID_TIPO_ORDEN || '')));
  const ordenFecha  = esc(fmtDT(pFila.FECHA_EXPEDICION));
  const posfechado  = pFila.POSFECHADO != null ? (pFila.POSFECHADO ? 'S\u00ed' : 'No') : 'No';
  const observaciones = esc(cl(dO.OBSERVACIONES || pFila.OBSERVACIONES || ''));

  // Vigencia: FECHA_INICIO / FECHA_TERMINACION vienen de Op2 (OPERACION=2)
  const vigDesde = fmtD(dO.FECHA_INICIO    || dO.VIGENCIA_DESDE || pFila.VIGENCIA_DESDE || pFila.FECHA_INICIO_VIGENCIA);
  const vigHasta = fmtD(dO.FECHA_TERMINACION || dO.VIGENCIA_HASTA || pFila.VIGENCIA_HASTA || pFila.FECHA_FIN_VIGENCIA || pFila.FECHA_VENCIMIENTO);
  const vigencia = esc([vigDesde, vigHasta].filter(Boolean).join(' - '));

  // Mappings numéricos del Op2
  const VIA_MAP     = { 0: 'Consulta externa', 1: 'Urgencias', 2: 'Hospitalizaci\u00f3n', 3: 'Remitido' };
  const AMBITO_MAP  = { 1: 'Ambulatorio', 2: 'Hospitalario', 3: 'Domiciliario', 4: 'Urgencias' };
  const TIPUSO_MAP  = { 0: 'Externo', 1: 'Externo', 2: 'Interno' };

  // VIA_INGRESO: Op2 usa ID_ORIGEN_VIA_INGRESO (numérico)
  const viaN = dO.ID_ORIGEN_VIA_INGRESO != null ? dO.ID_ORIGEN_VIA_INGRESO
             : (dO.VIA_INGRESO ?? pFila.VIA_INGRESO ?? b3.VIA_INGRESO ?? at.VIA_INGRESO);
  const viaIngreso = esc(VIA_MAP[viaN] ?? cl(dO.NOMBRE_VIA_INGRESO || pFila.NOMBRE_VIA_INGRESO || b3.NOMBRE_VIA_INGRESO || t['VIA_INGRESO'] || ''));

  // TIPO_USUARIO: texto directo en Op2
  const tipoUsr = esc(cl(dO.TIPO_USUARIO || pFila.TIPO_USUARIO || b3.TIPO_USUARIO || at.TIPO_USUARIO || t['TIPO_USUARIO'] || ''));

  // CATEGORIA: Op2 llama al campo CATEGORIA_CONVENIO
  const categoria = esc(cl(dO.CATEGORIA_CONVENIO || dO.CATEGORIA || pFila.CATEGORIA || b3.CATEGORIA || t['CATEGORIA'] || ''));

  // AMBITO: Op2 devuelve ID_AMBITO numérico
  const ambitoN = dO.ID_AMBITO;
  const ambito  = esc(ambitoN != null ? (AMBITO_MAP[ambitoN] || String(ambitoN))
                    : cl(dO.AMBITO_ATENCION || dO.AMBITO || pFila.AMBITO || b3.AMBITO_ATENCION || t['AMBITO'] || ''));

  // TIPO_USO: Op2 devuelve TIPO_USO numérico (1 = Externo)
  const tipoUsoN = dO.TIPO_USO;
  const tipoUso  = esc(tipoUsoN != null ? (TIPUSO_MAP[tipoUsoN] || String(tipoUsoN))
                     : cl(pFila.TIPO_USO || b3.TIPO_USO || t['TIPO_USO'] || ''));

  // ── Estilos de celda de la tabla ──────────────────────────────────────────
  const thS = 'padding:3px 5px; border:1px solid #000; background:#d9d9d9; font-weight:bold; font-size:9.5px; line-height:1.3; white-space:nowrap;';
  const tdS = 'padding:3px 5px; border:1px solid #000; font-size:9.5px; line-height:1.3; word-break:break-word;';

  // ── Encabezado de orden ───────────────────────────────────────────────────
  const ordenHeaderHtml = `
    <div style="font-size:9.5px; margin-top:6px; line-height:1.5;">
      <b>Orden N&ordm;: ${ordenNum}</b>
      &nbsp;&nbsp; ${ordenTipo}
      &nbsp;&nbsp; C&oacute;digo: ${ordenCodigo}
      &nbsp;&nbsp; Fecha y hora: ${ordenFecha}
    </div>`;

  // ── Tabla del paciente 4 columnas (estilo Panacea) ─────────────────────────
  const tablaPaciente = `
    <table style="border-collapse:collapse; width:100%; table-layout:fixed; margin-top:4px;">
      <colgroup>
        <col style="width:16%"><col style="width:34%"><col style="width:16%"><col style="width:34%">
      </colgroup>
      <tr>
        <td style="${thS}">Apellidos:</td><td style="${tdS}">${apellidos}</td>
        <td style="${thS}">Nombres:</td><td style="${tdS}">${nombres}</td>
      </tr>
      <tr>
        <td style="${thS}">Tipo Identificaci&oacute;n:</td><td style="${tdS}">${tipoId}</td>
        <td style="${thS}">N&uacute;mero documento:</td><td style="${tdS}">${numId}</td>
      </tr>
      <tr>
        <td style="${thS}">Fecha de Nacimiento:</td><td style="${tdS}">${fechaNac}</td>
        <td style="${thS}">Edad:</td><td style="${tdS}">${edad}</td>
      </tr>
      <tr>
        <td style="${thS}">G&eacute;nero:</td><td style="${tdS}">${genero}</td>
        <td style="${thS}">Ocupaci&oacute;n:</td><td style="${tdS}">${ocupacion}</td>
      </tr>
      <tr>
        <td style="${thS}">Direcci&oacute;n:</td><td style="${tdS}">${direccion}</td>
        <td style="${thS}">Tel&eacute;fono:</td><td style="${tdS}">${telefono}</td>
      </tr>
      <tr>
        <td style="${thS}">Fecha registro :</td><td style="${tdS}">${fechaReg}</td>
        <td style="${thS}">Fecha atenci&oacute;n:</td><td style="${tdS}">${fechaAten}</td>
      </tr>
      <tr>
        <td style="${thS}">Nombre del Cliente:</td><td style="${tdS}">${cliente}</td>
        <td style="${thS}">Convenio:</td><td style="${tdS}">${convenio}</td>
      </tr>
      <tr>
        <td style="${thS}">Tipo de usuario:</td><td style="${tdS}">${tipoUsr}</td>
        <td style="${thS}">Categor&iacute;a:</td><td style="${tdS}">${categoria}</td>
      </tr>
      <tr>
        <td style="${thS}">V&iacute;a de ingreso:</td><td style="${tdS}">${viaIngreso}</td>
        <td style="${thS}">&Aacute;mbito:</td><td style="${tdS}">${ambito}</td>
      </tr>
      <tr>
        <td style="${thS}">Tipo uso:</td><td style="${tdS}">${tipoUso}</td>
        <td style="${thS}">Vigencia:</td><td style="${tdS}">${vigencia}</td>
      </tr>
    </table>`;

  // ── Diagnósticos compactos — formato Panacea ──────────────────────────────
  // Ref: "DiagnósticosPrincipal Ingreso: D649  Tipo principal: Confirmado nuevo"
  //       "Relacionado 1 Ingreso: K922"
  const dxList = (payload.clinico && payload.clinico.diagnosticos) || [];
  let dxHtml = '';
  if (dxList.length) {
    const esPpal = (d) => {
      const tipo = String(d.DESCRIPCION_TIPO_DX_PPAL || d.TIPO_DX || d.TIPO || '').toUpperCase();
      return d.PRINCIPAL === 1 || d.ES_PRINCIPAL === 1
        || d.ID_TIPO_DIAGNOSTICO_RIPS === 0 || d.ID_TIPO_DIAGNOSTICO_RIPS === '0'
        || tipo.includes('PRINCIPAL') || tipo.includes('INGRESO');
    };
    const principal   = dxList.find(esPpal) || dxList[0];
    const relacionados = dxList.filter(d => d !== principal);

    const codPpal  = esc(cl(principal.CODIGO_CIE || principal.CIE || principal.CODIGO_DX || ''));
    const tipoPpal = esc(cl(principal.DESCRIPCION_TIPO_DX_PPAL || principal.TIPO_DX || ''));

    let primeraLinea = `<b>Diagn&oacute;sticos</b>Principal Ingreso: ${codPpal}`;
    if (tipoPpal) primeraLinea += `&nbsp;&nbsp;Tipo principal: ${tipoPpal}`;

    const relLineas = relacionados.map((d, i) => {
      const cod = esc(cl(d.CODIGO_CIE || d.CIE || d.CODIGO_DX || ''));
      return `<div style="font-size:9.5px; line-height:1.35;">Relacionado ${i + 1} Ingreso: ${cod}</div>`;
    }).join('');

    dxHtml = `<div style="font-size:9.5px; margin-top:6px; line-height:1.35;">`
           + `<div>${primeraLinea}</div>${relLineas}`
           + `</div>`;
  }

  // ── Tabla de medicamentos (sin título) — pasar op2Rows para DISTANCIA/dosis ──
  const tablaHtml = renderFormulaMedicaPanacea(recordsets, [], { showTitle: false }, op2Rows);
  if (!tablaHtml) return null;

  // ── Posfechado / Observaciones ─────────────────────────────────────────────
  const piePdf = `
    <div style="font-size:9.5px; margin-top:6px; line-height:1.5;">
      <div>Posfechado: ${posfechado}</div>
      <div>Observaciones: ${observaciones}</div>
    </div>`;

  const html = `
    <div style="padding: 0 12mm 0 6mm;">
      ${renderEncabezado(payload)}
      ${ordenHeaderHtml}
      ${tablaPaciente}
      ${dxHtml}
      ${tablaHtml}
      ${piePdf}
      ${renderFirma(payload)}
      <div class="footer">Atenci&oacute;n: ${esc(String(at.ID || ''))}</div>
    </div>
  `;

  const body = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${estilos}</style>
</head>
<body>
${html}
</body>
</html>`;

  return { html: body, parametros: (payload.parametros && payload.parametros[0]) || {} };
}

/**
 * Genera el HTML completo para un PDF de Orden de Incapacidad.
 * Formato Panacea: bloque de texto "ORDEN DE INCAPACIDAD:" + descripción — sin tabla.
 */
function renderHtmlIncapacidades(payload, recordsets, datosDinamicos = {}) {
  const estilos = buildEstilos(payload.parametros);
  const cleanStr = (s) => String(s || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  const esc = escapeHtml;

  const formatFechaHora = (v) => {
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d)) return formatSoloFecha(v);
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  };

  const GENERO_MAP = { 1: 'Masculino', 2: 'Femenino', 3: 'Indeterminado' };
  const VIA_INGRESO_MAP = { 0: 'Consulta externa', 1: 'Urgencias', 2: 'Hospitalización', 3: 'Remitido' };

  // GUIDs fijos del formato de incapacidad (estructura op=1)
  const GUID_AMBITO    = '2E70F5DD-3E27-4738-A7C4-208A5B098B43';
  const GUID_ORIGEN    = '94F03BF9-70CA-4F94-8895-8F567F0781C1';
  const GUID_MODALIDAD = 'AE0B1652-DA41-4886-B4C6-E6E86561A896';

  let blocksHtml = '';

  for (const rs of recordsets || []) {
    if (!rs || !rs.length) continue;
    for (const f of rs) {
      const idOrden = f.ID_ORDEN != null ? Number(f.ID_ORDEN) : null;

      const datos = idOrden && datosDinamicos.ordenesDatosPorId
        ? datosDinamicos.ordenesDatosPorId.get(idOrden)
        : null;

      // #region agent log
      fetch('http://127.0.0.1:7484/ingest/1b468bd2-7ffd-4415-8c1e-811e7c186967',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6767d5'},body:JSON.stringify({sessionId:'6767d5',location:'plantilla.render.js:renderHtmlIncapacidades',message:'orden procesada',data:{idOrden,hasDatos:!!datos,datosKeys:datos?Object.keys(datos).slice(0,10):null,hasDatosDinamicos:Object.keys(datosDinamicos)},timestamp:Date.now(),hypothesisId:'H1-H5'})}).catch(()=>{});
      // #endregion

      if (!datos) {
        // ─── Fallback: solo línea descriptiva ──────────────────────────────────
        let desc = cleanStr(f.DESCRIPCION_PROCEDIMIENTO || f.PRUEBA || f.NOMBRE_SERVICIO || '');
        if (!desc && f.NOMBRE_PLANTILLA) {
          const partes = [];
          if (f.FECHA_EXPEDICION) {
            const d = new Date(f.FECHA_EXPEDICION);
            if (!isNaN(d)) {
              const pad = n => String(n).padStart(2, '0');
              partes.push(`${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`);
            }
          }
          partes.push(cleanStr(f.NOMBRE_PLANTILLA));
          if (f.NOMBRE_ESPECIALIDAD)       partes.push(cleanStr(f.NOMBRE_ESPECIALIDAD));
          if (f.NOMBRE_COMPLETO_PRESTADOR) partes.push(cleanStr(f.NOMBRE_COMPLETO_PRESTADOR));
          desc = partes.join(' - ');
        }
        if (!desc) continue;
        blocksHtml += `<div style="margin-top:12px;font-size:10px;"><strong>ORDEN DE INCAPACIDAD:</strong> ${esc(desc)}</div>`;
        continue;
      }

      // ─── Render con datos completos de OPERACION=0 ─────────────────────────
      const listaRows = idOrden && datosDinamicos.ordenesListaPorId
        ? (datosDinamicos.ordenesListaPorId.get(idOrden) || [])
        : [];
      const valorListaPorGuid = new Map(listaRows.map(r => [r.ID_ESTRUCTURA_PLANTILLA, r.VALOR_LISTA]));

      const textoRows = idOrden && datosDinamicos.ordenesTextoPorId
        ? (datosDinamicos.ordenesTextoPorId.get(idOrden) || [])
        : [];
      const valorTextoPorGuid = new Map(textoRows.map(r => [r.ID_ESTRUCTURA_PLANTILLA, r.VALOR_TEXTO]));

      const ambito   = cleanStr(valorTextoPorGuid.get(GUID_AMBITO)    || '');
      const origenInc = cleanStr(valorListaPorGuid.get(GUID_ORIGEN)   || '');
      const modalidad = cleanStr(valorListaPorGuid.get(GUID_MODALIDAD) || '');

      // Título de tipo de orden en título case
      const tipoOrdenNombre = cleanStr(f.NOMBRE_PLANTILLA || 'INCAPACIDADES O LICENCIAS')
        .toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

      // Género y vía de ingreso
      const generoTexto = GENERO_MAP[datos.GENERO_PACIENTE] || '';
      const viaIngreso  = VIA_INGRESO_MAP[datos.ID_ORIGEN_VIA_INGRESO] != null
        ? VIA_INGRESO_MAP[datos.ID_ORIGEN_VIA_INGRESO]
        : '';

      // Vigencia
      const vi = formatSoloFecha(datos.FECHA_INICIO);
      const vf = formatSoloFecha(datos.FECHA_TERMINACION);
      const vigencia = vi && vf ? `${vi} - ${vf}` : (vi || vf || '');

      // Diagnósticos compactos desde payload general
      const dxList = (payload.clinico && payload.clinico.diagnosticos) || [];
      const dxPpal = dxList.find(d => {
        const t = String(d.DESCRIPCION_TIPO_DX_PPAL || d.TIPO_DX || '').toUpperCase();
        return d.ES_PRINCIPAL === 1 || d.PRINCIPAL === 1 || t.includes('INGRESO') || t.includes('PRINCIPAL');
      }) || dxList[0];

      // Líneas multi-campo igual que Panacea
      const causaLine = [
        datos.CAUSA_EXTERNA    ? `Causa externa: ${esc(cleanStr(datos.CAUSA_EXTERNA))}` : '',
        datos.OCUPACION        ? `Ocupaci\u00f3n: ${esc(cleanStr(datos.OCUPACION))}` : 'Ocupaci\u00f3n:',
        datos.TIPO_VINCULACION ? `Tipo vinculaci\u00f3n: ${esc(cleanStr(datos.TIPO_VINCULACION))}` : '',
      ].filter(Boolean).join(' &nbsp; ');

      const diasLine = [
        datos.DIAS_INCAPACIDAD != null ? `D\u00edas de incapacidad: ${datos.DIAS_INCAPACIDAD}` : '',
        `Pr\u00f3rroga: ${datos.PRORROGA === true || datos.PRORROGA === 1 ? 'S\u00ed' : 'No'}`,
      ].filter(Boolean).join(' &nbsp; ');

      const ambitoLine = [
        ambito    ? `\u00c1mbito de atenci\u00f3n: ${esc(ambito)}`    : '',
        origenInc ? `Origen Incapacidad: ${esc(origenInc)}`           : '',
        modalidad ? `Modalidad Tec. Salud: ${esc(modalidad)}`         : '',
      ].filter(Boolean).join(' &nbsp; ');

      // Tabla de identificación del paciente específica para incapacidad
      // line-height:1.4 anula el line-height:0.1 del body (parámetros Panacea)
      const tdS = 'border:1px solid #555; padding:3px 6px; vertical-align:top; font-size:9.5px; line-height:1.4; width:50%; word-wrap:break-word; word-break:break-word;';
      const lb  = (label, val) => `<b>${label}:</b> ${esc(cleanStr(String(val ?? '')))}`;
      const tablaPaciente = `
        <table style="border-collapse:collapse; width:100%; table-layout:fixed; margin-top:4px;">
          <tr>
            <td style="${tdS}">${lb('Apellidos', datos.APELLIDOS_PACIENTE)}</td>
            <td style="${tdS}">${lb('Nombres', datos.NOMBRES_PACIENTE)}</td>
          </tr>
          <tr>
            <td style="${tdS}">${lb('Tipo Identificaci\u00f3n', datos.TIPO_IDENTIFICACION_PACIENTE)}</td>
            <td style="${tdS}">${lb('N\u00famero documento', datos.NUMERO_IDENTIFICACION_PACIENTE)}</td>
          </tr>
          <tr>
            <td style="${tdS}">${lb('Fecha de Nacimiento', formatSoloFecha(datos.FECHA_NACIMIENTO))}</td>
            <td style="${tdS}">${lb('Edad', datos.UNIDAD_MEDIDA_EDAD)}</td>
          </tr>
          <tr>
            <td style="${tdS}">${lb('G\u00e9nero', generoTexto)}</td>
            <td style="${tdS}">${lb('Ocupaci\u00f3n', datos.OCUPACION)}</td>
          </tr>
          <tr>
            <td style="${tdS}">${lb('Direcci\u00f3n', datos.DIRECCION_PACIENTE)}</td>
            <td style="${tdS}">${lb('Tel\u00e9fono', datos.TELEFONO_PACIENTE)}</td>
          </tr>
          <tr>
            <td style="${tdS}">${lb('Nombre del Cliente', datos.NOMBRE_TERCERO)}</td>
            <td style="${tdS}">${lb('Convenio', datos.CONVENIO)}</td>
          </tr>
          <tr>
            <td style="${tdS}">${lb('Fecha registro', formatFechaHora(datos.FECHA_EXPEDICION))}</td>
            <td style="${tdS}">${lb('Fecha atenci\u00f3n', formatFechaHora(datos.FECHA_INICIO))}</td>
          </tr>
        </table>`;

      blocksHtml += `
        <div style="font-size:9.5px; margin-top:6px;">
          <b>Orden N\u00b0: ${esc(datos.NUMERO_ORDEN || '')}</b>
          &nbsp; Orden ${esc(tipoOrdenNombre)}
          &nbsp; C\u00f3digo: ${esc(datos.CODIGO_PLANTILLA || '')}
          &nbsp; Fecha y hora: ${esc(formatFechaHora(datos.FECHA_EXPEDICION))}
        </div>
        ${tablaPaciente}
        <div style="font-size:9.5px; margin-top:8px; line-height:1.65;">
          ${vigencia    ? `<div>Vigencia: ${esc(vigencia)}</div>` : ''}
          ${datos.TIPO_USUARIO ? `<div>Tipo de usuario: ${esc(cleanStr(datos.TIPO_USUARIO))}</div>` : ''}
          ${viaIngreso  ? `<div>V\u00eda de ingreso: ${esc(viaIngreso)}</div>` : ''}
          ${dxList.length ? `
            <div><b>Diagn\u00f3sticos</b></div>
            ${dxPpal ? `<div>Principal Ingreso: ${esc(dxPpal.CODIGO_CIE || '')} &nbsp; Tipo principal: ${esc(dxPpal.DESCRIPCION_TIPO_DX_PPAL || '')},</div>` : ''}
          ` : ''}
          ${causaLine   ? `<div>${causaLine}</div>` : ''}
          ${diasLine    ? `<div>${diasLine}</div>` : ''}
          ${datos.ITEM  ? `<div>Diagn\u00f3stico: ${esc(cleanStr(datos.ITEM))}</div>` : ''}
          ${ambitoLine  ? `<div>${ambitoLine}</div>` : ''}
          <div>Observaciones: ${esc(cleanStr(datos.OBSERVACIONES || ''))}</div>
        </div>`;
    }
  }

  if (!blocksHtml) return null;

  // Wrapper con padding-right para que la tabla no llegue al borde del papel
  const html = `
    <div style="padding: 0 12mm 0 6mm;">
      ${renderEncabezado(payload)}
      ${blocksHtml}
      ${renderFirma(payload)}
      <div class="footer">Atenci&oacute;n: ${escapeHtml(payload.atencion.ID || '')}</div>
    </div>
  `;

  const body = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${estilos}</style>
</head>
<body>
${html}
</body>
</html>`;

  return { html: body, parametros: (payload.parametros && payload.parametros[0]) || {} };
}

/**
 * Genera el HTML completo para un PDF de Orden de Imagenología.
 * Formato Panacea completo: encabezado de orden, tabla de paciente estilo fórmula,
 * diagnósticos, tabla de procedimientos con todas las columnas (área corporal,
 * lateralidad, estado, prioridad, tipo uso, comentario) y firma.
 *
 * @param {object} payload        – printPayload estándar del servicio
 * @param {Array}  recordsets     – filas de QRY_ORDENES_IMPRESION clasificadas como imagenología
 * @param {object} datosOrden     – primera fila de QRY_IMPRESION_ORDENES_FORMATOS OPERACION=0
 * @param {Array}  op1Rows        – filas de QRY_IMPRESION_ORDENES_FORMATOS OPERACION=1
 */
function renderHtmlOrdenImagenologia(payload, recordsets, datosOrden = null, op1Rows = []) {
  const estilos = buildEstilos(payload.parametros);
  if (!recordsets || !recordsets.length) return null;

  const at  = payload.atencion || {};
  const b3  = at.basico_op3 || {};
  const t   = payload.tokens || {};
  const dO  = datosOrden || {};
  const esc = escapeHtml;
  const cl  = (s) => String(s || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();

  const pad2  = n => String(n).padStart(2, '0');
  const fmtDT = (v) => {
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d)) return String(v);
    return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth()+1)}/${d.getUTCFullYear()} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
  };
  const fmtD  = (v) => {
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d)) return String(v);
    return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth()+1)}/${d.getUTCFullYear()}`;
  };

  // ── Datos del paciente ─────────────────────────────────────────────────────
  const apellidos = esc(cl(b3.APELLIDOS_PACIENTE  || t['APELLIDOS_PACIENTE']  || ''));
  const nombres   = esc(cl(b3.NOMBRES_PACIENTE    || t['NOMBRES_PACIENTE']    || ''));
  const tipoId    = esc(cl(b3.CODIGO_TIPO_IDENTIFICACION || t['TIPO_IDENTIFICACION'] || ''));
  const numId     = esc(cl(b3.NUMERO_IDENTIFICACION_PACIENTE || t['IDENTIFICACION_PACIENTE'] || ''));
  const fechaNac  = esc(fmtD(b3.FECHA_NACIMIENTO_PACIENTE || t['FECHA_NACIMIENTO']));
  const edad      = esc(cl(b3.EDAD_COMPLETA || (b3.EDAD_PACIENTE ? String(b3.EDAD_PACIENTE) + ' Años' : '') || t['EDAD'] || ''));
  const genN      = b3.GENERO_PACIENTE;
  const genero    = esc(genN === 1 ? 'Masculino' : genN === 2 ? 'Femenino' : cl(b3.SEXO_PACIENTE || t['SEXO'] || ''));
  const ocupacion = esc(cl(b3.OCUPACION || t['OCUPACION'] || ''));
  const direccion = esc(cl(b3.DIRECCION || t['DIRECCION'] || ''));
  const telefono  = esc(cl(b3.TELEFONO  || t['TELEFONO']  || ''));
  const cliente   = esc(cl(b3.NOMBRE_CLIENTE_CONVENIO || at.CLIENTE  || t['CLIENTE']  || ''));
  const convenio  = esc(cl(b3.NOMBRE_CONVENIO         || at.CONVENIO || t['CONVENIO'] || ''));
  const fechaReg  = esc(fmtDT(b3.FECHA_REGISTRO  || at.FECHA_REGISTRO));
  const fechaAten = esc(fmtDT(b3.FECHA_ATENCION  || at.FECHA_ATENCION));

  // ── Datos de la orden ─────────────────────────────────────────────────────
  const allRows   = (recordsets || []).flatMap(rs => rs || []);
  const pFila     = allRows[0] || {};
  const ordenNum  = esc(cl(String(dO.NUMERO_ORDEN  || pFila.NUMERO_ORDEN  || pFila.ID_ORDEN || '')));
  const ordenTipo = esc(cl(dO.NOMBRE_PLANTILLA || pFila.NOMBRE_PLANTILLA || 'Orden Imagenología'));
  const ordenCod  = esc(cl(String(dO.ID_TIPO_PLANTILLA || pFila.ID_TIPO_PLANTILLA || pFila.ID_TIPO_ORDEN || '')));
  const ordenFecha = esc(fmtDT(dO.FECHA_EXPEDICION || pFila.FECHA_EXPEDICION));
  const observaciones = esc(cl(dO.OBSERVACIONES || pFila.OBSERVACIONES || ''));

  const VIA_MAP = { 0: 'Consulta externa', 1: 'Urgencias', 2: 'Hospitalización', 3: 'Remitido' };
  const viaN      = dO.ID_ORIGEN_VIA_INGRESO;
  const viaIngreso = esc(VIA_MAP[viaN] != null ? VIA_MAP[viaN] : cl(dO.NOMBRE_VIA_INGRESO || pFila.NOMBRE_VIA_INGRESO || b3.NOMBRE_VIA_INGRESO || t['VIA_INGRESO'] || ''));
  const tipoUsr   = esc(cl(dO.TIPO_USUARIO || pFila.TIPO_USUARIO || b3.TIPO_USUARIO || at.TIPO_USUARIO || t['TIPO_USUARIO'] || ''));
  const vigDesde  = fmtD(dO.FECHA_INICIO    || dO.VIGENCIA_DESDE  || pFila.VIGENCIA_DESDE);
  const vigHasta  = fmtD(dO.FECHA_TERMINACION || dO.VIGENCIA_HASTA || pFila.VIGENCIA_HASTA);
  const vigencia  = esc([vigDesde, vigHasta].filter(Boolean).join(' - '));

  // ── Estilos de celda ──────────────────────────────────────────────────────
  const thS = 'padding:3px 5px; border:1px solid #000; background:#d9d9d9; font-weight:bold; font-size:9.5px; line-height:1.3; white-space:nowrap;';
  const tdS = 'padding:3px 5px; border:1px solid #000; font-size:9.5px; line-height:1.3; word-break:break-word;';

  // ── Encabezado de orden ───────────────────────────────────────────────────
  const ordenHeaderHtml = `
    <div style="font-size:9.5px; margin-top:6px; line-height:1.5;">
      <b>Orden N&ordm;: ${ordenNum}</b>
      &nbsp;&nbsp; ${ordenTipo}
      &nbsp;&nbsp; C&oacute;digo: ${ordenCod}
      &nbsp;&nbsp; Fecha y hora: ${ordenFecha}
    </div>`;

  // ── Tabla del paciente ────────────────────────────────────────────────────
  const tablaPaciente = `
    <table style="border-collapse:collapse; width:100%; table-layout:fixed; margin-top:4px;">
      <colgroup>
        <col style="width:16%"><col style="width:34%"><col style="width:16%"><col style="width:34%">
      </colgroup>
      <tr>
        <td style="${thS}">Apellidos:</td><td style="${tdS}">${apellidos}</td>
        <td style="${thS}">Nombres:</td><td style="${tdS}">${nombres}</td>
      </tr>
      <tr>
        <td style="${thS}">Tipo Identificaci&oacute;n:</td><td style="${tdS}">${tipoId}</td>
        <td style="${thS}">N&uacute;mero documento:</td><td style="${tdS}">${numId}</td>
      </tr>
      <tr>
        <td style="${thS}">Fecha de Nacimiento:</td><td style="${tdS}">${fechaNac}</td>
        <td style="${thS}">Edad:</td><td style="${tdS}">${edad}</td>
      </tr>
      <tr>
        <td style="${thS}">G&eacute;nero:</td><td style="${tdS}">${genero}</td>
        <td style="${thS}">Ocupaci&oacute;n:</td><td style="${tdS}">${ocupacion}</td>
      </tr>
      <tr>
        <td style="${thS}">Direcci&oacute;n:</td><td style="${tdS}">${direccion}</td>
        <td style="${thS}">Tel&eacute;fono:</td><td style="${tdS}">${telefono}</td>
      </tr>
      <tr>
        <td style="${thS}">Fecha registro :</td><td style="${tdS}">${fechaReg}</td>
        <td style="${thS}">Fecha atenci&oacute;n:</td><td style="${tdS}">${fechaAten}</td>
      </tr>
      <tr>
        <td style="${thS}">Nombre del Cliente:</td><td style="${tdS}">${cliente}</td>
        <td style="${thS}">Convenio:</td><td style="${tdS}">${convenio}</td>
      </tr>
    </table>`;

  // ── Diagnósticos compactos ────────────────────────────────────────────────
  const dxList = (payload.clinico && payload.clinico.diagnosticos) || [];
  let dxHtml = '';
  if (dxList.length) {
    const esPpal = (d) => {
      const tipo = String(d.DESCRIPCION_TIPO_DX_PPAL || d.TIPO_DX || d.TIPO || '').toUpperCase();
      return d.PRINCIPAL === 1 || d.ES_PRINCIPAL === 1
        || d.ID_TIPO_DIAGNOSTICO_RIPS === 0 || d.ID_TIPO_DIAGNOSTICO_RIPS === '0'
        || tipo.includes('PRINCIPAL') || tipo.includes('INGRESO');
    };
    const principal   = dxList.find(esPpal) || dxList[0];
    const relacionados = dxList.filter(d => d !== principal);

    const codPpal  = esc(cl(principal.CODIGO_CIE || principal.CIE || principal.CODIGO_DX || ''));
    const tipoPpal = esc(cl(principal.DESCRIPCION_TIPO_DX_PPAL || principal.TIPO_DX || ''));

    let primeraLinea = `<b>Diagn&oacute;sticos</b>Principal Ingreso: ${codPpal}`;
    if (tipoPpal) primeraLinea += `&nbsp;&nbsp;Tipo principal: ${tipoPpal}`;

    const relLineas = relacionados.map((d, i) => {
      const cod = esc(cl(d.CODIGO_CIE || d.CIE || d.CODIGO_DX || ''));
      return `<div style="font-size:9.5px; line-height:1.35;">Relacionado ${i + 1} Ingreso: ${cod}</div>`;
    }).join('');

    dxHtml = `<div style="font-size:9.5px; margin-top:6px; line-height:1.35;">
      <div>${primeraLinea}</div>${relLineas}
      <div>Observaciones: ${observaciones}</div>
    </div>`;
  }

  // ── Tabla de procedimientos ───────────────────────────────────────────────
  // Usar las filas de OPERACION=1 si están disponibles (tienen AREA_CORPORAL,
  // LATERALIDAD, ESTADO, PRIORIDAD, TIPO_USO, COMENTARIO); si no, usar las de ordenes.
  const rowsParaTabla = op1Rows && op1Rows.length ? [op1Rows] : recordsets;
  const tablaHtml = renderOrdenesPanacea(rowsParaTabla);
  if (!tablaHtml) return null;

  const html = `
    <div style="padding: 0 12mm 0 6mm;">
      ${renderEncabezado(payload)}
      ${ordenHeaderHtml}
      ${tablaPaciente}
      ${dxHtml}
      ${tablaHtml}
      ${renderFirma(payload)}
      <div class="footer">Atenci&oacute;n: ${esc(String(at.ID || ''))}</div>
    </div>
  `;

  const body = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${estilos}</style>
</head>
<body>
${html}
</body>
</html>`;

  return { html: body, parametros: (payload.parametros && payload.parametros[0]) || {} };
}

module.exports = { renderHtml, clasificarTodasLasOrdenes, renderHtmlOrdenPorTipo, renderHtmlFormula, renderHtmlIncapacidades, renderHtmlOrdenImagenologia };
