const { OMITIR_RUBRICAS_ESTRUCTURA } = require('./constants');

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
  // Si es un objeto Date, usamos sus componentes UTC para evitar el shift de zona horaria local (Bogot&aacute; -5h).
  // Si es string, el constructor new Date() lo interpretar&aacute;; luego extraemos los componentes UTC.
  const d = value instanceof Date ? value : new Date(value);

  if (isNaN(d.getTime())) return '';  // Valor inv&aacute;lido â†’ cadena vac&iacute;a

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

function formatSoloFecha(value) {
  if (!value) return '';
  // Solo detectar ISO estricto (YYYY-MM-DDTHH...) â€” NO "GMT" ni otros strings con 'T'
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const [yyyy, mm, dd] = value.split('T')[0].split('-');
    const yy = String(yyyy).slice(-2);
    return `${dd}/${mm}/${yy}`;
  }
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';  // Valor inv&aacute;lido â†’ vac&iacute;o
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yy = String(d.getUTCFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
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
  // PAPEL_HISTORIA puede venir como c&oacute;digo (1=Carta, 2=Oficio, etc.).
  switch (parametros.PAPEL_HISTORIA) {
    case 2: return 'Legal';
    case 3: return 'A4';
    default: return 'Letter';
  }
}

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

function getFallbackCampoPorNombre(payload, nombreCampo = '') {
  const n = normalizeKey(String(nombreCampo || '').replace(':', ''));
  const aliases = {
    'fecha del peso': ['Fecha del peso'],
    'peso': ['Peso'],
    'fecha de la talla': ['Fecha de la talla'],
    'talla': ['Talla'],
    'indice de masa corporal': ['&Iacute;ndice de masa corporal', 'Indice de masa corporal'],
    'temperatura': ['Temperatura'],
    'circunferencia de cintura': ['Circunferencia de cintura'],
    'tension arterial sistolica (tas)': ['Tensi&oacute;n arterial sist&oacute;lica (TAS)', 'Tension arterial sistolica (TAS)'],
    'tension arterial diastolica (tad)': ['Tensi&oacute;n arterial diast&oacute;lica (TAD)', 'Tension arterial diastolica (TAD)'],
    'tam (tension arterial media)': ['TAM (Tensi&oacute;n arterial media)', 'TAM (Tension arterial media)'],
    'saturacion de oxigeno': ['Saturaci&oacute;n de Oxigeno', 'Saturacion de Oxigeno'],
    'frecuencia respiratoria (min)': ['Frecuencia Respitatoria (min)', 'Frecuencia Respiratoria (min)'],
    'frecuencia cardiaca': ['Frecuencia C&aacute;rdiaca', 'Frecuencia Cardiaca'],
  };
  const valor = getCampo(payload, aliases[n] || [nombreCampo]);
  if (valor == null || String(valor).trim() === '') return '';
  if (n.startsWith('fecha ')) return formatSoloFecha(valor);
  return String(valor);
}

function numeroALetras(num) {
  if (num === null || isNaN(num)) return '';
  let n = Math.floor(Number(num));
  if (n === 0) return 'cero';

  const unidades = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
  const decenas = ['', 'diez', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
  const especiales = { 11: 'once', 12: 'doce', 13: 'trece', 14: 'catorce', 15: 'quince', 16: 'diecis&eacute;is', 17: 'diecisiete', 18: 'dieciocho', 19: 'diecinueve', 21: 'veintiuno', 22: 'veintid&oacute;s', 23: 'veintitr&eacute;s', 24: 'veinticuatro', 25: 'veinticinco', 26: 'veintis&eacute;is', 27: 'veintisiete', 28: 'veintiocho', 29: 'veintinueve' };
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
module.exports = { escapeHtml, formatFecha, formatSoloFecha, formatDecimal, bytesToDataUrl, buildFormat, resolverTokens, esTituloGinecoObstetrico, esTituloProfesionalSalud, normalizeKey, getCampo, getFallbackCampoPorNombre, numeroALetras };
