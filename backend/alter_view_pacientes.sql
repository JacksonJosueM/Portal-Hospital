-- =========================================================================
-- SCRIPT PARA ACTUALIZAR LA VISTA DE PACIENTES DE PANACEA (PORTAL WEB)
-- =========================================================================
-- Ejecuta esto en tu SQL Server Management Studio conectado a la base 
-- de datos del PortalPacientes.
-- 
-- IMPORTANTE: Donde veas "COLUMNA_XXX", debes reemplazarlo por el nombre
-- exacto de esa columna dentro de la tabla conectada de Panacea.
-- Usamos la palabra "AS" para traducirle los nombres a NodeJS automáticamente.
-- =========================================================================

ALTER VIEW [dbo].[vw_pacientes_portal] AS
SELECT 
    -- 1. IDENTIFICACIÓN ÚNICA DEL PACIENTE (Obligatorio para los códigos de seguridad)
    COLUMNA_DEL_ID_EN_PANACEA AS id,               -- Ejemplo: IdPaciente AS id
    
    -- 2. DATOS BÁSICOS
    COLUMNA_DEL_NOMBRE_COMPLETO AS nombre,         -- Ejemplo: NombreCompleto AS nombre
    
    -- 3. DOCUMENTOS
    tipo_documento,
    numero_documento,
    
    -- 4. VALIDACIÓN DE FECHA
    fecha_nacimiento,

    -- 5. INFORMACIÓN DE CONTACTO PARA ENVIAR OTP (WhatsApp y Correo)
    email AS correo,                                -- Cambiamos nombre "email" -> "correo" para NodeJS
    COLUMNA_DEL_CELULAR AS telefono,                -- Ejemplo: Celular AS telefono

    -- 6. ESTADO (Permitir acceso)
    1 AS activo                                     -- Forzamos a que siempre esté activo (1) en el portal
    
FROM 
    [SERVBD-PANACEA].[BaseDeDatosDePanacea].[dbo].[ElNombreDeLaTablaPacientes];
GO
