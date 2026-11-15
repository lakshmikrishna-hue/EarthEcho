import {
  ColumnFeatures,
  GRID_COLS,
  GridCell,
  SonificationMode,
  clamp,
  computeNightLightsCellGain,
  computeStereoPan,
  mapLightningRowToDrumPitch,
} from './sonification';

/**
 * Self-contained Web Audio API synthesizer for EarthEcho.
 * Supports 3 distinct dataset sound personalities (purely synthesized, no audio files):
 * 1. night-lights: soft sine/triangle pentatonic pulses with max(R, G, B) volume & cluster rhythm density
 * 2. lightning: synthesized percussive clicks/drums (oscillators + noise bursts), panned X, pitched by Y
 * 3. forest-height: warm sustained pad (layered detuned oscillators, slow attack/release, low-pass filter)
 */
export class EarthAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private activeNodes: Set<AudioScheduledSourceNode> = new Set();

  public async ensureReady(initialVolume: number): Promise<AudioContext> {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new AudioCtx();

      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-16, this.ctx.currentTime);
      this.compressor.knee.setValueAtTime(18, this.ctx.currentTime);
      this.compressor.ratio.setValueAtTime(6, this.ctx.currentTime);
      this.compressor.attack.setValueAtTime(0.005, this.ctx.currentTime);
      this.compressor.release.setValueAtTime(0.15, this.ctx.currentTime);

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(initialVolume, this.ctx.currentTime);

      this.compressor.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      this.noiseBuffer = this.createNoiseBuffer(this.ctx);
    }

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    return this.ctx;
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * 0.15);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  public setMasterVolume(volume: number): void {
    if (!this.ctx || !this.masterGain) return;
    const clamped = Math.min(1, Math.max(0, volume));
    this.masterGain.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.02);
  }

  public playColumn(
    columnCells: GridCell[],
    colIndex: number,
    stepDurationSec: number,
    masterVolume: number,
    totalCols: number = GRID_COLS,
    mode: SonificationMode = 'night-lights',
    features?: ColumnFeatures,
  ): void {
    if (!this.ctx || !this.compressor || this.ctx.state !== 'running') return;
    if (masterVolume <= 0) return;

    if (mode === 'night-lights') {
      this.playNightLightsColumn(
        columnCells,
        colIndex,
        stepDurationSec,
        totalCols,
        features,
      );
      return;
    }

    if (mode === 'lightning') {
      this.playLightningColumn(colIndex, stepDurationSec, totalCols, features);
      return;
    }

    this.playForestHeightColumn(
      colIndex,
      stepDurationSec,
      totalCols,
      features,
    );
  }

  /**
   * Night Lights personality:
   * - Volume = max(R, G, B) color intensity of each cell (pure black stays silent,
   *   any non-black pixel gets a small minimum volume)
   * - Rhythm density = number of bright clusters in each column (more clusters = more notes per beat)
   * - Sound = soft sine/triangle notes on a C major pentatonic scale
   */
  private playNightLightsColumn(
    columnCells: GridCell[],
    colIndex: number,
    stepDurationSec: number,
    totalCols: number,
    features?: ColumnFeatures,
  ): void {
    if (!this.ctx || !this.compressor) return;
    const now = this.ctx.currentTime;

    const nonBlackCells = [...columnCells]
      .filter((c) => c.hasNonBlackPixel)
      .sort((a, b) => b.maxRgbIntensity - a.maxRgbIntensity);

    if (nonBlackCells.length === 0) {
      // Pure black column stays completely silent
      return;
    }

    const pulseCount = clamp(features?.rhythmDensity ?? 1, 1, 6);
    const panValue = computeStereoPan(colIndex, totalCols);

    const panner = this.ctx.createStereoPanner();
    panner.pan.setValueAtTime(panValue, now);
    panner.connect(this.compressor);

    const pulseSpacing = stepDurationSec / pulseCount;
    const pulseDur = clamp(pulseSpacing * 0.82, 0.05, 0.24);
    const pitchPool = nonBlackCells.slice(0, Math.max(1, Math.min(4, nonBlackCells.length)));

    for (let p = 0; p < pulseCount; p++) {
      const start = now + p * pulseSpacing;
      const cell = pitchPool[p % pitchPool.length];
      if (!cell || !cell.hasNonBlackPixel) continue;

      const amp = computeNightLightsCellGain(
        cell.maxRgbIntensity,
        cell.hasNonBlackPixel,
        1,
        pulseCount > 2 ? 2 : 1,
      );
      if (amp <= 0) continue;

      // Soft blended sine + triangle pentatonic voice
      const oscMain = this.ctx.createOscillator();
      const oscWarm = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const warmGain = this.ctx.createGain();

      oscMain.type = 'sine';
      oscMain.frequency.setValueAtTime(cell.frequency, start);

      oscWarm.type = 'triangle';
      oscWarm.frequency.setValueAtTime(cell.frequency, start);
      warmGain.gain.setValueAtTime(0.38, start);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(amp, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + pulseDur);

      oscMain.connect(gain);
      oscWarm.connect(warmGain);
      warmGain.connect(gain);
      gain.connect(panner);

      this.trackNode(oscMain, () => {
        oscMain.disconnect();
        gain.disconnect();
      });
      this.trackNode(oscWarm, () => {
        oscWarm.disconnect();
        warmGain.disconnect();
      });

      oscMain.start(start);
      oscWarm.start(start);
      oscMain.stop(start + pulseDur + 0.02);
      oscWarm.stop(start + pulseDur + 0.02);
    }
  }

  /**
   * Lightning personality:
   * - Detects pixels above brightness threshold
   * - Triggers synthesized percussive hit (noise burst click + pitched drum oscillator)
   * - Panned left-to-right by flash horizontal position; vertical position sets drum pitch
   */
  private playLightningColumn(
    colIndex: number,
    stepDurationSec: number,
    totalCols: number,
    features?: ColumnFeatures,
  ): void {
    if (!this.ctx || !this.compressor) return;
    const strikes = features?.lightningStrikes ?? [];
    if (strikes.length === 0) return;

    const now = this.ctx.currentTime;

    for (const strike of strikes) {
      const start = now + strike.subOffset * stepDurationSec;
      const panner = this.ctx.createStereoPanner();
      const pan = Number.isFinite(strike.pan)
        ? strike.pan
        : computeStereoPan(colIndex, totalCols);
      panner.pan.setValueAtTime(clamp(pan, -1, 1), start);
      panner.connect(this.compressor);

      const intensity = clamp(strike.intensity, 0.22, 1);
      const drumPitch = mapLightningRowToDrumPitch(strike.rowRatio);

      // 1. Crisp percussive click (bandpass-filtered noise burst)
      if (this.noiseBuffer) {
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1500 + (1 - strike.rowRatio) * 2400, start);
        filter.Q.setValueAtTime(1.8, start);

        const clickGain = this.ctx.createGain();
        const clickDur = 0.03 + intensity * 0.025;
        clickGain.gain.setValueAtTime(0.0001, start);
        clickGain.gain.linearRampToValueAtTime(0.34 * intensity, start + 0.003);
        clickGain.gain.exponentialRampToValueAtTime(0.0001, start + clickDur);

        noise.connect(filter);
        filter.connect(clickGain);
        clickGain.connect(panner);

        this.trackNode(noise, () => {
          noise.disconnect();
          filter.disconnect();
          clickGain.disconnect();
        });

        noise.start(start);
        noise.stop(start + clickDur + 0.01);
      }

      // 2. Synthesized pitched drum transient whose frequency follows vertical position
      const drumOsc = this.ctx.createOscillator();
      const drumGain = this.ctx.createGain();
      const drumDur = 0.085;

      drumOsc.type = 'triangle';
      drumOsc.frequency.setValueAtTime(drumPitch * 1.9, start);
      drumOsc.frequency.exponentialRampToValueAtTime(drumPitch * 0.65, start + drumDur);

      drumGain.gain.setValueAtTime(0.0001, start);
      drumGain.gain.linearRampToValueAtTime(0.4 * intensity, start + 0.004);
      drumGain.gain.exponentialRampToValueAtTime(0.0001, start + drumDur);

      drumOsc.connect(drumGain);
      drumGain.connect(panner);

      this.trackNode(drumOsc, () => {
        drumOsc.disconnect();
        drumGain.disconnect();
      });

      drumOsc.start(start);
      drumOsc.stop(start + drumDur + 0.015);
    }
  }

  /**
   * Forest Height personality:
   * - Color scale low-to-high mapped to pitch high-to-low (short forest = higher notes, tall forest = lower notes)
   * - Warm sustained pad: layered detuned oscillators with slow attack & release and a low-pass filter
   */
  private playForestHeightColumn(
    colIndex: number,
    stepDurationSec: number,
    totalCols: number,
    features?: ColumnFeatures,
  ): void {
    if (!this.ctx || !this.compressor) return;
    if (!features || features.forestCoverage < 0.025) return;

    const now = this.ctx.currentTime;
    const panValue = computeStereoPan(colIndex, totalCols);
    const panner = this.ctx.createStereoPanner();
    panner.pan.setValueAtTime(panValue, now);
    panner.connect(this.compressor);

    const padFilter = this.ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.setValueAtTime(
      920 - features.forestCanopyScale * 360,
      now,
    );
    padFilter.Q.setValueAtTime(0.8, now);
    padFilter.connect(panner);

    // Slow attack and slow release sustained pad envelope
    const attack = Math.max(0.14, Math.min(0.28, stepDurationSec * 0.55));
    const hold = Math.max(0.18, stepDurationSec * 0.85);
    const release = 0.42;
    const totalDur = attack + hold + release;
    const coverageGain = clamp(0.15 + features.forestCoverage * 0.28, 0.14, 0.38);

    // Layered detuned oscillators for rich warm pad texture
    const voices: Array<{ type: OscillatorType; freq: number; gainScale: number }> = [
      { type: 'sawtooth', freq: features.forestPitchHz * 0.994, gainScale: 0.24 },
      { type: 'triangle', freq: features.forestPitchHz, gainScale: 0.42 },
      { type: 'sawtooth', freq: features.forestPitchHz * 1.006, gainScale: 0.24 },
      { type: 'sine', freq: features.forestPitchHz * 0.5, gainScale: 0.22 },
    ];

    for (const v of voices) {
      const osc = this.ctx.createOscillator();
      const vGain = this.ctx.createGain();
      osc.type = v.type;
      osc.frequency.setValueAtTime(v.freq, now);

      const peak = coverageGain * v.gainScale;
      vGain.gain.setValueAtTime(0.0001, now);
      vGain.gain.linearRampToValueAtTime(peak, now + attack);
      vGain.gain.setValueAtTime(peak * 0.9, now + attack + hold);
      vGain.gain.exponentialRampToValueAtTime(0.0001, now + totalDur);

      osc.connect(vGain);
      vGain.connect(padFilter);

      this.trackNode(osc, () => {
        osc.disconnect();
        vGain.disconnect();
      });

      osc.start(now);
      osc.stop(now + totalDur + 0.04);
    }
  }

  private trackNode(
    node: AudioScheduledSourceNode,
    cleanup: () => void,
  ): void {
    this.activeNodes.add(node);
    node.onended = () => {
      this.activeNodes.delete(node);
      cleanup();
    };
  }

  public stopAll(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const node of this.activeNodes) {
      try {
        node.stop(now + 0.01);
      } catch {
        // Ignore already-stopped node
      }
    }
    this.activeNodes.clear();
  }

  public dispose(): void {
    this.stopAll();
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
      this.masterGain = null;
      this.compressor = null;
      this.noiseBuffer = null;
    }
  }
}
