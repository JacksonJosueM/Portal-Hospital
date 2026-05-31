const { buildFormat } = require('./utils');

function buildEstilos(parametros) {
  const p = (parametros && parametros[0]) || {};
  const tamanio = p.TAMANIO_FUENTE || 9;
  const interlineado = Math.max((p.INTERLINEADO || 14) / 10, 1.2);
  const mt = p.MARGEN_SUPERIOR ?? 12;
  const mb = p.MARGEN_INFERIOR ?? 12;
  const ml = p.MARGEN_IZQUIERDO || 25;
  const mr = p.MARGEN_DERECHO || 25;

  return `
    /* â•â• Reset / Base â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
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

    /* â•â• Encabezado â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
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

    /* â•â• T&iacute;tulos de secci&oacute;n â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
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

    /* â•â• Campos cl&iacute;nicos â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
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

    /* â•â• TABLAS â€” clave para evitar superposici&oacute;n â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
    .tabla-dinamica {
      width: 100%;
      border-collapse: collapse;
      margin: 6px 0;
      table-layout: fixed;
    }
    .tabla-dinamica th,
    .tabla-dinamica td {
      border: 1px solid #000;
      padding: 3px 5px;
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

    /* â•â• Tablas de &oacute;rdenes/f&oacute;rmula (anchos expl&iacute;citos) â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
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
      padding: 3px 5px;
      vertical-align: top;
      word-break: break-word;
      overflow-wrap: break-word;
      white-space: normal;
      line-height: 1.35;
    }
    table.orden-table th { background: #f3f4f6; font-weight: bold; }

    /* â•â• Firma â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
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

    /* â•â• Pie de p&aacute;gina â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
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

    /* â•â• @page: m&aacute;rgenes de impresi&oacute;n (refuerza lo que pasa Puppeteer) â•â• */
    @page {
      size: ${buildFormat(parametros)};
      margin: ${mt}mm ${mr}mm ${mb}mm ${ml}mm;
    }

    /* â•â• @media print: refuerza reglas solo cuando Chromium imprime â•â•â•â•â•â• */
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .tabla-dinamica { page-break-inside: auto; }
      .tabla-dinamica tr { page-break-inside: avoid; break-inside: avoid; }
      .campo-line { page-break-inside: avoid; break-inside: avoid; }
      .firma-block { page-break-inside: avoid; break-inside: avoid; }
    }
  `;
}
module.exports = { buildEstilos };
