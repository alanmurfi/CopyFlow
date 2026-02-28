// Generates PNG icons for CopyFlow
// Run: node scripts/generate-icons.mjs

import { writeFileSync, mkdirSync } from 'fs';
import { deflateSync } from 'zlib';

function makeChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createPNG(width, height, rgbaPixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; ihdrData[9] = 6;
  const ihdr = makeChunk('IHDR', ihdrData);

  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0;
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = y * (1 + width * 4) + 1 + x * 4;
      rawData[dstIdx] = rgbaPixels[srcIdx];
      rawData[dstIdx + 1] = rgbaPixels[srcIdx + 1];
      rawData[dstIdx + 2] = rgbaPixels[srcIdx + 2];
      rawData[dstIdx + 3] = rgbaPixels[srcIdx + 3];
    }
  }

  const compressed = deflateSync(rawData);
  const idat = makeChunk('IDAT', compressed);
  const iend = makeChunk('IEND', Buffer.alloc(0));
  return Buffer.concat([signature, ihdr, idat, iend]);
}

function setPixel(pixels, size, x, y, r, g, b, a = 255) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || x >= size || y < 0 || y >= size) return;
  const idx = (y * size + x) * 4;
  const srcA = a / 255;
  const dstA = pixels[idx + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA > 0) {
    pixels[idx] = Math.round((r * srcA + pixels[idx] * dstA * (1 - srcA)) / outA);
    pixels[idx + 1] = Math.round((g * srcA + pixels[idx + 1] * dstA * (1 - srcA)) / outA);
    pixels[idx + 2] = Math.round((b * srcA + pixels[idx + 2] * dstA * (1 - srcA)) / outA);
    pixels[idx + 3] = Math.round(outA * 255);
  }
}

function fillRect(pixels, size, x1, y1, w, h, r, g, b, a = 255) {
  for (let y = Math.floor(y1); y < Math.ceil(y1 + h); y++)
    for (let x = Math.floor(x1); x < Math.ceil(x1 + w); x++)
      setPixel(pixels, size, x, y, r, g, b, a);
}

function fillCircle(pixels, size, cx, cy, radius, r, g, b, a = 255) {
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++)
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++)
      if (Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) <= radius)
        setPixel(pixels, size, x, y, r, g, b, a);
}

function fillRoundRect(pixels, size, x1, y1, w, h, rad, r, g, b, a = 255) {
  fillRect(pixels, size, x1 + rad, y1, w - rad * 2, h, r, g, b, a);
  fillRect(pixels, size, x1, y1 + rad, w, h - rad * 2, r, g, b, a);
  fillCircle(pixels, size, x1 + rad, y1 + rad, rad, r, g, b, a);
  fillCircle(pixels, size, x1 + w - rad - 1, y1 + rad, rad, r, g, b, a);
  fillCircle(pixels, size, x1 + rad, y1 + h - rad - 1, rad, r, g, b, a);
  fillCircle(pixels, size, x1 + w - rad - 1, y1 + h - rad - 1, rad, r, g, b, a);
}

function drawIcon(s) {
  const pixels = Buffer.alloc(s * s * 4);
  const p = Math.max(1, Math.floor(s * 0.06));

  // Blue rounded background
  fillRoundRect(pixels, s, p, p, s - p * 2, s - p * 2, Math.floor(s * 0.18), 76, 110, 245);

  // White clipboard body
  const cbX = Math.floor(s * 0.25), cbY = Math.floor(s * 0.24);
  const cbW = Math.floor(s * 0.5), cbH = Math.floor(s * 0.58);
  fillRoundRect(pixels, s, cbX, cbY, cbW, cbH, Math.max(1, Math.floor(s * 0.04)), 255, 255, 255);

  // White clip tab
  const tabW = Math.floor(s * 0.22), tabH = Math.max(2, Math.floor(s * 0.08));
  const tabX = Math.floor(s * 0.5 - tabW / 2), tabY = cbY - Math.floor(tabH * 0.4);
  fillRoundRect(pixels, s, tabX, tabY, tabW, tabH, Math.max(1, Math.floor(s * 0.02)), 255, 255, 255);

  // Text lines on clipboard
  if (s >= 32) {
    const lh = Math.max(1, Math.floor(s * 0.03));
    const lx = cbX + Math.floor(cbW * 0.15);
    fillRect(pixels, s, lx, cbY + cbH * 0.32, cbW * 0.65, lh, 76, 110, 245, 80);
    fillRect(pixels, s, lx, cbY + cbH * 0.47, cbW * 0.45, lh, 76, 110, 245, 80);
    fillRect(pixels, s, lx, cbY + cbH * 0.62, cbW * 0.55, lh, 76, 110, 245, 80);
  }

  // Green circle accent
  const cr = Math.max(2, Math.floor(s * 0.15));
  fillCircle(pixels, s, Math.floor(s * 0.73), Math.floor(s * 0.73), cr, 55, 178, 77);

  return pixels;
}

mkdirSync('public/icon', { recursive: true });
for (const size of [16, 48, 128]) {
  const pixels = drawIcon(size);
  const png = createPNG(size, size, pixels);
  writeFileSync(`public/icon/icon-${size}.png`, png);
  console.log(`Created icon-${size}.png (${png.length} bytes)`);
}
console.log('Done!');
