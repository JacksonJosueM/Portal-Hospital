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
    *   Conectividad estricta a **SQL Server** usando una visión intermedia (Vistas) llamada `vw_pacientes_portal` para mantener la base de datos original (`Panacea`) intacta y segura. El backend interactúa enviando instrucciones exactas por la librería `mssql` de manera cifrada.

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

## 4. Archivos Digitales y Generación Compleja de PDFs

El paciente puede revisar sus historias clínicas ("listar") y pedir que se formen como un PDF único ("descargar"). Es el flujo más pesado, pero el más sofisticado, ubicado principalmente en `pdf.service.js`:

1.  **Modelo y Compilación en Memoria (Puppeteer):** La app no almacena los PDFs previamente en disco (ahorrando cientos de Gigabytes a futuro). En su lugar, todos se generan **al vuelo** y directamente *en memoria RAM*. Solo cuando se generan se mandan para ser descargados y luego se destruyen, mejorando la Ley de Privacidad de los datos.
2.  **El Formato Institucional Panacea:** En los recursos internos (`templates/historia_clinica.html`) existe una plantilla HTML prediseñada que emula la maqueta obligatoria del formato Panacea. Contiene espacios vacíos o variables bajo el formato `{{placeholder}}`.
3.  **Extrapolación (Mapping):** El sistema toma campos de la BD como: anamnesis, motivos, medicamentos, signos vitales, etc. Y en tiempo real reemplaza el HTML con estos valores exactos del paciente.
4.  **Incrustación de Imágenes Segura:** Convierte el logo institucional (`logo.png`) a formato **Base64** empaquetándolo dentro del HTML mismo para evitar peticiones online externas durante la renderización.
5.  **Motor Rendering (Chromium Headless):** Una vez que el archivo HTML se conformó dentro de NodeJS, la capa `Puppeteer` dispara instantáneamente un subproceso silencioso del navegador *"Google Chrome/Chromium"* que toma el HTML, lo procesa y lo exporta perfectamente en forma de un documento de impresión (`Margin, Formato Carta, Background`). El resultado es un buffer que viaja como PDF y se descarga para el paciente.

### Conclusión Técnica y Soporte IT.

Toda la aplicación se concibió altamente modular (MVC). Separamos todo en `rutas`, `controladores` (la lógica funcional), `servicios` (utilidades PDF y Correos) y `modelos` (interacción DB). Esto da a Ingeniería un proyecto robusto: en el evento que el requerimiento cambie, las interfaces se podrán sustituir fácilmente; y a nivel de concurrencia, soportará altas transferencias conectándose en paralelo al SQL Server.
