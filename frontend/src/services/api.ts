import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 60000, // 60 segundos para dar tiempo a consultas pesadas de Panacea
  headers: {
    'Content-Type': 'application/json',
  },
});

// Inyectar token automáticamente en cada request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('portal_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Manejar errores globalmente
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Si es un 401, pero viene de un intento de autenticación (!error.config.url.includes('/servicios/'))
    // y no es una validación de OTP (que también puede devolver 401 si el código es incorrecto)
    // Solo expulsar si estaban consultando un registro protegido y expiró el token
    if (
      error.response?.status === 401 && 
      error.config && 
      !error.config.url?.includes('/servicios/') &&
      !error.config.url?.includes('otp=')
    ) {
      // Token expirado → limpiar sesión
      localStorage.removeItem('portal_token');
      localStorage.removeItem('portal_paciente');
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

export default api;
