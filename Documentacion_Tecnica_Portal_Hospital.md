# Documentación Técnica - Portal del Paciente (E.S.E Hospital San Juan de Dios)

Este documento detalla la arquitectura, el flujo de datos, el marco de seguridad y los principales procesos técnicos detrás del Portal del Paciente. Está orientado a proveer a Ingeniería y TI de una visión completa sobre el funcionamiento interno de la plataforma.

---

## 1. Arquitectura General y Flujo de la Aplicación (El "Flow")

La plataforma utiliza una arquitectura Cliente-Servidor tradicional, dividida en un Frontend (aplicación en el navegador de los usuarios) y un Backend (servidor de lógica y base de datos) bajo la pila MERN/SQL:

*   **Frontend (Cliente):** 
    *   Desarrollado en **React 19** y **Vite**, usando **TailwindCSS** para el diseño interactivo y responsivo. 
    *   Es una Single Page Application (SPA). Todo el renderizado de la interfaz gráfica ocurre aquí mediante JavaScript.
*   **Backend (Servidor/API):**
    *   Desarrollado en **Node.js** con el framework **Express.js**.
    *   Actúa como la API o "puente" de comunicación. Se encarga de procesar la lógica de negocio, reglas de autenticación, límite de peticiones (Rate Limit) y generación de archivos antes de interactuar con la Base de Datos.
*   **Base de Datos (DB):**
    *   El backend mantiene **dos pools de conexión a SQL Server** separados:
        *   `portalPool` → BD `PortalPacientes` con vistas planas (`vw_pacientes_portal`, `vw_atenciones_portal`) y la tabla `codigos_otp`. Se usa para login, listado de historias y OTP.
        *   `panaceaPool` → BD `PANACEA` con los esquemas nativos (`Historia.*`, `Dinamico.*`, `Parametrizacion.*`, `Administracion.*`, `Laboratorio.*`, `Odontologia.*`). Se usa al imprimir una historia: el portal ejecuta **exactamente la misma secuencia de stored procedures** que la aplicación Silverlight de Panacea, garantizando contenido idéntico y dejando la misma huella en SQL Profiler con un usuario auditable (`Portal_Pacientes`).
    *   Toda interacción ocurre por la librería `mssql` con consultas pre-compiladas y conexión cifrada.

### El Flujo de Autenticación (Login)
1. El paciente digita su **tipo de documento**, **número** y **fecha de nacimiento**.
2. El Frontend envía esto a la ruta de inicio en Express (`/servicios/autenticar`).
3. El Backend consulta la vista local en SQL Server de manera protegida (evitando cualquier alteración) para comprobar su existencia.
4. Si los datos hacen "match" perfecto, el sistema desencadena en milisegundos un **Código OTP (Clave dinámica)** enviándolo a WhatsApp y Correo.
5. El servidor devuelve al frontend un **Token Temporal (JWT)** que dura 10 minutos para indicar: "Sé quién eres, pero estoy esperando el código OTP".
6. El usuario digita el OTP de 6 dígitos. Si es correcto, el servidor valida el Token temporal, lo descarta, y devuelve un **Token de Acceso Principal (JWT)** válido por 30 minutos, con el que el usuario ya puede descargar su historia.

---

## 2. Puntos Críticos de Seguridad Implementados

Para asegurar la integridad de la información médica sensible (Historias Clínicas), el Portal implementa la siguiente coraza de ciberseguridad:

*   **Seguridad de Cabeceras HTTP (`Helmet`):** Se utiliza el middleware Helmet para bloquear ataques Cross-Site Scripting (XSS), sniffings de MIME type y enmascarar los metadatos del servidor en internet (nadie sabrá que se usa Express.js directamente).
*   **Prevención de Inyección SQL (SQLi):** Todas las consultas SQL generadas en el backend se procesan pre-compiladas (Parameterized queries). En ningún momento el texto que el usuario envía viaja como string crudo a la base de datos; esto anula cualquier tipo de inyección.
*   **Denegación de Servicio (DDoS) / Fuerza Bruta:** 
    *   La protección `express-rate-limit` frena peticiones masivas.
    *   **Límites estrictos de Inicio de Sesión:** Sólo se permiten 10 intentos por IP cada 15 minutos.
    *   **Límites OTP:** El servidor rastrea intentos fallidos por cada código generado y solo permite **5 intentos cada 5 minutos**.
*   **Autenticación sin Contraseñas Estáticas (Passwordless):** Dado que evitar que el usuario asocie la clínica con contraseñas que olvide, utilice en otras webs o se le filtren, elegimos **Tokens Dinámicos**.
*   **Tokens Firmados (JSON Web Tokens - JWT):** Todo el progreso por el portal está encriptado en Tokens JWT firmados por el servidor mediante una *Clave Secreta Oculta en Entorno (`.env`)*; es imposible falsificar dichos tokens desde el navegador.

---

## 3. Claves Dinámicas y Códigos OTP: ¿Cómo se Generan?

El mecanismo que otorga el acceso final funciona del siguiente modo (Codificado en `otp.model.js` y `servicios.controller.js`):

1.  **Entropía de Software:** El código son 6 dígitos que se originan usando la fórmula `Math.floor(100000 + Math.random() * 900000)`. Se garantiza siempre generar números de entre `100000` y `999999` en rutinas aisladas de memoria.
2.  **Mecanismo de Guardado (Storage):** El código se encripta, asocia y guarda en la tabla `codigos_otp` del SQL Server bajo una condición: expira automáticamente dentro de **5 minutos**. Se registra el correo del paciente y todos sus datos identificativos para el caso de uso de auditoría.
3.  **Distribución Multicanal:** Inmediatamente después de guardarse, interviene `Nodemailer` para construir y mandar un correo en formato HTML estéticamente limpio; en paralelo, la `API de WhatsApp` (o el servicio `sms.service.js`) dispara un mensaje al móvil del paciente registrado.
4.  **Sistema Anti-Ataques (Lockout de 3 Intentos):**
    *   Cada vez que el paciente inserta el código y este es verificado, se analiza la columna `intentos`.
    *   Si el paciente o un atacante se equivoca introduciendo el OTP, el contador aumenta +1.
    *   A los **3 intentos fallidos**, el servidor lanza una directriz de bloqueo temporal. La clave dejará de servir al instante, impidiendo adivinar el código mediante fuerza bruta automatizada.

---

## 4. Archivos Digitales y Generación Compleja de PDFs (Pipeline estilo Panacea)

El paciente puede revisar sus historias clínicas ("listar") y pedir que se formen como un PDF único ("descargar"). Este es el flujo más sofisticado y se compone de cinco capas que **replican fielmente** lo que la aplicación Silverlight de Panacea hace internamente.

1.  **Orquestador (`services/historia.print.service.js`):** Recibe el `id_atencion` y ejecuta en el orden exacto de la traza original ~80 stored procedures sobre la BD `PANACEA`:
    *   Auditoría y parámetros: `Historia.STP_PARAMETROS_IMPRESION`, `Historia.STM_COPIAS_IMPRESION` (registra una copia impresa).
    *   Atención: `Historia.STM_ATENCIONES`, `STM_ATENCIONES_BASICO`, `QRY_CONSULTA_ATENCIONES`, `QRY_POBLAR_TOKEN_ATENCION` (resuelve los macros tipo `{{paciente.nombre}}`).
    *   Plantilla: `Dinamico.STP_PLANTILLAS` y `Dinamico.QRY_ESTRUCTURA_PLANA_PLANTILLA` (la espina dorsal del render).
    *   Catálogos clínicos del paciente: alergias, antecedentes, diagnósticos, síntomas, cálculos de riesgo, notas, gráficas, tratamientos odontológicos.
    *   Datos por tipo: `STM_DATOS_DECIMAL`, `_ENTEROS`, `_TEXTO`, `_LISTA`, `_FECHA`, `_TABLA`, además de `Laboratorio.STM_DATOS_TEXTO`.
    *   Para cada `id_dato` referenciado en la plantilla: bucle de `Dinamico.STP_DATOS`, `STP_DATOS_CAMPOS_TABLAS`, `STP_DATOS_IMAGENES`, `STP_RANGOS_HISTORIA` (10 tipos) y `STP_DATOS_VALORES`.
    *   Profesional: `Administracion.STP_USUARIOS` y `STP_USUARIO_IMAGENES` (firma).
    *   Sede e IPS: `Parametrizacion.STP_SEDES`, `STP_IPS`, `QRY_PRIMER_LOGO_IPS`.

    Cada `exec` se hace inyectando los parámetros transversales que Panacea exige (`@Usuario`, `@IP_Origen`, `@Timestamp`, `@Operacion`) — un helper centralizado (`services/panacea/auditContext.js`) los lee de variables de entorno y los aplica de manera idéntica en cada llamada.

2.  **Motor de Render Dinámico (`services/plantilla.render.js`):** Recorre la estructura plana devuelta por `QRY_ESTRUCTURA_PLANA_PLANTILLA` en orden. Por cada nodo decide cómo formatearlo según su `ID_TIPO_DATO_FIJO` (texto, decimal, entero, fecha, lista, tabla, imagen, sección, texto libre) y resuelve los macros con el diccionario que retornó `QRY_POBLAR_TOKEN_ATENCION`. El resultado es un HTML autocontenido cuyos márgenes, tamaño de fuente e interlineado salen de `STP_PARAMETROS_IMPRESION` (igual que en Panacea).

3.  **Renderizado a PDF (`services/pdf.service.js` + Puppeteer):** Un pool singleton de Chromium headless toma el HTML y produce un PDF en memoria. **Nada se persiste en disco.** Solo el buffer viaja al cliente y luego se libera, cumpliendo la Ley de Privacidad de los datos.

4.  **Imágenes Embebidas:** El logo de la IPS y la firma del médico llegan desde Panacea como bytes (`Parametrizacion.QRY_PRIMER_LOGO_IPS`, `Administracion.STP_USUARIO_IMAGENES`) y se insertan en el HTML como `data:image/...;base64`, evitando peticiones externas durante el render.

5.  **Validaciones de Seguridad Previas:** Antes de invocar el orquestador el controlador valida (a) el JWT del paciente, (b) que el OTP de descarga sea correcto y dentro de los 5 minutos. Solo después se inicia el pipeline costoso.

### Conclusión Técnica y Soporte IT.

Toda la aplicación se concibió altamente modular (MVC). Separamos todo en `rutas`, `controladores` (la lógica funcional), `servicios` (utilidades PDF y Correos) y `modelos` (interacción DB). Esto da a Ingeniería un proyecto robusto: en el evento que el requerimiento cambie, las interfaces se podrán sustituir fácilmente; y a nivel de concurrencia, soportará altas transferencias conectándose en paralelo al SQL Server.
