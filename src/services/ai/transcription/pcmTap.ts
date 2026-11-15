/**
 * The microphone as engine-rate samples, in slices, while it records — for
 * live transcription. Taps an existing MediaStream (the composer's visualizer
 * keeps reading the same one); stopping releases only the tap.
 */

import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import { failureLogger } from '@shared/utils/errors';
import workletUrl from './pcmTap.worklet.ts?worker&url';

const report = failureLogger('tapPcm');

const { sampleRate, liveChunkMs } = TRANSCRIPTION_CONFIG;

export interface PcmTap {
  stop: () => void;
}

export async function tapPcm(stream: MediaStream, onSlice: (pcm: Float32Array) => void): Promise<PcmTap> {
  const context = new AudioContext();
  await context.audioWorklet.addModule(workletUrl);
  const source = context.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(context, 'pcm-tap', {
    numberOfOutputs: 0,
    processorOptions: { targetRate: sampleRate, sliceSamples: (sampleRate * liveChunkMs) / 1000 },
  });
  node.port.onmessage = (event: MessageEvent<Float32Array>) => onSlice(event.data);
  source.connect(node);
  return {
    stop: () => {
      node.port.onmessage = null;
      source.disconnect();
      context.close().catch(report('close'));
    },
  };
}
