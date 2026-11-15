/** Animation and transition timings, easings and parameters. */

export const ANIMATION_CONFIG = {
  // Duration scale (in milliseconds)
  duration: {
    instant: 0,
    fast: 150,
    normal: 300,
    slow: 500,
    slower: 700,
    slowest: 1000,
  },

  // Easing functions
  easing: {
    linear: 'linear',
    easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
    easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
    easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  },

  // Transition configurations
  transition: {
    // Standard transitions
    colors: {
      duration: 300, // ms
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      property: 'colors',
    },
    opacity: {
      duration: 300,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      property: 'opacity',
    },
    transform: {
      duration: 300,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      property: 'transform',
    },
    all: {
      duration: 300,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      property: 'all',
    },

    // Component-specific
    sidebar: {
      duration: 300,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      property: 'all',
    },
    modal: {
      duration: 300,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      property: 'all',
    },
    dropdown: {
      duration: 200,
      easing: 'cubic-bezier(0, 0, 0.2, 1)',
      property: 'all',
    },
    tooltip: {
      duration: 150,
      easing: 'cubic-bezier(0, 0, 0.2, 1)',
      property: 'opacity',
    },
  },

  // Animation keyframes (for CSS animations)
  keyframes: {
    fadeIn: {
      name: 'fade-in',
      from: { opacity: 0 },
      to: { opacity: 1 },
    },
    fadeOut: {
      name: 'fade-out',
      from: { opacity: 1 },
      to: { opacity: 0 },
    },
    slideInFromRight: {
      name: 'slide-in-right',
      from: { transform: 'translateX(100%)' },
      to: { transform: 'translateX(0)' },
    },
    slideInFromLeft: {
      name: 'slide-in-left',
      from: { transform: 'translateX(-100%)' },
      to: { transform: 'translateX(0)' },
    },
    slideUp: {
      name: 'slide-up',
      from: { transform: 'translateY(10px)', opacity: 0 },
      to: { transform: 'translateY(0)', opacity: 1 },
    },
    scaleIn: {
      name: 'scale-in',
      from: { transform: 'scale(0.95)', opacity: 0 },
      to: { transform: 'scale(1)', opacity: 1 },
    },
    pulse: {
      name: 'pulse',
      '0%, 100%': { opacity: 1 },
      '50%': { opacity: 0.5 },
    },
    spin: {
      name: 'spin',
      from: { transform: 'rotate(0deg)' },
      to: { transform: 'rotate(360deg)' },
    },
  },

  // Delay scale (in milliseconds)
  delay: {
    none: 0,
    short: 100,
    medium: 200,
    long: 300,
  },

  // Debounce and throttle timings
  debounce: {
    search: 300, // Search input debounce
    resize: 150, // Window resize debounce
    scroll: 100, // Scroll event debounce
    input: 300,  // General input debounce
    stateSave: 500, // Window state save debounce
  },

  // Timer and interval settings
  timer: {
    recordingUpdate: 100, // Update recording timer every 100ms
    autoSaveInterval: 30000, // Auto-save every 30 seconds
    notificationDuration: 5000, // Show notifications for 5 seconds
    copyFeedback: 2000, // Show copy feedback for 2 seconds
    tooltipDelay: 500, // Show tooltip after 500ms hover
    placeholderCycle: 30000, // Rotate input placeholder hints (gentle, long interval)
  },

  // Loading and skeleton animations
  loading: {
    spinnerSpeed: 1000, // One full rotation per second
    pulseSpeed: 2000, // Pulse animation cycle
    shimmerSpeed: 2000, // Skeleton shimmer animation
  },

  // Audio visualizer settings
  visualizer: {
    updateInterval: 16, // ~60fps (1000ms / 60 ≈ 16ms)
    barAnimationSpeed: 100, // Smoothing factor for bar height changes
    idleAnimationSpeed: 2000, // Idle state animation cycle
  },

  // Chat and messages
  chat: {
    /** Shared-element id: the composer glides from the landing page to the bottom of the chat */
    composerLayoutId: 'chat-composer',
    /** framer-motion `layoutDependency` per composer host; values must differ or framer skips the shared glide. */
    composerLayoutDependency: { idle: 'idle', chat: 'chat' },
    /** Composer glide (framer-motion, seconds) — standard easeInOut */
    composerGlide: { duration: 0.3, ease: [0.4, 0, 0.2, 1] as const },
    /** A finished tool call (or group) stays open this long before folding, ms — time to see what happened. */
    toolFoldDelayMs: 600,
    messageAppearDelay: 100, // Delay between sequential messages
    typingIndicatorSpeed: 1000, // Typing indicator animation
    scrollDuration: 300, // Smooth scroll to new message
  },

  /** Progress bar (framer-motion, seconds): the fill easing to its value, the indeterminate sweep, a compact bar fading in. */
  progress: {
    fill: { duration: 0.3, ease: 'easeOut' },
    sweep: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' },
    appear: { duration: 0.2, ease: [0.4, 0, 0.2, 1] as const },
  },

  /** Disclosure open/close (framer-motion, seconds): height and fade together. */
  disclosure: { duration: 0.2, ease: [0.4, 0, 0.2, 1] as const },

  // Theme transition
  theme: {
    duration: 300, // Theme switch transition duration
    easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
} as const;

/** CSS transition string from config values. */
export function getCSSTransition(
  transitionKey: keyof typeof ANIMATION_CONFIG.transition
): string {
  const config = ANIMATION_CONFIG.transition[transitionKey];
  return `${config.property} ${config.duration}ms ${config.easing}`;
}

/** Animation duration in seconds, for CSS. */
export function getDurationInSeconds(durationKey: keyof typeof ANIMATION_CONFIG.duration): string {
  return `${ANIMATION_CONFIG.duration[durationKey] / 1000}s`;
}

/** requestAnimationFrame loop throttled to a target FPS. */
export function createAnimationLoop(
  callback: (deltaTime: number) => void,
  fps: number = 60
): () => void {
  let lastTime = performance.now();
  let animationId: number;
  const interval = 1000 / fps;

  function loop(currentTime: number) {
    animationId = requestAnimationFrame(loop);
    const deltaTime = currentTime - lastTime;

    if (deltaTime >= interval) {
      lastTime = currentTime - (deltaTime % interval);
      callback(deltaTime);
    }
  }

  animationId = requestAnimationFrame(loop);

  return () => cancelAnimationFrame(animationId);
}

/** Debounce using config delays. */
export function createDebounce<T extends (...args: never[]) => void>(
  func: T,
  delayKey: keyof typeof ANIMATION_CONFIG.debounce
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;
  const delay = ANIMATION_CONFIG.debounce[delayKey];

  return function (...args: Parameters<T>) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
}

/** Throttle using config delays. */
export function createThrottle<T extends (...args: never[]) => void>(
  func: T,
  delayKey: keyof typeof ANIMATION_CONFIG.debounce
): (...args: Parameters<T>) => void {
  let isThrottled = false;
  const delay = ANIMATION_CONFIG.debounce[delayKey];

  return function (...args: Parameters<T>) {
    if (isThrottled) return;

    func(...args);
    isThrottled = true;
    setTimeout(() => (isThrottled = false), delay);
  };
}
