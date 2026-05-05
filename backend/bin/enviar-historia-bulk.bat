@echo off
REM ============================================================================
REM  ENVIAR HISTORIA CLINICA - MODO BULK (lote desde CSV)
REM  ----------------------------------------------------------------------------
REM  Uso:
REM      enviar-historia-bulk.bat                        (usa envios\pacientes.csv)
REM      enviar-historia-bulk.bat C:\ruta\pacientes.csv  (CSV personalizado)
REM
REM  Formato del CSV (UTF-8, sin BOM o con BOM, separador "," ";" o tab):
REM      tipo_documento,numero_documento,id_atencion
REM      CC,12345678,359695
REM      CC,87654321,
REM      TI,1234567890,360001
REM
REM  La cabecera es opcional (se detecta automaticamente).
REM  La columna id_atencion es opcional; si se omite, se envia la ultima
REM  atencion cerrada del paciente.
REM
REM  Para reenviar atenciones que ya tienen un envio OK, agregar --forzar al
REM  final del comando node.
REM ============================================================================
setlocal

cd /d "%~dp0\.."

set "CSV=%~1"
if "%CSV%"=="" set "CSV=envios\pacientes.csv"

if not exist "%CSV%" (
  echo [ERROR] No se encuentra el archivo CSV: %CSV%
  echo.
  echo Sugerencia: cree la carpeta backend\envios\ y coloque el archivo
  echo "pacientes.csv" alli, o pase la ruta completa como argumento.
  exit /b 1
)

echo.
echo Procesando envios en lote desde: %CSV%
echo.
node cli\enviar-historia.js --modo csv --archivo "%CSV%"

set "RC=%ERRORLEVEL%"
echo.
echo Proceso finalizado con codigo de salida: %RC%
endlocal & exit /b %RC%
