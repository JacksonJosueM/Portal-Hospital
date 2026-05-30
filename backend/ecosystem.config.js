module.exports = {
  apps: [{
    name: 'envio-historia-clinica',
    script: './index.js',
    instances: 4,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '2G',
    env: {
      NODE_ENV: 'production',
    },
  }],
};
