import { SonificationMode } from './sonification';

export interface DatasetPreset {
  id: SonificationMode;
  shortLabel: string;
  datasetName: string;
  credit: string;
  soundPersonality: string;
  about: string;
  mappingSummary: string;
  howItWorksTitle: string;
  howItWorksBody: string;
  howItWorksRules: { label: string; detail: string }[];
}

export const NASA_SVS_CREDIT = 'Imagery: NASA Scientific Visualization Studio';

export const DATASET_PRESETS: readonly DatasetPreset[] = [
  {
    id: 'night-lights',
    shortLabel: 'Night Lights',
    datasetName: 'NASA SVS: Change in Night Lights 2012-2023',
    credit: NASA_SVS_CREDIT,
    soundPersonality: 'Pentatonic City Clusters',
    about:
      'Satellite sensors track nighttime light from cities, highways, and coastal corridors around the world. Comparing 2012 and 2023 reveals how urban settlements have expanded and brightened over a decade. Dark oceans and unlit regions stay silent so every lit pixel stands out.',
    mappingSummary:
      'Volume uses each cell’s max(R, G, B) color intensity (pure black is silent; any non-black pixel gets a small minimum volume), while bright clusters per column set rhythm density on soft sine/triangle pentatonic notes.',
    howItWorksTitle: 'Night Lights (Pentatonic City Clusters)',
    howItWorksBody:
      'Turns nighttime lights into soft musical pulses on a pentatonic scale so you can hear both brightness and how clustered cities are.',
    howItWorksRules: [
      {
        label: 'Color Intensity → Volume',
        detail:
          'Volume follows the brightest RGB channel (max of R, G, B). Pure black stays silent, and any lit pixel gets at least a gentle minimum volume.',
      },
      {
        label: 'Bright Clusters → Rhythm Density',
        detail:
          'More separate city-light clusters in a vertical slice play more notes per beat.',
      },
      {
        label: 'Soft Pentatonic Notes',
        detail:
          'Blended sine and triangle oscillators play harmonious C major pentatonic notes from top to bottom.',
      },
    ],
  },
  {
    id: 'lightning',
    shortLabel: 'Lightning',
    datasetName: 'NASA SVS: Lightning Events Detected from the ISS',
    credit: NASA_SVS_CREDIT,
    soundPersonality: 'Percussive Storm Hits',
    about:
      'Optical instruments in orbit detect brief lightning flashes inside severe thunderstorms across Earth’s tropical and mid-latitude belts. Because storms occur in bursts rather than continuous bands, each bright flash above your chosen threshold becomes a distinct percussive strike.',
    mappingSummary:
      'Pixels brighter than the threshold slider trigger synthesized percussive clicks and drum hits (oscillators + noise bursts). Horizontal position pans left-to-right and vertical position sets drum pitch.',
    howItWorksTitle: 'Lightning (Percussive Storm Hits)',
    howItWorksBody:
      'Listens only for bright electrical storm flashes above your brightness threshold and turns each one into a sharp drum click.',
    howItWorksRules: [
      {
        label: 'Threshold Slider → Flash Filter',
        detail:
          'Raise or lower the brightness threshold to isolate only the strongest lightning peaks or catch fainter flashes.',
      },
      {
        label: 'Left-to-Right → Stereo Pan',
        detail:
          'Each flash pans across your headphones or speakers to match its exact horizontal spot on the map.',
      },
      {
        label: 'Vertical Position → Drum Pitch',
        detail:
          'Flashes higher on the map trigger higher-pitched hits; flashes lower down sound deeper.',
      },
    ],
  },
  {
    id: 'forest-height',
    shortLabel: 'Forest Height',
    datasetName: 'NASA SVS: GEDI Forest Height',
    credit: NASA_SVS_CREDIT,
    soundPersonality: 'Warm Sustained Pad',
    about:
      'Spaceborne Global Ecosystem Dynamics Investigation (GEDI) lidar sensors measure the three-dimensional height of forest canopies around the globe. Shorter shrubs and savannas appear at the bright low end of the color scale, while towering rainforests appear in deep emerald and teal.',
    mappingSummary:
      'Maps the color scale low-to-high onto pitch high-to-low (short forest = higher notes, tall forest = lower notes) using a warm sustained pad of layered detuned oscillators and a low-pass filter.',
    howItWorksTitle: 'Forest Height (Warm Sustained Pad)',
    howItWorksBody:
      'Translates tree height into a smooth, breathing synthesizer pad where taller forests sound deeper and more grounded.',
    howItWorksRules: [
      {
        label: 'Short Forest → Higher Notes',
        detail:
          'Low scrubland and short woodland colors map to higher, lighter pitches.',
      },
      {
        label: 'Tall Forest → Lower Notes',
        detail:
          'Tall, dense rainforest canopies map to deep, resonant lower pitches.',
      },
      {
        label: 'Warm Pad Sound',
        detail:
          'Layered detuned oscillators pass through a low-pass filter with a slow attack and gentle release.',
      },
    ],
  },
] as const;

export function getPresetById(id: SonificationMode): DatasetPreset {
  return DATASET_PRESETS.find((p) => p.id === id) ?? DATASET_PRESETS[0];
}
