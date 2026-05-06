// 🛡️ ANTI-CRASH - Coloca ESTO al INICIO de tu archivo principal
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

// Log de inicio
console.log('🚀 Iniciando servidor...');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { testConnection } = require('./config/db');
const { verifyTransporter } = require('./config/mailer');
const { runMigrations } = require('./config/migrations');

// Rutas
const historiasRoutes = require('./routes/historias.routes');
const laboratoriosRoutes = require('./routes/laboratorios.routes');
const serviciosRoutes = require('./routes/servicios.routes');
const envioRoutes = require('./routes/envio.routes');

const app = express();
const PORT = process.env.PORT || 3001;

// ── Seguridad ───────────────────────────────────────────────────────────
app.use(helmet());

app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Disposition', 'Content-Length', 'Content-Type'],
  })
);

// Rate limiting global
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Demasiadas solicitudes desde esta IP. Intenta más tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

// ── Body parsers ────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Rutas ────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'Portal Hospital API' });
});

app.use('/historias', historiasRoutes);
app.use('/laboratorios', laboratoriosRoutes);
app.use('/servicios', serviciosRoutes);
app.use('/envio', envioRoutes);

// ── 404 handler ──────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// ── Error handler global ─────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Error no controlado:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// ── Arranque ─────────────────────────────────────────────────────────────
const start = async () => {
  try {
    await testConnection();
    await runMigrations();
    await verifyTransporter();

    app.listen(PORT, '0.0.0.0', () => {
      console.log('\n🏥 ════════════════════════════════════════');
      console.log(`   Portal Hospital API - Servidor iniciado`);
      console.log(`   🌐 http://localhost:${PORT}`);
      console.log(`   📋 Health: http://localhost:${PORT}/health`);
      console.log('   ════════════════════════════════════════\n');
    });
  } catch (err) {
    console.error('❌ Error al iniciar el servidor:', err.message);
    process.exit(1);
  }
};

start();