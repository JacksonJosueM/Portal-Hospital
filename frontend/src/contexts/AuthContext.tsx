import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { Paciente } from '../types';

interface AuthContextType {
  token: string | null;
  paciente: Paciente | null;
  isAuthenticated: boolean;
  login: (token: string, paciente: Paciente) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem('portal_token')
  );
  const [paciente, setPaciente] = useState<Paciente | null>(() => {
    const stored = localStorage.getItem('portal_paciente');
    return stored ? JSON.parse(stored) : null;
  });

  const login = (newToken: string, newPaciente: Paciente) => {
    localStorage.setItem('portal_token', newToken);
    localStorage.setItem('portal_paciente', JSON.stringify(newPaciente));
    setToken(newToken);
    setPaciente(newPaciente);
  };

  const logout = () => {
    localStorage.removeItem('portal_token');
    localStorage.removeItem('portal_paciente');
    setToken(null);
    setPaciente(null);
  };

  return (
    <AuthContext.Provider
      value={{ token, paciente, isAuthenticated: !!token, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
};
