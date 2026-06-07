import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  message: string;
  className?: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({ icon: Icon, message, className = '' }) => {
  return (
    <div className={`flex items-center justify-center w-full h-full min-h-[240px] ${className}`}>
      <div className="flex flex-col items-center justify-center gap-4 px-12 py-10 rounded-xl bg-white dark:bg-night-900 border border-parchment-200 dark:border-night-700 shadow-sm">
        <Icon className="w-10 h-10 text-parchment-400 dark:text-night-400" strokeWidth={1.5} />
        <p className="text-sm text-parchment-500 dark:text-night-400">{message}</p>
      </div>
    </div>
  );
};

export default EmptyState;
