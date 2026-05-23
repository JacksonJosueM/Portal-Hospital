const express = require('express');
const EnvioService = require('../services/envio.historia.service');

const router = express.Router();

/**
 * POST /envio/single
 * Body: { tipoDoc, numDoc } — mismo flujo que cli/enviar-historia.js modo single
 * (tipo/doc normalizados como en modoSingle; forzar alineado al .bat del hospital).
 */
router.post('/single', async (req, res) => {
  const tipo = (req.body?.tipoDoc ?? '').toString().trim().toUpperCase() || 'AUTO';
  const doc = (req.body?.numDoc ?? '').toString().trim();

  if (!doc) {
    return res.status(400).json({
      ok: false,
      error: 'Se requiere numDoc en el cuerpo JSON.',
    });
  }

  try {
    const resultado = await EnvioService.enviarHistoria({
      tipo_documento: tipo,
      numero_documento: doc,
      idAtencion: null,
      fuente: 'manual',
      forzar: true,
    });

    const status = resultado.ok ? 200 : 422;
    return res.status(status).json(resultado);
  } catch (err) {
    console.error('[envio/single]', err);
    return res.status(500).json({
      ok: false,
      error: err.message || 'Error interno al procesar el envío.',
    });
  }
});

module.exports = router;
