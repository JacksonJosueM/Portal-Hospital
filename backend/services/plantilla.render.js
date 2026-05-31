/**
 * ════════════════════════════════════════════════════════════════════════════
 * RENDER DE PLANTILLAS Y HTML (Refactorizado)
 * ════════════════════════════════════════════════════════════════════════════
 * 
 * Este archivo gigante ha sido modularizado para mejorar el rendimiento del 
 * motor V8 de NodeJS y permitir una escalabilidad correcta del Hospital.
 * Las funciones se importan desde la carpeta ./render y se exponen
 * para mantener compatibilidad total con el resto del proyecto.
 */

const {
  renderHtml,
  clasificarTodasLasOrdenes,
  renderHtmlOrdenPorTipo,
  renderHtmlFormula,
  renderHtmlIncapacidades,
  renderHtmlOrdenImagenologia,
  renderHtmlAutorizacion,
  CSSAutorizacion
} = require('./render');

module.exports = {
  renderHtml,
  clasificarTodasLasOrdenes,
  renderHtmlOrdenPorTipo,
  renderHtmlFormula,
  renderHtmlIncapacidades,
  renderHtmlOrdenImagenologia,
  renderHtmlAutorizacion,
  CSSAutorizacion
};
