const express = require('express');
const { param } = require('express-validator');
const HistoriaController = require('../controllers/historia.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const validateRequest = require('../middlewares/validate.middleware');

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authMiddleware);

/**
 * GET /historias
 * Lista historias clínicas del paciente autenticado
 */
router.get('/', HistoriaController.listar);

/**
 * GET /historias/:id
 * Detalle de historia clínica
 */
router.get(
  '/:id',
  [param('id').isInt({ min: 1 }).withMessage('ID inválido')],
  validateRequest,
  HistoriaController.detalle
);

/**
 * GET /historias/:id/pdf
 * Descarga PDF de historia clínica
 */
router.get(
  '/:id/pdf',
  [param('id').isInt({ min: 1 }).withMessage('ID inválido')],
  validateRequest,
  HistoriaController.descargarPdf
);
/**
 * POST /historias/:id/solicitar-pdf
 * Solicita código OTP para descargar
 */
router.post(
  '/:id/solicitar-pdf',
  [param('id').isInt({ min: 1 }).withMessage('ID inválido')],
  validateRequest,
  HistoriaController.solicitarPdf
);

module.exports = router;
