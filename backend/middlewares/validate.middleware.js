const { validationResult } = require('express-validator');

/**
 * Middleware para verificar errores de validación de express-validator
 */
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Datos inválidos',
      detalles: errors.array().map((e) => ({ campo: e.path, mensaje: e.msg })),
    });
  }
  next();
};

module.exports = validateRequest;
