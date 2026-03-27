// Run once: node generate-icons.mjs
// Generates placeholder icons required by Tauri for Windows builds.
// Replace icons/icon.ico and icons/128x128.png with your real app icon later.

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const iconsDir = path.join(__dirname, 'src-tauri', 'icons')
fs.mkdirSync(iconsDir, { recursive: true })

// ── Minimal ICO (32x32 RGBA) ──────────────────────────────────────────────────
function createIco(size = 32) {
  const color = [0x4a, 0x9e, 0xd9, 0xff]   // #4A9ED9 (blue), RGBA

  // BITMAPINFOHEADER (40 bytes)
  const bmpHeader = Buffer.alloc(40)
  bmpHeader.writeUInt32LE(40, 0)            // biSize
  bmpHeader.writeInt32LE(size, 4)           // biWidth
  bmpHeader.writeInt32LE(size * 2, 8)       // biHeight (doubled for ICO)
  bmpHeader.writeUInt16LE(1, 12)            // biPlanes
  bmpHeader.writeUInt16LE(32, 14)           // biBitCount
  // rest zeroed

  // Pixel data bottom-up, BGRA order
  const pixels = Buffer.alloc(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    pixels[i * 4 + 0] = color[2]           // B
    pixels[i * 4 + 1] = color[1]           // G
    pixels[i * 4 + 2] = color[0]           // R
    pixels[i * 4 + 3] = color[3]           // A
  }

  // AND mask (all zeros = fully opaque), DWORD-aligned rows
  const rowBytes = Math.ceil(size / 32) * 4
  const andMask = Buffer.alloc(rowBytes * size)

  const imageData = Buffer.concat([bmpHeader, pixels, andMask])

  // ICO file header (6 bytes)
  const icoHeader = Buffer.alloc(6)
  icoHeader.writeUInt16LE(0, 0)            // reserved
  icoHeader.writeUInt16LE(1, 2)            // type = 1 (ICO)
  icoHeader.writeUInt16LE(1, 4)            // count = 1

  // ICO directory entry (16 bytes)
  const dirEntry = Buffer.alloc(16)
  dirEntry.writeUInt8(size, 0)             // width
  dirEntry.writeUInt8(size, 1)             // height
  dirEntry.writeUInt8(0, 2)               // color count
  dirEntry.writeUInt8(0, 3)               // reserved
  dirEntry.writeUInt16LE(1, 4)            // planes
  dirEntry.writeUInt16LE(32, 6)           // bit count
  dirEntry.writeUInt32LE(imageData.length, 8)
  dirEntry.writeUInt32LE(6 + 16, 12)     // image offset

  return Buffer.concat([icoHeader, dirEntry, imageData])
}

// ── Minimal PNG (solid color) ─────────────────────────────────────────────────
import { createHash } from 'crypto'
import zlib from 'zlib'

function adler32(buf) {
  let a = 1, b = 0
  for (const byte of buf) { a = (a + byte) % 65521; b = (b + a) % 65521 }
  return (b << 16) | a
}

function crc32(buf) {
  let crc = 0xFFFFFFFF
  const table = []
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    table[i] = c
  }
  for (const byte of buf) crc = table[(crc ^ byte) & 0xFF] ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function pngChunk(type, data) {
  const typeB = Buffer.from(type)
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeB, data])))
  return Buffer.concat([len, typeB, data, crc])
}

function createPng(size, r = 0x4a, g = 0x9e, b = 0xd9) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(size, 0)
  ihdrData.writeUInt32BE(size, 4)
  ihdrData[8] = 8   // bit depth
  ihdrData[9] = 2   // color type RGB
  const ihdr = pngChunk('IHDR', ihdrData)

  const raw = []
  for (let y = 0; y < size; y++) {
    raw.push(0)                             // filter: None
    for (let x = 0; x < size; x++) { raw.push(r, g, b) }
  }
  const rawBuf = Buffer.from(raw)
  const compressed = zlib.deflateSync(rawBuf)
  const idat = pngChunk('IDAT', compressed)

  const iend = pngChunk('IEND', Buffer.alloc(0))
  return Buffer.concat([sig, ihdr, idat, iend])
}

// ── Write files ───────────────────────────────────────────────────────────────
const files = [
  ['icon.ico',         () => createIco(32)],
  ['32x32.png',        () => createPng(32)],
  ['128x128.png',      () => createPng(128)],
  ['128x128@2x.png',   () => createPng(256)],
]

for (const [name, gen] of files) {
  const dest = path.join(iconsDir, name)
  fs.writeFileSync(dest, gen())
  console.log(`✓ ${dest}`)
}
console.log('Done. Replace with your real icon when ready.')
