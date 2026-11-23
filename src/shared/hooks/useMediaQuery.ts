import { useState, useEffect } from 'react';
import { BREAKPOINTS } from '@config/ui.config';

export function useSmallScreen() {
  const [isSmallScreen, setIsSmallScreen] = useState(
    typeof window !== 'undefined' ? window.innerWidth <= BREAKPOINTS.md : false
  );

  useEffect(() => {
    const handleResize = () => {
      setIsSmallScreen(window.innerWidth <= BREAKPOINTS.md);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isSmallScreen;
}
