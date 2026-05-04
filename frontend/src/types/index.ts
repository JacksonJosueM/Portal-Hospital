// ─── Tipos de documento ─────────────────────────────────────────────────
export const TIPOS_DOCUMENTO = [
  { codigo: 'CC',   label: 'Cédula de ciudadanía' },
  { codigo: 'TI',   label: 'Tarjeta de identidad' },
  { codigo: 'CE',   label: 'Cédula de extranjería' },
  { codigo: 'PT',   label: 'Permiso temporal' },
  { codigo: 'PA',   label: 'Pasaporte' },
  { codigo: 'OTRO', label: 'Otro' },
] as const;

export type TipoDocumento = typeof TIPOS_DOCUMENTO[number]['codigo'];

// ─── Paciente ────────────────────────────────────────────────────────────
export interface Paciente {
  nombre: string;
  correo?: string;
  tipo_documento?: string;
  numero_documento?: string;
}

// ─── Historia Clínica ────────────────────────────────────────────────────
export interface HistoriaClinica {
  id: number;
  fecha: string;
  especialidad: string;
  medico: string;
  nombre_paciente?: string;
  numero_documento?: string;
  registro_medico?: string;
  id_estado?: number;
  id_plantilla?: number;
  diagnostico?: string;
  observaciones?: string;
  campos?: Record<string, string>; // Campos clínicos dinámicos de Panacea
}

// ─── Resultado de Laboratorio ─────────────────────────────────────────────
export interface ResultadoLaboratorio {
  id: number;
  tipo_documento: string;
  numero_documento: string;
  fecha: string;
  tipo_examen: string;
  resultado: string;
  archivo_pdf?: string;
  observaciones?: string;
}

// ─── Auth context ────────────────────────────────────────────────────────
export interface AuthState {
  token: string | null;
  paciente: Paciente | null;
  isAuthenticated: boolean;
}

// ─── API responses ───────────────────────────────────────────────────────
export interface ApiListResponse<T> {
  data: T[];
  total: number;
}

export interface ApiDetailResponse<T> {
  data: T;
}
