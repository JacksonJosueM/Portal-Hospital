process.on('uncaughtException', (err) => {
  console.error('💥 CRASH NO CONTROLADO:', err.message);
  console.error('📍 Stack trace:', err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 PROMISE RECHAZADA:', reason);
  console.error('📍 Promise:', promise);
  process.exit(1);
});

require('dotenv').config();

const express = require('express');

const { testConnection } = require('./config/db');
const { verifyTransporter } = require('./config/mailer');
const { runMigrations } = require('./config/migrations');
const envioRoutes = require('./routes/envio.routes');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: '512kb' }));

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'envio-historia-clinica',
  });
});

app.use('/envio', envioRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

app.use((err, req, res, next) => {
  console.error('❌ Error no controlado:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const start = async () => {
  try {
    await testConnection();
    await runMigrations();
    await verifyTransporter();

    app.listen(PORT, '0.0.0.0', () => {
      console.log('\n🏥 ════════════════════════════════════════');
      console.log('   Envío historia clínica — API mínima');
      console.log(`   🌐 http://localhost:${PORT}`);
      console.log(`   📋 Health: http://localhost:${PORT}/health`);
      console.log(`   📤 Envío:  POST http://localhost:${PORT}/envio/single`);
      console.log('   ════════════════════════════════════════\n');
    });
  } catch (err) {
    console.error('❌ Error al iniciar el servidor:', err.message);
    process.exit(1);
  }
};

start();
