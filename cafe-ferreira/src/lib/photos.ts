// Фото кладутся в src/photos/ под именами из PHOTOS.md. Расширение любое (jpg, jpeg, png, webp, avif, svg).
// Нет файла — сайт показывает плитку азулежу вместо снимка и не ломается.
import type { ImageMetadata } from 'astro';

const found = import.meta.glob<{ default: ImageMetadata }>('../photos/*.{jpg,jpeg,png,webp,avif,svg,JPG,JPEG,PNG,WEBP,SVG}', { eager: true });

const byName = new Map<string, ImageMetadata>();
for (const [path, mod] of Object.entries(found)) {
  const name = path.split('/').pop()!.replace(/\.[^.]+$/, '').toLowerCase();
  byName.set(name, mod.default);
}

export const photo = (name: string): ImageMetadata | undefined => byName.get(name.toLowerCase());
