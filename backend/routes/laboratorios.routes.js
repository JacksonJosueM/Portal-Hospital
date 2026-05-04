const express = require('express');
const { param } = require('express-validator');
const LaboratorioController = require('../controllers/laboratorio.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const validateRequest = require('../middlewares/validate.middleware');

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authMiddleware);

/**
 * GET /laboratorios
 * Lista resultados de laboratorio del paciente autenticado
 */
router.get('/', LaboratorioController.listar);

/**
 * GET /laboratorios/:id
 * Detalle de resultado de laboratorio
 */
router.get(
  '/:id',
  [param('id').isInt({ min: 1 }).withMessage('ID inválido')],
  validateRequest,
  LaboratorioController.detalle
);

/**
 * GET /laboratorios/:id/pdf
 * Descarga PDF de resultado de laboratorio
 */
router.get(
  '/:id/pdf',
  [param('id').isInt({ min: 1 }).withMessage('ID inválido')],
  validateRequest,
  LaboratorioController.descargarPdf
);

module.exports = router;
