/**
 * ════════════════════════════════════════════════════════════════════════════
 *  PDF SERVICE · Puppeteer (HTML → PDF buffer)
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Recibe el HTML ya rendirizado por `plantilla.render.js` y lo convierte
 *  en PDF aplicando los márgenes/papel que vienen en `parametros` (que a su
 *  vez salen del SP `Historia.STP_PARAMETROS_IMPRESION`).
 *
 *  Mantiene un pool singleton de browser Chromium para evitar el costo
 *  (~3-5s) de arrancar uno nuevo en cada petición.
 * ════════════════════════════════════════════════════════════════════════════
 */

const puppeteer = require('puppeteer');
const pLimit = require('p-limit');

// Máximo 5 páginas de Puppeteer en paralelo.
// Los demás se encolan automáticamente y se procesan en orden.
// Con 16 GB RAM esto consume ~1.5 GB máximo bajo carga total.
const _pdfLimit = pLimit(21);

let _browser = null;
let _browserLaunchPromise = null;

async function getBrowser() {
  if (_browser && _browser.isConnected()) return _browser;
  if (_browserLaunchPromise) return _browserLaunchPromise;

  _browserLaunchPromise = puppeteer
    .launch({
      headless: 'new',
      timeout: 60000, // Aumentar a 60s
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
        '--no-first-run',
      ],
    })
    .then((browser) => {
      _browser = browser;
      _browserLaunchPromise = null;
      browser.on('disconnected', () => {
        _browser = null;
        console.log('🔄 Puppeteer browser desconectado, se reiniciará en la próxima petición');
      });
      console.log('🚀 Puppeteer browser pool inicializado (reutilizable)');
      return browser;
    })
    .catch((err) => {
      _browserLaunchPromise = null;
      throw err;
    });
  return _browserLaunchPromise;
}

process.on('SIGINT', async () => { if (_browser) await _browser.close(); });
process.on('SIGTERM', async () => { if (_browser) await _browser.close(); });

/**
 * Convierte parámetros estilo Panacea a la opción `margin` de Puppeteer.
 * STP_PARAMETROS_IMPRESION devuelve los márgenes en milímetros.
 */
function buildMargin(parametros = {}) {
  const mt = parametros.MARGEN_SUPERIOR ?? 12;
  const mb = parametros.MARGEN_INFERIOR ?? 12;
  const ml = parametros.MARGEN_IZQUIERDO || 25;
  const mr = parametros.MARGEN_DERECHO || 25;
  return { top: `${mt}mm`, bottom: `${mb}mm`, left: `${ml}mm`, right: `${mr}mm` };
}

function buildFormat(parametros = {}) {
  // PAPEL_HISTORIA puede venir como código (1=Carta, 2=Oficio, etc.).
  // Usamos Letter por defecto para emular Panacea.
  switch (parametros.PAPEL_HISTORIA) {
    case 2: return 'Legal';
    case 3: return 'A4';
    default: return 'Letter';
  }
}

/**
 * Renderiza un HTML a PDF y devuelve el buffer en memoria.
 * Esta es la primitiva reusable que utiliza tanto el controlador HTTP
 * (`generarPdfDesdeHtml`) como el CLI de envío automatizado.
 *
 * @param {object} params
 * @param {string} params.html         HTML completo (con <html>, <head>, <body>)
 * @param {object} [params.parametros] Parámetros de impresión (de STP_PARAMETROS_IMPRESION)
 * @returns {Promise<Buffer>}
 */
async function generarPdfBuffer({ html, parametros = {} }) {
  // Encolar si ya hay 5 PDFs generándose en paralelo
  return _pdfLimit(() => _generarPdfBuffer({ html, parametros }));
}

async function _generarPdfBuffer({ html, parametros = {} }) {
  let page;
  const startTime = Date.now();

  try {
    const browser = await getBrowser();
    page = await browser.newPage();

    // ── Viewport alineado al formato de papel real ───────────────────────
    // A4 a 96 DPI ≈ 794 px de ancho. Letter ≈ 816 px.
    // Usamos 794 como mínimo común; Puppeteer lo reescala internamente al PDF.
    const formato = buildFormat(parametros);
    const vpWidth = 1200; // Ancho amplio para permitir flujo natural sin restricciones
    await page.setViewport({ width: vpWidth, height: 1123, deviceScaleFactor: 1 });

    // Bloquear SOLO recursos de red (imágenes externas, scripts remotos).
    // Las hojas de estilo inline y data-URIs NO pasan por aquí; se permiten.
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      // Permitir: document, stylesheet (por si acaso), image (data-URI)
      if (['font', 'script', 'media', 'websocket', 'other'].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // setContent con networkidle0 garantiza que los data-URIs de imágenes
    // (logo, firma) terminen de decodificarse antes de exportar.
    await page.setContent(html, {
      waitUntil: ['domcontentloaded', 'networkidle0'],
      timeout: 120000,
    });

    // ── CORRECCIÓN CRÍTICA ────────────────────────────────────────────────
    // Emular 'print' (NO 'screen') para que Chromium active:
    //   • las reglas @media print
    //   • las directivas @page (márgenes, tamaño)
    //   • page-break-inside / break-inside
    // Con 'screen' estas reglas se ignoran completamente y el contenido
    // se renderiza como si fuera una página web infinita → superposición.
    await page.emulateMediaType('print');

    const pdfBuffer = await page.pdf({
      format: formato,
      margin: buildMargin(parametros),
      printBackground: true,
      preferCSSPageSize: false,   // respetar el format + margin de arriba
      displayHeaderFooter: false, // sin encabezado/pie nativos de Chrome
      timeout: 120000,
    });

    await page.close();
    page = null;

    const elapsed = Date.now() - startTime;
    console.log(`📄 PDF generado en ${elapsed}ms (${(pdfBuffer.length / 1024).toFixed(0)} KB)`);

    return pdfBuffer;
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.error(`❌ Error generando PDF después de ${elapsed}ms:`, err.message);
    if (page) {
      try { await page.close(); } catch (_) { /* noop */ }
    }
    throw err;
  }
}

/**
 * Renderiza un HTML a PDF y lo escribe directo en la respuesta HTTP.
 * Wrapper compatible con el controlador `historia.controller.js`.
 *
 * @param {object} params
 * @param {string} params.html         HTML completo
 * @param {object} [params.parametros] Parámetros de impresión
 * @param {string} [params.nombreArchivo='historia_clinica.pdf']
 * @param {import('express').Response} params.res
 */
async function generarPdfDesdeHtml({ html, parametros = {}, nombreArchivo = 'historia_clinica.pdf', res }) {
  const pdfBuffer = await generarPdfBuffer({ html, parametros });

  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
    'Content-Length': pdfBuffer.length,
  });
  return res.send(pdfBuffer);
}

/**
 * Cierra el browser singleton de Puppeteer. Útil para apagar limpiamente
 * el proceso CLI al final de un envío masivo.
 */
async function cerrarBrowser() {
  if (_browser) {
    try { await _browser.close(); } catch (_) { /* noop */ }
    _browser = null;
  }
}

module.exports = { generarPdfBuffer, generarPdfDesdeHtml, cerrarBrowser };
