import api from './api';

// ─── Servicio de autenticación passwordless ───────────────────────────────────
export const serviciosService = {
  async autenticar(tipo_documento: string, numero_documento: string, fecha_nacimiento: string) {
    const { data } = await api.post('/servicios/autenticar', {
      tipo_documento, numero_documento, fecha_nacimiento,
    });
    return data;
  },

  async verificarOtp(temp_token: string, codigo_otp: string) {
    const { data } = await api.post('/servicios/verificar-otp', {
      temp_token, codigo_otp,
    });
    return data;
  },
};

// ─── Historias Clínicas ───────────────────────────────────────────────────────
export const historiasService = {
  async listar() {
    const { data } = await api.get('/historias');
    return data.data || [];
  },
  async detalle(id: number) {
    const { data } = await api.get(`/historias/${id}`);
    return data;
  },
  async solicitarPdf(id: number) {
    const { data } = await api.post(`/historias/${id}/solicitar-pdf`);
    return data;
  },
  async descargarPdf(id: number, otp: string, nombreArchivo: string) {
    const response = await api.get(`/historias/${id}/pdf?otp=${otp}`, { responseType: 'blob' });
    // Intentar extraer nombre del header Content-Disposition
    const disposition = response.headers['content-disposition'];
    let filename = nombreArchivo;
    if (disposition) {
      const match = disposition.match(/filename="?([^";\n]+)"?/);
      if (match && match[1]) filename = match[1];
    }
    _descargarBlob(response.data, filename, 'application/pdf');
  },
};

// ─── Laboratorios ─────────────────────────────────────────────────────────────
export const laboratoriosService = {
  async listar() {
    const { data } = await api.get('/laboratorios');
    return data.data || [];
  },
  async detalle(id: number) {
    const { data } = await api.get(`/laboratorios/${id}`);
    return data;
  },
  async descargarPdf(id: number, nombreArchivo: string) {
    const response = await api.get(`/laboratorios/${id}/pdf`, { responseType: 'blob' });
    _descargarBlob(response.data, nombreArchivo);
  },
};

// ─── Helper ───────────────────────────────────────────────────────────────────
function _descargarBlob(data: Blob, nombre: string, mimeType?: string) {
  // Asegurar que el blob tenga el tipo MIME correcto
  const blob = mimeType ? new Blob([data], { type: mimeType }) : new Blob([data]);
  const url = window.URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.style.display = 'none';
  link.href = url;
  
  // Usar la propiedad .download directamente es más robusto en Chrome
  link.download = nombre || 'historia_clinica.pdf';
  
  document.body.appendChild(link);
  
  // Trigger click
  link.click();
  
  // Aumentar significativamente el timeout para evitar el bug de Chrome
  // donde usar el UUID de la URL en lugar del atributo download.
  setTimeout(() => {
    if (document.body.contains(link)) {
      document.body.removeChild(link);
    }
    window.URL.revokeObjectURL(url);
  }, 1500);
}

// ─── Auth legacy (se mantiene por compatibilidad) ─────────────────────────────
export const authService = {
  async login(tipo_documento: string, numero_documento: string, contrasena: string) {
    const { data } = await api.post('/auth/login', { tipo_documento, numero_documento, contrasena });
    return data;
  },
};
