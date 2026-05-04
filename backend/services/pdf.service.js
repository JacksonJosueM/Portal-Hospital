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

let _browser = null;
let _browserLaunchPromise = null;

async function getBrowser() {
  if (_browser && _browser.isConnected()) return _browser;
  if (_browserLaunchPromise) return _browserLaunchPromise;

  _browserLaunchPromise = puppeteer
    .launch({
      headless: 'new',
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
  const ml = parametros.MARGEN_IZQUIERDO ?? 10;
  const mr = parametros.MARGEN_DERECHO ?? 10;
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
 * Renderiza un HTML a PDF y lo escribe directo en la respuesta HTTP.
 *
 * @param {object} params
 * @param {string} params.html         HTML completo (con <html>, <head>, <body>)
 * @param {object} [params.parametros] Parámetros de impresión (de STP_PARAMETROS_IMPRESION)
 * @param {string} [params.nombreArchivo='historia_clinica.pdf']
 * @param {import('express').Response} params.res
 */
async function generarPdfDesdeHtml({ html, parametros = {}, nombreArchivo = 'historia_clinica.pdf', res }) {
  let page;
  const startTime = Date.now();

  try {
    const browser = await getBrowser();
    page = await browser.newPage();

    // Viewport que coincida con el ancho de una página Letter a 96 DPI
    // (8.5in × 96 = 816px). Sin esto, el viewport por defecto ~800px puede
    // calcular el layout de flex/tablas mal antes de imprimir el PDF.
    await page.setViewport({ width: 816, height: 1056, deviceScaleFactor: 1 });

    // Bloquear recursos externos (no debería haber, pero por si acaso)
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (['stylesheet', 'font', 'script'].includes(type)) req.abort();
      else req.continue();
    });

    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    await page.emulateMediaType('screen');

    const pdfBuffer = await page.pdf({
      format: buildFormat(parametros),
      margin: buildMargin(parametros),
      printBackground: true,
      preferCSSPageSize: false,
    });

    await page.close();
    page = null;

    const elapsed = Date.now() - startTime;
    console.log(`📄 PDF generado en ${elapsed}ms (${(pdfBuffer.length / 1024).toFixed(0)} KB)`);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
      'Content-Length': pdfBuffer.length,
    });
    return res.send(pdfBuffer);
  } catch (err) {
    if (page) {
      try { await page.close(); } catch (_) { /* noop */ }
    }
    console.error('❌ Error generando PDF:', err.message);
    throw err;
  }
}

module.exports = { generarPdfDesdeHtml };
