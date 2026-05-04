const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

const verifyTransporter = async () => {
  try {
    await transporter.verify();
    console.log('✅ Servidor de correo configurado correctamente');
  } catch (err) {
    console.warn('⚠️  No se pudo verificar el servidor de correo:', err.message);
    console.warn('   El sistema funcionará pero no podrá enviar correos reales');
  }
};

module.exports = { transporter, verifyTransporter };
