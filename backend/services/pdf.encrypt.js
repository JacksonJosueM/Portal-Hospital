/**
 * ════════════════════════════════════════════════════════════════════════════
 *  PDF ENCRYPT · Cifrado AES-128 con contraseña
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Cifra el buffer de un PDF para que solo el titular pueda abrirlo. La
 *  contraseña que se envía al correo del paciente es **su número de
 *  documento de identidad** (cédula o tarjeta de identidad). Esto garantiza
 *  que aunque el correo sea reenviado, sólo el paciente —que conoce su
 *  documento— pueda leer la historia clínica.
 *
 *  Implementación:
 *    • Librería principal: `muhammara` (fork mantenido de HummusJS, soporta
 *      AES-128). Tiene prebuilts para Windows x64.
 *    • Fallback opcional: `node-qpdf2` si está instalado y muhammara falla.
 *    • Si **ninguna** librería está disponible, la función lanza un error
 *      descriptivo: NO devolvemos el PDF sin cifrar para no incumplir la
 *      promesa de seguridad hecha al paciente.
 *
 *  Permisos del documento cifrado:
 *    - Lectura: SÍ
 *    - Impresión: SÍ
 *    - Copy/paste de texto: NO
 *    - Edición: NO
 *    - Anotaciones: NO
 * ════════════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

let _muhammara = null;
let _muhammaraTried = false;

let _qpdf = null;
let _qpdfTried = false;

function tryLoadMuhammara() {
  if (_muhammaraTried) return _muhammara;
  _muhammaraTried = true;
  try {
    _muhammara = require('muhammara');
    console.log('🔐 [PdfEncrypt] muhammara cargado (cifrado AES-128 disponible)');
  } catch (err) {
    console.warn('⚠️  [PdfEncrypt] muhammara no disponible:', err.message);
    _muhammara = null;
  }
  return _muhammara;
}

function tryLoadQpdf() {
  if (_qpdfTried) return _qpdf;
  _qpdfTried = true;
  try {
    _qpdf = require('node-qpdf2');
    console.log('🔐 [PdfEncrypt] node-qpdf2 cargado (fallback de cifrado)');
  } catch (err) {
    _qpdf = null;
  }
  return _qpdf;
}

/**
 * Normaliza la contraseña: solo dígitos y letras, sin espacios ni puntos.
 * El paciente abrirá con su cédula limpia (ej: "1.234.567" → "1234567").
 */
function sanitizarPassword(raw) {
  if (raw == null) throw new Error('La contraseña del PDF es requerida (numero_documento del paciente)');
  const limpio = String(raw).replace(/[^A-Za-z0-9]/g, '');
  if (limpio.length < 4) {
    throw new Error('La contraseña del PDF debe tener al menos 4 caracteres alfanuméricos');
  }
  return limpio;
}

/**
 * Cifra un buffer de PDF con muhammara (AES-128).
 */
function cifrarConMuhammara(buffer, password) {
  const muhammara = tryLoadMuhammara();
  if (!muhammara) return null;

  const tmpDir = os.tmpdir();
  const uid = crypto.randomBytes(8).toString('hex');
  const inFile = path.join(tmpDir, `historia_in_${uid}.pdf`);
  const outFile = path.join(tmpDir, `historia_out_${uid}.pdf`);

  try {
    fs.writeFileSync(inFile, buffer);

    muhammara.recrypt(
      inFile,
      outFile,
      {
        userPassword: password,
        ownerPassword: password + '_owner_' + uid, // owner distinto para que el paciente no pueda quitar restricciones
        userProtectionFlag: 0xFFFFF0C0, // Permite imprimir pero no copiar/editar
      }
    );

    const cifrado = fs.readFileSync(outFile);
    return cifrado;
  } catch (err) {
    console.warn('⚠️  [PdfEncrypt] Falló cifrado con muhammara:', err.message);
    return null;
  } finally {
    try { fs.unlinkSync(inFile); } catch (_) { /* noop */ }
    try { fs.unlinkSync(outFile); } catch (_) { /* noop */ }
  }
}

/**
 * Cifra un buffer de PDF con node-qpdf2 (binario qpdf como fallback).
 */
async function cifrarConQpdf(buffer, password) {
  const qpdf = tryLoadQpdf();
  if (!qpdf) return null;

  const tmpDir = os.tmpdir();
  const uid = crypto.randomBytes(8).toString('hex');
  const inFile = path.join(tmpDir, `historia_in_${uid}.pdf`);
  const outFile = path.join(tmpDir, `historia_out_${uid}.pdf`);

  try {
    fs.writeFileSync(inFile, buffer);

    await qpdf.encrypt({
      input: inFile,
      output: outFile,
      password: password,
      keyLength: 128,
      restrictions: {
        print: 'full',
        modify: 'none',
        extract: 'n',
        annotate: 'n',
      },
    });

    return fs.readFileSync(outFile);
  } catch (err) {
    console.warn('⚠️  [PdfEncrypt] Falló cifrado con qpdf:', err.message);
    return null;
  } finally {
    try { fs.unlinkSync(inFile); } catch (_) { /* noop */ }
    try { fs.unlinkSync(outFile); } catch (_) { /* noop */ }
  }
}

/**
 * Cifra un PDF con AES-128 usando la contraseña indicada.
 *
 * @param {Buffer} pdfBuffer       PDF de entrada (sin cifrar)
 * @param {string} password        Contraseña (típicamente numero_documento)
 * @returns {Promise<Buffer>}      PDF cifrado
 * @throws {Error}                 Si ninguna librería de cifrado está disponible
 */
async function cifrarPdf(pdfBuffer, password) {
  if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
    throw new Error('cifrarPdf: pdfBuffer vacío o inválido');
  }
  const limpio = sanitizarPassword(password);
  const t0 = Date.now();

  const muhammaraResult = cifrarConMuhammara(pdfBuffer, limpio);
  if (muhammaraResult) {
    console.log(`🔐 [PdfEncrypt] PDF cifrado con muhammara en ${Date.now() - t0}ms`);
    return muhammaraResult;
  }

  const qpdfResult = await cifrarConQpdf(pdfBuffer, limpio);
  if (qpdfResult) {
    console.log(`🔐 [PdfEncrypt] PDF cifrado con qpdf en ${Date.now() - t0}ms`);
    return qpdfResult;
  }

  throw new Error(
    'No se pudo cifrar el PDF: ni "muhammara" ni "node-qpdf2" están disponibles. ' +
    'Instala una de ellas: `npm install muhammara` (recomendado) o `npm install node-qpdf2`. ' +
    'Por seguridad, NO se enviará el PDF sin cifrar.'
  );
}

module.exports = { cifrarPdf, sanitizarPassword };
