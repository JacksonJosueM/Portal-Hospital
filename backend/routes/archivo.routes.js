/**
 * ════════════════════════════════════════════════════════════════════════════
 *  ARCHIVO ROUTES · Endpoints exclusivos del módulo de Archivo/Correspondencia
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Prefijo: /archivo
 *
 *  GET  /archivo/paciente/:numDoc           → Buscar paciente + correo actual
 *  GET  /archivo/atenciones/:idPaciente     → Listar atenciones cerradas
 *  PUT  /archivo/paciente/:numDoc/correo    → Actualizar correo en Panacea
 *  POST /archivo/enviar                     → Enviar historia seleccionada
 * ════════════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const ArchivoService = require('../services/archivo.service');

const router = express.Router();

// ── Helpers ────────────────────────────────────────────────────────────────

function getClientIp(req) {
  let ip = req.body?.ipOrigen || req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '';
  ip = ip.split(',')[0].trim();
  if (ip.includes('::ffff:')) ip = ip.split('::ffff:')[1];
  return ip;
}

async function getClientHostname(req, ip) {
  let hostname = req.body?.equipoOrigen || null;
  if (!hostname && ip) {
    try {
      const dns = require('dns').promises;
      const names = await dns.reverse(ip);
      if (names && names.length > 0) hostname = names[0];
    } catch (_) {}
  }
  return hostname || ip || 'Desconocido';
}

// ── GET /archivo/paciente/:numDoc ──────────────────────────────────────────
/**
 * Busca el paciente y devuelve su información + correo actual desde Panacea.
 * El HTA llama esto al presionar "Buscar".
 */
router.get('/paciente/:numDoc', async (req, res) => {
  const numDoc = (req.params.numDoc || '').toString().trim();
  if (!numDoc) return res.status(400).json({ ok: false, error: 'Número de documento requerido.' });

  try {
    const paciente = await ArchivoService.buscarPacienteArchivo(numDoc);
    if (!paciente) {
      return res.status(404).json({
        ok: false,
        error: `No se encontró ningún paciente con el documento ${numDoc}.`,
      });
    }

    // Obtener correo directo desde Panacea (más actualizado que la vista)
    const contacto = await ArchivoService.obtenerContactoPaciente(paciente.id_paciente);

    return res.json({
      ok: true,
      paciente: {
        id_paciente:     paciente.id_paciente,
        nombre:          paciente.NOMBRE_COMPLETO,
        numero_documento: paciente.numero_documento,
        email:           contacto?.EMAIL   || paciente.email || '',
        email_alterno:   contacto?.EMAIL_ALTERNO || '',
        tiene_correo:    !!(contacto?.EMAIL || paciente.email),
      },
    });
  } catch (err) {
    console.error('[archivo/paciente]', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /archivo/atenciones/:idPaciente ────────────────────────────────────
/**
 * Lista las atenciones cerradas del paciente para que el operador elija cuál enviar.
 */
router.get('/atenciones/:idPaciente', async (req, res) => {
  const idPaciente = parseInt(req.params.idPaciente, 10);
  if (!idPaciente || isNaN(idPaciente)) {
    return res.status(400).json({ ok: false, error: 'ID de paciente inválido.' });
  }

  try {
    const atenciones = await ArchivoService.listarAtencionesPaciente(idPaciente);
    return res.json({
      ok: true,
      total: atenciones.length,
      atenciones: atenciones.map(a => ({
        id:           a.ID,
        fecha:        a.FECHA_ATENCION,
        profesional:  a.NOMBRE_PROFESIONAL,
        especialidad: a.ESPECIALIDAD || '',
      })),
    });
  } catch (err) {
    console.error('[archivo/atenciones]', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── PUT /archivo/paciente/:numDoc/correo ───────────────────────────────────
/**
 * Actualiza el correo del paciente en Parametrizacion.TP_PACIENTE_CONTACTOS.
 * Body: { idPaciente, emailNuevo, operador, ipOrigen, equipoOrigen }
 */
router.put('/paciente/:numDoc/correo', async (req, res) => {
  const numDoc     = (req.params.numDoc || '').toString().trim();
  const idPaciente = parseInt(req.body?.idPaciente, 10);
  const emailNuevo = (req.body?.emailNuevo || '').toString().trim();
  const operador   = (req.body?.operador || 'ARCHIVO').toString().trim();

  if (!numDoc)               return res.status(400).json({ ok: false, error: 'Número de documento requerido.' });
  if (!idPaciente || isNaN(idPaciente)) return res.status(400).json({ ok: false, error: 'ID de paciente requerido.' });
  if (!emailNuevo)           return res.status(400).json({ ok: false, error: 'El nuevo correo es requerido.' });

  // Validación básica de formato de correo
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(emailNuevo)) {
    return res.status(400).json({ ok: false, error: `El correo '${emailNuevo}' no tiene un formato válido.` });
  }

  const clientIp = getClientIp(req);

  try {
    const resultado = await ArchivoService.actualizarCorreoPaciente(
      idPaciente, emailNuevo, operador, clientIp
    );
    const status = resultado.ok ? 200 : 422;
    return res.status(status).json(resultado);
  } catch (err) {
    console.error('[archivo/correo]', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /archivo/enviar ───────────────────────────────────────────────────
/**
 * Envía la historia clínica de la atención seleccionada al correo del paciente.
 *
 * Body:
 * {
 *   "numDoc":       "12345678",
 *   "idAtencion":   359695,
 *   "operador":     "ARCHIVO01",
 *   "ipOrigen":     "10.10.0.5",     ← opcional, el HTA lo manda
 *   "equipoOrigen": "PC-ARCHIVO"     ← opcional, el HTA lo manda
 * }
 */
router.post('/enviar', async (req, res) => {
  const numDoc    = (req.body?.numDoc    || '').toString().trim();
  const idAtencion = req.body?.idAtencion ? parseInt(req.body.idAtencion, 10) : null;
  const operador  = (req.body?.operador  || 'ARCHIVO').toString().trim();

  if (!numDoc) {
    return res.status(400).json({ ok: false, error: 'Se requiere numDoc.' });
  }
  if (!idAtencion || isNaN(idAtencion)) {
    return res.status(400).json({ ok: false, error: 'Se requiere idAtencion (número entero).' });
  }

  const clientIp       = getClientIp(req);
  const clientHostname  = await getClientHostname(req, clientIp);

  try {
    const resultado = await ArchivoService.enviarHistoriaArchivo({
      numero_documento: numDoc,
      idAtencion,
      operador,
      clientIp,
      clientHostname,
    });

    const status = resultado.ok ? 200 : 422;
    return res.status(status).json(resultado);
  } catch (err) {
    console.error('[archivo/enviar]', err);
    return res.status(500).json({ ok: false, error: err.message || 'Error interno.' });
  }
});

module.exports = router;
