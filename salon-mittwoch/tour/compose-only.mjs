// Пересборка итогового ролика из готового preview\mittwoch-raw.mp4 (без новой съёмки)
import {compose} from './engine.mjs';
const {meta} = await import('./mittwoch.tour.mjs');
await compose({raw: 'preview/mittwoch-raw.mp4', outDir: 'preview', name: 'mittwoch', meta});
console.log('Готово: preview\\mittwoch-16x9.mp4');
