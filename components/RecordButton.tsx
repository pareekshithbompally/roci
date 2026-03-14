import React from 'react';
import { Circle } from 'lucide-react';
import { UI_CONFIG } from '../src/config/ui.config';

interface RecordButtonProps {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}

/**
 * RecordButton Component
 * 
 * Circular red button with pulsing animation for starting recordings.
 * Inspired by classic recording UI patterns.
 */
const RecordButton: React.FC<RecordButtonProps> = ({ 
  onClick, 
  disabled = false,
  label = 'Record'
}) => {
  return (
    <div className="flex flex-col items-center gap-4">
      {/* Button Container */}
      <button
        onClick={onClick}
        disabled={disabled}
        className="group relative flex items-center justify-center transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          width: UI_CONFIG.size.button.recordButton.width,
          height: UI_CONFIG.size.button.recordButton.height,
        }}
        aria-label={label}
      >
        {/* Outer glow ring - animated pulse */}
        <div 
          className="absolute inset-0 rounded-full bg-red-500/20 animate-ping"
          style={{
            animationDuration: '2s',
          }}
        />
        
        {/* Middle ring - static glow */}
        <div 
          className="absolute inset-0 rounded-full bg-red-500/10 scale-110 transition-transform group-hover:scale-125"
        />
        
        {/* Main button circle */}
        <div 
          className="relative w-full h-full rounded-full bg-gradient-to-br from-red-500 to-red-600 shadow-xl shadow-red-500/30 flex items-center justify-center transition-all duration-300 group-hover:shadow-2xl group-hover:shadow-red-500/40 group-hover:scale-105 group-active:scale-95"
        >
          {/* Inner highlight */}
          <div className="absolute inset-2 rounded-full bg-gradient-to-br from-white/20 to-transparent" />
          
          {/* Icon */}
          <Circle 
            className="relative fill-white text-white drop-shadow-lg" 
            style={{
              width: UI_CONFIG.size.button.recordButton.iconSize,
              height: UI_CONFIG.size.button.recordButton.iconSize,
            }}
          />
        </div>
      </button>
      
      {/* Label */}
      <span className="text-base font-semibold text-zinc-900 dark:text-white">
        {label}
      </span>
    </div>
  );
};

export default RecordButton;
