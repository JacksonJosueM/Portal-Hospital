# 🏥 Guía de Arquitectura y Despliegue - Portal de Pacientes
*E.S.E Hospital San Juan de Dios Marinilla*

Este documento consolida todas las decisiones técnicas y la configuración empresarial definida para el exitoso despliegue del Portal de Pacientes, garantizando un rendimiento sin fallas y la protección total del sistema Core (Panacea).

---

## 1. Arquitectura de Hardware (Modelo Distribuido) 🏗️

Se ha decidido implementar una arquitectura en **N-Capas (N-Tier)** separando físicamente el "Músculo" del "Cerebro", utilizando dos servidores distintos para maximizar la seguridad y el rendimiento:

### Servidor 1: Base de Datos Core (El Cerebro)
* **Función:** Uso exclusivo para el motor de base de datos SQL Server (Panacea).
* **Hardware:** Intel Xeon Gold 5318Y (48 procesadores lógicos), SSDs corporativos, 128 GB RAM.
* **Configuración:** La RAM suele operar al 95% (122 GB asignados dinámicamente a SQL Server). Se recomienda establecer un techo de Memoria Máxima (Max Server Memory) a 110 GB a través de SSMS para garantizar recursos al sistema operativo.
* **Integración con el Portal:** El portal se conecta directamente a la BD `PANACEA` con un usuario de servicio dedicado (`Portal_Pacientes`) y ejecuta los **mismos stored procedures que la aplicación Silverlight** cuando un paciente descarga su historia clínica. Esto garantiza que el contenido del PDF sea **idéntico al que ven los doctores** sin duplicar lógica de impresión.

  Permisos requeridos a otorgar al usuario por el DBA de Panacea:

  ```sql
  GRANT EXECUTE ON SCHEMA::Historia        TO Portal_Pacientes;
  GRANT EXECUTE ON SCHEMA::Dinamico        TO Portal_Pacientes;
  GRANT EXECUTE ON SCHEMA::Parametrizacion TO Portal_Pacientes;
  GRANT EXECUTE ON SCHEMA::Administracion  TO Portal_Pacientes;
  GRANT EXECUTE ON SCHEMA::Laboratorio     TO Portal_Pacientes;
  GRANT EXECUTE ON SCHEMA::Odontologia     TO Portal_Pacientes;
  ```

  La BD intermedia (`PortalPacientes`) sigue siendo necesaria sólo para las vistas `vw_atenciones_portal` / `vw_pacientes_portal` (usadas únicamente por el listado y el envío del OTP) y para la tabla `codigos_otp` propia del portal.

### Servidor 2: Servidor de Aplicación Web (El Músculo)
* **Función:** Ejecución de NodeJS, Empaquetado de React y Generación de documentos PDF (Puppeteer).
* **Hardware:** Máquina Virtual asignada con 10 Hilos de Procesamiento Lógico y 32 GB de RAM.
* **Ventaja Estratégica:** Este servidor cuenta con **~28.7 GB libres**, otorgando una pista de procesamiento masiva para aislar el tráfico de los pacientes, evitar saturar a los doctores y prevenir que los errores de la web puedan afectar al Servidor 1.

---

## 2. Configuración de Alta Tolerancia y Escalabilidad (PM2) ⚙️

Para aprovechar el hardware del Servidor 2 sin intervenir negativamente con otras aplicaciones institucionales hospedadas (ej. IIS / Aplicativo de doctores), se implementó **PM2** en modo clúster.

**Archivo Configurado (`backend/ecosystem.config.js`):**
* **Instancias (Clones):** Se fijaron en `2` procesos concurrentes de Node.js que trabajarán en forma de balanceador de carga.
* **Seguridad de RAM (`max_memory_restart: '4G'`):** Cada instancia de la aplicación cuenta con un límite forzado de 4 GB RAM. Debido a que el aplicativo usa *Google Chrome Headless* para la renderización simultánea de decenas de Historias Clínicas PDF, este umbral de 4GB absorbe picos concurrentes extremos, mientras le sigue dejando **20 GB de margen vital libre a la Máquina Virtual**. 

---

## 3. Guía de Despliegue en Red Local (Paso a Paso) 🚀

Cuando las vistas SQL en Panacea estén listas, seguir este orden en el **Servidor 2 (VM de 32GB)**:

1. **Instalar Dependencias:** Instalar NodeJS localmente. Correr `npm install` tanto en `/backend` como en `/frontend`.
2. **Conexión SQL Server:** Editar el archivo `backend/.env` usando la **Dirección IP del Servidor 1** en `DB_SERVER` (BD del portal con `vw_*_portal` y `codigos_otp`) y en `PANACEA_DB_SERVER` (BD `PANACEA` con los SPs nativos). Configurar también `PANACEA_DB_USER`/`PANACEA_DB_PASSWORD` con el usuario `Portal_Pacientes` que el DBA de Panacea autorizó. Definir `PANACEA_DB_USUARIO_AUDIT`, `PANACEA_DB_IP_ORIGEN` y `PANACEA_ID_IPS` para el contexto de auditoría que se inyecta en cada SP.
3. **Encendido Invisible del Backend:** Moverse a la carpeta `/backend` y ejecutar `pm2 start ecosystem.config.js`. Esto activará en segundo plano automático la API sobre el puerto local `3001`.
4. **Construcción estática de React:** Moverse a la carpeta `/frontend` y correr `npm run build`. Esto empaquetará la versión final minimizada (HTML, CSS, JS) lista para los navegadores web en la nueva carpeta `/dist`.
5. **Configuración del Host IIS:** 
   * En Internet Information Services (IIS), crear el Sitio Web (ej: *portal-pacientes*) apuntando la ruta física hacia la carpeta comprimida `/dist`.
   * En IIS, configurar un *URL Rewrite / Reverse Proxy* para que todas las peticiones que ingresen a la ruta `/api/(.*)` sean reenviadas transparentemente de forma interna a `http://localhost:3001/$1` (puerto PM2).

---

## 4. Fase de Exposición a Internet Mundial 🌎
Una vez probado bajo la IP local (ej: `192.168.x.x`), para el acceso público deberán interactuar desde Infraestructura/Redes del hospital integrando tres elementos:

1. **Port Forwarding (NAT):** Permitir tráfico del puerto `80` (HTTP) y `443` (HTTPS) desde el Firewall del hospital exclusivamente hacia la IP interna del **Servidor 2**.
2. **Enlace DNS / Dominio:** Registrar y vincular el dominio institucional (ej: `pacientes.suhospital.gov.co`) hacia la IP Pública estática asignada por su ISP de telecomunicaciones.
3. **Autenticación y Certificados SSL:** Emitir e instalar un Certificado de Seguridad (SSL) verde a través de *Let's Encrypt* en su servidor IIS. Esto es crítico por ley para encriptar los resultados patológicos/personales desde IIS a los dispositivos móviles de los ciudadanos.
