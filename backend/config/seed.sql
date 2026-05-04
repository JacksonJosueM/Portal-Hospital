-- ============================================================
-- SCRIPT DE DATOS DE PRUEBA / DEMO PARA SQL SERVER
-- Portal del Paciente - Hospital
-- ============================================================

-- Pacientes de prueba
-- Contraseña encriptada para demo: "admin123" usando bcrypt ($2a$10$wT0qF6j4rWk18M7k3zT94OOtLwK2qL2gE0eR4HjZ/Uqy/U1M2gE)
-- Contraseña en texto plano permitida de forma temporal para pruebas locales: "admin123"

IF NOT EXISTS (SELECT 1 FROM dbo.pacientes WHERE tipo_documento = 'CC' AND numero_documento = '1234567890')
INSERT INTO dbo.pacientes (tipo_documento, numero_documento, nombre, correo, telefono, contrasena)
VALUES ('CC', '1234567890', 'Juan Carlos Pérez García', 'juan.perez@ejemplo.com', '3001234567', 'admin123');

IF NOT EXISTS (SELECT 1 FROM dbo.pacientes WHERE tipo_documento = 'CC' AND numero_documento = '9876543210')
INSERT INTO dbo.pacientes (tipo_documento, numero_documento, nombre, correo, telefono, contrasena)
VALUES ('CC', '9876543210', 'María Elena Rodríguez López', 'maria.rodriguez@ejemplo.com', '3109876543', 'admin123');

-- Historias clínicas de prueba
INSERT INTO dbo.historias_clinicas (tipo_documento, numero_documento, fecha, especialidad, medico, diagnostico, observaciones)
SELECT 'CC', '1234567890', '2025-03-15', 'Medicina General', 'Roberto Sanchez Morales', 'Faringitis aguda viral.', 'Se recomienda reposo.'
WHERE NOT EXISTS (SELECT 1 FROM dbo.historias_clinicas WHERE numero_documento = '1234567890' AND fecha = '2025-03-15');

INSERT INTO dbo.historias_clinicas (tipo_documento, numero_documento, fecha, especialidad, medico, diagnostico, observaciones)
SELECT 'CC', '1234567890', '2025-01-20', 'Cardiología', 'María Fernández Castro', 'Hipertensión arterial estadio 1.', 'Iniciar cambios en estilo de vida.'
WHERE NOT EXISTS (SELECT 1 FROM dbo.historias_clinicas WHERE numero_documento = '1234567890' AND fecha = '2025-01-20');

-- Resultados de laboratorio de prueba
INSERT INTO dbo.resultados_laboratorio (tipo_documento, numero_documento, fecha, tipo_examen, resultado, observaciones)
SELECT 'CC', '1234567890', '2025-03-16', 'Hemograma completo', 'Hemoglobina: 14.2 g/dL', 'Hemograma dentro de parámetros normales.'
WHERE NOT EXISTS (SELECT 1 FROM dbo.resultados_laboratorio WHERE numero_documento = '1234567890' AND fecha = '2025-03-16');

-- Verificar datos insertados
SELECT 'dbo.pacientes' as tabla, COUNT(*) as registros FROM dbo.pacientes
UNION ALL
SELECT 'dbo.historias_clinicas', COUNT(*) FROM dbo.historias_clinicas
UNION ALL
SELECT 'dbo.resultados_laboratorio', COUNT(*) FROM dbo.resultados_laboratorio;
