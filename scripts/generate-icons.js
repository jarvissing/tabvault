// scripts/generate-icons.js
// Pure Node.js script (no external npm dependencies required) to generate
// pixel-perfect PNG icons (16x16, 48x48, 128x128) and SVG icon for TabVault.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// CRC32 table for PNG chunk checksums
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const body = Buffer.concat([typeBuf, data]);
  const crcVal = crc32(body);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crcVal, 0);

  return Buffer.concat([lenBuf, body, crcBuf]);
}

function createPng(width, height, renderPixel) {
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  // IHDR chunk: 13 bytes
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bits per channel
  ihdr[9] = 6; // Color type 6 = RGBA
  ihdr[10] = 0; // Compression = deflate
  ihdr[11] = 0; // Filter = standard
  ihdr[12] = 0; // No interlace

  const ihdrChunk = makeChunk('IHDR', ihdr);

  // Scanlines with 0-byte filter prefix per row
  const rowLength = 1 + width * 4;
  const rawData = Buffer.alloc(height * rowLength);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowLength;
    rawData[rowOffset] = 0; // Filter None

    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = renderPixel(x, y, width, height);
      const pixelOffset = rowOffset + 1 + x * 4;
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a;
    }
  }

  const compressedData = zlib.deflateSync(rawData, { level: 9 });
  const idatChunk = makeChunk('IDAT', compressedData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Pixel rendering function for TabVault Icon (Vault + Tabs icon)
function renderTabVaultIcon(x, y, w, h) {
  // Normalize coordinates to [0, 1]
  const nx = x / (w - 1);
  const ny = y / (h - 1);

  // Background: Rounded rectangle with gradient (Deep Indigo to Vibrant Violet)
  const radius = 0.22;
  const dx = Math.max(0, Math.abs(nx - 0.5) - (0.5 - radius));
  const dy = Math.max(0, Math.abs(ny - 0.5) - (0.5 - radius));
  const distToEdge = Math.sqrt(dx * dx + dy * dy);

  if (distToEdge > radius) {
    return [0, 0, 0, 0]; // Transparent outside rounded corner
  }

  // Soft anti-aliasing on corner edge
  const edgeAlpha = Math.min(1, Math.max(0, (radius - distToEdge) * Math.min(w, h)));

  // Base background gradient: Indigo (#4338CA) to Purple (#7C3AED)
  const tGrad = (nx + ny) / 2;
  let bgR = Math.round(67 + (124 - 67) * tGrad);
  let bgG = Math.round(56 + (58 - 56) * tGrad);
  let bgB = Math.round(202 + (237 - 202) * tGrad);

  // Subtle border glow
  if (distToEdge > radius - 0.04) {
    bgR = Math.min(255, bgR + 40);
    bgG = Math.min(255, bgG + 40);
    bgB = Math.min(255, bgB + 50);
  }

  // Draw Foreground Elements:
  // 1. Top Tab Shape (layered tab)
  // 2. Vault Shield with lock keyhole

  let fg = null; // [r, g, b, a]

  // Top tab layered in background: y: 0.20 to 0.32, x: 0.28 to 0.72
  if (ny >= 0.20 && ny <= 0.32 && nx >= 0.28 && nx <= 0.72) {
    fg = [199, 210, 254, 180]; // soft indigo light
  }

  // Primary front tab: y: 0.28 to 0.40, x: 0.22 to 0.78
  if (ny >= 0.28 && ny <= 0.40 && nx >= 0.22 && nx <= 0.78) {
    fg = [224, 231, 255, 230];
  }

  // Vault Shield body: x: 0.24 to 0.76, y: 0.38 to 0.82
  const shieldCenterX = 0.5;
  const shieldTopY = 0.38;
  const shieldBotY = 0.82;
  const shieldHalfW = 0.26;

  if (nx >= shieldCenterX - shieldHalfW && nx <= shieldCenterX + shieldHalfW &&
      ny >= shieldTopY && ny <= shieldBotY) {
    
    // Check shield taper at bottom
    let inShield = true;
    if (ny > 0.60) {
      const taperProgress = (ny - 0.60) / (shieldBotY - 0.60);
      const allowedHalfW = shieldHalfW * (1 - Math.pow(taperProgress, 1.6));
      if (Math.abs(nx - shieldCenterX) > allowedHalfW) {
        inShield = false;
      }
    }

    if (inShield) {
      // White/Cyan vault shield face with subtle metallic sheen
      const sheen = (1 - (ny - shieldTopY) / (shieldBotY - shieldTopY)) * 25;
      const sr = Math.min(255, 245 + sheen);
      const sg = Math.min(255, 248 + sheen);
      const sb = 255;

      // Vault Lock Keyhole:
      // Circle at center (0.5, 0.54) with r = 0.06
      // Slit from (0.48, 0.54) to (0.52, 0.66)
      const lockDist = Math.hypot(nx - 0.5, ny - 0.54);
      const inCircle = lockDist < 0.055;
      const inStem = (ny >= 0.54 && ny <= 0.65 && Math.abs(nx - 0.5) < (0.022 + (ny - 0.54) * 0.1));

      if (inCircle || inStem) {
        fg = [67, 56, 202, 255]; // Deep indigo lock hole
      } else {
        fg = [sr, sg, sb, 255];
      }
    }
  }

  // Blend FG over BG
  if (fg) {
    const alpha = (fg[3] / 255);
    const outR = Math.round(fg[0] * alpha + bgR * (1 - alpha));
    const outG = Math.round(fg[1] * alpha + bgG * (1 - alpha));
    const outB = Math.round(fg[2] * alpha + bgB * (1 - alpha));
    return [outR, outG, outB, Math.round(255 * edgeAlpha)];
  }

  return [bgR, bgG, bgB, Math.round(255 * edgeAlpha)];
}

// Generate SVG string
function generateSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4F46E5"/>
      <stop offset="100%" stop-color="#7C3AED"/>
    </linearGradient>
    <linearGradient id="shieldGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#E0E7FF"/>
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="4" stdDeviation="4" flood-opacity="0.25"/>
    </filter>
  </defs>
  <!-- Base Tile -->
  <rect x="2" y="2" width="124" height="124" rx="28" fill="url(#bgGrad)" stroke="#818CF8" stroke-width="2"/>
  
  <!-- Stacked Tab Preview -->
  <rect x="36" y="24" width="56" height="14" rx="5" fill="#C7D2FE" opacity="0.65"/>
  <rect x="28" y="34" width="72" height="15" rx="5" fill="#E0E7FF" opacity="0.85"/>
  
  <!-- Vault Shield -->
  <g filter="url(#shadow)">
    <path d="M34 46 C 34 46, 64 42, 64 42 C 64 42, 94 46, 94 46 L 94 76 C 94 94, 64 106, 64 106 C 64 106, 34 94, 34 76 Z" 
          fill="url(#shieldGrad)" stroke="#C7D2FE" stroke-width="1.5"/>
    <!-- Keyhole -->
    <circle cx="64" cy="68" r="7" fill="#4338CA"/>
    <polygon points="61,68 67,68 69,82 59,82" fill="#4338CA"/>
  </g>
</svg>`;
}

// Generate files
const iconsDir = path.join(__dirname, '..', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// 1. Save SVG
const svgPath = path.join(iconsDir, 'icon.svg');
fs.writeFileSync(svgPath, generateSvg(), 'utf8');
console.log(`Generated SVG icon: ${svgPath}`);

// 2. Generate PNGs: 16, 48, 128
const sizes = [16, 48, 128];
for (const size of sizes) {
  const pngBuf = createPng(size, size, renderTabVaultIcon);
  const outPath = path.join(iconsDir, `icon-${size}.png`);
  fs.writeFileSync(outPath, pngBuf);
  console.log(`Generated PNG icon: ${outPath} (${size}x${size}, ${pngBuf.length} bytes)`);
}

console.log('Icon generation complete!');
