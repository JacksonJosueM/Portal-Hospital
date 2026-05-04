const jwt = require('jsonwebtoken');

/**
 * Middleware para proteger rutas: verifica JWT
 */
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de acceso requerido' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'hospital_secret');
    req.paciente = decoded; // { tipo_documento, numero_documento, nombre }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Sesión expirada. Por favor vuelve a ingresar.' });
    }
    return res.status(401).json({ error: 'Token inválido' });
  }
};

module.exports = authMiddleware;
