/**
 * VoiceWaveform
 *
 * 7 animated bars driven by live microphone data via Web Audio API AnalyserNode.
 * When no stream is available (pre-audio or transcribing), falls back to a
 * gentle sine-wave idle pulse so bars are never frozen.
 *
 * Bars use a blue-400 → violet-400 vertical gradient matching the app's
 * active-state accent color. Driven by Framer Motion — zero new dependencies.
 */

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

const NUM_BARS = 7;
const BAR_MAX_HEIGHT = 28; // px
const BAR_MIN_HEIGHT = 3;  // px

// Frequency bin indices to sample from the analyser (out of 16 bins at fftSize=32)
const BIN_INDICES = [1, 2, 4, 6, 8, 10, 12];

function idleAmplitude(barIndex: number, t: number): number {
  // Gentle sine wave staggered per bar, always visible
  return 0.15 + 0.2 * Math.abs(Math.sin(t / 800 + barIndex * 0.7));
}

interface VoiceWaveformProps {
  stream: MediaStream | null;
}

export function VoiceWaveform({ stream }: VoiceWaveformProps) {
  const [amplitudes, setAmplitudes] = useState<number[]>(
    Array.from({ length: NUM_BARS }, (_, i) => idleAmplitude(i, 0))
  );
  const rafRef = useRef<number | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    if (!stream) {
      // No stream: animate idle sine pulse
      let running = true;
      const animate = () => {
        if (!running) return;
        const t = performance.now();
        setAmplitudes(Array.from({ length: NUM_BARS }, (_, i) => idleAmplitude(i, t)));
        rafRef.current = requestAnimationFrame(animate);
      };
      rafRef.current = requestAnimationFrame(animate);
      return () => {
        running = false;
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      };
    }

    // Stream available: connect AnalyserNode
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 32;
    analyser.smoothingTimeConstant = 0.6;
    source.connect(analyser);

    ctxRef.current = ctx;
    sourceRef.current = source;
    analyserRef.current = analyser;

    const data = new Uint8Array(analyser.frequencyBinCount);
    let running = true;

    const animate = () => {
      if (!running) return;
      analyser.getByteFrequencyData(data);
      setAmplitudes(BIN_INDICES.map(bin => (data[bin] ?? 0) / 255));
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      running = false;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      source.disconnect();
      ctx.close();
      ctxRef.current = null;
      sourceRef.current = null;
      analyserRef.current = null;
    };
  }, [stream]);

  return (
    <div className="flex items-center justify-center gap-[3px] h-8">
      {amplitudes.map((amp, i) => {
        const height = Math.max(BAR_MIN_HEIGHT, amp * BAR_MAX_HEIGHT);
        return (
          <motion.div
            key={i}
            style={{
              width: 3,
              borderRadius: 9999,
              background: 'linear-gradient(to top, #60a5fa, #a78bfa)',
            }}
            animate={{ height }}
            transition={{ duration: 0.1, ease: 'easeOut' }}
          />
        );
      })}
    </div>
  );
}
