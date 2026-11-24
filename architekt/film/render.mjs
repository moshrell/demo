// Rendert Stills (Kontaktbogen) oder das ganze Video. node render.mjs stills | video
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import path from 'node:path';
const mode = process.argv[2] || 'video';
const out = path.resolve('out'); 
const serveUrl = await bundle({ entryPoint: path.resolve('src/index.ts') });
const chromiumOptions = { gl: 'swangle' };
const composition = await selectComposition({ serveUrl, id: 'Haus', chromiumOptions });
if (mode === 'stills') {
  const frames = (process.argv[3] || '0,30,60,90,120,150,180,210,240,270,299').split(',').map(Number);
  for (const frame of frames) {
    await renderStill({ serveUrl, composition, frame, output: `${out}/${process.env.STILLS || "stills"}/f${String(frame).padStart(3, '0')}.jpg`, imageFormat: 'jpeg', jpegQuality: 90, chromiumOptions });
    console.log('still', frame);
  }
} else {
  await renderMedia({ serveUrl, composition, codec: 'h264', crf: 16, outputLocation: `${out}/haus-master.mp4`, chromiumOptions, concurrency: 2,
    onProgress: ({ progress }) => { if (Math.round(progress * 100) % 10 === 0) process.stdout.write(`\r${Math.round(progress * 100)}%`); } });
  console.log('\nok');
}
