/**
 * ════════════════════════════════════════════════════════════════════════════
 *  MAIL SERVICE · Envío de correos con adjuntos (Nodemailer)
 * ════════════════════════════════════════════════════════════════════════════
 */

const { transporter } = require('../config/mailer');

/**
 * Envía un correo con un adjunto en memoria (Buffer).
 *
 * @param {object} params
 * @param {string}          params.to          Destinatario
 * @param {string}          params.subject     Asunto
 * @param {string}          params.text        Cuerpo en texto plano
 * @param {string}          [params.html]      Cuerpo en HTML (opcional)
 * @param {string}          params.filename    Nombre del archivo adjunto
 * @param {Buffer}          params.content     Contenido del adjunto (Buffer)
 * @param {string}          [params.mimetype]  MIME type del adjunto (default: application/pdf)
 * @returns {Promise<object>}  Resultado de nodemailer (messageId, etc.)
 */
async function enviarConAdjunto({ to, subject, text, html, filename, content, mimetype = 'application/pdf' }) {
  const mailOptions = {
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to,
    subject,
    text,
    ...(html ? { html } : {}),
    attachments: [
      {
        filename,
        content,
        contentType: mimetype,
      },
    ],
  };

  const info = await transporter.sendMail(mailOptions);
  console.log(`📧 Correo enviado a ${to} | messageId: ${info.messageId}`);
  return info;
}

module.exports = { enviarConAdjunto };
