@echo off
REM ============================================================================
REM  ENVIAR HISTORIA CLINICA - MODO SINGLE (un paciente)
REM  ----------------------------------------------------------------------------
REM  Uso interactivo (abre formulario HTML estilizado):
REM      enviar-historia-single.bat
REM
REM  Uso con argumentos (modo CLI directo, sin GUI):
REM      enviar-historia-single.bat CC 12345678
REM      enviar-historia-single.bat CC 12345678 359695
REM
REM  Argumentos:
REM      %1  Tipo documento (CC, TI, CE, PT, PA, OTRO)
REM      %2  Numero documento
REM      %3  ID atencion (opcional - si se omite envia la ultima cerrada)
REM ============================================================================
setlocal ENABLEDELAYEDEXPANSION

REM Posicionarse en backend/ (un nivel arriba de bin/)
cd /d "%~dp0\.."

set "TIPO=%~1"
set "DOC=%~2"
set "ATENCION=%~3"

REM Si NO hay argumentos, abrir el formulario HTML (HTA) y salir
if "!TIPO!"=="" if "!DOC!"=="" (
  if exist "%~dp0enviar-historia-single.hta" (
    start "" "mshta.exe" "%~dp0enviar-historia-single.hta"
    endlocal & exit /b 0
  ) else (
    echo [ERROR] No se encuentra el formulario:
    echo         %~dp0enviar-historia-single.hta
    echo.
    pause
    endlocal & exit /b 1
  )
)

REM Validacion en modo CLI (cuando se invoca con argumentos)
if "!TIPO!"=="" (
  echo [ERROR] Tipo de documento es obligatorio.
  pause
  endlocal & exit /b 1
)
if "!DOC!"=="" (
  echo [ERROR] Numero de documento es obligatorio.
  pause
  endlocal & exit /b 1
)

if "!ATENCION!"=="" (
  echo.
  echo Enviando historia clinica del paciente !TIPO!-!DOC! ^(ultima atencion cerrada^)...
  node cli\enviar-historia.js --modo single --tipo !TIPO! --doc !DOC! --forzar
) else (
  echo.
  echo Enviando historia clinica del paciente !TIPO!-!DOC! atencion=!ATENCION!...
  node cli\enviar-historia.js --modo single --tipo !TIPO! --doc !DOC! --atencion !ATENCION! --forzar
)

set "RC=%ERRORLEVEL%"
echo.
echo Proceso finalizado con codigo de salida: !RC!
echo.
pause
endlocal & exit /b %RC%
