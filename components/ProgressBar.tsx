import React from 'react';

interface ProgressBarProps {
  message: string;
  percentage: number;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ message, percentage }) => {
  return (
    <div className="w-full space-y-2 animate-fade-in">
      <div className="flex justify-between mb-1">
        <span className="text-base font-medium text-slate-300">{message}</span>
        <span className="text-sm font-medium text-slate-300">{Math.round(percentage)}%</span>
      </div>
      <div className="w-full bg-slate-700 rounded-full h-2.5">
        <div 
          className="bg-gradient-to-r from-sky-500 to-teal-400 h-2.5 rounded-full transition-all duration-500 ease-out" 
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
    </div>
  );
};