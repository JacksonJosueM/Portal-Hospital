module.exports = {
  apps: [{
    name: 'envio-historia-clinica',
    script: './index.js',
    instances: 9, // Reservamos núcleos libres para el resto de la máquina virtual
    exec_mode: 'cluster', // Permite que varios núcleos escuchen en el mismo puerto 3001
    autorestart: true,
    watch: false,
    max_memory_restart: '3G', // Límite de 3GB por trabajador (8 núcleos * 3GB = 24GB max total)
    env: {
      NODE_ENV: 'production',
    },
    node_args: '--max-old-space-size=3072', // 3072 MB (3GB) para que la generación de PDFs pesados tenga memoria de sobra
  }],
};
