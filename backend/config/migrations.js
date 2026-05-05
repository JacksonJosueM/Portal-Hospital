const { poolPromise, sql } = require('../config/db');

/**
 * Ejecuta las migraciones para crear todas las tablas en SQL Server Local
 */
const runMigrations = async () => {
  try {
    const pool = await poolPromise;

    // Tabla de pacientes
    await pool.query(`
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[pacientes]') AND type in (N'U'))
      BEGIN
        CREATE TABLE [dbo].[pacientes] (
          id INT IDENTITY(1,1) PRIMARY KEY,
          tipo_documento VARCHAR(10) NOT NULL,
          numero_documento VARCHAR(30) NOT NULL,
          nombre VARCHAR(200) NOT NULL,
          correo VARCHAR(150),
          telefono VARCHAR(20),
          contrasena VARCHAR(500) NOT NULL,
          activo BIT DEFAULT 1,
          fecha_registro DATETIME DEFAULT GETDATE(),
          fecha_actualizacion DATETIME DEFAULT GETDATE(),
          CONSTRAINT UQ_pacientes_doc UNIQUE (tipo_documento, numero_documento)
        )
      END
    `);

    // Tabla codigos_otp
    await pool.query(`
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[codigos_otp]') AND type in (N'U'))
      BEGIN
        CREATE TABLE [dbo].[codigos_otp] (
          id INT IDENTITY(1,1) PRIMARY KEY,
          paciente_id INT NOT NULL,
          codigo VARCHAR(6) NOT NULL,
          accion VARCHAR(50) DEFAULT 'historia_pdf',
          usado BIT DEFAULT 0,
          expiracion DATETIME NOT NULL,
          created_at DATETIME DEFAULT GETDATE(),
          FOREIGN KEY (paciente_id) REFERENCES pacientes(id)
        )
      END
    `);
    // Tabla de historias clínicas
    await pool.query(`
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[historias_clinicas]') AND type in (N'U'))
      BEGIN
        CREATE TABLE [dbo].[historias_clinicas] (
          id INT IDENTITY(1,1) PRIMARY KEY,
          tipo_documento VARCHAR(10) NOT NULL,
          numero_documento VARCHAR(30) NOT NULL,
          fecha DATE NOT NULL,
          especialidad VARCHAR(100) NOT NULL,
          medico VARCHAR(200) NOT NULL,
          diagnostico NVARCHAR(MAX) NOT NULL,
          observaciones NVARCHAR(MAX),
          created_at DATETIME DEFAULT GETDATE()
        )
      END
    `);

    // Índice para historias
    await pool.query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_historias_documento' AND object_id = OBJECT_ID('dbo.historias_clinicas'))
      BEGIN
        CREATE INDEX idx_historias_documento ON dbo.historias_clinicas (tipo_documento, numero_documento, fecha DESC);
      END
    `);

    // Tabla de resultados de laboratorio
    await pool.query(`
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[resultados_laboratorio]') AND type in (N'U'))
      BEGIN
        CREATE TABLE [dbo].[resultados_laboratorio] (
          id INT IDENTITY(1,1) PRIMARY KEY,
          tipo_documento VARCHAR(10) NOT NULL,
          numero_documento VARCHAR(30) NOT NULL,
          fecha DATE NOT NULL,
          tipo_examen VARCHAR(150) NOT NULL,
          resultado NVARCHAR(MAX) NOT NULL,
          archivo_pdf VARCHAR(500),
          observaciones NVARCHAR(MAX),
          created_at DATETIME DEFAULT GETDATE()
        )
      END
    `);

    // Índice para laboratorios
    await pool.query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_laboratorios_documento' AND object_id = OBJECT_ID('dbo.resultados_laboratorio'))
      BEGIN
        CREATE INDEX idx_laboratorios_documento ON dbo.resultados_laboratorio (tipo_documento, numero_documento, fecha DESC);
      END
    `);

    // ══════════════════════════════════════════════════════════════
    // VISTAS DE PANACEA (lectura en tiempo real via linked server)
    // Estas vistas viven en PortalPacientes, NO modifican Panacea.
    // ══════════════════════════════════════════════════════════════

    // Vista de ATENCIONES (lista de historias clínicas del paciente)
    await pool.query(`
      IF NOT EXISTS (SELECT * FROM sys.views WHERE name = 'vw_atenciones_portal')
      BEGIN
        EXEC('
          CREATE VIEW [dbo].[vw_atenciones_portal] AS
          SELECT
            a.ID                        AS id_atencion,
            a.FECHA_ATENCION            AS fecha_atencion,
            a.ID_PACIENTE               AS id_paciente,
            a.ID_ESTADO                 AS id_estado,
            a.ID_PLANTILLA              AS id_plantilla,
            pac.NUMERO_IDENTIFICACION   AS numero_documento,
            pac.ID_TIPO_IDENTIFICACION  AS tipo_documento,
            pac.NOMBRE_COMPLETO         AS nombre_paciente,
            t.NOMBRE_COMPLETO           AS nombre_medico,
            pr.REGISTRO_MEDICO          AS registro_medico,
            e.NOMBRE                    AS especialidad,
            e.ID                        AS id_especialidad
          FROM PANACEA.Historia.TM_ATENCIONES a
          INNER JOIN PANACEA.Parametrizacion.TP_PACIENTES pac ON a.ID_PACIENTE = pac.ID
          LEFT JOIN PANACEA.Parametrizacion.TP_PRESTADORES pr ON a.ID_PRESTADOR = pr.ID_TERCERO
          LEFT JOIN PANACEA.Parametrizacion.TP_TERCEROS t ON pr.ID_TERCERO = t.ID
          LEFT JOIN PANACEA.Parametrizacion.TP_ESPECIALIDADES e ON a.ID_ESPECIALIDAD = e.ID
          WHERE a.ID_ESTADO IN (2, 3)
        ')
      END
    `);

    // ══════════════════════════════════════════════════════════════
    // TABLA DE AUDITORÍA DE ENVÍOS AUTOMATIZADOS POR CORREO
    // Usada por el CLI `cli/enviar-historia.js` y los .bat asociados.
    // ══════════════════════════════════════════════════════════════
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

    // Índice de consulta general (idempotencia y reporting)
    await pool.query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_envios_atencion' AND object_id = OBJECT_ID('dbo.envios_historia'))
      BEGIN
        CREATE INDEX idx_envios_atencion ON dbo.envios_historia (id_atencion, estado);
      END
    `);

    // Índice único parcial: una atención solo puede tener UN envío exitoso.
    // Si se relanza el .bat, los reenvíos se rechazan en BD por este índice.
    await pool.query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'UX_envios_atencion_ok' AND object_id = OBJECT_ID('dbo.envios_historia'))
      BEGIN
        CREATE UNIQUE INDEX UX_envios_atencion_ok
          ON dbo.envios_historia (id_atencion)
          WHERE estado = 'OK';
      END
    `);

    // Vista de DATOS CLÍNICOS (campos dinámicos de cada atención)
    await pool.query(`
      IF NOT EXISTS (SELECT * FROM sys.views WHERE name = 'vw_datos_clinicos_portal')
      BEGIN
        EXEC('
          CREATE VIEW [dbo].[vw_datos_clinicos_portal] AS
          SELECT
            dt.ID_ATENCION              AS id_atencion,
            d.ID                        AS id_campo,
            d.NOMBRE                    AS nombre_campo,
            CAST(dt.VALOR AS VARCHAR(MAX)) AS valor
          FROM PANACEA.Historia.TM_DATOS_TEXTO dt
          INNER JOIN PANACEA.Dinamico.TP_ESTRUCTURAS_PLANTILLAS ep
            ON dt.ID_ESTRUCTURA_PLANTILLA = ep.ID
          INNER JOIN PANACEA.Dinamico.TP_DATOS d
            ON ep.ID_ESTRUCTURA = d.ID
        ')
      END
    `);

    console.log('✅ Migraciones y vistas ejecutadas correctamente');
  } catch (err) {
    console.error('❌ Error en migraciones MSSQL:', err.message);
    throw err;
  }
};

module.exports = { runMigrations };
