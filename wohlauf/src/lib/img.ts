// Fotos: public/img/<name>.jpg (aus PROMPTS.txt). Fehlt ein Bild, wird der Bildplatz weggelassen (keine Platzhalter).
import fs from 'node:fs';
import path from 'node:path';
const dir = path.join(process.cwd(), 'public', 'img');
export const has = (name: string) => fs.existsSync(path.join(dir, `${name}.jpg`));
export const src = (name: string) => `${import.meta.env.BASE_URL}img/${name}.jpg`;
