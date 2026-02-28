// Generates minimal PNG icons for CopyFlow
// Run: node scripts/generate-icons.js
// Creates 16x16, 48x48, 128x128 PNGs in public/icon/

import { writeFileSync, mkdirSync } from 'fs';

// Minimal PNG encoder (no dependencies needed)
function createPNG(width, height, rgbaPixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 6;  // color type: RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = makeChunk('IHDR', ihdrData);

  // IDAT chunk — raw image data with filter bytes
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = y * (1 + width * 4) + 1 + x * 4;
      rawData[dstIdx] = rgbaPixels[srcIdx];
      rawData[dstIdx + 1] = rgbaPixels[srcIdx + 1];
      rawData[dstIdx + 2] = rgbaPixels[srcIdx + 2];
      rawData[dstIdx + 3] = rgbaPixels[srcIdx + 3];
    }
  }

  const { deflateSync } = await import('zlib');
  const compressed = deflateSync(rawData);
  const idat = makeChunk('IDAT', compressed);

  // IEND chunk
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

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

function drawIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);

  function setPixel(x, y, r, g, b, a = 255) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const idx = (y * size + x) * 4;
    // Alpha blend
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

  function fillRect(x1, y1, w, h, r, g, b, a = 255) {
    for (let y = Math.floor(y1); y < Math.ceil(y1 + h); y++) {
      for (let x = Math.floor(x1); x < Math.ceil(x1 + w); x++) {
        setPixel(x, y, r, g, b, a);
      }
    }
  }

  function fillCircle(cx, cy, radius, r, g, b, a = 255) {
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
      for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
        const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        if (dist <= radius) {
          setPixel(x, y, r, g, b, a);
        }
      }
    }
  }

  function fillRoundRect(x1, y1, w, h, rad, r, g, b, a = 255) {
    // Fill center
    fillRect(x1 + rad, y1, w - rad * 2, h, r, g, b, a);
    fillRect(x1, y1 + rad, w, h - rad * 2, r, g, b, a);
    // Fill corners
    fillCircle(x1 + rad, y1 + rad, rad, r, g, b, a);
    fillCircle(x1 + w - rad, y1 + rad, rad, r, g, b, a);
    fillCircle(x1 + rad, y1 + h - rad, rad, r, g, b, a);
    fillCircle(x1 + w - rad, y1 + h - rad, rad, r, g, b, a);
  }

  const s = size;
  const p = Math.max(1, Math.floor(s * 0.06));

  // Background — blue rounded square
  fillRoundRect(p, p, s - p * 2, s - p * 2, Math.floor(s * 0.2), 76, 110, 245);

  // Clipboard body — white
  const cbX = Math.floor(s * 0.25);
  const cbY = Math.floor(s * 0.24);
  const cbW = Math.floor(s * 0.5);
  const cbH = Math.floor(s * 0.58);
  fillRoundRect(cbX, cbY, cbW, cbH, Math.floor(s * 0.05), 255, 255, 255);

  // Clipboard clip (top tab)
  const tabW = Math.floor(s * 0.22);
  const tabH = Math.max(2, Math.floor(s * 0.08));
  const tabX = Math.floor(s * 0.5 - tabW / 2);
  const tabY = cbY - Math.floor(tabH * 0.4);
  fillRoundRect(tabX, tabY, tabW, tabH, Math.floor(s * 0.02), 255, 255, 255);

  // Text lines on clipboard (blue, subtle)
  if (s >= 32) {
    const lineH = Math.max(1, Math.floor(s * 0.03));
    const lineX = cbX + Math.floor(cbW * 0.15);
    fillRect(lineX, cbY + cbH * 0.3, cbW * 0.65, lineH, 76, 110, 245, 80);
    fillRect(lineX, cbY + cbH * 0.45, cbW * 0.45, lineH, 76, 110, 245, 80);
    fillRect(lineX, cbY + cbH * 0.6, cbW * 0.55, lineH, 76, 110, 245, 80);
  }

  // Green accent circle (bottom right)
  const circR = Math.floor(s * 0.15);
  const circX = Math.floor(s * 0.73);
  const circY = Math.floor(s * 0.73);
  fillCircle(circX, circY, circR, 55, 178, 77);

  // Checkmark in green circle
  if (s >= 32) {
    const cw = Math.max(1, Math.floor(s * 0.02));
    for (let i = 0; i < circR * 0.4; i++) {
      for (let t = 0; t < cw; t++) {
        setPixel(circX - circR * 0.25 + i, circY + i * 0.5 + t, 255, 255, 255);
      }
    }
    for (let i = 0; i < circR * 0.7; i++) {
      for (let t = 0; t < cw; t++) {
        setPixel(circX - circR * 0.25 + circR * 0.4 + i, circY + circR * 0.2 - i * 0.5 + t, 255, 255, 255);
      }
    }
  }

  return pixels;
}

// Generate all sizes
const sizes = [16, 48, 128];

mkdirSync('public/icon', { recursive: true });

for (const size of sizes) {
  const pixels = drawIcon(size);
  const png = await createPNG(size, size, pixels);
  writeFileSync(`public/icon/icon-${size}.png`, png);
  console.log(`Created icon-${size}.png`);
}

console.log('All icons generated!');
