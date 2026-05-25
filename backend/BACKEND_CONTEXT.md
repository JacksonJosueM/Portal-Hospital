# Contexto del Backend

Este documento resume como esta organizado el backend de `Portal-Hospital`, como consume datos, como arma los documentos PDF y que archivos tocar cuando se trabaje sobre el flujo de envio de historias clinicas.

## Resumen rapido

El backend es una API minima en Node.js + Express que automatiza este flujo:

1. Recibe una solicitud de envio por HTTP, CLI o script `.bat`.
2. Busca el paciente en la base del portal.
3. Resuelve la atencion cerrada de Panacea.
4. Ejecuta stored procedures nativos de Panacea para reconstruir la historia clinica.
5. Renderiza el payload clinico a HTML.
6. Convierte el HTML a PDF con Puppeteer.
7. Cifra cada PDF con la cedula/documento del paciente.
8. Envia los PDFs por correo usando Nodemailer.
9. Registra auditoria del resultado en `envios_historia`.

La descripcion del paquete en `package.json` confirma el objetivo principal: `Panacea -> PDF -> mail`.

## Stack y dependencias

- Runtime: Node.js CommonJS.
- HTTP: `express`.
- Variables de entorno: `dotenv`.
- SQL Server: `mssql`.
- PDF HTML -> PDF: `puppeteer`.
- Control de concurrencia: `p-limit`.
- Cifrado de PDF: `muhammara`; fallback opcional con `node-qpdf2` si esta instalado.
- Correo: `nodemailer`.
- Desarrollo: `nodemon`.

Scripts npm:

- `npm start`: ejecuta `node index.js`.
- `npm run dev`: ejecuta `nodemon index.js`.

## Estructura del backend

```text
backend/
  index.js                         # Entrada HTTP Express
  package.json                     # Dependencias y scripts
  ecosystem.config.js              # Configuracion PM2
  .env.example                     # Variables esperadas
  config/
    db.js                          # Pools SQL Server: portal y Panacea
    mailer.js                      # Transporter Nodemailer
    migrations.js                  # Crea/verifica envios_historia
    seed.sql                       # Datos demo antiguos/locales
  routes/
    envio.routes.js                # POST /envio/single
  cli/
    enviar-historia.js             # CLI single/csv/programado
  bin/
    enviar-historia-single.bat     # GUI HTA o CLI single
    enviar-historia-bulk.bat       # Lote CSV
    enviar-historia-programado.bat # Task Scheduler
    envio-single-desde-red.bat     # Llama API HTTP con curl
    *.hta                          # Formularios Windows
  services/
    envio.historia.service.js      # Orquestador principal paciente -> PDF -> mail
    historia.print.service.js      # Orquestador de SPs Panacea para imprimir atencion
    plantilla.render.js            # Motor HTML estilo Panacea
    pdf.service.js                 # Puppeteer HTML -> PDF buffer
    pdf.encrypt.js                 # Cifrado de PDFs
    mail.service.js                # Envio de correos con adjuntos
    panacea/
      historiaSP.js                # Wrappers Historia.*
      dinamicoSP.js                # Wrappers Dinamico.*
      parametrizacionSP.js         # Wrappers Parametrizacion.*
      administracionSP.js          # Wrappers Administracion.*
      laboratorioSP.js             # Wrappers Laboratorio.*
      odontologiaSP.js             # Wrappers Odontologia.*
      auditContext.js              # Parametros transversales de auditoria SP
      normalizeColumns.js          # camelCase/PascalCase -> UPPER_SNAKE_CASE
```

## Entradas del sistema

### API HTTP

`index.js` levanta Express en `PORT` o `3001`, verifica conexiones SQL, ejecuta migraciones y verifica SMTP antes de escuchar.

Rutas disponibles:

- `GET /health`: healthcheck simple.
- `POST /envio/single`: envia la historia de un paciente.

Body de `POST /envio/single`:

```json
{
  "tipoDoc": "CC",
  "numDoc": "12345678"
}
```

La ruta normaliza `tipoDoc`, exige `numDoc` y llama:

```js
EnvioService.enviarHistoria({
  tipo_documento: tipo,
  numero_documento: doc,
  idAtencion: null,
  fuente: 'manual',
  forzar: true,
});
```

### CLI

`cli/enviar-historia.js` es la entrada para automatizacion local y scripts `.bat`.

Modos esperados:

- `single`: un paciente puntual.
- `csv`: lote desde CSV con `tipo_documento,numero_documento[,id_atencion]`.
- `programado`: barrido desde una fecha.

Ejemplos:

```powershell
node cli/enviar-historia.js --modo single --tipo CC --doc 12345678 --forzar
node cli/enviar-historia.js --modo single --tipo AUTO --doc 12345678 --atencion 359695
node cli/enviar-historia.js --modo csv --archivo envios\pacientes.csv
node cli/enviar-historia.js --modo programado --desde 2026-05-01 --max 200
```

El CLI crea logs diarios en `backend/logs/envios-YYYY-MM-DD.log` y cierra el browser de Puppeteer al final.

### Scripts Windows

- `bin/enviar-historia-single.bat`: si no recibe argumentos abre `enviar-historia-single.hta`; si recibe argumentos llama al CLI en modo single con `--forzar`.
- `bin/enviar-historia-bulk.bat`: procesa `envios\pacientes.csv` o una ruta CSV recibida como argumento.
- `bin/enviar-historia-programado.bat`: pensado para Task Scheduler; escribe en `logs\programado.log`.
- `bin/envio-single-desde-red.bat`: pide tipo/documento por consola y hace `curl` a `http://localhost:3001/envio/single`.

## Configuracion y variables

Las variables esperadas estan documentadas en `.env.example`.

Servidor:

- `PORT`
- `NODE_ENV`

Base del portal:

- `DB_SERVER`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`

Base Panacea:

- `PANACEA_DB_SERVER`
- `PANACEA_DB_PORT`
- `PANACEA_DB_NAME` no aparece en `.env.example`, pero `config/db.js` la soporta y usa `PRUEBAS` por defecto.
- `PANACEA_DB_USER`
- `PANACEA_DB_PASSWORD`
- `PANACEA_DB_USUARIO_AUDIT`
- `PANACEA_DB_IP_ORIGEN`
- `PANACEA_ID_IPS`

Correo:

- `EMAIL_HOST`
- `EMAIL_PORT`
- `EMAIL_USER`
- `EMAIL_PASS`
- `EMAIL_FROM`

Automatizacion de envios:

- `ENVIO_CONCURRENCIA`
- `ENVIO_FUENTE_DEFAULT`
- `ENVIO_MAX_PROGRAMADO`

Hay variables heredadas o no usadas directamente por este backend minimo, como `JWT_SECRET`, `FRONTEND_URL` y configuracion de WhatsApp. En el codigo actual no hay middleware JWT ni CORS configurado.

## Conexion a bases de datos

`config/db.js` crea dos pools SQL Server:

- `portalPool`: base propia del portal. Se usa para vistas del portal, auditoria de envios y compatibilidad con `poolPromise`.
- `panaceaPool`: base Panacea. Se usa para ejecutar SPs nativos de los esquemas `Historia`, `Dinamico`, `Parametrizacion`, `Administracion`, `Laboratorio` y `Odontologia`.

Ambos pools usan:

- `encrypt: true`
- `trustServerCertificate: true`
- `requestTimeout: 90000`
- `connectionTimeout: 45000`

El backend verifica ambos pools al iniciar con `testConnection()`.

## Consumo de datos

### Datos del portal

`services/envio.historia.service.js` consulta la base del portal para:

- Buscar pacientes en `vw_pacientes_portal`.
- Obtener `id_paciente`, `NOMBRE_COMPLETO`, `numero_documento` y `email`.
- Validar si una atencion ya fue enviada correctamente en `envios_historia`.
- Registrar auditoria del envio en `envios_historia`.

La busqueda de paciente soporta:

- `tipo_documento = AUTO`: busca solo por `numero_documento`.
- Tipos textuales como `CC`, `TI`, `CE`, `PT`, etc., convertidos a codigos numericos con `TIPO_DOC_CODIGO`.

La tabla `envios_historia` se crea/verifica en `config/migrations.js` con:

- Indice `idx_envios_atencion` sobre `(id_atencion, estado)`.
- Indice unico filtrado `UX_envios_atencion_ok` para evitar mas de un envio `OK` por atencion.

### Datos de Panacea

La historia clinica real no sale de tablas locales del portal. Se reconstruye ejecutando SPs Panacea.

`services/historia.print.service.js` es el orquestador de lectura. Su funcion principal es:

```js
HistoriaPrintService.imprimirAtencion(idAtencion, {
  registrarCopia: true,
  numeroCopias: 1,
});
```

Flujo interno:

1. Lee parametros de impresion e informacion principal de la atencion.
2. Resuelve IDs derivados: IPS, sede, paciente, prestador, especialidad, procedimiento, admision, plantilla, etc.
3. Opcionalmente registra copia impresa en Panacea.
4. Obtiene plantilla, modulos y datos basicos de la atencion.
5. Ejecuta `Historia.QRY_POBLAR_TOKEN_ATENCION`.
6. Lee catalogos clinicos, estructura de plantilla y valores dinamicos.
7. Obtiene metadata por cada dato dinamico con concurrencia limitada.
8. Indexa valores por `ID_ESTRUCTURA_PLANTILLA`.
9. Agrega riesgo, ordenes, notas, graficas, tratamientos odontologicos y formulacion medica.
10. Busca profesional y firma.
11. Retorna un `payload` consolidado para render.

Los wrappers de `services/panacea/*.js` encapsulan los SPs por esquema:

- `historiaSP.js`: `Historia.STP_PARAMETROS_IMPRESION`, `Historia.STM_ATENCIONES`, `Historia.STM_ATENCIONES_BASICO`, `Historia.QRY_POBLAR_TOKEN_ATENCION`, `Historia.STM_PACIENTE_ALERGIAS`, `Historia.STM_PACIENTE_ANTECEDENTES`, `Historia.STM_DATOS_*`, `Historia.QRY_ORDENES_IMPRESION`, `Historia.QRY_IMPRIME_FORMULACION_MEDICA`, entre otros.
- `dinamicoSP.js`: plantilla, estructura plana, datos, campos de tabla, imagenes, valores posibles y rangos de historia.
- `parametrizacionSP.js`: sede, IPS y logo.
- `administracionSP.js`: usuario/profesional, firma e imagenes.
- `laboratorioSP.js`: datos de texto de laboratorio.
- `odontologiaSP.js`: tratamientos odontologicos.

### Auditoria en SPs Panacea

`services/panacea/auditContext.js` inyecta parametros transversales en los SPs que siguen el contrato Panacea:

- `@Usuario`
- `@IP_Origen`
- `@Timestamp`
- `@Operacion`

Estos valores salen de:

- `PANACEA_DB_USUARIO_AUDIT`
- `PANACEA_DB_IP_ORIGEN`
- `PANACEA_ID_IPS`

Cuando se agregue un wrapper nuevo para Panacea, revisar si el SP requiere `applyAudit(request, operacion)`.

### Normalizacion de columnas

`services/panacea/normalizeColumns.js` transforma columnas devueltas por SPs, por ejemplo:

- `IdEstructuraPlantilla` -> `ID_ESTRUCTURA_PLANTILLA`
- `ValorTexto` -> `VALOR_TEXTO`
- `CodigoCie` -> `CODIGO_CIE`

El render y el orquestador esperan `UPPER_SNAKE_CASE`. Si se consume un SP nuevo, normalizar sus `recordset`/`recordsets` antes de retornar.

## Flujo principal de envio

El flujo completo vive en `services/envio.historia.service.js`.

`enviarHistoria()` hace:

1. `buscarPaciente(tipo_documento, numero_documento)`.
2. Si no recibe `idAtencion`, usa `obtenerUltimaAtencion(idPaciente)`, que busca en `Historia.TM_ATENCIONES` atenciones con `ID_ESTADO = 2`.
3. Si `forzar` es false, consulta `yaEnviada(idAtencion)` en `envios_historia`.
4. Llama `HistoriaPrintService.imprimirAtencion(idAtencion)`.
5. Renderiza historia principal con `renderHtml(payload)`.
6. Genera PDF con `PdfService.generarPdfBuffer({ html, parametros })`.
7. Cifra PDF con `PdfEncrypt.cifrarPdf(pdfBuffer, paciente.numero_documento)`.
8. Clasifica ordenes y genera PDFs adicionales si hay datos.
9. Envia todos los adjuntos con `MailService.enviarConMultiplesAdjuntos()`.
10. Inserta auditoria `OK` o `ERROR`.

Adjuntos posibles:

- `Historia_Clinica_<PACIENTE>.pdf`
- `Orden_Laboratorio_<PACIENTE>.pdf`
- `Orden_Imagenologia_<PACIENTE>.pdf`
- `Orden_Medica_<PACIENTE>.pdf`
- `Orden_Incapacidad_<PACIENTE>.pdf`
- `Formula_Medica_<PACIENTE>.pdf`

La contrasena de cada PDF es el `numero_documento` del paciente, sanitizado a solo letras y numeros.

## Generacion de HTML

`services/plantilla.render.js` recibe el payload de impresion y produce HTML listo para Puppeteer.

Funciones exportadas:

- `renderHtml(payload)`: historia clinica completa.
- `clasificarTodasLasOrdenes(ordenesRS, formulacionRS)`: separa laboratorio, imagenologia, medicamentos, incapacidades y otras ordenes.
- `renderHtmlOrdenPorTipo(payload, tituloDoc, tituloTabla, recordsets)`: ordenes medicas por tipo.
- `renderHtmlFormula(payload, recordsets)`: formula medica.
- `renderHtmlIncapacidades(payload, recordsets)`: incapacidades en formato texto estilo Panacea.

Puntos importantes del render:

- Reconstruye el arbol de la plantilla desde `QRY_ESTRUCTURA_PLANA_PLANTILLA`.
- Usa `ID_ESTRUCTURA_PLANTILLA` como llave para buscar valores.
- Resuelve tokens `{{TOKEN}}` desde `QRY_POBLAR_TOKEN_ATENCION`.
- Escapa HTML para evitar romper el documento.
- Inserta logos, firmas e imagenes como `data:` URLs cuando vienen como bytes.
- Omite algunas secciones/rubricas duplicadas o tecnicas.
- Tiene reglas de formato para fechas, decimales, tablas dinamicas, datos gineco-obstetricos y bloques del profesional.

## Generacion de PDF

`services/pdf.service.js` convierte HTML a PDF con Puppeteer.

Detalles relevantes:

- Mantiene un browser singleton para no abrir Chromium en cada solicitud.
- Usa `p-limit` para limitar generaciones simultaneas.
- Lanza Puppeteer con:
  - `headless: 'new'`
  - `--no-sandbox`
  - `--disable-setuid-sandbox`
  - `--disable-dev-shm-usage`
  - `--disable-gpu`
  - `--disable-extensions`
  - `--no-first-run`
- Usa viewport ancho (`1200`) para que el HTML fluya bien antes de PDF.
- Bloquea recursos de red de tipos `font`, `script`, `media`, `websocket` y `other`.
- Usa `page.setContent(html, waitUntil: ['domcontentloaded', 'networkidle0'])`.
- Emula media `print`.
- Exporta con `page.pdf()` y margenes/formato derivados de parametros Panacea.

Formatos de papel:

- `PAPEL_HISTORIA = 2` -> `Legal`.
- `PAPEL_HISTORIA = 3` -> `A4`.
- Cualquier otro valor -> `Letter`.

Margenes:

- `MARGEN_SUPERIOR`
- `MARGEN_INFERIOR`
- `MARGEN_IZQUIERDO`
- `MARGEN_DERECHO`

Funciones exportadas:

- `generarPdfBuffer({ html, parametros })`
- `generarPdfDesdeHtml({ html, parametros, nombreArchivo, res })`
- `cerrarBrowser()`

Nota: el comentario del archivo dice "maximo 5 paginas", pero el valor actual en codigo es `pLimit(21)`.

## Cifrado de PDF

`services/pdf.encrypt.js` cifra cada PDF antes de enviarlo.

Flujo:

1. Valida que el buffer no este vacio.
2. Sanitiza la contrasena con `String(raw).replace(/[^A-Za-z0-9]/g, '')`.
3. Intenta cifrar con `muhammara`.
4. Si falla y `node-qpdf2` esta disponible, intenta con qpdf.
5. Si no puede cifrar, lanza error y no se envia el PDF sin cifrar.

Restricciones buscadas:

- Lectura permitida.
- Impresion permitida.
- Copiar/pegar bloqueado.
- Edicion bloqueada.
- Anotaciones bloqueadas.

Los archivos temporales de entrada/salida se escriben en `os.tmpdir()` y se eliminan en `finally`.

## Envio de correo

`config/mailer.js` crea el transporter Nodemailer con:

- `EMAIL_HOST`
- `EMAIL_PORT`
- `EMAIL_USER`
- `EMAIL_PASS`
- `tls.rejectUnauthorized = false`

`services/mail.service.js` exporta:

- `enviarConAdjunto()`
- `enviarConMultiplesAdjuntos()`

El flujo principal usa `enviarConMultiplesAdjuntos()` y manda texto plano indicando que los archivos estan protegidos con el numero de documento del paciente.

## Migraciones y persistencia propia

`config/migrations.js` solo crea/verifica la tabla `dbo.envios_historia`.

No crea las tablas o vistas antiguas del portal. El comentario indica que deben existir:

- `vw_pacientes_portal`
- `vw_atenciones_portal`
- `tipos_documento`

`config/seed.sql` contiene datos demo para tablas como `pacientes`, `historias_clinicas` y `resultados_laboratorio`. Ese archivo parece corresponder a una etapa anterior/local y no al flujo actual Panacea -> PDF -> mail.

## Despliegue

`ecosystem.config.js` define una app PM2:

- Nombre: `envio-historia-clinica`
- Script: `./index.js`
- Instancias: `1`
- Modo: `fork`
- `autorestart: true`
- `max_memory_restart: '2G'`
- `NODE_ENV=production`

## Observaciones importantes para futuros cambios

- El backend actual no tiene autenticacion en las rutas HTTP. Aunque `.env.example` incluye `JWT_SECRET`, no hay middleware JWT configurado en `index.js` ni `routes/envio.routes.js`.
- El backend actual no configura CORS, aunque `.env.example` incluye `FRONTEND_URL`.
- `cli/enviar-historia.js` modo `programado` llama `EnvioService.listarPendientes({ desde, max })`, pero `services/envio.historia.service.js` solo exporta `{ enviarHistoria }`. Si se va a usar el modo programado, hay que implementar/exportar `listarPendientes`.
- `bin/enviar-historia-programado.bat` comenta que detecta `id_estado IN (2,3)`, pero `obtenerUltimaAtencion()` usa `ID_ESTADO = 2`. Revisar la regla de negocio antes de cambiarlo.
- `pdf.service.js` tiene un comentario de concurrencia desactualizado: habla de 5 PDFs en paralelo, pero el codigo usa `pLimit(21)`.
- `test_envio_381138.js` es un script temporal de prueba y su propio encabezado indica que no es parte del sistema. No usarlo como entrada productiva.
- No devolver nunca PDFs sin cifrar si falla `PdfEncrypt`; el codigo actual cumple esa regla lanzando error.

## Guia para agentes de Cursor

Cuando se necesite cambiar el backend:

- Para rutas HTTP, empezar por `index.js` y `routes/envio.routes.js`.
- Para flujo de negocio del envio, revisar `services/envio.historia.service.js`.
- Para consumo de Panacea, revisar `services/historia.print.service.js` y luego el wrapper especifico en `services/panacea/`.
- Para cambios en HTML/maquetacion de documentos, revisar `services/plantilla.render.js`.
- Para problemas de PDF, revisar primero `services/pdf.service.js`; para contrasena o restricciones, revisar `services/pdf.encrypt.js`.
- Para correo, revisar `config/mailer.js` y `services/mail.service.js`.
- Para auditoria/idempotencia, revisar `config/migrations.js` y las funciones `registrarEnvio()` / `yaEnviada()`.
- Si un SP nuevo devuelve columnas en camelCase/PascalCase, normalizar con `normalizeRecordset`, `normalizeRecordsets` o `normalizeFirst`.
- Si se agrega un SP Panacea con parametros transversales, usar `applyAudit()` y confirmar el valor correcto de `Operacion`.
- Si se agregan adjuntos nuevos, seguir el patron: render HTML -> `PdfService.generarPdfBuffer()` -> `PdfEncrypt.cifrarPdf()` -> agregar a `adjuntos`.

