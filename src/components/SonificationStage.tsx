import React, { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Upload } from 'lucide-react';
import {
  C_MAJOR_PENTATONIC,
  DEFAULT_LIGHTNING_THRESHOLD,
  GRID_COLS,
  GRID_ROWS,
  SonificationGrid,
  SonificationMode,
  analyzeImageGrid,
} from '../utils/sonification';

interface SonificationStageProps {
  imageSrc: string | null;
  imageLabel: string;
  datasetName: string;
  creditText: string;
  grid: SonificationGrid | null;
  currentCol: number;
  isPlaying: boolean;
  isActiveStage?: boolean;
  mode: SonificationMode;
  lightningThreshold?: number;
  highContrast: boolean;
  showGridOverlay: boolean;
  compact?: boolean;
  testId?: string;
  uploadButtonLabel?: string;
  uploadAriaLabel?: string;
  onRequestUpload?: () => void;
  sampleButtonLabel?: string;
  sampleAriaLabel?: string;
  onRequestSample?: () => void;
  onGridAnalyzed: (grid: SonificationGrid | null) => void;
  onSelectColumn: (col: number) => void;
  onImageError?: (message: string) => void;
}

export const SonificationStage: React.FC<SonificationStageProps> = ({
  imageSrc,
  imageLabel,
  datasetName,
  creditText,
  grid,
  currentCol,
  isPlaying,
  isActiveStage = true,
  mode,
  lightningThreshold = DEFAULT_LIGHTNING_THRESHOLD,
  highContrast,
  showGridOverlay,
  compact = false,
  testId = 'sonification-canvas',
  uploadButtonLabel = 'Upload image',
  uploadAriaLabel = 'Upload a NASA SVS image frame',
  onRequestUpload,
  sampleButtonLabel = 'Try a sample frame',
  sampleAriaLabel = 'Try a NASA SVS sample frame',
  onRequestSample,
  onGridAnalyzed,
  onSelectColumn,
  onImageError,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadedImageRef = useRef<HTMLImageElement | null>(null);
  const sampledDataRef = useRef<{
    data: Uint8ClampedArray;
    width: number;
    height: number;
  } | null>(null);
  const [imageReady, setImageReady] = useState(false);

  // Decode uploaded image onto a 320x180 offscreen canvas and store pixel buffer
  useEffect(() => {
    if (!imageSrc) {
      loadedImageRef.current = null;
      sampledDataRef.current = null;
      setImageReady(false);
      onGridAnalyzed(null);
      return;
    }

    let cancelled = false;
    setImageReady(false);

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      if (cancelled) return;
      loadedImageRef.current = img;

      const sampleWidth = 320;
      const sampleHeight = 180;
      const offscreen = document.createElement('canvas');
      offscreen.width = sampleWidth;
      offscreen.height = sampleHeight;
      const offCtx = offscreen.getContext('2d', { willReadFrequently: true });

      if (offCtx) {
        offCtx.drawImage(img, 0, 0, sampleWidth, sampleHeight);
        const imageData = offCtx.getImageData(0, 0, sampleWidth, sampleHeight);
        sampledDataRef.current = {
          data: imageData.data,
          width: sampleWidth,
          height: sampleHeight,
        };
        const analyzed = analyzeImageGrid(
          imageData.data,
          sampleWidth,
          sampleHeight,
          GRID_COLS,
          GRID_ROWS,
          { lightningThreshold },
        );
        onGridAnalyzed(analyzed);
      }
      setImageReady(true);
    };

    img.onerror = () => {
      if (cancelled) return;
      loadedImageRef.current = null;
      sampledDataRef.current = null;
      setImageReady(false);
      onGridAnalyzed(null);
      onImageError?.('Could not decode the uploaded image file. Please try another PNG, JPG, WebP, or GIF image.');
    };

    img.src = imageSrc;

    return () => {
      cancelled = true;
    };
  }, [imageSrc, onGridAnalyzed, onImageError]);

  // Re-analyze pixel buffer instantaneously when the Lightning threshold slider moves
  useEffect(() => {
    const sampled = sampledDataRef.current;
    if (!sampled || !imageReady) return;
    const analyzed = analyzeImageGrid(
      sampled.data,
      sampled.width,
      sampled.height,
      GRID_COLS,
      GRID_ROWS,
      { lightningThreshold },
    );
    onGridAnalyzed(analyzed);
  }, [imageReady, lightningThreshold, onGridAnalyzed]);

  // Paint uploaded image, 16x8 grid overlay, and personality-aware active playhead bar
  useEffect(() => {
    if (!imageSrc || !imageReady || !loadedImageRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const colWidth = width / GRID_COLS;
    const rowHeight = height / GRID_ROWS;

    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(loadedImageRef.current, 0, 0, width, height);

    if (showGridOverlay) {
      ctx.save();
      ctx.strokeStyle = highContrast
        ? 'rgba(255, 255, 255, 0.5)'
        : 'rgba(226, 232, 240, 0.2)';
      ctx.lineWidth = highContrast ? 1.5 : 1;

      for (let c = 1; c < GRID_COLS; c++) {
        const x = Math.round(c * colWidth) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      for (let r = 1; r < GRID_ROWS; r++) {
        const y = Math.round(r * rowHeight) + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (!isActiveStage) {
      ctx.save();
      ctx.fillStyle = highContrast ? 'rgba(0, 0, 0, 0.45)' : 'rgba(7, 9, 14, 0.38)';
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
      return;
    }

    const activeX = currentCol * colWidth;
    ctx.save();

    if (isPlaying) {
      ctx.fillStyle = highContrast ? 'rgba(0, 0, 0, 0.35)' : 'rgba(7, 9, 14, 0.28)';
      if (activeX > 0) {
        ctx.fillRect(0, 0, activeX, height);
      }
      if (activeX + colWidth < width) {
        ctx.fillRect(activeX + colWidth, 0, width - (activeX + colWidth), height);
      }
    }

    ctx.fillStyle = highContrast
      ? 'rgba(255, 255, 0, 0.2)'
      : mode === 'night-lights'
        ? 'rgba(245, 158, 11, 0.16)'
        : mode === 'forest-height'
          ? 'rgba(52, 211, 153, 0.16)'
          : 'rgba(34, 211, 238, 0.18)';
    ctx.fillRect(activeX, 0, colWidth, height);

    if (grid && grid.cells[currentCol]) {
      const feat = grid.columnFeatures[currentCol];

      if (mode === 'lightning' && feat) {
        for (const strike of feat.lightningStrikes) {
          const sx = strike.normX * width;
          const sy = strike.normY * height;
          const radius = 8 + strike.intensity * 8;
          ctx.strokeStyle = highContrast ? '#FFFF00' : '#38BDF8';
          ctx.lineWidth = highContrast ? 3 : 2;
          ctx.beginPath();
          ctx.arc(sx, sy, radius, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = highContrast ? '#FFFFFF' : '#F8FAFC';
          ctx.beginPath();
          ctx.arc(sx, sy, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (mode === 'forest-height' && feat) {
        if (feat.forestCoverage >= 0.025) {
          const barY = feat.forestCanopyScale * (height - 20);
          ctx.strokeStyle = highContrast ? '#FFFF00' : '#34D399';
          ctx.lineWidth = highContrast ? 3 : 2.5;
          ctx.strokeRect(
            activeX + 4,
            Math.max(4, barY),
            Math.max(6, colWidth - 8),
            16,
          );
        }
      } else {
        for (let r = 0; r < GRID_ROWS; r++) {
          const cell = grid.cells[currentCol][r];
          if (cell && cell.hasNonBlackPixel && cell.maxRgbIntensity >= 0.08) {
            const cellY = r * rowHeight;
            ctx.strokeStyle = highContrast ? '#FF9900' : 'rgba(245, 158, 11, 0.92)';
            ctx.lineWidth = highContrast ? 3 : 2;
            ctx.strokeRect(
              activeX + 3,
              cellY + 3,
              Math.max(4, colWidth - 6),
              Math.max(4, rowHeight - 6),
            );
          }
        }
      }
    }

    ctx.strokeStyle = highContrast
      ? '#FFFF00'
      : mode === 'night-lights'
        ? '#F59E0B'
        : mode === 'forest-height'
          ? '#34D399'
          : '#22D3EE';
    ctx.lineWidth = highContrast ? 4 : 3;
    ctx.strokeRect(activeX + 1.5, 1.5, colWidth - 3, height - 3);
    ctx.restore();
  }, [
    currentCol,
    grid,
    highContrast,
    imageReady,
    imageSrc,
    isActiveStage,
    isPlaying,
    mode,
    showGridOverlay,
  ]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!imageSrc || !imageReady) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const col = Math.min(
      GRID_COLS - 1,
      Math.max(0, Math.floor((relX / rect.width) * GRID_COLS)),
    );
    onSelectColumn(col);
  };

  return (
    <div className="w-full">
      <div className="flex items-stretch gap-2">
        {!compact && (
          <div
            aria-hidden="true"
            className="hidden sm:grid grid-rows-8 items-center w-7 shrink-0 text-[11px] font-mono-tabular text-right select-none"
            style={{ color: 'var(--text-secondary)' }}
          >
            {mode === 'forest-height'
              ? ['C5', 'A4', 'G4', 'E4', 'D4', 'C4', 'A3', 'C3'].map((label) => (
                  <span key={label} className="leading-none">
                    {label}
                  </span>
                ))
              : C_MAJOR_PENTATONIC.map((item) => (
                  <span key={item.note} className="leading-none">
                    {item.note}
                  </span>
                ))}
          </div>
        )}

        <div
          className="flex-1 min-w-0 relative overflow-hidden rounded-lg aspect-video flex items-center justify-center"
          style={{
            border: `${highContrast ? '2px' : '1px'} solid ${
              isActiveStage ? 'var(--border-strong)' : 'var(--border-hairline)'
            }`,
            backgroundColor: 'var(--bg-surface)',
          }}
        >
          {imageSrc ? (
            <canvas
              ref={canvasRef}
              width={960}
              height={540}
              data-testid={testId}
              onClick={handleCanvasClick}
              aria-label={`Sonification visualization canvas for ${imageLabel} (${datasetName}). ${
                isActiveStage
                  ? `Currently highlighting column ${currentCol + 1} of ${GRID_COLS}.`
                  : 'Click any column to switch playback to this image.'
              }`}
              className="block w-full h-full cursor-crosshair"
            />
          ) : (
            <div
              data-testid={`${testId}-empty`}
              className="w-full h-full flex flex-col items-center justify-center gap-3 p-6 text-center"
            >
              <p
                className="text-sm sm:text-base font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                Upload a NASA SVS frame to start
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                {onRequestUpload && (
                  <button
                    type="button"
                    onClick={onRequestUpload}
                    aria-label={uploadAriaLabel}
                    className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors"
                    style={{
                      backgroundColor: 'var(--bg-surface-elevated)',
                      color: 'var(--text-primary)',
                      border: `${highContrast ? '2px' : '1px'} solid var(--border-strong)`,
                    }}
                  >
                    <Upload className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>{uploadButtonLabel}</span>
                  </button>
                )}
                {onRequestSample && (
                  <button
                    type="button"
                    onClick={onRequestSample}
                    aria-label={sampleAriaLabel}
                    className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--accent-primary)',
                      border: `${highContrast ? '2px' : '1px'} solid var(--accent-primary)`,
                    }}
                  >
                    <ImageIcon className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>{sampleButtonLabel}</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dataset Name & Credit displayed right next to each image */}
      <div
        className={`${!compact ? 'sm:pl-9' : ''} mt-2 flex flex-wrap items-center justify-between gap-2 text-xs`}
        style={{ color: 'var(--text-secondary)' }}
      >
        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
          {datasetName}
          {imageLabel && imageLabel !== datasetName ? ` · ${imageLabel}` : ''}
        </span>
        <span>{creditText}</span>
      </div>

      {/* Interactive 16-column jump selector aligned underneath the canvas */}
      {imageSrc && imageReady && (
        <div className={`${!compact ? 'sm:pl-9' : ''} mt-2`}>
          <div
            role="group"
            aria-label={`Jump to grid column 1 through ${GRID_COLS} for ${imageLabel}`}
            className="grid grid-cols-16 gap-0.5 sm:gap-1"
          >
            {Array.from({ length: GRID_COLS }, (_, idx) => {
              const active = isActiveStage && idx === currentCol;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onSelectColumn(idx)}
                  aria-label={`Jump playhead to column ${idx + 1} of ${GRID_COLS} on ${imageLabel}`}
                  aria-current={active ? 'step' : undefined}
                  className="min-w-0 min-h-[32px] px-0 rounded text-[10px] leading-none font-mono-tabular font-medium transition-colors cursor-pointer"
                  style={{
                    fontSize: '10px',
                    backgroundColor: active
                      ? 'var(--accent-primary)'
                      : 'var(--bg-surface)',
                    color: active
                      ? 'var(--accent-primary-text)'
                      : 'var(--text-secondary)',
                    border: `1px solid ${active ? 'var(--accent-primary)' : 'var(--border-hairline)'}`,
                  }}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
