const https = require('https');

/**
 * Formatea el número de teléfono al formato internacional.
 * Si el número no tiene código de país, asume Colombia (+57).
 */
function formatearTelefono(telefono) {
  // Quitar espacios, guiones, paréntesis
  let num = String(telefono).replace(/[\s\-().+]/g, '');
  // Si empieza con 57 y tiene 12 dígitos → ya está bien
  if (num.startsWith('57') && num.length === 12) return num;
  // Si empieza con 3 y tiene 10 dígitos → número colombiano sin código
  if (num.startsWith('3') && num.length === 10) return `57${num}`;
  // Si ya tiene + al inicio, quitar el +
  return num;
}

const SmsService = {
  /**
   * Envía el código OTP por WhatsApp usando la Meta Business API.
   * Requiere en .env:
   *   WHATSAPP_TOKEN       → Access token permanente de Meta Business
   *   WHATSAPP_PHONE_ID    → Phone Number ID de la cuenta WhatsApp Business
   *   WHATSAPP_TEMPLATE    → Nombre del template aprobado (opcional, default: authentication)
   */
  async enviarOtp(telefono, codigo) {
    try {
      if (!telefono) return false;

      const token = process.env.WHATSAPP_TOKEN;
      const phoneNumberId = process.env.WHATSAPP_PHONE_ID;

      if (!token || !phoneNumberId) {
        console.warn('⚠️ [WhatsApp] WHATSAPP_TOKEN o WHATSAPP_PHONE_ID no configurados en .env');
        console.log(`📱 [DEV] Código OTP para ${telefono}: ${codigo}`);
        return false;
      }

      const destinatario = formatearTelefono(telefono);
      const templateName = process.env.WHATSAPP_TEMPLATE || 'authentication';

      // Cuerpo del mensaje — se intenta primero con template de autenticación
      // Si tienes un template personalizado del hospital, cambia el body según su estructura
      const body = JSON.stringify({
        messaging_product: 'whatsapp',
        to: destinatario,
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'es' },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: codigo }
              ]
            },
            {
              type: 'button',
              sub_type: 'url',
              index: '0',
              parameters: [
                { type: 'text', text: codigo }
              ]
            }
          ]
        }
      });

      const options = {
        hostname: 'graph.facebook.com',
        path: `/v19.0/${phoneNumberId}/messages`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Content-Length': Buffer.byteLength(body)
        }
      };

      await new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              console.error('❌ [WhatsApp] Error de la API:', parsed.error.message);
              reject(new Error(parsed.error.message));
            } else {
              console.log(`✅ [WhatsApp] Mensaje enviado a +${destinatario}`);
              resolve(parsed);
            }
          });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
      });

      return true;
    } catch (err) {
      console.error('❌ [WhatsApp] Error al enviar mensaje:', err.message);
      return false;
    }
  }
};

module.exports = SmsService;
