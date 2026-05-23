const { poolPromise } = require('./db');

/**
 * Migraciones mínimas para el flujo de envío de historias (CLI, .bat, POST /envio).
 *
 * No crea tablas del portal web antiguo (pacientes locales, OTP, etc.).
 * Deben existir en la misma BD: vw_pacientes_portal, vw_atenciones_portal,
 * tipos_documento (usados por envío y modo programado).
 */
const runMigrations = async () => {
  try {
    const pool = await poolPromise;

    await pool.query(`
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[envios_historia]') AND type in (N'U'))
      BEGIN
        CREATE TABLE [dbo].[envios_historia] (
          id INT IDENTITY(1,1) PRIMARY KEY,
          id_atencion BIGINT NOT NULL,
          tipo_documento VARCHAR(10) NOT NULL,
          numero_documento VARCHAR(30) NOT NULL,
          destino VARCHAR(200) NOT NULL,
          estado VARCHAR(20) NOT NULL,
          error_mensaje NVARCHAR(MAX) NULL,
          fecha_envio DATETIME DEFAULT GETDATE(),
          fuente VARCHAR(20) NOT NULL
        )
      END
    `);

    await pool.query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_envios_atencion' AND object_id = OBJECT_ID('dbo.envios_historia'))
      BEGIN
        CREATE INDEX idx_envios_atencion ON dbo.envios_historia (id_atencion, estado);
      END
    `);

    await pool.query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'UX_envios_atencion_ok' AND object_id = OBJECT_ID('dbo.envios_historia'))
      BEGIN
        CREATE UNIQUE INDEX UX_envios_atencion_ok
          ON dbo.envios_historia (id_atencion)
          WHERE estado = 'OK';
      END
    `);

    console.log('✅ Migraciones de envío (envios_historia) verificadas');
  } catch (err) {
    console.error('❌ Error en migraciones MSSQL:', err.message);
    throw err;
  }
};

module.exports = { runMigrations };
