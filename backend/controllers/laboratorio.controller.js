const LaboratorioModel = require('../models/laboratorio.model');
const PacienteModel = require('../models/paciente.model');
const PdfService = require('../services/pdf.service');

const LaboratorioController = {
  /**
   * GET /laboratorios
   * Lista todos los resultados de laboratorio del paciente autenticado
   */
  async listar(req, res) {
    try {
      const { tipo_documento, numero_documento } = req.paciente;
      const resultados = await LaboratorioModel.findByDocument(tipo_documento, numero_documento);
      return res.status(200).json({ data: resultados, total: resultados.length });
    } catch (err) {
      console.error('❌ [Laboratorio] listar:', err.message);
      return res.status(500).json({ error: 'Error al obtener resultados de laboratorio' });
    }
  },

  /**
   * GET /laboratorios/:id
   * Detalle de un resultado de laboratorio
   */
  async detalle(req, res) {
    try {
      const { tipo_documento, numero_documento } = req.paciente;
      const resultado = await LaboratorioModel.findById(req.params.id, tipo_documento, numero_documento);

      if (!resultado) {
        return res.status(404).json({ error: 'Resultado de laboratorio no encontrado' });
      }

      return res.status(200).json({ data: resultado });
    } catch (err) {
      console.error('❌ [Laboratorio] detalle:', err.message);
      return res.status(500).json({ error: 'Error al obtener el resultado' });
    }
  },

  /**
   * GET /laboratorios/:id/pdf
   * Descarga PDF de un resultado de laboratorio
   */
  async descargarPdf(req, res) {
    try {
      const { tipo_documento, numero_documento } = req.paciente;

      const resultado = await LaboratorioModel.findById(req.params.id, tipo_documento, numero_documento);
      if (!resultado) {
        return res.status(404).json({ error: 'Resultado de laboratorio no encontrado' });
      }

      const paciente = await PacienteModel.findByDocument(tipo_documento, numero_documento);

      PdfService.generarLaboratorioPdf(resultado, paciente, res);
    } catch (err) {
      console.error('❌ [Laboratorio] PDF:', err.message);
      return res.status(500).json({ error: 'Error al generar PDF' });
    }
  },
};

module.exports = LaboratorioController;
