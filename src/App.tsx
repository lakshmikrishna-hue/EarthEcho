/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Contrast,
  Grid3x3,
  Image as ImageIcon,
  Pause,
  Play,
  SlidersHorizontal,
  Trash2,
  Type,
  Upload,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { HowItWorksSection } from './components/HowItWorksSection';
import { SonificationStage } from './components/SonificationStage';
import { EarthAudioEngine } from './utils/audioEngine';
import {
  DATASET_PRESETS,
  NASA_SVS_CREDIT,
  getPresetById,
} from './utils/presets';
import {
  DEFAULT_LIGHTNING_THRESHOLD,
  GRID_COLS,
  SonificationGrid,
  SonificationMode,
  clamp,
  compareSonificationGrids,
  describeColumnSonification,
  describeOverallImage,
} from './utils/sonification';

const MIN_SPEED = 1;
const MAX_SPEED = 12;

interface UploadedFrame {
  src: string;
  label: string;
}

type UploadSlotKey =
  | 'night-lights-2012'
  | 'night-lights-2023'
  | 'lightning'
  | 'forest-height';

const SAMPLE_FILES: Record<UploadSlotKey, { file: string; label: string }> = {
  'night-lights-2012': {
    file: 'night-2012.jpg',
    label: 'Sample frame (2012)',
  },
  'night-lights-2023': {
    file: 'night-2023.jpg',
    label: 'Sample frame (2023)',
  },
  lightning: {
    file: 'lightning.jpg',
    label: 'Sample frame',
  },
  'forest-height': {
    file: 'forest.jpg',
    label: 'Sample frame',
  },
};

function getSampleFrameUrl(filename: string): string {
  const base = import.meta.env.BASE_URL || '/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return `${normalizedBase}samples/${filename}`;
}

export default function App() {
  // Active dataset preset ('night-lights' | 'lightning' | 'forest-height')
  const [selectedPresetId, setSelectedPresetId] =
    useState<SonificationMode>('night-lights');

  // Uploaded Earth observation frames per preset slot (all start empty; no placeholders)
  const [nightLights2012, setNightLights2012] = useState<UploadedFrame | null>(null);
  const [nightLights2023, setNightLights2023] = useState<UploadedFrame | null>(null);
  const [nightLightsActiveYear, setNightLightsActiveYear] = useState<'2012' | '2023'>('2012');
  const [lightningFrame, setLightningFrame] = useState<UploadedFrame | null>(null);
  const [forestFrame, setForestFrame] = useState<UploadedFrame | null>(null);

  const [imageNotice, setImageNotice] = useState<string | null>(null);

  // Lightning brightness threshold slider (10%..95%, stored as 0.10..0.95)
  const [lightningThresholdPct, setLightningThresholdPct] = useState<number>(
    Math.round(DEFAULT_LIGHTNING_THRESHOLD * 100),
  );

  // Night Lights Compare Mode (plays 2012 cols 1..16, then 2023 cols 1..16)
  const [compareMode, setCompareMode] = useState<boolean>(false);
  const [compareActiveSlot, setCompareActiveSlot] = useState<0 | 1>(0);
  const [compareCompleted, setCompareCompleted] = useState<boolean>(false);

  // Analyzed grids
  const [singleGrid, setSingleGrid] = useState<SonificationGrid | null>(null);
  const [compareGrid2012, setCompareGrid2012] = useState<SonificationGrid | null>(null);
  const [compareGrid2023, setCompareGrid2023] = useState<SonificationGrid | null>(null);

  // Playback state
  const [currentCol, setCurrentCol] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [hasInteracted, setHasInteracted] = useState<boolean>(false);

  // Speed (1..12 col/s) and Volume (0..100%)
  const [speed, setSpeed] = useState<number>(4);
  const [volumePct, setVolumePct] = useState<number>(75);

  // Accessibility display modes
  const [highContrast, setHighContrast] = useState<boolean>(false);
  const [largeText, setLargeText] = useState<boolean>(false);
  const [showGridOverlay, setShowGridOverlay] = useState<boolean>(true);

  const audioEngineRef = useRef<EarthAudioEngine | null>(null);
  const uploadTargetSlotRef = useRef<UploadSlotKey>('night-lights-2012');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const slotUrlsRef = useRef<Record<UploadSlotKey, string | null>>({
    'night-lights-2012': null,
    'night-lights-2023': null,
    lightning: null,
    'forest-height': null,
  });

  const activePreset = useMemo(
    () => getPresetById(selectedPresetId),
    [selectedPresetId],
  );

  const isCompareActive = selectedPresetId === 'night-lights' && compareMode;
  const activeMode: SonificationMode = selectedPresetId;

  // Determine the single-stage frame for the active preset
  const activeSingleFrame: UploadedFrame | null = useMemo(() => {
    if (selectedPresetId === 'night-lights') {
      if (nightLightsActiveYear === '2012') {
        return nightLights2012 ?? nightLights2023;
      }
      return nightLights2023 ?? nightLights2012;
    }
    if (selectedPresetId === 'lightning') return lightningFrame;
    return forestFrame;
  }, [
    forestFrame,
    lightningFrame,
    nightLights2012,
    nightLights2023,
    nightLightsActiveYear,
    selectedPresetId,
  ]);

  const effectiveSingleNightYear: '2012' | '2023' = useMemo(() => {
    if (nightLightsActiveYear === '2012') {
      return !nightLights2012 && nightLights2023 ? '2023' : '2012';
    }
    return !nightLights2023 && nightLights2012 ? '2012' : '2023';
  }, [nightLights2012, nightLights2023, nightLightsActiveYear]);

  const canPlay = isCompareActive
    ? Boolean(nightLights2012 && nightLights2023 && compareGrid2012 && compareGrid2023)
    : Boolean(activeSingleFrame && singleGrid);

  const activeGrid: SonificationGrid | null = isCompareActive
    ? compareActiveSlot === 0
      ? compareGrid2012
      : compareGrid2023
    : singleGrid;

  const getAudioEngine = useCallback(() => {
    if (!audioEngineRef.current) {
      audioEngineRef.current = new EarthAudioEngine();
    }
    return audioEngineRef.current;
  }, []);

  // Sync accessibility classes onto <html>
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('high-contrast', highContrast);
    root.classList.toggle('large-text', largeText);
  }, [highContrast, largeText]);

  // Cleanup audio engine and object URLs on unmount
  useEffect(() => {
    const urls = slotUrlsRef.current;
    return () => {
      (Object.keys(urls) as UploadSlotKey[]).forEach((key) => {
        if (urls[key]) URL.revokeObjectURL(urls[key]!);
      });
      audioEngineRef.current?.dispose();
    };
  }, []);

  // Update master gain when volume slider moves
  useEffect(() => {
    audioEngineRef.current?.setMasterVolume(volumePct / 100);
  }, [volumePct]);

  const playColumnForGrid = useCallback(
    (
      targetGrid: SonificationGrid | null,
      colIndex: number,
      stepSpeed: number,
      volPct: number,
      mode: SonificationMode,
    ) => {
      if (!targetGrid || !targetGrid.cells[colIndex]) return;
      const engine = getAudioEngine();
      engine.playColumn(
        targetGrid.cells[colIndex],
        colIndex,
        1 / stepSpeed,
        volPct / 100,
        targetGrid.cols,
        mode,
        targetGrid.columnFeatures[colIndex],
      );
    },
    [getAudioEngine],
  );

  // Play or pause strictly from user gesture, and never play sound if no image is uploaded
  const togglePlayPause = useCallback(async () => {
    if (isPlaying) {
      setIsPlaying(false);
      audioEngineRef.current?.stopAll();
      return;
    }

    if (!canPlay) {
      return;
    }

    const engine = getAudioEngine();
    await engine.ensureReady(volumePct / 100);
    setHasInteracted(true);

    if (isCompareActive) {
      // Starting or resuming comparison playback; if previously completed, restart from 2012 col 0
      if (compareCompleted) {
        setCompareCompleted(false);
        setCompareActiveSlot(0);
        setCurrentCol(0);
        setIsPlaying(true);
        playColumnForGrid(compareGrid2012, 0, speed, volumePct, 'night-lights');
        return;
      }
    }

    setIsPlaying(true);
    playColumnForGrid(activeGrid, currentCol, speed, volumePct, activeMode);
  }, [
    activeGrid,
    activeMode,
    canPlay,
    compareCompleted,
    compareGrid2012,
    currentCol,
    getAudioEngine,
    isCompareActive,
    isPlaying,
    playColumnForGrid,
    speed,
    volumePct,
  ]);

  // Scanning loop synchronized with Web Audio playback
  useEffect(() => {
    if (!isPlaying) return;
    if (isCompareActive && (!compareGrid2012 || !compareGrid2023)) return;
    if (!isCompareActive && !singleGrid) return;

    const intervalMs = Math.round(1000 / speed);
    const timerId = window.setInterval(() => {
      if (!isCompareActive && singleGrid) {
        setCurrentCol((prev) => {
          const nextCol = (prev + 1) % singleGrid.cols;
          playColumnForGrid(singleGrid, nextCol, speed, volumePct, activeMode);
          return nextCol;
        });
        return;
      }

      if (isCompareActive && compareGrid2012 && compareGrid2023) {
        const currentStageGrid =
          compareActiveSlot === 0 ? compareGrid2012 : compareGrid2023;
        const nextCol = currentCol + 1;

        if (nextCol < currentStageGrid.cols) {
          setCurrentCol(nextCol);
          playColumnForGrid(
            currentStageGrid,
            nextCol,
            speed,
            volumePct,
            'night-lights',
          );
        } else if (compareActiveSlot === 0) {
          // 2012 finished column 16 -> transition seamlessly to 2023 column 1
          setCompareActiveSlot(1);
          setCurrentCol(0);
          playColumnForGrid(compareGrid2023, 0, speed, volumePct, 'night-lights');
        } else {
          // 2023 finished column 16 -> complete comparison playback and show summary
          setIsPlaying(false);
          setCompareCompleted(true);
          setCompareActiveSlot(0);
          setCurrentCol(0);
        }
      }
    }, intervalMs);

    return () => window.clearInterval(timerId);
  }, [
    activeMode,
    compareActiveSlot,
    compareGrid2012,
    compareGrid2023,
    currentCol,
    isCompareActive,
    isPlaying,
    playColumnForGrid,
    singleGrid,
    speed,
    volumePct,
  ]);

  // Global keyboard shortcuts: Space = Play/Pause, Arrow keys = Speed
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName ?? '';

      if (e.code === 'Space') {
        if (
          tag === 'BUTTON' ||
          tag === 'A' ||
          tag === 'SELECT' ||
          (tag === 'INPUT' && (target as HTMLInputElement).type === 'file')
        ) {
          return;
        }
        e.preventDefault();
        void togglePlayPause();
        return;
      }

      if (
        e.key === 'ArrowRight' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown'
      ) {
        if (tag === 'INPUT' && (target as HTMLInputElement).type === 'range') {
          return;
        }
        e.preventDefault();
        const delta = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : -1;
        setSpeed((prev) => clamp(prev + delta, MIN_SPEED, MAX_SPEED));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlayPause]);

  const stopPlaybackAndResetCol = useCallback(() => {
    setIsPlaying(false);
    audioEngineRef.current?.stopAll();
    setCurrentCol(0);
    setCompareActiveSlot(0);
    setCompareCompleted(false);
  }, []);

  const handleSelectPreset = (presetId: SonificationMode) => {
    stopPlaybackAndResetCol();
    setSelectedPresetId(presetId);
    if (presetId !== 'night-lights') {
      setCompareMode(false);
    }
    setSingleGrid(null);
    setImageNotice(null);
  };

  const handleToggleCompareMode = () => {
    stopPlaybackAndResetCol();
    setSelectedPresetId('night-lights');
    setCompareMode((prev) => !prev);
    setImageNotice(null);
  };

  const openUploadDialogForSlot = (slot: UploadSlotKey) => {
    uploadTargetSlotRef.current = slot;
    fileInputRef.current?.click();
  };

  // Handle user-uploaded Earth observation image files cleanly in memory
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setImageNotice('Please select a valid image file (PNG, JPG, WebP, or GIF).');
      e.target.value = '';
      return;
    }

    const slot = uploadTargetSlotRef.current;
    const prevUrl = slotUrlsRef.current[slot];
    if (prevUrl) {
      URL.revokeObjectURL(prevUrl);
    }

    const nextUrl = URL.createObjectURL(file);
    slotUrlsRef.current[slot] = nextUrl;

    const frame: UploadedFrame = {
      src: nextUrl,
      label: file.name.replace(/\.[^.]+$/, ''),
    };

    stopPlaybackAndResetCol();
    setImageNotice(null);

    if (slot === 'night-lights-2012') {
      setNightLights2012(frame);
      setNightLightsActiveYear('2012');
    } else if (slot === 'night-lights-2023') {
      setNightLights2023(frame);
      setNightLightsActiveYear('2023');
    } else if (slot === 'lightning') {
      setLightningFrame(frame);
    } else {
      setForestFrame(frame);
    }

    e.target.value = '';
  };

  const handleLoadSample = (slot: UploadSlotKey) => {
    const prevUrl = slotUrlsRef.current[slot];
    if (prevUrl) {
      URL.revokeObjectURL(prevUrl);
      slotUrlsRef.current[slot] = null;
    }

    const sample = SAMPLE_FILES[slot];
    const frame: UploadedFrame = {
      src: getSampleFrameUrl(sample.file),
      label: sample.label,
    };

    stopPlaybackAndResetCol();
    setImageNotice(null);

    if (slot === 'night-lights-2012') {
      setNightLights2012(frame);
      setNightLightsActiveYear('2012');
    } else if (slot === 'night-lights-2023') {
      setNightLights2023(frame);
      setNightLightsActiveYear('2023');
    } else if (slot === 'lightning') {
      setLightningFrame(frame);
    } else {
      setForestFrame(frame);
    }
  };

  const handleClearSlot = (slot: UploadSlotKey) => {
    const prevUrl = slotUrlsRef.current[slot];
    if (prevUrl) {
      URL.revokeObjectURL(prevUrl);
      slotUrlsRef.current[slot] = null;
    }

    stopPlaybackAndResetCol();
    setImageNotice(null);

    if (slot === 'night-lights-2012') {
      setNightLights2012(null);
      setCompareGrid2012(null);
      if (nightLightsActiveYear === '2012') setSingleGrid(null);
    } else if (slot === 'night-lights-2023') {
      setNightLights2023(null);
      setCompareGrid2023(null);
      if (nightLightsActiveYear === '2023') setSingleGrid(null);
    } else if (slot === 'lightning') {
      setLightningFrame(null);
      setSingleGrid(null);
    } else {
      setForestFrame(null);
      setSingleGrid(null);
    }
  };

  const handleSelectSingleColumn = useCallback(
    async (col: number) => {
      if (!singleGrid) return;
      const clampedCol = clamp(col, 0, GRID_COLS - 1);
      setCurrentCol(clampedCol);

      const engine = getAudioEngine();
      await engine.ensureReady(volumePct / 100);
      setHasInteracted(true);
      playColumnForGrid(singleGrid, clampedCol, speed, volumePct, activeMode);
    },
    [activeMode, getAudioEngine, playColumnForGrid, singleGrid, speed, volumePct],
  );

  const handleSelectCompareColumn = useCallback(
    async (slot: 0 | 1, col: number) => {
      const targetGrid = slot === 0 ? compareGrid2012 : compareGrid2023;
      if (!targetGrid) return;

      const clampedCol = clamp(col, 0, GRID_COLS - 1);
      setCompareActiveSlot(slot);
      setCurrentCol(clampedCol);

      const engine = getAudioEngine();
      await engine.ensureReady(volumePct / 100);
      setHasInteracted(true);
      playColumnForGrid(targetGrid, clampedCol, speed, volumePct, 'night-lights');
    },
    [
      compareGrid2012,
      compareGrid2023,
      getAudioEngine,
      playColumnForGrid,
      speed,
      volumePct,
    ],
  );

  const handleImageError = useCallback((message: string) => {
    setImageNotice(message);
  }, []);

  const columnSummary = useMemo(() => {
    if (!activeGrid) return null;
    return describeColumnSonification(activeGrid, currentCol, activeMode);
  }, [activeGrid, activeMode, currentCol]);

  const overallOverview = useMemo(() => {
    if (!activeGrid) {
      if (isCompareActive) {
        return 'Upload both 2012 and 2023 Night Lights NASA SVS frames to run a back-to-back comparison.';
      }
      return 'Upload a NASA SVS frame to start sonification.';
    }
    return describeOverallImage(activeGrid, activeMode);
  }, [activeGrid, activeMode, isCompareActive]);

  const compareSummary = useMemo(() => {
    if (!isCompareActive || !compareGrid2012 || !compareGrid2023) return null;
    return compareSonificationGrids(
      compareGrid2012,
      compareGrid2023,
      '2012',
      '2023',
    );
  }, [compareGrid2012, compareGrid2023, isCompareActive]);

  const liveDescriptionText = useMemo(() => {
    if (!activeGrid) {
      return overallOverview;
    }

    const baseText =
      isPlaying || hasInteracted
        ? (columnSummary?.description ?? overallOverview)
        : overallOverview;

    if (!isCompareActive) {
      if (selectedPresetId === 'night-lights' && activeSingleFrame) {
        return `[Night Lights ${effectiveSingleNightYear}] ${baseText}`;
      }
      return baseText;
    }

    const yearLabel = compareActiveSlot === 0 ? '2012' : '2023';
    if (compareCompleted && compareSummary) {
      return `Comparison playback complete. ${compareSummary.summaryLine}`;
    }
    return `[Now playing: ${yearLabel} (${compareActiveSlot + 1} of 2)] ${baseText}`;
  }, [
    activeGrid,
    activeSingleFrame,
    columnSummary,
    compareActiveSlot,
    compareCompleted,
    compareSummary,
    effectiveSingleNightYear,
    hasInteracted,
    isCompareActive,
    isPlaying,
    overallOverview,
    selectedPresetId,
  ]);

  // Personality-specific telemetry summary labels
  const telemetryMetricSummary = useMemo(() => {
    if (!columnSummary) {
      return {
        label1:
          activeMode === 'night-lights'
            ? 'Intensity (Max RGB)'
            : activeMode === 'lightning'
              ? 'Threshold Flashes'
              : 'Canopy Scale',
        value1: '--',
        label2:
          activeMode === 'night-lights'
            ? 'Clusters · Rhythm'
            : activeMode === 'lightning'
              ? 'Column Pan'
              : 'Pad Pitch',
        value2: '--',
        stripLabel: 'Mapping',
        stripValue: 'Waiting for frame',
      };
    }

    if (activeMode === 'night-lights') {
      return {
        label1: 'Intensity (Max RGB)',
        value1: `${Math.round(columnSummary.avgMaxRgb * 100)}%`,
        label2: 'Clusters · Rhythm',
        value2: `${columnSummary.brightClusterCount} · ${columnSummary.rhythmDensity}×`,
        stripLabel: 'Clusters / Pulse',
        stripValue: `${columnSummary.brightClusterCount} (${columnSummary.rhythmDensity} notes/beat)`,
      };
    }

    if (activeMode === 'lightning') {
      return {
        label1: 'Threshold Flashes',
        value1: `${columnSummary.lightningStrikeCount}`,
        label2: 'Column Pan',
        value2: columnSummary.panLabel,
        stripLabel: 'Percussion',
        stripValue:
          columnSummary.lightningStrikeCount > 0
            ? `${columnSummary.lightningStrikeCount} ${columnSummary.lightningStrikeCount === 1 ? 'hit' : 'hits'}`
            : 'Quiet',
      };
    }

    return {
      label1: 'Canopy Scale',
      value1:
        columnSummary.forestCoverage >= 0.025
          ? `${Math.round(columnSummary.forestCanopyScale * 100)}%`
          : 'Ocean / Bare',
      label2: 'Pad Pitch',
      value2:
        columnSummary.forestCoverage >= 0.025
          ? `${columnSummary.forestNoteName} (${Math.round(columnSummary.forestPitchHz)} Hz)`
          : 'Silent',
      stripLabel: 'Canopy Pad',
      stripValue:
        columnSummary.forestCoverage >= 0.025
          ? `${columnSummary.forestNoteName} · ${Math.round(columnSummary.forestPitchHz)} Hz`
          : 'Quiet',
    };
  }, [activeMode, columnSummary]);

  const comparePlayingLabel =
    compareActiveSlot === 0 ? 'Now playing: 2012' : 'Now playing: 2023';

  return (
    <div
      className="min-h-screen flex flex-col overflow-x-hidden"
      style={{
        backgroundColor: 'var(--bg-canvas)',
        color: 'var(--text-primary)',
      }}
      data-playing={isPlaying ? 'true' : 'false'}
      data-mode={activeMode}
      data-compare={isCompareActive ? 'true' : 'false'}
      data-compare-completed={compareCompleted ? 'true' : 'false'}
      data-high-contrast={highContrast ? 'true' : 'false'}
      data-large-text={largeText ? 'true' : 'false'}
    >
      {/* Skip Link for Keyboard & Screen Reader Users */}
      <a
        href="#main-workspace"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:rounded-md focus:font-semibold"
        style={{
          backgroundColor: 'var(--accent-primary)',
          color: 'var(--accent-primary-text)',
        }}
      >
        Skip to EarthEcho controls
      </a>

      {/* Top Bar: Clean 3-Zone Layout */}
      <header
        className="w-full"
        style={{
          borderBottom: `${highContrast ? '2px' : '1px'} solid var(--border-hairline)`,
          backgroundColor: 'var(--bg-surface)',
        }}
      >
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4 sm:gap-8">
          <div className="flex items-center gap-4 min-w-0">
            <h1 className="text-lg sm:text-xl font-semibold tracking-tight whitespace-nowrap shrink-0">
              EarthEcho
            </h1>
          </div>

          <nav
            aria-label="Primary sections"
            className="hidden md:flex items-center gap-6 text-sm"
            style={{ color: 'var(--text-secondary)' }}
          >
            <a
              href="#main-workspace"
              className="hover:underline whitespace-nowrap shrink-0"
              style={{ color: 'var(--text-primary)' }}
            >
              Sonification Stage
            </a>
            <a
              href="#how-it-works"
              className="hover:underline whitespace-nowrap shrink-0"
              style={{ color: 'var(--text-primary)' }}
            >
              How It Works
            </a>
          </nav>

          <div
            className="flex items-center gap-2.5 shrink-0"
            role="group"
            aria-label="Display accessibility settings"
          >
            <button
              type="button"
              onClick={() => setHighContrast((prev) => !prev)}
              aria-pressed={highContrast}
              aria-label="Toggle high-contrast mode"
              className="inline-flex items-center gap-2 min-h-[44px] px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              style={{
                backgroundColor: highContrast
                  ? 'var(--accent-primary)'
                  : 'var(--bg-surface-elevated)',
                color: highContrast
                  ? 'var(--accent-primary-text)'
                  : 'var(--text-primary)',
                border: `${highContrast ? '2px' : '1px'} solid ${
                  highContrast ? 'var(--accent-primary)' : 'var(--border-hairline)'
                }`,
              }}
            >
              <Contrast className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>High Contrast</span>
            </button>

            <button
              type="button"
              onClick={() => setLargeText((prev) => !prev)}
              aria-pressed={largeText}
              aria-label="Toggle large-text mode"
              className="inline-flex items-center gap-2 min-h-[44px] px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              style={{
                backgroundColor: largeText
                  ? 'var(--accent-primary)'
                  : 'var(--bg-surface-elevated)',
                color: largeText
                  ? 'var(--accent-primary-text)'
                  : 'var(--text-primary)',
                border: `${highContrast ? '2px' : '1px'} solid ${
                  largeText ? 'var(--accent-primary)' : 'var(--border-hairline)'
                }`,
              }}
            >
              <Type className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Large Text</span>
            </button>
          </div>
        </div>
      </header>

      {/* Hidden shared file input driven by accessible upload buttons */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileUpload}
        tabIndex={-1}
        aria-hidden="true"
        className="hidden"
      />

      {/* Main Split Scientific Console */}
      <main
        id="main-workspace"
        className="flex-1 w-full max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-4 lg:py-5 flex flex-col gap-5"
      >
        {/* 3 Dataset Presets Selector & Workspace Controls Bar */}
        <section
          aria-label="Dataset presets and upload controls"
          className="flex flex-wrap items-center justify-between gap-3 pb-4"
          style={{
            borderBottom: `${highContrast ? '2px' : '1px'} solid var(--border-hairline)`,
          }}
        >
          <div
            role="group"
            aria-label="Dataset preset selector"
            className="flex flex-wrap items-center gap-2"
          >
            {DATASET_PRESETS.map((preset) => {
              const isSelected = selectedPresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectPreset(preset.id)}
                  aria-pressed={isSelected}
                  aria-label={`Select ${preset.shortLabel} preset (${preset.datasetName})`}
                  className="inline-flex items-center min-h-[44px] px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  style={{
                    backgroundColor: isSelected
                      ? 'var(--accent-primary)'
                      : 'var(--bg-surface)',
                    color: isSelected
                      ? 'var(--accent-primary-text)'
                      : 'var(--text-primary)',
                    border: `${highContrast ? '2px' : '1px'} solid ${
                      isSelected ? 'var(--accent-primary)' : 'var(--border-hairline)'
                    }`,
                  }}
                >
                  {preset.shortLabel}
                </button>
              );
            })}
          </div>

          {/* Preset-specific Upload Slots + Night Lights Compare Toggle + Grid Toggle */}
          <div className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">
            {selectedPresetId === 'night-lights' ? (
              <>
                <button
                  type="button"
                  onClick={() => openUploadDialogForSlot('night-lights-2012')}
                  aria-label="Upload 2012 image for Night Lights"
                  className="inline-flex items-center gap-2 min-h-[44px] px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    border: `${highContrast ? '2px' : '1px'} solid ${
                      nightLights2012 ? 'var(--accent-primary)' : 'var(--border-hairline)'
                    }`,
                  }}
                >
                  <Upload className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{nightLights2012 ? 'Replace 2012' : 'Upload 2012'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => openUploadDialogForSlot('night-lights-2023')}
                  aria-label="Upload 2023 image for Night Lights"
                  className="inline-flex items-center gap-2 min-h-[44px] px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    border: `${highContrast ? '2px' : '1px'} solid ${
                      nightLights2023 ? 'var(--accent-primary)' : 'var(--border-hairline)'
                    }`,
                  }}
                >
                  <Upload className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{nightLights2023 ? 'Replace 2023' : 'Upload 2023'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleLoadSample('night-lights-2012')}
                  aria-label="Try 2012 sample frame for Night Lights"
                  className="inline-flex items-center gap-2 min-h-[44px] px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--accent-primary)',
                    border: `${highContrast ? '2px' : '1px'} solid var(--border-hairline)`,
                  }}
                >
                  <ImageIcon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>Try 2012 sample</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleLoadSample('night-lights-2023')}
                  aria-label="Try 2023 sample frame for Night Lights"
                  className="inline-flex items-center gap-2 min-h-[44px] px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--accent-primary)',
                    border: `${highContrast ? '2px' : '1px'} solid var(--border-hairline)`,
                  }}
                >
                  <ImageIcon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>Try 2023 sample</span>
                </button>

                <button
                  type="button"
                  onClick={handleToggleCompareMode}
                  aria-pressed={compareMode}
                  aria-label="Toggle Compare mode for Night Lights 2012 and 2023"
                  className="inline-flex items-center gap-2 min-h-[44px] px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  style={{
                    backgroundColor: compareMode
                      ? 'var(--accent-primary)'
                      : 'var(--bg-surface-elevated)',
                    color: compareMode
                      ? 'var(--accent-primary-text)'
                      : 'var(--text-primary)',
                    border: `${highContrast ? '2px' : '1px'} solid ${
                      compareMode ? 'var(--accent-primary)' : 'var(--border-strong)'
                    }`,
                  }}
                >
                  <ArrowLeftRight className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>Compare</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() =>
                    openUploadDialogForSlot(
                      selectedPresetId === 'lightning' ? 'lightning' : 'forest-height',
                    )
                  }
                  aria-label={`Upload image for ${activePreset.shortLabel}`}
                  className="inline-flex items-center gap-2 min-h-[44px] px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    border: `${highContrast ? '2px' : '1px'} solid var(--border-hairline)`,
                  }}
                >
                  <Upload className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{activeSingleFrame ? 'Replace image' : 'Upload image'}</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleLoadSample(
                      selectedPresetId === 'lightning' ? 'lightning' : 'forest-height',
                    )
                  }
                  aria-label={`Try a sample frame for ${activePreset.shortLabel}`}
                  className="inline-flex items-center gap-2 min-h-[44px] px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--accent-primary)',
                    border: `${highContrast ? '2px' : '1px'} solid var(--border-hairline)`,
                  }}
                >
                  <ImageIcon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>Try a sample frame</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => setShowGridOverlay((prev) => !prev)}
              aria-pressed={showGridOverlay}
              aria-label="Toggle 16 by 8 grid overlay"
              className="inline-flex items-center gap-2 min-h-[44px] px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              style={{
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                border: `${highContrast ? '2px' : '1px'} solid var(--border-hairline)`,
              }}
            >
              <Grid3x3 className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>16×8 Grid</span>
            </button>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-7 items-start">
          {/* Left Stage: Dataset About + Visualization Stage(s) + Telemetry */}
          <section
            aria-labelledby="stage-heading"
            className="lg:col-span-8 flex flex-col gap-4"
          >
            {/* Dataset Name, Sound Personality & About This Dataset */}
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2
                  id="stage-heading"
                  className="text-base sm:text-lg font-semibold tracking-tight"
                >
                  {activePreset.datasetName}
                </h2>
                <div
                  className="flex flex-wrap items-center gap-2 text-xs sm:text-sm"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <span>{activePreset.credit}</span>
                  <span aria-hidden="true">·</span>
                  <span style={{ color: 'var(--accent-primary)' }}>
                    Sound: {activePreset.soundPersonality}
                  </span>
                </div>
              </div>

              <div
                data-testid="about-dataset"
                className="p-3.5 rounded-lg text-sm leading-relaxed"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: `${highContrast ? '2px' : '1px'} solid var(--border-hairline)`,
                  color: 'var(--text-secondary)',
                }}
              >
                <strong style={{ color: 'var(--text-primary)' }}>
                  About this dataset:{' '}
                </strong>
                <span>{activePreset.about}</span>
              </div>
            </div>

            {imageNotice && (
              <p
                role="alert"
                className="px-3.5 py-2.5 rounded-lg text-sm"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: `1px solid var(--accent-warm)`,
                  color: 'var(--text-primary)',
                }}
              >
                {imageNotice}
              </p>
            )}

            {/* Night Lights single-mode slot switcher (when both or either uploaded) */}
            {selectedPresetId === 'night-lights' && !isCompareActive && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div
                  role="group"
                  aria-label="Night Lights active frame slot"
                  className="flex items-center gap-2"
                >
                  {(['2012', '2023'] as const).map((yr) => {
                    const frame = yr === '2012' ? nightLights2012 : nightLights2023;
                    const active = effectiveSingleNightYear === yr;
                    return (
                      <button
                        key={yr}
                        type="button"
                        onClick={() => {
                          stopPlaybackAndResetCol();
                          setNightLightsActiveYear(yr);
                        }}
                        aria-pressed={active}
                        aria-label={`View Night Lights ${yr} slot`}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium cursor-pointer transition-colors"
                        style={{
                          backgroundColor: active
                            ? 'var(--bg-surface-elevated)'
                            : 'var(--bg-surface)',
                          color: active
                            ? 'var(--accent-primary)'
                            : 'var(--text-secondary)',
                          border: `${highContrast ? '2px' : '1px'} solid ${
                            active ? 'var(--accent-primary)' : 'var(--border-hairline)'
                          }`,
                        }}
                      >
                        {yr} Slot {frame ? `· ${frame.label}` : '· Empty'}
                      </button>
                    );
                  })}
                </div>

                {activeSingleFrame && (
                  <button
                    type="button"
                    onClick={() =>
                      handleClearSlot(
                        effectiveSingleNightYear === '2012'
                          ? 'night-lights-2012'
                          : 'night-lights-2023',
                      )
                    }
                    aria-label={`Remove ${effectiveSingleNightYear} image`}
                    className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--text-secondary)',
                      border: `1px solid var(--border-hairline)`,
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Clear {effectiveSingleNightYear}</span>
                  </button>
                )}
              </div>
            )}

            {/* Clear button for Lightning or Forest Height when uploaded */}
            {selectedPresetId !== 'night-lights' && activeSingleFrame && (
              <div className="flex items-center justify-between gap-2">
                <span
                  className="text-xs sm:text-sm"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Loaded frame:{' '}
                  <strong style={{ color: 'var(--text-primary)' }}>
                    {activeSingleFrame.label}
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    handleClearSlot(
                      selectedPresetId === 'lightning' ? 'lightning' : 'forest-height',
                    )
                  }
                  aria-label={`Remove ${activePreset.shortLabel} image`}
                  className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1 rounded-lg text-xs font-medium cursor-pointer"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-secondary)',
                    border: `1px solid var(--border-hairline)`,
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Clear image</span>
                </button>
              </div>
            )}

            {/* Single Preset Stage OR Night Lights Compare Mode Dual Stages */}
            {!isCompareActive ? (
              <SonificationStage
                imageSrc={activeSingleFrame?.src ?? null}
                imageLabel={
                  selectedPresetId === 'night-lights'
                    ? `${effectiveSingleNightYear}${activeSingleFrame ? ` · ${activeSingleFrame.label}` : ''}`
                    : activeSingleFrame?.label ?? activePreset.shortLabel
                }
                datasetName={activePreset.datasetName}
                creditText={NASA_SVS_CREDIT}
                grid={singleGrid}
                currentCol={currentCol}
                isPlaying={isPlaying}
                mode={activeMode}
                lightningThreshold={lightningThresholdPct / 100}
                highContrast={highContrast}
                showGridOverlay={showGridOverlay}
                uploadButtonLabel={
                  selectedPresetId === 'night-lights'
                    ? `Upload ${effectiveSingleNightYear} image`
                    : 'Upload image'
                }
                uploadAriaLabel={
                  selectedPresetId === 'night-lights'
                    ? `Upload ${effectiveSingleNightYear} image into stage for Night Lights`
                    : `Upload image into stage for ${activePreset.shortLabel}`
                }
                onRequestUpload={() =>
                  openUploadDialogForSlot(
                    selectedPresetId === 'night-lights'
                      ? effectiveSingleNightYear === '2012'
                        ? 'night-lights-2012'
                        : 'night-lights-2023'
                      : selectedPresetId === 'lightning'
                        ? 'lightning'
                        : 'forest-height',
                  )
                }
                sampleButtonLabel={
                  selectedPresetId === 'night-lights'
                    ? `Try ${effectiveSingleNightYear} sample frame`
                    : 'Try a sample frame'
                }
                sampleAriaLabel={
                  selectedPresetId === 'night-lights'
                    ? `Try ${effectiveSingleNightYear} sample frame into stage for Night Lights`
                    : `Try a sample frame into stage for ${activePreset.shortLabel}`
                }
                onRequestSample={() =>
                  handleLoadSample(
                    selectedPresetId === 'night-lights'
                      ? effectiveSingleNightYear === '2012'
                        ? 'night-lights-2012'
                        : 'night-lights-2023'
                      : selectedPresetId === 'lightning'
                        ? 'lightning'
                        : 'forest-height',
                  )
                }
                onGridAnalyzed={setSingleGrid}
                onSelectColumn={(col) => void handleSelectSingleColumn(col)}
                onImageError={handleImageError}
              />
            ) : (
              <div className="flex flex-col gap-4">
                {/* Active Comparison Playback Status Banner */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span
                    data-testid="compare-now-playing"
                    className="text-sm font-semibold font-mono-tabular"
                    style={{ color: 'var(--accent-primary)' }}
                  >
                    {isPlaying
                      ? `${comparePlayingLabel} (Column ${currentCol + 1} of ${GRID_COLS})`
                      : canPlay
                        ? compareCompleted
                          ? 'Playback finished: 2012 → 2023'
                          : 'Ready: Plays 2012 then 2023'
                        : 'Upload both 2012 and 2023 frames to compare'}
                  </span>

                  <span
                    className="text-xs font-mono-tabular"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Active Stage: {compareActiveSlot === 0 ? '2012 (1 of 2)' : '2023 (2 of 2)'}
                  </span>
                </div>

                {/* Live Compare Summary announced after playback completes */}
                <div
                  aria-live="polite"
                  aria-atomic="true"
                  data-testid="compare-summary-region"
                >
                  {compareCompleted && compareSummary && (
                    <p
                      data-testid="compare-summary"
                      className="p-3.5 rounded-lg text-sm leading-relaxed font-medium"
                      style={{
                        backgroundColor: 'var(--bg-surface-elevated)',
                        border: `${highContrast ? '2px' : '1px'} solid var(--accent-primary)`,
                        color: 'var(--text-primary)',
                      }}
                    >
                      {compareSummary.summaryLine}
                    </p>
                  )}
                </div>

                {/* Dual 2012 & 2023 Stages playing back-to-back */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-semibold">
                        1. 2012{nightLights2012 ? ` (${nightLights2012.label})` : ''}
                      </span>
                      <span
                        className="text-xs font-mono-tabular"
                        style={{
                          color:
                            compareActiveSlot === 0
                              ? 'var(--accent-primary)'
                              : 'var(--text-muted)',
                        }}
                      >
                        {compareActiveSlot === 0
                          ? isPlaying
                            ? '● Now playing: 2012'
                            : 'Ready (1st)'
                          : '2012'}
                      </span>
                    </div>
                    <SonificationStage
                      imageSrc={nightLights2012?.src ?? null}
                      imageLabel="2012"
                      datasetName={activePreset.datasetName}
                      creditText={NASA_SVS_CREDIT}
                      grid={compareGrid2012}
                      currentCol={currentCol}
                      isPlaying={isPlaying}
                      isActiveStage={compareActiveSlot === 0}
                      mode="night-lights"
                      highContrast={highContrast}
                      showGridOverlay={showGridOverlay}
                      compact={true}
                      testId="compare-canvas-2012"
                      uploadButtonLabel="Upload 2012 image"
                      uploadAriaLabel="Upload 2012 image into stage for Night Lights"
                      onRequestUpload={() =>
                        openUploadDialogForSlot('night-lights-2012')
                      }
                      sampleButtonLabel="Try 2012 sample frame"
                      sampleAriaLabel="Try 2012 sample frame into stage for Night Lights"
                      onRequestSample={() => handleLoadSample('night-lights-2012')}
                      onGridAnalyzed={setCompareGrid2012}
                      onSelectColumn={(col) =>
                        void handleSelectCompareColumn(0, col)
                      }
                      onImageError={handleImageError}
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-semibold">
                        2. 2023{nightLights2023 ? ` (${nightLights2023.label})` : ''}
                      </span>
                      <span
                        className="text-xs font-mono-tabular"
                        style={{
                          color:
                            compareActiveSlot === 1
                              ? 'var(--accent-primary)'
                              : 'var(--text-muted)',
                        }}
                      >
                        {compareActiveSlot === 1
                          ? isPlaying
                            ? '● Now playing: 2023'
                            : 'Ready (2nd)'
                          : '2023'}
                      </span>
                    </div>
                    <SonificationStage
                      imageSrc={nightLights2023?.src ?? null}
                      imageLabel="2023"
                      datasetName={activePreset.datasetName}
                      creditText={NASA_SVS_CREDIT}
                      grid={compareGrid2023}
                      currentCol={currentCol}
                      isPlaying={isPlaying}
                      isActiveStage={compareActiveSlot === 1}
                      mode="night-lights"
                      highContrast={highContrast}
                      showGridOverlay={showGridOverlay}
                      compact={true}
                      testId="compare-canvas-2023"
                      uploadButtonLabel="Upload 2023 image"
                      uploadAriaLabel="Upload 2023 image into stage for Night Lights"
                      onRequestUpload={() =>
                        openUploadDialogForSlot('night-lights-2023')
                      }
                      sampleButtonLabel="Try 2023 sample frame"
                      sampleAriaLabel="Try 2023 sample frame into stage for Night Lights"
                      onRequestSample={() => handleLoadSample('night-lights-2023')}
                      onGridAnalyzed={setCompareGrid2023}
                      onSelectColumn={(col) =>
                        void handleSelectCompareColumn(1, col)
                      }
                      onImageError={handleImageError}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Unboxed Metadata & Live Telemetry Strip */}
            <div
              className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm font-mono-tabular pt-1"
              style={{ color: 'var(--text-secondary)' }}
              aria-label="Current playhead telemetry"
            >
              <span>
                Column{' '}
                <strong style={{ color: 'var(--text-primary)' }}>
                  {activeGrid ? String(currentCol + 1).padStart(2, '0') : '--'} / {GRID_COLS}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Stereo Pan{' '}
                <strong style={{ color: 'var(--text-primary)' }}>
                  {columnSummary?.panLabel ?? '--'}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {telemetryMetricSummary.stripLabel}{' '}
                <strong style={{ color: 'var(--text-primary)' }}>
                  {telemetryMetricSummary.stripValue}
                </strong>
              </span>
              {activeMode === 'night-lights' && activeGrid && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    Notes{' '}
                    <strong style={{ color: 'var(--text-primary)' }}>
                      {columnSummary && columnSummary.activeNotes.length > 0
                        ? columnSummary.activeNotes.join(', ')
                        : 'Silent'}
                    </strong>
                  </span>
                </>
              )}
            </div>
          </section>

          {/* Right Column: Transport, Sliders & Accessible Live Audio Description */}
          <aside
            aria-label="Audio controls and live sonification description"
            className="lg:col-span-4 flex flex-col gap-4"
          >
            {/* Primary Controls Surface */}
            <section
              aria-labelledby="controls-heading"
              className="p-4 rounded-lg flex flex-col gap-4"
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: `${highContrast ? '2px' : '1px'} solid var(--border-hairline)`,
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 id="controls-heading" className="text-base font-semibold">
                  Sonification Controls
                </h2>
                <span
                  className="text-xs font-mono-tabular"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {isPlaying ? '● Playing' : canPlay ? '■ Paused' : 'Upload frame'}
                </span>
              </div>

              {/* Primary Play / Pause Trigger */}
              <button
                type="button"
                onClick={() => void togglePlayPause()}
                disabled={!canPlay}
                aria-disabled={!canPlay}
                aria-pressed={isPlaying}
                aria-label={
                  !canPlay
                    ? 'Play sonification (upload a NASA SVS frame to start)'
                    : isPlaying
                      ? 'Pause sonification'
                      : isCompareActive
                        ? 'Play 2012 then 2023 comparison'
                        : 'Play sonification'
                }
                className="w-full min-h-[48px] px-5 py-3 rounded-lg font-semibold text-base inline-flex items-center justify-center gap-2.5 transition-opacity"
                style={{
                  backgroundColor: canPlay
                    ? 'var(--accent-primary)'
                    : 'var(--bg-surface-elevated)',
                  color: canPlay
                    ? 'var(--accent-primary-text)'
                    : 'var(--text-muted)',
                  border: canPlay
                    ? 'none'
                    : `1px solid var(--border-hairline)`,
                  cursor: canPlay ? 'pointer' : 'not-allowed',
                }}
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-5 h-5 shrink-0" aria-hidden="true" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5 shrink-0" aria-hidden="true" />
                    <span>
                      {!canPlay
                        ? 'Upload a NASA SVS frame to start'
                        : isCompareActive
                          ? 'Play Comparison (2012 → 2023)'
                          : 'Play Sonification'}
                    </span>
                  </>
                )}
              </button>

              {/* Speed Slider */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="speed-slider" className="text-sm font-medium">
                    Scan Speed
                  </label>
                  <span
                    className="text-sm font-mono-tabular font-semibold"
                    style={{ color: 'var(--accent-primary)' }}
                  >
                    {speed} col/s
                  </span>
                </div>
                <input
                  id="speed-slider"
                  type="range"
                  min={MIN_SPEED}
                  max={MAX_SPEED}
                  step={1}
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  aria-label="Scan speed in columns per second"
                  aria-valuetext={`${speed} columns per second`}
                  className="earthecho-slider"
                />
                <div
                  className="flex justify-between text-xs font-mono-tabular"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <span>1 col/s (Slow)</span>
                  <span>12 col/s (Fast)</span>
                </div>
              </div>

              {/* Volume Slider */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="volume-slider"
                    className="text-sm font-medium inline-flex items-center gap-1.5"
                  >
                    {volumePct === 0 ? (
                      <VolumeX className="w-4 h-4 shrink-0" aria-hidden="true" />
                    ) : (
                      <Volume2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                    )}
                    <span>Master Volume</span>
                  </label>
                  <span
                    className="text-sm font-mono-tabular font-semibold"
                    style={{ color: 'var(--accent-primary)' }}
                  >
                    {volumePct}%
                  </span>
                </div>
                <input
                  id="volume-slider"
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={volumePct}
                  onChange={(e) => setVolumePct(Number(e.target.value))}
                  aria-label="Master audio volume percentage"
                  aria-valuetext={`${volumePct} percent`}
                  className="earthecho-slider"
                />
              </div>

              {/* Lightning Brightness Threshold Slider */}
              {activeMode === 'lightning' && (
                <div
                  className="flex flex-col gap-2 pt-3"
                  style={{ borderTop: `1px solid var(--border-hairline)` }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor="lightning-threshold-slider"
                      className="text-sm font-medium inline-flex items-center gap-1.5"
                    >
                      <SlidersHorizontal
                        className="w-4 h-4 shrink-0"
                        aria-hidden="true"
                      />
                      <span>Flash Threshold</span>
                    </label>
                    <span
                      className="text-sm font-mono-tabular font-semibold"
                      style={{ color: 'var(--accent-primary)' }}
                    >
                      {lightningThresholdPct}%
                    </span>
                  </div>
                  <input
                    id="lightning-threshold-slider"
                    type="range"
                    min={10}
                    max={95}
                    step={5}
                    value={lightningThresholdPct}
                    onChange={(e) => setLightningThresholdPct(Number(e.target.value))}
                    aria-label="Lightning brightness threshold percentage"
                    aria-valuetext={`${lightningThresholdPct} percent brightness threshold`}
                    className="earthecho-slider"
                  />
                  <div
                    className="flex justify-between text-xs font-mono-tabular"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <span>10% (More flashes)</span>
                    <span>95% (Brightest only)</span>
                  </div>
                </div>
              )}
            </section>

            {/* Live Accessible Audio Description Panel */}
            <section
              aria-labelledby="live-desc-heading"
              className="p-4 rounded-lg flex flex-col gap-2.5"
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: `${highContrast ? '2px' : '1px'} solid var(--border-hairline)`,
              }}
            >
              <h2 id="live-desc-heading" className="text-base font-semibold">
                What You Are Hearing
              </h2>

              <p
                aria-live="polite"
                aria-atomic="true"
                data-testid="live-audio-description"
                className="text-sm sm:text-base leading-relaxed"
                style={{ color: 'var(--text-primary)' }}
              >
                {liveDescriptionText}
              </p>

              <div
                className="pt-3 grid grid-cols-2 gap-4 text-xs sm:text-sm"
                style={{
                  borderTop: `1px solid var(--border-hairline)`,
                }}
              >
                <div>
                  <span
                    className="block text-xs"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {telemetryMetricSummary.label1}
                  </span>
                  <span className="font-mono-tabular font-semibold text-base">
                    {telemetryMetricSummary.value1}
                  </span>
                </div>

                <div>
                  <span
                    className="block text-xs"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {telemetryMetricSummary.label2}
                  </span>
                  <span className="font-mono-tabular font-semibold text-base">
                    {telemetryMetricSummary.value2}
                  </span>
                </div>
              </div>
            </section>

            {/* Active Mapping & Keyboard Shortcuts */}
            <section
              aria-labelledby="guide-heading"
              className="p-4 rounded-lg flex flex-col gap-2"
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: `${highContrast ? '2px' : '1px'} solid var(--border-hairline)`,
              }}
            >
              <h2 id="guide-heading" className="text-base font-semibold">
                Active Sound Rules & Keys
              </h2>

              <p
                className="text-sm leading-relaxed"
                style={{ color: 'var(--text-secondary)' }}
              >
                {activePreset.mappingSummary}
              </p>

              <p
                className="text-xs sm:text-sm pt-2"
                style={{
                  borderTop: `1px solid var(--border-hairline)`,
                  color: 'var(--text-secondary)',
                }}
              >
                <strong style={{ color: 'var(--text-primary)' }}>Keys: </strong>
                Space = Play/Pause · Arrow keys = Speed · Tab = Navigate controls
              </p>
            </section>
          </aside>
        </div>

        {/* Plain-language "How It Works" section */}
        <HowItWorksSection
          activeMode={activeMode}
          compareMode={isCompareActive}
          highContrast={highContrast}
        />
      </main>

      {/* Footer Credit */}
      <footer
        className="w-full py-3 mt-auto"
        style={{
          borderTop: `${highContrast ? '2px' : '1px'} solid var(--border-hairline)`,
          backgroundColor: 'var(--bg-surface)',
        }}
      >
        <div
          className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm"
          style={{ color: 'var(--text-secondary)' }}
        >
          <span>{NASA_SVS_CREDIT}</span>
          <span>EarthEcho · Accessible Earth Sonification</span>
        </div>
      </footer>
    </div>
  );
}
