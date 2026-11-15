/** Worklet: mic resampled to the engine rate and posted in fixed Float32Array slices; rates come as options. */

declare const sampleRate: number;
declare function registerProcessor(name: string, processor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: { processorOptions?: unknown });
}

interface TapOptions {
  targetRate: number;
  sliceSamples: number;
}

class PcmTap extends AudioWorkletProcessor {
  /** Input samples per output sample. */
  private readonly step: number;
  private readonly slice: Float32Array;
  private filled = 0;
  /** Where the next output sample falls, in input samples after `previous`. */
  private position = 0;
  private previous = 0;

  constructor(options: { processorOptions: TapOptions }) {
    super(options);
    const { targetRate, sliceSamples } = options.processorOptions;
    this.step = sampleRate / targetRate;
    this.slice = new Float32Array(sliceSamples);
  }

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0];
    if (input) this.resample(input);
    return true;
  }

  /** Sample k of [previous, ...input], interpolated at the running position. */
  private resample(input: Float32Array): void {
    const at = (k: number) => (k === 0 ? this.previous : input[k - 1]);
    while (this.position < input.length) {
      const k = Math.floor(this.position);
      const fraction = this.position - k;
      this.push(at(k) + (at(k + 1) - at(k)) * fraction);
      this.position += this.step;
    }
    this.position -= input.length;
    this.previous = input[input.length - 1];
  }

  private push(sample: number): void {
    this.slice[this.filled++] = sample;
    if (this.filled < this.slice.length) return;
    const full = this.slice.slice();
    this.port.postMessage(full, [full.buffer]);
    this.filled = 0;
  }
}

registerProcessor('pcm-tap', PcmTap);
