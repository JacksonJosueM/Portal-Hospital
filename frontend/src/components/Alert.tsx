import React from 'react';

interface Props {
  type?: 'error' | 'success' | 'info' | 'warning';
  message: string;
  className?: string;
  style?: React.CSSProperties;
}

const icons = {
  error:   '✕',
  success: '✓',
  info:    'ℹ',
  warning: '⚠',
};

export const Alert: React.FC<Props> = ({ type = 'error', message, className = '', style }) => {
  if (!message) return null;
  return (
    <div className={`alert alert-${type} animate-fade-in ${className}`} role="alert" style={style}>
      <span style={{ fontWeight: 700, flexShrink: 0 }}>{icons[type]}</span>
      <span>{message}</span>
    </div>
  );
};
