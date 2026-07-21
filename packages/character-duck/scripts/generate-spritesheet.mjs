import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.join(__dirname, '..', 'assets');
const sourceDir = path.join(assetsDir, 'source');
const outPath = path.join(assetsDir, 'spritesheet.png');

const COLS = 10;
const ROWS = 13;
const CELL = 48;
const TARGET_BODY_H = 40;

const SOURCE_SHEET_NAMES = ['sprite-sheet.png', 'duck-sprite-sheet.png'];

/** Etienne Pouvreau — grid 32×32 (0-based rows). Pares ímpares/par = direita/esquerda. */
const ETENNE_LAYOUT = {
  idle: { srcRow: 7, frames: 4, startCol: 0 },
  idleLeft: { srcRow: 8, frames: 4, startCol: 0 },
  walk: { srcRow: 0, frames: 2, startCol: 0 },
  walkLeft: { srcRow: 1, frames: 2, startCol: 0 },
  run: { srcRow: 2, frames: 2, startCol: 0 },
  runLeft: { srcRow: 3, frames: 2, startCol: 0 },
  peck: { srcRow: 16, frames: 5, startCol: 0 },
  walkFront: { srcRow: 9, frames: 4, startCol: 0 },
  walkBack: { srcRow: 10, frames: 4, startCol: 0 },
  idleFront: { srcRow: 9, frames: 4, startCol: 0 },
  idleBack: { srcRow: 10, frames: 4, startCol: 0 },
  fly: { srcRow: 11, frames: 10, startCol: 0 },
  flyLeft: { srcRow: 12, frames: 10, startCol: 0 },
};

const ROW_NAMES = Object.keys(ETENNE_LAYOUT);

fs.mkdirSync(sourceDir, { recursive: true });

const sourceSheetPath = SOURCE_SHEET_NAMES.map((name) => path.join(sourceDir, name)).find((p) =>
  fs.existsSync(p),
);

if (!sourceSheetPath) {
  throw new Error(
    'No sprite-sheet.png found in assets/source/. Add the Etienne Pouvreau sheet as assets/source/sprite-sheet.png.',
  );
}

buildFromEtienneSheet(sourceSheetPath);

function buildFromEtienneSheet(sheetPath) {
  const source = PNG.sync.read(fs.readFileSync(sheetPath));
  const srcCell = 32;
  const png = new PNG({ width: COLS * CELL, height: ROWS * CELL });
  const rowMetrics = {};

  for (const rowName of ROW_NAMES) {
    rowMetrics[rowName] = measureRowMetrics(source, rowName, srcCell);
  }

  for (const rowName of ROW_NAMES) {
    const plan = ETENNE_LAYOUT[rowName];
    const destRow = ROW_NAMES.indexOf(rowName);
    const metrics = rowMetrics[rowName];

    for (let col = 0; col < plan.frames; col += 1) {
      const srcCol = (plan.startCol ?? 0) + col;
      const cellX = col * CELL;
      const cellY = destRow * CELL;
      blitFrame(
        source,
        srcCol * srcCell,
        plan.srcRow * srcCell,
        srcCell,
        srcCell,
        png,
        cellX,
        cellY,
        metrics,
      );
      if (rowName !== 'fly' && rowName !== 'flyLeft') {
        removeFloatingGapRows(png, cellX, cellY);
      }
    }
  }

  fs.writeFileSync(outPath, PNG.sync.write(png));
  console.log('Built spritesheet from', path.basename(sheetPath), 'at', outPath);
}

function measureRowMetrics(source, rowName, srcCell) {
  const plan = ETENNE_LAYOUT[rowName];
  const boxes = [];

  for (let col = 0; col < plan.frames; col += 1) {
    const srcCol = (plan.startCol ?? 0) + col;
    const box = bounds(source, srcCol * srcCell, plan.srcRow * srcCell, srcCell, srcCell);
    if (box) boxes.push(box);
  }

  if (!boxes.length) {
    return { maxH: srcCell, maxW: srcCell, scale: 1 };
  }

  const maxH = Math.max(...boxes.map((b) => b.h));
  const maxW = Math.max(...boxes.map((b) => b.w));
  const scale = Math.min(CELL / maxW, TARGET_BODY_H / maxH, 1.35);

  return { maxH, maxW, scale };
}

function bounds(img, offsetX = 0, offsetY = 0, width = img.width, height = img.height) {
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = ((offsetY + y) * img.width + (offsetX + x)) * 4 + 3;
      if (img.data[i] < 12) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX) return null;
  return { minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function sample(img, sx, sy) {
  const x = Math.max(0, Math.min(img.width - 1, sx));
  const y = Math.max(0, Math.min(img.height - 1, sy));
  const i = (img.width * y + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
}

function paintPixel(target, x, y, rgba) {
  if (x < 0 || y < 0 || x >= target.width || y >= target.height) return;
  const [r, g, b, a] = rgba;
  if (a < 12) return;
  const i = (target.width * y + x) * 4;
  target.data[i] = r;
  target.data[i + 1] = g;
  target.data[i + 2] = b;
  target.data[i + 3] = a;
}

function clearPixel(target, x, y) {
  if (x < 0 || y < 0 || x >= target.width || y >= target.height) return;
  const i = (target.width * y + x) * 4;
  target.data[i + 3] = 0;
}

function blitFrame(source, sx, sy, sw, sh, target, cellX, cellY, metrics) {
  const box = bounds(source, sx, sy, sw, sh);
  if (!box) return;

  const scale = metrics.scale;
  const outW = Math.max(1, Math.round(box.w * scale));
  const outH = Math.max(1, Math.round(box.h * scale));
  const slotW = Math.max(1, Math.round(metrics.maxW * scale));
  const footLine = cellY + CELL - 2;
  const offsetX = cellX + Math.floor((CELL - slotW) / 2);
  const padX = Math.floor(((metrics.maxW - box.w) * scale) / 2);
  const offsetY = footLine - outH + 1;

  for (let oy = 0; oy < outH; oy += 1) {
    const ly = Math.min(box.h - 1, Math.floor((oy * box.h) / outH));
    for (let ox = 0; ox < outW; ox += 1) {
      const lx = Math.min(box.w - 1, Math.floor((ox * box.w) / outW));
      const rgba = sample(source, sx + box.minX + lx, sy + box.minY + ly);
      if (rgba[3] < 12) continue;
      paintPixel(target, offsetX + padX + ox, offsetY + oy, rgba);
    }
  }
}

function rowPixelCount(target, cellX, cellY, localY) {
  let n = 0;
  for (let x = cellX; x < cellX + CELL; x += 1) {
    const i = (target.width * (cellY + localY) + x) * 4 + 3;
    if (target.data[i] >= 12) n += 1;
  }
  return n;
}

function rowWhiteCount(target, cellX, cellY, localY) {
  let n = 0;
  for (let x = cellX; x < cellX + CELL; x += 1) {
    const i = (target.width * (cellY + localY) + x) * 4;
    if (target.data[i + 3] < 12) continue;
    if (target.data[i] > 240 && target.data[i + 1] > 240 && target.data[i + 2] > 240) n += 1;
  }
  return n;
}

/** Remove só pixels flutuando com linha vazia abaixo (o `---` real). Preserva contorno da cabeça. */
function removeFloatingGapRows(target, cellX, cellY) {
  for (let pass = 0; pass < 4; pass += 1) {
    const box = bounds(target, cellX, cellY, CELL, CELL);
    if (!box) return;

    const y = box.minY;
    if (y > box.minY + 6) return;

    const total = rowPixelCount(target, cellX, cellY, y);
    if (total === 0) return;
    if (rowWhiteCount(target, cellX, cellY, y) >= 2) return;

    let gapRows = 0;
    for (let y2 = y + 1; y2 <= Math.min(box.maxY, y + 4); y2 += 1) {
      if (rowPixelCount(target, cellX, cellY, y2) === 0) {
        gapRows += 1;
        continue;
      }
      break;
    }

    if (gapRows === 0) return;

    for (let x = cellX; x < cellX + CELL; x += 1) {
      clearPixel(target, x, cellY + y);
    }
  }
}
