// Build-Zeit: prüft, ob ein Bild in public/img/ liegt, und liest Breite/Höhe (JPEG/PNG/WebP).
// Fehlt das Bild (Gemini-Fotos noch nicht da), rendern die Komponenten eine neutrale Fläche.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'public', 'img');

function size(buf: Buffer): [number, number] | null {
  if (buf[0] === 0x89 && buf[1] === 0x50) return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const t = buf.toString('ascii', 12, 16);
    if (t === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
    if (t === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
    if (t === 'VP8L') { const b = buf.readUInt32LE(21); return [(b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1]; }
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

export function img(name: string) {
  const base = name.replace(/\.(jpe?g|png|webp)$/i, '');
  for (const ext of ['.webp', '.jpg', '.jpeg', '.png']) {
    const p = join(DIR, base + ext);
    if (existsSync(p)) {
      const s = size(readFileSync(p));
      return { src: `${import.meta.env.BASE_URL}img/${base}${ext}`, width: s?.[0] ?? 1200, height: s?.[1] ?? 900 };
    }
  }
  return null;
}
