import React from 'react';
import { DATASET_PRESETS } from '../utils/presets';
import { SonificationMode } from '../utils/sonification';

interface HowItWorksSectionProps {
  activeMode: SonificationMode;
  compareMode: boolean;
  highContrast: boolean;
}

export const HowItWorksSection: React.FC<HowItWorksSectionProps> = ({
  activeMode,
  compareMode,
  highContrast,
}) => {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-heading"
      className="w-full pt-4"
      style={{
        borderTop: `${highContrast ? '2px' : '1px'} solid var(--border-hairline)`,
      }}
    >
      <div className="flex flex-col gap-1.5 mb-4">
        <h2
          id="how-it-works-heading"
          className="text-lg font-semibold tracking-tight"
        >
          How It Works
        </h2>
        <p
          className="text-sm max-w-3xl leading-relaxed"
          style={{ color: 'var(--text-secondary)' }}
        >
          EarthEcho divides each uploaded Earth observation visualization into 16
          vertical slices from west (left) to east (right). As the playhead scans across
          the map, each dataset uses a tailored sound personality so you can hear the
          science clearly.
        </p>
      </div>

      {/* 3 Preset Mappings in a clean 3-column grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {DATASET_PRESETS.map((preset, index) => {
          const isCurrent = !compareMode && activeMode === preset.id;
          return (
            <article
              key={preset.id}
              className="p-4 rounded-lg flex flex-col gap-2.5"
              style={{
                backgroundColor: isCurrent
                  ? 'var(--bg-surface-elevated)'
                  : 'var(--bg-surface)',
                border: `${highContrast ? '2px' : '1px'} solid ${
                  isCurrent ? 'var(--accent-primary)' : 'var(--border-hairline)'
                }`,
              }}
            >
              <h3 className="text-sm sm:text-base font-semibold leading-snug">
                0{index + 1}. {preset.howItWorksTitle}
              </h3>

              <p
                className="text-sm leading-relaxed"
                style={{ color: 'var(--text-secondary)' }}
              >
                {preset.howItWorksBody}
              </p>

              <dl
                className="mt-auto pt-2.5 flex flex-col gap-1.5 text-xs sm:text-sm"
                style={{
                  borderTop: `1px solid var(--border-hairline)`,
                }}
              >
                {preset.howItWorksRules.map((rule) => (
                  <div key={rule.label} className="leading-snug">
                    <dt
                      className="font-semibold inline"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {rule.label}:{' '}
                    </dt>
                    <dd
                      className="inline"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {rule.detail}
                    </dd>
                  </div>
                ))}
              </dl>
            </article>
          );
        })}
      </div>

      {/* Why a Musical Scale Is Used + Night Lights Compare Mode */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <article
          className="p-4 rounded-lg flex flex-col gap-1.5"
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: `${highContrast ? '2px' : '1px'} solid var(--border-hairline)`,
          }}
        >
          <h3 className="text-sm sm:text-base font-semibold">
            04. Why a Musical Scale Is Used
          </h3>
          <p
            className="text-sm leading-relaxed"
            style={{ color: 'var(--text-secondary)' }}
          >
            Instead of turning image height into raw, clashing frequencies, EarthEcho
            snaps notes to a five-note C major pentatonic scale (C, D, E, G, A). Because
            any combination of pentatonic notes blends harmoniously without harsh
            dissonance, your ear can comfortably follow bright city clusters, forest
            heights, and changes over time without listening fatigue.
          </p>
        </article>

        <article
          className="p-4 rounded-lg flex flex-col gap-1.5"
          style={{
            backgroundColor: compareMode
              ? 'var(--bg-surface-elevated)'
              : 'var(--bg-surface)',
            border: `${highContrast ? '2px' : '1px'} solid ${
              compareMode ? 'var(--accent-primary)' : 'var(--border-hairline)'
            }`,
          }}
        >
          <h3 className="text-sm sm:text-base font-semibold">
            05. Compare Mode (Night Lights 2012 → 2023)
          </h3>
          <p
            className="text-sm leading-relaxed"
            style={{ color: 'var(--text-secondary)' }}
          >
            With both 2012 and 2023 Night Lights frames uploaded, Compare Mode plays the
            2012 frame (columns 1–16) and immediately plays 2023 (columns 1–16)
            back-to-back. When playback finishes, EarthEcho displays and announces a
            one-line summary showing how brightness, bright clusters, and regional activity
            changed.
          </p>
        </article>
      </div>
    </section>
  );
};
