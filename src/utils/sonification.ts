/**
 * Pure Earth-observation image analysis and sonification math for EarthEcho.
 * Decoupled from DOM, Vite asset imports, and Web Audio API so every calculation
 * can be deterministically unit-tested in Node.
 */

export const GRID_COLS = 16;
export const GRID_ROWS = 8;
export const DEFAULT_LIGHTNING_THRESHOLD = 0.55;
export const MIN_NON_BLACK_VOLUME = 0.06;

export type NoteWaveform = 'sine' | 'triangle';

export type SonificationMode =
  | 'night-lights'
  | 'lightning'
  | 'forest-height';

export interface PentatonicNote {
  note: string;
  freq: number;
}

/**
 * C major pentatonic scale mapped top-to-bottom across 8 rows.
 * Row 0 (top of image) = highest pitch (E5).
 * Row 7 (bottom of image) = lowest pitch (C4).
 */
export const C_MAJOR_PENTATONIC: readonly PentatonicNote[] = [
  { note: 'E5', freq: 659.25 },
  { note: 'D5', freq: 587.33 },
  { note: 'C5', freq: 523.25 },
  { note: 'A4', freq: 440.0 },
  { note: 'G4', freq: 392.0 },
  { note: 'E4', freq: 329.63 },
  { note: 'D4', freq: 293.66 },
  { note: 'C4', freq: 261.63 },
] as const;

/**
 * Forest Canopy scale: maps color scale (low canopy -> high canopy)
 * to pitch (high pitch -> low pitch) for a warm sustained pad.
 */
export const FOREST_CANOPY_NOTES: readonly PentatonicNote[] = [
  { note: 'C5', freq: 523.25 },
  { note: 'A4', freq: 440.0 },
  { note: 'G4', freq: 392.0 },
  { note: 'E4', freq: 329.63 },
  { note: 'D4', freq: 293.66 },
  { note: 'C4', freq: 261.63 },
  { note: 'A3', freq: 220.0 },
  { note: 'G3', freq: 196.0 },
  { note: 'E3', freq: 164.81 },
  { note: 'C3', freq: 130.81 },
] as const;

export interface GridCell {
  col: number;
  row: number;
  /** Normalized perceptual luminance from 0 (black) to 1 (white). */
  brightness: number;
  /** Mean max(R, G, B) / 255 across pixels in this cell (0..1). */
  maxRgbIntensity: number;
  /** True if at least one pixel in the cell has R > 0, G > 0, or B > 0. */
  hasNonBlackPixel: boolean;
  /** Warmth index (Red minus Blue normalized) from -1 (cool blue) to +1 (warm red). */
  warmth: number;
  /** Soft sine for cool cells (warmth <= 0), brighter triangle for warm cells (warmth > 0). */
  waveform: NoteWaveform;
  frequency: number;
  noteName: string;
  avgR: number;
  avgG: number;
  avgB: number;
}

export interface LightningStrike {
  /** Stereo pan (-1 left to +1 right) derived from exact pixel x position. */
  pan: number;
  /** Normalized horizontal fraction within the column (0..1) used for micro-timing. */
  subOffset: number;
  /** Normalized vertical fraction (0..1, top to bottom) controlling drum pitch. */
  rowRatio: number;
  /** Flash intensity above threshold (0..1). */
  intensity: number;
  /** X position normalized across entire image (0..1). */
  normX: number;
  /** Y position normalized across entire image (0..1). */
  normY: number;
}

export interface ColumnFeatures {
  col: number;
  /** Number of distinct bright clusters detected in this column (Night Lights). */
  brightClusterCount: number;
  /** Rhythm subdivisions per step (1..6) derived from brightClusterCount. */
  rhythmDensity: number;
  /** Mean max(R, G, B) intensity across active cells in the column (0..1). */
  nightIntensity: number;
  /** True if this column contains at least one non-black pixel. */
  hasAnyNonBlack: boolean;
  /** Threshold-detected lightning flash clicks in this column. */
  lightningStrikes: LightningStrike[];
  /** Total pixels above the lightning threshold inside this column. */
  lightningPixelCount: number;
  /** Estimated forest canopy scale (0 = low vegetation, 1 = tall rainforest). */
  forestCanopyScale: number;
  /** Fraction of pixels in this column classified as vegetation/forest (0..1). */
  forestCoverage: number;
  /** Forest pad pitch in Hz (high pitch for low canopy, low pitch for tall canopy). */
  forestPitchHz: number;
  /** Nearest note label for the forest pad pitch. */
  forestNoteName: string;
}

export interface SonificationGrid {
  cols: number;
  rows: number;
  lightningThreshold: number;
  /** Column-major matrix: cells[col][row] */
  cells: GridCell[][];
  /** Precomputed personality-specific column features. */
  columnFeatures: ColumnFeatures[];
}

export interface AnalyzeGridOptions {
  lightningThreshold?: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function computeLuminance(r: number, g: number, b: number): number {
  return clamp((0.299 * r + 0.587 * g + 0.114 * b) / 255, 0, 1);
}

/**
 * Computes color intensity as max(R, G, B) / 255 (used for Night Lights volume).
 */
export function computeMaxRgbIntensity(r: number, g: number, b: number): number {
  return clamp(Math.max(r, g, b) / 255, 0, 1);
}

/**
 * Classifies a pixel on the Forest Canopy Height color scale:
 * - Pale yellow-ochre / lime (low vegetation) -> canopyScale near 0.0
 * - Mid-green (medium forest) -> canopyScale near 0.5
 * - Deep rich emerald / dark teal (tall rainforest canopy) -> canopyScale near 1.0
 * - Pure black, dark slate ocean, or neutral grey -> isVegetation: false
 */
export function estimateForestCanopyPixel(
  r: number,
  g: number,
  b: number,
): { isVegetation: boolean; canopyScale: number } {
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  const chroma = maxC - minC;

  // Pure black or very dark neutral background
  if (maxC < 24) {
    return { isVegetation: false, canopyScale: 0 };
  }

  // Dark neutral slate oceans or Antarctica grey have low chroma and blue >= green
  if (chroma < 18 && b >= g - 4) {
    return { isVegetation: false, canopyScale: 0 };
  }
  if (b > g + 8 && r < 110) {
    return { isVegetation: false, canopyScale: 0 };
  }

  const greenOverRed = (g - r) / 255;
  const lum = computeLuminance(r, g, b);

  // Pale yellow-ochre / arid low scrub: high luminance, warm yellow-green (r & g high, b lower)
  if (r > 120 && g > 115 && r + g - 2 * b > 28) {
    const greenness = clamp((g - r + 40) / 110, 0, 1);
    const darkness = clamp(1 - lum, 0, 1);
    const scale = clamp(greenness * 0.55 + darkness * 0.35, 0.05, 0.78);
    return { isVegetation: true, canopyScale: scale };
  }

  // Deep green / teal canopy: green clearly exceeds red
  if (greenOverRed > 0.04 && g >= 38) {
    const darkness = clamp(1 - lum, 0, 1);
    const tealBoost = clamp((g - r) / 95, 0, 1);
    const scale = clamp(0.45 + darkness * 0.35 + tealBoost * 0.28, 0.45, 1);
    return { isVegetation: true, canopyScale: scale };
  }

  return { isVegetation: false, canopyScale: 0 };
}

/**
 * Maps forest canopy scale (0 = low canopy, 1 = high canopy)
 * inversely to pitch (high pitch -> low pitch).
 */
export function mapForestCanopyToPitch(canopyScale: number): PentatonicNote {
  const clamped = clamp(canopyScale, 0, 1);
  const idx = Math.min(
    FOREST_CANOPY_NOTES.length - 1,
    Math.floor(clamped * FOREST_CANOPY_NOTES.length),
  );
  return FOREST_CANOPY_NOTES[idx];
}

/**
 * Computes lightning drum frequency from normalized vertical position (0 = top, 1 = bottom).
 * Higher vertical position on the map produces a higher drum pitch; lower position produces a deeper pitch.
 */
export function mapLightningRowToDrumPitch(rowRatio: number): number {
  const clamped = clamp(rowRatio, 0, 1);
  return Math.round(110 + (1 - clamped) * 310);
}

/**
 * Splits an RGBA pixel buffer into a 16-column x 8-row grid and computes
 * max(R, G, B) intensity, luminance, warmth, and all preset personality metrics per column.
 */
export function analyzeImageGrid(
  pixels: Uint8ClampedArray | number[],
  width: number,
  height: number,
  cols: number = GRID_COLS,
  rows: number = GRID_ROWS,
  options: AnalyzeGridOptions = {},
): SonificationGrid {
  if (width <= 0 || height <= 0 || cols <= 0 || rows <= 0) {
    throw new Error('Image and grid dimensions must be positive.');
  }

  const lightningThreshold = clamp(
    options.lightningThreshold ?? DEFAULT_LIGHTNING_THRESHOLD,
    0.05,
    0.98,
  );

  const cells: GridCell[][] = [];
  const columnFeatures: ColumnFeatures[] = [];
  const NIGHT_PIXEL_THRESHOLD = 0.22;
  const SLICE_COUNT = 24; // Vertical sub-slices per column for Night Lights cluster detection

  for (let col = 0; col < cols; col++) {
    const colCells: GridCell[] = [];
    const xStart = Math.floor((col * width) / cols);
    const xEnd = Math.max(xStart + 1, Math.floor(((col + 1) * width) / cols));

    for (let row = 0; row < rows; row++) {
      const yStart = Math.floor((row * height) / rows);
      const yEnd = Math.max(yStart + 1, Math.floor(((row + 1) * height) / rows));

      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let sumMaxRgb = 0;
      let hasNonBlackPixel = false;
      let count = 0;

      for (let y = yStart; y < yEnd; y++) {
        const rowOffset = y * width;
        for (let x = xStart; x < xEnd; x++) {
          const idx = (rowOffset + x) * 4;
          const r = pixels[idx] ?? 0;
          const g = pixels[idx + 1] ?? 0;
          const b = pixels[idx + 2] ?? 0;
          sumR += r;
          sumG += g;
          sumB += b;
          sumMaxRgb += Math.max(r, g, b) / 255;
          if (r > 0 || g > 0 || b > 0) {
            hasNonBlackPixel = true;
          }
          count++;
        }
      }

      const safeCount = Math.max(1, count);
      const avgR = sumR / safeCount;
      const avgG = sumG / safeCount;
      const avgB = sumB / safeCount;

      const brightness = computeLuminance(avgR, avgG, avgB);
      const maxRgbIntensity = clamp(sumMaxRgb / safeCount, 0, 1);
      const warmth = clamp((avgR - avgB) / 255, -1, 1);

      const waveform: NoteWaveform = warmth > 0 ? 'triangle' : 'sine';
      const noteInfo = C_MAJOR_PENTATONIC[row % C_MAJOR_PENTATONIC.length];

      colCells.push({
        col,
        row,
        brightness,
        maxRgbIntensity,
        hasNonBlackPixel,
        warmth,
        waveform,
        frequency: noteInfo.freq,
        noteName: noteInfo.note,
        avgR,
        avgG,
        avgB,
      });
    }

    cells.push(colCells);

    // --- Personality 1: Night Lights cluster detection (24 vertical slices using max(R, G, B)) ---
    const sliceHasLight: boolean[] = [];
    let nightIntensitySum = 0;
    let nightBrightPixels = 0;

    for (let s = 0; s < SLICE_COUNT; s++) {
      const syStart = Math.floor((s * height) / SLICE_COUNT);
      const syEnd = Math.max(syStart + 1, Math.floor(((s + 1) * height) / SLICE_COUNT));
      let slicePeak = 0;
      let sliceBrightCount = 0;
      let sliceTotal = 0;

      for (let y = syStart; y < syEnd; y++) {
        const rowOffset = y * width;
        for (let x = xStart; x < xEnd; x++) {
          const idx = (rowOffset + x) * 4;
          const maxInt = computeMaxRgbIntensity(
            pixels[idx] ?? 0,
            pixels[idx + 1] ?? 0,
            pixels[idx + 2] ?? 0,
          );
          if (maxInt > slicePeak) slicePeak = maxInt;
          if (maxInt >= NIGHT_PIXEL_THRESHOLD) {
            sliceBrightCount++;
            nightIntensitySum += maxInt;
            nightBrightPixels++;
          }
          sliceTotal++;
        }
      }

      const active =
        slicePeak >= NIGHT_PIXEL_THRESHOLD + 0.08 ||
        sliceBrightCount / Math.max(1, sliceTotal) >= 0.025;
      sliceHasLight.push(active);
    }

    let brightClusterCount = 0;
    let inCluster = false;
    for (let s = 0; s < sliceHasLight.length; s++) {
      if (sliceHasLight[s] && !inCluster) {
        brightClusterCount++;
        inCluster = true;
      } else if (!sliceHasLight[s]) {
        inCluster = false;
      }
    }

    const rhythmDensity = clamp(
      brightClusterCount === 0 ? 1 : Math.min(6, brightClusterCount),
      1,
      6,
    );
    const hasAnyNonBlack = colCells.some((c) => c.hasNonBlackPixel);
    const colAvgMaxRgb =
      colCells.reduce((acc, c) => acc + c.maxRgbIntensity, 0) /
      Math.max(1, colCells.length);
    const nightIntensity = !hasAnyNonBlack
      ? 0
      : nightBrightPixels > 0
        ? clamp(
            (nightIntensitySum / nightBrightPixels) * 0.65 + colAvgMaxRgb * 0.35,
            MIN_NON_BLACK_VOLUME,
            1,
          )
        : clamp(colAvgMaxRgb, MIN_NON_BLACK_VOLUME, 1);

    // --- Personality 2: Lightning threshold strike detection ---
    const candidateStrikes: LightningStrike[] = [];
    let lightningPixelCount = 0;
    const colSpan = Math.max(1, xEnd - xStart);

    const microCols = Math.min(6, colSpan);
    const microRows = 12;
    for (let mc = 0; mc < microCols; mc++) {
      const mxStart = xStart + Math.floor((mc * colSpan) / microCols);
      const mxEnd = Math.max(
        mxStart + 1,
        xStart + Math.floor(((mc + 1) * colSpan) / microCols),
      );
      for (let mr = 0; mr < microRows; mr++) {
        const myStart = Math.floor((mr * height) / microRows);
        const myEnd = Math.max(
          myStart + 1,
          Math.floor(((mr + 1) * height) / microRows),
        );

        let peakIntensity = 0;
        let peakX = mxStart;
        let peakY = myStart;
        let hotCount = 0;

        for (let y = myStart; y < myEnd; y++) {
          const rowOffset = y * width;
          for (let x = mxStart; x < mxEnd; x++) {
            const idx = (rowOffset + x) * 4;
            const r = pixels[idx] ?? 0;
            const g = pixels[idx + 1] ?? 0;
            const b = pixels[idx + 2] ?? 0;
            const lum = computeLuminance(r, g, b);
            const maxChan = Math.max(r, g, b) / 255;
            const flashScore = lum * 0.65 + maxChan * 0.35;

            if (flashScore >= lightningThreshold) {
              lightningPixelCount++;
              hotCount++;
              if (flashScore > peakIntensity) {
                peakIntensity = flashScore;
                peakX = x;
                peakY = y;
              }
            }
          }
        }

        if (hotCount > 0) {
          const normX = width > 1 ? peakX / (width - 1) : 0.5;
          const normY = height > 1 ? peakY / (height - 1) : 0.5;
          const pan = clamp(normX * 2 - 1, -1, 1);
          const subOffset = clamp((peakX - xStart) / colSpan, 0, 0.85);
          const denom = Math.max(0.02, 1 - lightningThreshold);
          const intensity = clamp(
            (peakIntensity - lightningThreshold) / denom,
            0.2,
            1,
          );
          candidateStrikes.push({
            pan,
            subOffset,
            rowRatio: normY,
            intensity,
            normX,
            normY,
          });
        }
      }
    }

    const lightningStrikes = candidateStrikes
      .sort((a, b) => b.intensity - a.intensity)
      .slice(0, 7)
      .sort((a, b) => a.subOffset - b.subOffset);

    // --- Personality 3: Forest Height color scale -> canopy index ---
    let vegSum = 0;
    let vegCount = 0;
    let totalPixelsInCol = 0;

    for (let y = 0; y < height; y++) {
      const rowOffset = y * width;
      for (let x = xStart; x < xEnd; x++) {
        const idx = (rowOffset + x) * 4;
        const { isVegetation, canopyScale } = estimateForestCanopyPixel(
          pixels[idx] ?? 0,
          pixels[idx + 1] ?? 0,
          pixels[idx + 2] ?? 0,
        );
        if (isVegetation) {
          vegSum += canopyScale;
          vegCount++;
        }
        totalPixelsInCol++;
      }
    }

    const forestCoverage = vegCount / Math.max(1, totalPixelsInCol);
    const forestCanopyScale = vegCount > 0 ? clamp(vegSum / vegCount, 0, 1) : 0;
    const forestNote = mapForestCanopyToPitch(forestCanopyScale);

    columnFeatures.push({
      col,
      brightClusterCount,
      rhythmDensity,
      nightIntensity,
      hasAnyNonBlack,
      lightningStrikes,
      lightningPixelCount,
      forestCanopyScale,
      forestCoverage,
      forestPitchHz: forestNote.freq,
      forestNoteName: forestNote.note,
    });
  }

  return { cols, rows, lightningThreshold, cells, columnFeatures };
}

/**
 * Computes stereo pan from -1.0 (full left) to +1.0 (full right) across columns.
 */
export function computeStereoPan(col: number, totalCols: number = GRID_COLS): number {
  if (totalCols <= 1) return 0;
  const clampedCol = clamp(col, 0, totalCols - 1);
  return (clampedCol / (totalCols - 1)) * 2 - 1;
}

/**
 * Converts cell brightness and master volume into a safe per-oscillator gain,
 * scaling down gently when multiple notes sound simultaneously to avoid clipping.
 */
export function computeCellGain(
  brightness: number,
  masterVolume: number,
  activeNoteCount: number,
): number {
  const b = clamp(brightness, 0, 1);
  const vol = clamp(masterVolume, 0, 1);
  if (b < 0.03 || vol <= 0) return 0;

  const polyphonyDivisor = Math.max(2.2, Math.sqrt(Math.max(1, activeNoteCount)) * 1.35);
  const rawGain = (Math.pow(b, 1.25) * vol) / polyphonyDivisor;
  return clamp(rawGain, 0, 0.72);
}

/**
 * Computes Night Lights note volume from max(R, G, B) color intensity.
 * - Pure black cells (hasNonBlackPixel === false) stay completely silent (0).
 * - Any cell containing non-black pixels receives at least a small minimum volume.
 */
export function computeNightLightsCellGain(
  maxRgbIntensity: number,
  hasNonBlackPixel: boolean,
  masterVolume: number,
  activeNoteCount: number = 1,
): number {
  const vol = clamp(masterVolume, 0, 1);
  if (!hasNonBlackPixel || vol <= 0) return 0;

  const effectiveIntensity = Math.max(MIN_NON_BLACK_VOLUME, clamp(maxRgbIntensity, 0, 1));
  const polyphonyDivisor = Math.max(2.0, Math.sqrt(Math.max(1, activeNoteCount)) * 1.25);
  const rawGain = (Math.pow(effectiveIntensity, 1.05) * vol) / polyphonyDivisor;
  return clamp(rawGain, 0.025 * vol, 0.55);
}

export function formatPanLabel(pan: number): string {
  const pct = Math.round(Math.abs(pan) * 100);
  if (pct < 8) return 'Center';
  return pan < 0 ? `${pct}% Left` : `${pct}% Right`;
}

export interface ColumnSummary {
  colNumber: number;
  totalCols: number;
  sideLabel: 'Left' | 'Center-Left' | 'Center-Right' | 'Right';
  panLabel: string;
  avgBrightness: number;
  avgMaxRgb: number;
  avgWarmth: number;
  dominantWaveform: NoteWaveform | 'mixed';
  activeNotes: string[];
  description: string;
  brightClusterCount: number;
  rhythmDensity: number;
  lightningStrikeCount: number;
  forestCanopyScale: number;
  forestCoverage: number;
  forestPitchHz: number;
  forestNoteName: string;
}

/**
 * Generates an accessible plain-language description of what is currently heard
 * in a single column for the active dataset sound personality.
 */
export function describeColumnSonification(
  grid: SonificationGrid,
  colIndex: number,
  mode: SonificationMode = 'night-lights',
): ColumnSummary {
  const safeCol = clamp(colIndex, 0, grid.cols - 1);
  const column = grid.cells[safeCol];
  const feat = grid.columnFeatures[safeCol] ?? {
    col: safeCol,
    brightClusterCount: 0,
    rhythmDensity: 1,
    nightIntensity: 0,
    hasAnyNonBlack: false,
    lightningStrikes: [],
    lightningPixelCount: 0,
    forestCanopyScale: 0,
    forestCoverage: 0,
    forestPitchHz: 329.63,
    forestNoteName: 'E4',
  };

  const pan = computeStereoPan(safeCol, grid.cols);
  const panLabel = formatPanLabel(pan);

  const sideLabel: ColumnSummary['sideLabel'] =
    safeCol < grid.cols * 0.25
      ? 'Left'
      : safeCol < grid.cols * 0.5
        ? 'Center-Left'
        : safeCol < grid.cols * 0.75
          ? 'Center-Right'
          : 'Right';

  const nonBlackCells = column.filter((c) => c.hasNonBlackPixel);
  const sample = nonBlackCells.length > 0 ? nonBlackCells : column;

  let totalWeight = 0;
  let weightedWarmth = 0;
  let warmEnergy = 0;
  let coolEnergy = 0;

  for (const cell of sample) {
    const w = Math.max(0.01, Math.pow(cell.maxRgbIntensity, 1.2));
    totalWeight += w;
    weightedWarmth += cell.warmth * w;
    if (cell.waveform === 'triangle') warmEnergy += w;
    else coolEnergy += w;
  }

  const avgBrightness =
    sample.reduce((sum, cell) => sum + cell.brightness, 0) / sample.length;
  const avgMaxRgb =
    column.reduce((sum, cell) => sum + cell.maxRgbIntensity, 0) / column.length;
  const avgWarmth = weightedWarmth / Math.max(0.01, totalWeight);

  let dominantWaveform: ColumnSummary['dominantWaveform'] = 'mixed';
  if (warmEnergy > coolEnergy * 1.35) dominantWaveform = 'triangle';
  else if (coolEnergy > warmEnergy * 1.35) dominantWaveform = 'sine';

  const prominent = [...nonBlackCells]
    .sort((a, b) => b.maxRgbIntensity - a.maxRgbIntensity)
    .slice(0, 3)
    .sort((a, b) => a.row - b.row);

  const activeNotes = prominent.map((c) => c.noteName);
  const sideDirection =
    sideLabel === 'Left' || sideLabel === 'Center-Left' ? 'on the left' : 'on the right';

  let description: string;
  let finalActiveNotes = activeNotes;

  if (mode === 'night-lights') {
    const clusters = feat.brightClusterCount;
    const densityWord =
      clusters >= 4
        ? 'rapid rhythmic'
        : clusters >= 2
          ? 'steady multi-pulse'
          : 'gentle single-beat';

    if (!feat.hasAnyNonBlack) {
      finalActiveNotes = [];
      description = `Column ${safeCol + 1} of ${grid.cols} (${sideLabel}): Pure black region ${sideDirection} stays completely silent.`;
    } else if (clusters === 0) {
      const notesSuffix = activeNotes.length > 0 ? ` (${activeNotes.join(', ')})` : '';
      description = `Column ${safeCol + 1} of ${grid.cols} (${sideLabel}): Faint non-black glow ${sideDirection} plays a soft minimum-volume pentatonic pulse at ${Math.round(feat.nightIntensity * 100)}% max-RGB intensity${notesSuffix}.`;
    } else {
      const notesSuffix = activeNotes.length > 0 ? ` (${activeNotes.join(', ')})` : '';
      description = `Column ${safeCol + 1} of ${grid.cols} (${sideLabel}): ${clusters} bright city ${clusters === 1 ? 'cluster' : 'clusters'} drive ${densityWord} pentatonic pulses (${feat.rhythmDensity} notes per beat) at ${Math.round(feat.nightIntensity * 100)}% max-RGB volume${notesSuffix}.`;
    }
  } else if (mode === 'lightning') {
    finalActiveNotes = [];
    const strikes = feat.lightningStrikes.length;
    if (strikes === 0) {
      description = `Column ${safeCol + 1} of ${grid.cols} (${sideLabel}): No lightning flashes exceed the ${Math.round(grid.lightningThreshold * 100)}% threshold ${sideDirection}; quiet storm gap.`;
    } else {
      const avgStrikePan =
        feat.lightningStrikes.reduce((acc, s) => acc + s.pan, 0) / strikes;
      const avgStrikePitch = Math.round(
        feat.lightningStrikes.reduce(
          (acc, s) => acc + mapLightningRowToDrumPitch(s.rowRatio),
          0,
        ) / strikes,
      );
      description = `Column ${safeCol + 1} of ${grid.cols} (${sideLabel}): ${strikes} lightning ${strikes === 1 ? 'flash' : 'flashes'} above ${Math.round(grid.lightningThreshold * 100)}% threshold trigger percussive hits panned ${formatPanLabel(avgStrikePan)} (average drum pitch ${avgStrikePitch} Hz).`;
    }
  } else {
    // forest-height
    if (feat.forestCoverage < 0.03) {
      finalActiveNotes = [];
      description = `Column ${safeCol + 1} of ${grid.cols} (${sideLabel}): Open ocean or bare ground ${sideDirection} with minimal forest canopy; warm pad rests silently.`;
    } else {
      finalActiveNotes = [feat.forestNoteName];
      const canopyPct = Math.round(feat.forestCanopyScale * 100);
      const heightLabel =
        feat.forestCanopyScale >= 0.65
          ? 'tall dense rainforest canopy'
          : feat.forestCanopyScale >= 0.35
            ? 'mid-height woodland'
            : 'short forest and scrub';
      const pitchLabel =
        feat.forestCanopyScale >= 0.65
          ? 'lower, deep'
          : feat.forestCanopyScale >= 0.35
            ? 'mid-range'
            : 'higher';
      description = `Column ${safeCol + 1} of ${grid.cols} (${sideLabel}): ${heightLabel} (${canopyPct}% height scale, ${Math.round(feat.forestCoverage * 100)}% canopy cover) plays a ${pitchLabel} warm sustained pad at ${feat.forestNoteName} (${Math.round(feat.forestPitchHz)} Hz).`;
    }
  }

  return {
    colNumber: safeCol + 1,
    totalCols: grid.cols,
    sideLabel,
    panLabel,
    avgBrightness,
    avgMaxRgb,
    avgWarmth,
    dominantWaveform,
    activeNotes: finalActiveNotes,
    description,
    brightClusterCount: feat.brightClusterCount,
    rhythmDensity: feat.rhythmDensity,
    lightningStrikeCount: feat.lightningStrikes.length,
    forestCanopyScale: feat.forestCanopyScale,
    forestCoverage: feat.forestCoverage,
    forestPitchHz: feat.forestPitchHz,
    forestNoteName: feat.forestNoteName,
  };
}

/**
 * Generates an initial whole-image acoustic overview before playback begins.
 */
export function describeOverallImage(
  grid: SonificationGrid,
  mode: SonificationMode = 'night-lights',
): string {
  if (mode === 'night-lights') {
    const totalClusters = grid.columnFeatures.reduce(
      (sum, f) => sum + f.brightClusterCount,
      0,
    );
    const peakCol = grid.columnFeatures.reduce((best, cur) =>
      cur.brightClusterCount > best.brightClusterCount ? cur : best,
    );
    return `Night Lights mapped across ${grid.cols} columns: ${totalClusters} bright urban clusters detected overall, peaking at column ${peakCol.col + 1} (${peakCol.brightClusterCount} clusters). Max(R, G, B) color intensity sets volume while pure black stays silent.`;
  }

  if (mode === 'lightning') {
    const totalStrikes = grid.columnFeatures.reduce(
      (sum, f) => sum + f.lightningStrikes.length,
      0,
    );
    const activeCols = grid.columnFeatures.filter(
      (f) => f.lightningStrikes.length > 0,
    ).length;
    return `Lightning mapped at ${Math.round(grid.lightningThreshold * 100)}% threshold: ${totalStrikes} flash events detected across ${activeCols} of ${grid.cols} columns. Each flash triggers a percussive hit panned left-to-right with vertical height setting drum pitch.`;
  }

  const vegCols = grid.columnFeatures.filter((f) => f.forestCoverage >= 0.05);
  const avgScale =
    vegCols.length > 0
      ? vegCols.reduce((sum, f) => sum + f.forestCanopyScale, 0) / vegCols.length
      : 0;
  const deepestCol = vegCols.reduce(
    (best, cur) => (cur.forestCanopyScale > best.forestCanopyScale ? cur : best),
    vegCols[0] ?? grid.columnFeatures[0],
  );
  return `Forest Height mapped across ${grid.cols} columns: average canopy index ${Math.round(avgScale * 100)}%, deepest tall-forest tones near column ${deepestCol.col + 1} (${deepestCol.forestNoteName}). Short forest plays higher notes; tall forest plays lower warm pad notes.`;
}

export interface CompareSummary {
  brightnessDeltaPct: number;
  clustersA: number;
  clustersB: number;
  clustersDeltaPct: number;
  peakChangeSide: 'left' | 'center' | 'right';
  summaryLine: string;
}

/**
 * Computes a plain-language one-line summary of what changed between the 2012
 * and 2023 Night Lights images for Compare Mode.
 */
export function compareSonificationGrids(
  gridA: SonificationGrid,
  gridB: SonificationGrid,
  labelA: string = '2012',
  labelB: string = '2023',
): CompareSummary {
  const flatA = gridA.cells.flat();
  const flatB = gridB.cells.flat();

  // Compare illuminated max(R, G, B) intensity across non-black cells
  const intensitySumA = flatA.reduce(
    (s, c) => s + (c.hasNonBlackPixel ? c.maxRgbIntensity : 0),
    0,
  );
  const intensitySumB = flatB.reduce(
    (s, c) => s + (c.hasNonBlackPixel ? c.maxRgbIntensity : 0),
    0,
  );

  const brightnessDeltaPct =
    intensitySumA > 0.01
      ? Math.round(((intensitySumB - intensitySumA) / intensitySumA) * 100)
      : intensitySumB > 0.01
        ? 100
        : 0;

  const clustersA = gridA.columnFeatures.reduce(
    (s, f) => s + f.brightClusterCount,
    0,
  );
  const clustersB = gridB.columnFeatures.reduce(
    (s, f) => s + f.brightClusterCount,
    0,
  );
  const clustersDeltaPct =
    clustersA > 0
      ? Math.round(((clustersB - clustersA) / clustersA) * 100)
      : clustersB > 0
        ? 100
        : 0;

  // Locate which third of the map experienced the largest change
  const thirds = [0, 0, 0];
  for (let c = 0; c < Math.min(gridA.cols, gridB.cols); c++) {
    const bA =
      gridA.cells[c].reduce((s, cell) => s + cell.maxRgbIntensity, 0) /
      Math.max(1, gridA.rows);
    const bB =
      gridB.cells[c].reduce((s, cell) => s + cell.maxRgbIntensity, 0) /
      Math.max(1, gridB.rows);
    const diff = Math.abs(bB - bA);
    const bucket = c < 5 ? 0 : c < 11 ? 1 : 2;
    thirds[bucket] += diff;
  }
  const maxBucket = thirds.indexOf(Math.max(...thirds));
  const peakChangeSide: CompareSummary['peakChangeSide'] =
    maxBucket === 0 ? 'left' : maxBucket === 1 ? 'center' : 'right';

  const brightnessPhrase =
    brightnessDeltaPct > 1
      ? `is ${brightnessDeltaPct}% brighter overall`
      : brightnessDeltaPct < -1
        ? `is ${Math.abs(brightnessDeltaPct)}% dimmer overall`
        : 'has nearly the same overall brightness';

  const clusterPhrase =
    clustersB > clustersA
      ? `has more bright clusters (${clustersB} vs. ${clustersA})`
      : clustersB < clustersA
        ? `has fewer bright clusters (${clustersB} vs. ${clustersA})`
        : `has the same number of bright clusters (${clustersB})`;

  const summaryLine = `${labelB} ${brightnessPhrase} compared to ${labelA} and ${clusterPhrase}, mostly toward the ${peakChangeSide}.`;

  return {
    brightnessDeltaPct,
    clustersA,
    clustersB,
    clustersDeltaPct,
    peakChangeSide,
    summaryLine,
  };
}
