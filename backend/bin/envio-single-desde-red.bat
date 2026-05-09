@echo off
setlocal EnableExtensions
chcp 65001 >nul

set "API=http://localhost:3001/envio/single"

echo.
echo  Envío de historia clínica (un paciente^)
echo  Servidor: %API%
echo.

set "TIPO="
set /p "TIPO=Tipo de documento (ej. CC, TI, CE): "
if not defined TIPO goto :fin

set "DOC="
set /p "DOC=Número de documento: "
if not defined DOC goto :fin

set "TIPO=%TIPO: =%"
set "DOC=%DOC: =%"

echo.
echo Enviando solicitud...
curl.exe -sS -X POST "%API%" ^
  -H "Content-Type: application/json; charset=utf-8" ^
  -d "{\"tipoDoc\":\"%TIPO%\",\"numDoc\":\"%DOC%\"}"

echo.
echo.

:fin
endlocal
pause
