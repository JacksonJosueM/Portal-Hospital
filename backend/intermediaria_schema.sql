-- =================================================================================
-- ESTRUCTURA: BASE DE DATOS INTERMEDIARIA PARA EL PORTAL WEB DE PACIENTES
-- =================================================================================
-- Esta base de datos funciona como un "Espejo de Lectura". Será llenada periódicamente
-- (ej. cada hora) desde la base de datos oficial (Panacea), permitiendo que los pacientes 
-- consulten de forma segura sin tocar ni sobrecargar la base de datos transaccional 
-- del hospital. No guarda contraseñas y opera 100% password-less usando OTP y validación
-- por fecha de nacimiento.
-- =================================================================================

-- CREATE DATABASE PortalHospitalDb;
-- GO
-- USE PortalHospitalDb;
-- GO

-- --------------------------------------------------------------------------------
-- 1. TABLA DE PACIENTES
-- Aquí ya NO existe columna de contraseña. La validación se hace con documento 
-- y fecha de nacimiento.
-- --------------------------------------------------------------------------------
CREATE TABLE pacientes (
    id INT IDENTITY(1,1) PRIMARY KEY,
    tipo_documento VARCHAR(10) NOT NULL, -- Ej: 'CC', 'TI', 'CE'
    numero_documento VARCHAR(30) NOT NULL,
    fecha_nacimiento DATE NOT NULL,      -- CRÍTICO: Usado como mecanismo de validación principal
    nombre VARCHAR(150) NOT NULL,
    correo VARCHAR(150) NULL,            -- Email para envío de OTP y reportes
    telefono VARCHAR(20) NULL,           -- Para envío de WhatsApp/SMS
    id_panacea INT NULL,                 -- Id de cruce con la BD principal del hospital
    activo BIT DEFAULT 1,
    fecha_actualizacion DATETIME DEFAULT GETDATE(),

    -- Restricción para asegurar que no hay pacientes duplicados por tipo y número de doc
    CONSTRAINT UQ_Paciente_Documento UNIQUE (tipo_documento, numero_documento)
);
GO

-- --------------------------------------------------------------------------------
-- 2. TABLA DE HISTORIAS CLÍNICAS (Resumen / PDF)
-- Estas son copias extraídas de Panacea. Solo para lectura ("Read-Only").
-- --------------------------------------------------------------------------------
CREATE TABLE historias (
    id INT IDENTITY(1,1) PRIMARY KEY,
    paciente_id INT NOT NULL,
    id_panacea INT NULL,                 -- Id de la atención en la BD principal
    fecha_creacion DATETIME NOT NULL,
    motivo_consulta VARCHAR(500) NULL,
    enfermedad_actual TEXT NULL,
    antecedentes TEXT NULL,
    examen_fisico TEXT NULL,
    diagnostico TEXT NULL,
    plan_tratamiento TEXT NULL,
    medico_nombre VARCHAR(150),
    medico_especialidad VARCHAR(150),
    usuario_crea VARCHAR(100),           -- Médico o usuario digitador que la firmó originalmente
    fecha_sincronizacion DATETIME DEFAULT GETDATE(),

    CONSTRAINT FK_Historia_Paciente FOREIGN KEY (paciente_id) REFERENCES pacientes(id)
);
GO

-- --------------------------------------------------------------------------------
-- 3. TABLA DE LABORATORIOS (Resultados)
-- Copias extraídas de Panacea. 
-- --------------------------------------------------------------------------------
CREATE TABLE laboratorios (
    id INT IDENTITY(1,1) PRIMARY KEY,
    paciente_id INT NOT NULL,
    id_panacea INT NULL,
    fecha DATETIME NOT NULL,
    examen VARCHAR(200) NOT NULL,
    resultado TEXT NOT NULL,
    referencia VARCHAR(500) NULL,
    observacion TEXT NULL,
    medico_solicitante VARCHAR(150) NULL,
    medico_laboratorio VARCHAR(150) NULL,
    fecha_sincronizacion DATETIME DEFAULT GETDATE(),

    CONSTRAINT FK_Laboratorio_Paciente FOREIGN KEY (paciente_id) REFERENCES pacientes(id)
);
GO

-- --------------------------------------------------------------------------------
-- 4. TABLA DE SEGURIDAD (CÓDIGOS OTP)
-- Tabla operativa exclusiva de la plataforma web. NO se sincroniza con Panacea.
-- Usada para gestionar los códigos dinámicos del sistema passwordless.
-- --------------------------------------------------------------------------------
CREATE TABLE codigos_otp (
    id INT IDENTITY(1,1) PRIMARY KEY,
    paciente_id INT NOT NULL,
    codigo VARCHAR(10) NOT NULL,
    accion VARCHAR(50) NOT NULL,   -- 'servicio_acceso', 'descarga_pdf', etc.
    expiracion DATETIME NOT NULL,  -- (DATEADD(minute, 5, GETDATE()))
    usado BIT DEFAULT 0,
    creado_en DATETIME DEFAULT GETDATE(),

    CONSTRAINT FK_OTP_Paciente FOREIGN KEY (paciente_id) REFERENCES pacientes(id)
);
GO

-- =================================================================================
-- INDICES PARA ACELERAR LAS BÚSQUEDAS EN LA PLATAFORMA WEB
-- =================================================================================
CREATE NONCLUSTERED INDEX IX_Paciente_Documento ON pacientes(tipo_documento, numero_documento);
CREATE NONCLUSTERED INDEX IX_Historias_Paciente ON historias(paciente_id);
CREATE NONCLUSTERED INDEX IX_Laboratorios_Paciente ON laboratorios(paciente_id);
CREATE NONCLUSTERED INDEX IX_OTP_Validos ON codigos_otp(paciente_id, codigo, usado);
GO
