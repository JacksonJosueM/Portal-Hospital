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

  // Obtener IP del cliente (priorizando ipOrigen mandado por HTA o x-forwarded-for en caso de estar detrás de un proxy)
  let clientIp = req.body?.ipOrigen || req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
  if (clientIp) {
    clientIp = clientIp.split(',')[0].trim();
    if (clientIp.includes('::ffff:')) {
      clientIp = clientIp.split('::ffff:')[1];
    }
  }

  // Obtener Hostname del cliente
  // 1. Si el frontend lo manda, se usa (útil si hay un script en la PC cliente que sepa su nombre)
  let clientHostname = req.body?.equipoOrigen || null;
  
  // 2. Si no lo manda, intentamos resolver el nombre a partir de la IP en la red local
  if (!clientHostname && clientIp) {
    try {
      const dns = require('dns').promises;
      const hostnames = await dns.reverse(clientIp);
      if (hostnames && hostnames.length > 0) {
        clientHostname = hostnames[0];
      }
    } catch (e) {
      // dns.reverse lanza error si no encuentra registro asociado (ej: red sin DNS interno configurado para PTR)
    }
  }

  // 3. Fallback: Si tampoco pudo resolverse, dejamos la IP como nombre de máquina o 'Desconocido'
  if (!clientHostname) {
    clientHostname = clientIp || 'Desconocido';
  }

  try {
    const resultado = await EnvioService.enviarHistoria({
      tipo_documento: tipo,
      numero_documento: doc,
      idAtencion: null,
      fuente: 'manual',
      forzar: true,
      clientIp,
      clientHostname
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
