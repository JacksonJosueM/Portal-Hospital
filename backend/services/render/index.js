const { buildEstilos } = require('./styles');
const { renderEncabezado, renderFirma, renderProfesionalInfo } = require('./identificacion');
const { renderEstructura } = require('./estructura');
const { escapeHtml, formatFecha, formatSoloFecha, formatDecimal, bytesToDataUrl, buildFormat, resolverTokens, esTituloGinecoObstetrico, esTituloProfesionalSalud, normalizeKey, getCampo, getFallbackCampoPorNombre, numeroALetras } = require('./utils');
const { renderDiagnosticos, renderAlergias, renderAntecedentes, renderSintomas, renderCalculosRiesgo, renderNotas, renderGraficas, renderTratamientosOdonto } = require('./clinico');
const { renderOrdenesYFormulacion, clasificarTodasLasOrdenes, renderHtmlOrdenPorTipo, renderHtmlFormula, renderHtmlIncapacidades, renderHtmlOrdenImagenologia } = require('./ordenes');
const { renderHtmlAutorizacion, CSSAutorizacion } = require('../plantilla.render.autorizacion');

function renderHtml(payload) {
  const estilos = buildEstilos(payload.parametros);
  const plantillaNombre = (payload.plantilla.meta && (payload.plantilla.meta.NOMBRE || payload.plantilla.meta.IDENTIFICADOR)) || 'HISTORIA CL&Iacute;NICA';

  const cuerpo = `
    <div style="padding: 0 12mm 0 6mm;">
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
      <div class="footer">Atenci&oacute;n: ${escapeHtml(payload.atencion.ID || '')} Â· Plantilla: ${escapeHtml((payload.plantilla.meta && payload.plantilla.meta.ID) || '')}</div>
    </div>
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

module.exports = {
  renderHtml, clasificarTodasLasOrdenes, renderHtmlOrdenPorTipo, renderHtmlFormula, renderHtmlIncapacidades, renderHtmlOrdenImagenologia, renderHtmlAutorizacion, CSSAutorizacion
};
