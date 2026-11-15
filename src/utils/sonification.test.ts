import test from 'node:test';
import assert from 'node:assert/strict';
import {
  C_MAJOR_PENTATONIC,
  GRID_COLS,
  GRID_ROWS,
  analyzeImageGrid,
  compareSonificationGrids,
  computeMaxRgbIntensity,
  computeNightLightsCellGain,
  computeStereoPan,
  describeColumnSonification,
  describeOverallImage,
  estimateForestCanopyPixel,
  mapForestCanopyToPitch,
  mapLightningRowToDrumPitch,
} from './sonification';

/** Helper to build a synthetic RGBA buffer of size width x height using a pixel callback. */
function makeImageBuffer(
  width: number,
  height: number,
  pixelFn: (x: number, y: number) => [number, number, number],
): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixelFn(x, y);
      const idx = (y * width + x) * 4;
      buf[idx] = r;
      buf[idx + 1] = g;
      buf[idx + 2] = b;
      buf[idx + 3] = 255;
    }
  }
  return buf;
}

test('C major pentatonic scale decreases in pitch from top row (0) to bottom row (7)', () => {
  assert.equal(C_MAJOR_PENTATONIC.length, GRID_ROWS);
  for (let i = 0; i < C_MAJOR_PENTATONIC.length - 1; i++) {
    assert.ok(
      C_MAJOR_PENTATONIC[i].freq > C_MAJOR_PENTATONIC[i + 1].freq,
      `Row ${i} should be higher pitched than row ${i + 1}`,
    );
  }
  assert.equal(C_MAJOR_PENTATONIC[0].note, 'E5');
  assert.equal(C_MAJOR_PENTATONIC[7].note, 'C4');
});

test('computeStereoPan spans -1 (left) to +1 (right)', () => {
  assert.equal(computeStereoPan(0, 16), -1);
  assert.equal(computeStereoPan(15, 16), 1);
  const mid = computeStereoPan(7.5, 16);
  assert.ok(Math.abs(mid) < 1e-9);
});

test('Night Lights volume uses max(R, G, B), keeps pure black silent, and gives non-black pixels a minimum volume', () => {
  // Pure blue [0, 0, 255] has low luminance (~0.114) but max(R, G, B) = 1.0
  assert.equal(computeMaxRgbIntensity(0, 0, 255), 1);
  assert.equal(computeMaxRgbIntensity(0, 0, 0), 0);

  // Pure black stays completely silent
  assert.equal(computeNightLightsCellGain(0, false, 1.0, 1), 0);

  // Any non-black pixel gets a small minimum volume even if maxRGB is tiny
  const minGain = computeNightLightsCellGain(1 / 255, true, 1.0, 1);
  assert.ok(minGain > 0, 'Non-black cell should receive a small minimum volume');

  const brightGain = computeNightLightsCellGain(1.0, true, 1.0, 1);
  assert.ok(brightGain > minGain, 'Brighter cell should be louder than minimal cell');

  // Verify grid tracks pure black vs dim non-black pixel accurately
  const width = 32;
  const height = 16;
  const pixels = makeImageBuffer(width, height, (x) =>
    x === 0 ? [0, 0, 1] : [0, 0, 0],
  );
  const grid = analyzeImageGrid(pixels, width, height, GRID_COLS, GRID_ROWS);
  assert.equal(grid.cells[0][0].hasNonBlackPixel, true);
  assert.equal(grid.cells[5][0].hasNonBlackPixel, false);
  assert.equal(grid.columnFeatures[5].hasAnyNonBlack, false);

  const silentDesc = describeColumnSonification(grid, 5, 'night-lights');
  assert.match(silentDesc.description, /silent/i);
});

test('Night Lights counts bright clusters per column and scales rhythm density', () => {
  const width = 64;
  const height = 48;
  const pixels = makeImageBuffer(width, height, (x, y) => {
    if (x >= 8 && x < 12 && y >= 20 && y <= 24) {
      return [250, 210, 120];
    }
    if (
      x >= 40 &&
      x < 44 &&
      ((y >= 2 && y <= 5) ||
        (y >= 14 && y <= 17) ||
        (y >= 26 && y <= 29) ||
        (y >= 38 && y <= 41))
    ) {
      return [255, 225, 150];
    }
    return [0, 0, 0];
  });

  const grid = analyzeImageGrid(pixels, width, height);
  assert.equal(grid.columnFeatures[2].brightClusterCount, 1);
  assert.equal(grid.columnFeatures[2].rhythmDensity, 1);
  assert.ok(grid.columnFeatures[10].brightClusterCount >= 4);
  assert.ok(grid.columnFeatures[10].rhythmDensity >= 4);

  const summary = describeColumnSonification(grid, 10, 'night-lights');
  assert.match(summary.description, /bright city clusters/i);
});

test('Lightning respects brightness threshold slider, pans left-to-right, and maps vertical position to drum pitch', () => {
  const width = 64;
  const height = 32;
  // Dim flash ~0.45 at col 3, very bright top flash at col 1, very bright bottom flash at col 15
  const pixels = makeImageBuffer(width, height, (x, y) => {
    if (x >= 4 && x <= 5 && y >= 2 && y <= 4) return [245, 252, 255]; // top-left
    if (x >= 12 && x <= 14 && y >= 14 && y <= 16) return [115, 115, 115]; // moderate (~0.45)
    if (x >= 59 && x <= 61 && y >= 27 && y <= 29) return [255, 240, 255]; // bottom-right
    return [10, 14, 28];
  });

  const lowThreshGrid = analyzeImageGrid(pixels, width, height, GRID_COLS, GRID_ROWS, {
    lightningThreshold: 0.35,
  });
  const highThreshGrid = analyzeImageGrid(pixels, width, height, GRID_COLS, GRID_ROWS, {
    lightningThreshold: 0.75,
  });

  assert.ok(
    lowThreshGrid.columnFeatures[3].lightningStrikes.length >= 1,
    'Lower threshold should detect moderate flash',
  );
  assert.equal(
    highThreshGrid.columnFeatures[3].lightningStrikes.length,
    0,
    'Higher threshold should ignore moderate flash',
  );

  assert.ok(highThreshGrid.columnFeatures[1].lightningStrikes[0].pan < -0.7);
  assert.ok(highThreshGrid.columnFeatures[15].lightningStrikes[0].pan > 0.7);

  // Vertical position sets drum pitch (top = higher pitch, bottom = lower pitch)
  const topPitch = mapLightningRowToDrumPitch(
    highThreshGrid.columnFeatures[1].lightningStrikes[0].rowRatio,
  );
  const bottomPitch = mapLightningRowToDrumPitch(
    highThreshGrid.columnFeatures[15].lightningStrikes[0].rowRatio,
  );
  assert.ok(topPitch > bottomPitch, 'Higher flash on map should produce higher drum pitch');

  const strikeSummary = describeColumnSonification(highThreshGrid, 15, 'lightning');
  assert.match(strikeSummary.description, /percussive hits/i);
});

test('Forest Height maps low canopy (pale yellow) to high pitch and tall canopy (deep teal) to low pitch', () => {
  const ocean = estimateForestCanopyPixel(58, 70, 88);
  assert.equal(ocean.isVegetation, false);

  const lowScrub = estimateForestCanopyPixel(235, 224, 150);
  const tallRainforest = estimateForestCanopyPixel(16, 98, 86);

  assert.equal(lowScrub.isVegetation, true);
  assert.equal(tallRainforest.isVegetation, true);
  assert.ok(tallRainforest.canopyScale > lowScrub.canopyScale);

  const lowCanopyPitch = mapForestCanopyToPitch(lowScrub.canopyScale);
  const tallCanopyPitch = mapForestCanopyToPitch(tallRainforest.canopyScale);
  assert.ok(lowCanopyPitch.freq > tallCanopyPitch.freq);

  const width = 64;
  const height = 32;
  const pixels = makeImageBuffer(width, height, (x) =>
    x < 32 ? [235, 224, 150] : [16, 98, 86],
  );
  const grid = analyzeImageGrid(pixels, width, height);
  assert.ok(
    grid.columnFeatures[2].forestPitchHz > grid.columnFeatures[13].forestPitchHz,
  );
  const overview = describeOverallImage(grid, 'forest-height');
  assert.match(overview, /Forest Height/i);
});

test('compareSonificationGrids summarizes brightness and cluster changes between 2012 and 2023', () => {
  const width = 64;
  const height = 48;

  const pixels2012 = makeImageBuffer(width, height, (x, y) => {
    if (x >= 44 && x < 50 && ((y >= 10 && y <= 14) || (y >= 30 && y <= 34))) {
      return [240, 190, 90];
    }
    return [0, 0, 0];
  });

  const pixels2023 = makeImageBuffer(width, height, (x, y) => {
    if (
      x >= 42 &&
      x < 56 &&
      ((y >= 4 && y <= 8) ||
        (y >= 15 && y <= 19) ||
        (y >= 26 && y <= 30) ||
        (y >= 37 && y <= 41))
    ) {
      return [255, 230, 145];
    }
    return [0, 0, 0];
  });

  const grid2012 = analyzeImageGrid(pixels2012, width, height);
  const grid2023 = analyzeImageGrid(pixels2023, width, height);
  const diff = compareSonificationGrids(grid2012, grid2023, '2012', '2023');

  assert.ok(diff.brightnessDeltaPct > 0);
  assert.ok(diff.clustersB > diff.clustersA);
  assert.equal(diff.peakChangeSide, 'right');
  assert.match(diff.summaryLine, /^2023 is \d+% brighter overall/);
  assert.match(diff.summaryLine, /more bright clusters/);
  assert.match(diff.summaryLine, /toward the right\./);
});
