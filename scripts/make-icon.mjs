#!/usr/bin/env node
/**
 * Генерация webview2/icon.ico без внешних зависимостей.
 * Иконка рисуется программно: фиолетово-синий скруглённый бейдж,
 * белое облако чата и три полосы звуковой волны внутри.
 * Размеры 16–256 кодируются в PNG (zlib) и упаковываются в ICO.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SIZES = [16, 24, 32, 48, 64, 128, 256];
const OUT = "webview2/icon.ico";

/* ---------- рисование ---------- */

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** мягкое покрытие пикселя фигурой (антиалиасинг по расстоянию) */
const cover = (dist, feather) => clamp01(0.5 - dist / feather);

function roundRectDist(x, y, w, h, r) {
  const dx = Math.max(Math.abs(x - w / 2) - (w / 2 - r), 0);
  const dy = Math.max(Math.abs(y - h / 2) - (h / 2 - r), 0);
  return Math.hypot(dx, dy) - r;
}

function render(size) {
  const px = new Uint8Array(size * size * 4);
  const s = size / 256; // масштаб от эталона 256×256
  const feather = Math.max(1, 1.2 * s * 2);

  const put = (i, r, g, b, a) => {
    if (a <= 0) return;
    const ia = px[i + 3] / 255;
    const na = a + ia * (1 - a);
    if (na <= 0) return;
    px[i] = Math.round((r * a + px[i] * ia * (1 - a)) / na);
    px[i + 1] = Math.round((g * a + px[i + 1] * ia * (1 - a)) / na);
    px[i + 2] = Math.round((b * a + px[i + 2] * ia * (1 - a)) / na);
    px[i + 3] = Math.round(na * 255);
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const X = (x + 0.5) / s; // координаты в эталоне 256
      const Y = (y + 0.5) / s;

      /* фон: скруглённый квадрат с диагональным градиентом */
      const bg = cover(roundRectDist(X, Y, 256, 256, 56), 2);
      if (bg > 0) {
        const t = clamp01((X + Y) / 512);
        put(i, Math.round(lerp(139, 79, t)), Math.round(lerp(92, 70, t)), Math.round(lerp(246, 229, t)), bg);
      }

      /* облако чата: рамка + хвостик, вырез внутри */
      const outer = roundRectDist(X, Y, 256, 256, 0);
      void outer;
      const bubbleOuter = roundRectDist(X - 40, Y - 52, 176, 132, 30);
      const bubbleInner = roundRectDist(X - 62, Y - 74, 132, 88, 14);
      let bubble = Math.max(cover(bubbleOuter, 2) - cover(bubbleInner, 2), 0);

      // хвостик — треугольник под облаком
      const tx = X - 84;
      const ty = Y - 176;
      if (ty >= 0 && ty <= 46 && tx >= 0 && tx <= 56 - ty * 0.9) {
        bubble = Math.max(bubble, 1);
      }
      if (bubble > 0) put(i, 255, 255, 255, bubble);

      /* три полосы звуковой волны */
      const bars = [
        [96, 108, 38],
        [120, 92, 70],
        [146, 104, 52],
      ];
      for (const [bx, byTop, bh] of bars) {
        const d = roundRectDist(X - bx, Y - byTop, 22, bh, 11);
        const a = cover(d, 2);
        if (a > 0) put(i, 255, 255, 255, a);
      }
    }
  }
  return px;
}

/* ---------- PNG ---------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function toPng(px, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // бит на канал
  ihdr[9] = 6;   // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // фильтр None
    Buffer.from(px.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------- ICO ---------- */

const images = SIZES.map((size) => ({ size, data: toPng(render(size), size) }));

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);              // тип: иконка
header.writeUInt16LE(images.length, 4);

let offset = 6 + images.length * 16;
const dir = [];
for (const img of images) {
  const e = Buffer.alloc(16);
  e[0] = img.size >= 256 ? 0 : img.size;  // 0 означает 256
  e[1] = img.size >= 256 ? 0 : img.size;
  e[2] = 0;                               // палитра не используется
  e[3] = 0;
  e.writeUInt16LE(1, 4);                  // плоскостей
  e.writeUInt16LE(32, 6);                 // бит на пиксель
  e.writeUInt32LE(img.data.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += img.data.length;
  dir.push(e);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, Buffer.concat([header, ...dir, ...images.map((i) => i.data)]));
console.log(`Иконка готова: ${OUT} (${SIZES.join(", ")} px)`);
