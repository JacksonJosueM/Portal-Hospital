import React from 'react';

interface Props {
  text?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const Loader: React.FC<Props> = ({ text, size = 'md', className = '' }) => {
  const dims = { sm: 16, md: 40, lg: 60 };
  const d = dims[size];

  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 ${className}`}
      role="status"
      aria-label={text || 'Cargando'}
    >
      <svg
        width={d}
        height={d}
        viewBox="0 0 50 50"
        style={{ animation: 'spin 0.8s linear infinite' }}
      >
        <circle
          cx="25" cy="25" r="20"
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="5"
        />
        <circle
          cx="25" cy="25" r="20"
          fill="none"
          stroke="#3b82f6"
          strokeWidth="5"
          strokeDasharray="60"
          strokeDashoffset="20"
          strokeLinecap="round"
        />
      </svg>
      {text && (
        <p style={{ color: '#6b7280', fontSize: 14, margin: 0 }}>{text}</p>
      )}
    </div>
  );
};
