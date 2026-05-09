@echo off
REM ============================================================================
REM  ENVIAR HISTORIA CLINICA - MODO PROGRAMADO (Task Scheduler)
REM  ----------------------------------------------------------------------------
REM  Detecta atenciones cerradas en Panacea (id_estado IN (2,3)) cuyo correo
REM  aun no se ha enviado y las procesa hasta el limite ENVIO_MAX_PROGRAMADO.
REM
REM  Por defecto busca atenciones desde el inicio del DIA ACTUAL.
REM  Para cambiar la ventana, edite la variable DESDE mas abajo.
REM
REM  Registro en Windows Task Scheduler (ejemplo):
REM      schtasks /Create /TN "Portal\EnviarHistoriasProgramado" ^
REM        /TR "C:\Portal-Hospital\backend\bin\enviar-historia-programado.bat" ^
REM        /SC HOURLY /MO 1 /RU SYSTEM
REM
REM  Codigos de salida:
REM      0  = todo OK (o nada que enviar)
REM      1  = argumentos invalidos
REM      2  = error fatal de conexion
REM      3  = errores parciales (algunos enviados, otros no)
REM ============================================================================
setlocal

cd /d "%~dp0\.."

REM Carpeta de logs
if not exist "logs" mkdir logs

REM Construir fecha YYYY-MM-DD del dia actual a partir de %date% en formato es-CO (DD/MM/YYYY)
REM Si su servidor usa otro locale, ajuste estos indices.
set "DD=%date:~0,2%"
set "MM=%date:~3,2%"
set "YYYY=%date:~6,4%"
set "DESDE=%YYYY%-%MM%-%DD%T00:00:00"

echo.
echo [%date% %time%] Iniciando barrido de envios programados desde %DESDE%
echo.

node cli\enviar-historia.js --modo programado --desde "%DESDE%" >> "logs\programado.log" 2>&1

set "RC=%ERRORLEVEL%"
echo [%date% %time%] Finalizado con codigo de salida: %RC% >> "logs\programado.log"
endlocal & exit /b %RC%
