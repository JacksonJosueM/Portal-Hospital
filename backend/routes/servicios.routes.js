const express = require('express');
const { body } = require('express-validator');
const rateLimit = require('express-rate-limit');
const ServiciosController = require('../controllers/servicios.controller');
const validateRequest = require('../middlewares/validate.middleware');

const router = express.Router();

// Rate limiting estricto para autenticación
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos de acceso. Intente de nuevo en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const otpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  message: { error: 'Demasiados intentos de verificacion. Espere 5 minutos.' },
});

const TIPOS_VALIDOS = ['CC', 'TI', 'CE', 'PT', 'PA', 'OTRO'];

/**
 * POST /servicios/autenticar
 * Verifica identidad: tipo_doc + numero_doc + fecha_nacimiento → envía OTP
 */
router.post(
  '/autenticar',
  authLimiter,
  [
    body('tipo_documento').trim().isIn(TIPOS_VALIDOS).withMessage('Tipo de documento inválido.'),
    body('numero_documento').trim().notEmpty().isLength({ min: 4, max: 30 }).withMessage('Número de documento inválido.'),
    body('fecha_nacimiento').notEmpty().withMessage('La fecha de nacimiento es requerida.'),
  ],
  validateRequest,
  ServiciosController.autenticar
);

/**
 * POST /servicios/verificar-otp
 * Valida OTP y devuelve token de acceso a registros
 */
router.post(
  '/verificar-otp',
  otpLimiter,
  [
    body('temp_token').notEmpty().withMessage('Token requerido.'),
    body('codigo_otp').trim().isLength({ min: 6, max: 6 }).withMessage('Código OTP de 6 dígitos requerido.'),
  ],
  validateRequest,
  ServiciosController.verificarOtp
);

module.exports = router;
