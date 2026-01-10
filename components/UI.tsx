import React, { memo } from 'react';

export const Card = memo(({ title, children, className = "", accent, onClick }: { 
  title: string; 
  children: React.ReactNode; 
  className?: string; 
  accent?: string; 
  onClick?: () => void 
}) => (
  <div 
    onClick={onClick}
    className={`bg-white rounded-[32px] shadow-sm border border-slate-100 p-6 relative overflow-hidden transition-all duration-300 hover:shadow-md ${onClick ? 'cursor-pointer active:scale-[0.98]' : ''} ${className}`}
  >
    {accent && <div className={`absolute top-0 left-0 w-1.5 h-full ${accent}`} />}
    <div className="mb-4">
      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{title}</h3>
    </div>
    {children}
  </div>
));

export const ProgressBar = memo(({ progress, color }: { progress: number; color: string }) => (
  <div className="h-2 w-full bg-slate-50 rounded-full overflow-hidden">
    <div 
      className="h-full transition-all duration-700 ease-out rounded-full"
      style={{ width: `${Math.min(progress, 100)}%`, backgroundColor: color }}
    />
  </div>
));