module.exports = {
  apps: [{
    name: "portal-hospital-backend",
    script: "./index.js",
    
    // Clonación (Escalabilidad Horizontal Mágica)
    instances: 4,           // Inicia 4 procesos/doctores en paralelo (aprovechando la Máquina Virtual de 32GB)
    exec_mode: "cluster",   // Activa el modo de balanceo de carga interno
    
    // Comportamiento del servidor
    autorestart: true,      // Si un proceso falla, PM2 lo revive automáticamente
    watch: false,           // Falso porque es Producción. (Usar nodemon para desarrollo)
    max_memory_restart: "4G", // Subimos a 4GB por instancia para darles holgura con los PDFs, sobrando 40GB libres para el resto
    
    // Variables de entorno de producción
    env: {
      NODE_ENV: "production",
    }
  }]
}
