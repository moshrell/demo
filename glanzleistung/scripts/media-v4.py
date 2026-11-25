#!/usr/bin/env python3
"""Baut public/media aus dem Blender-Paket v4 (bay-film\\v4\\out) für die Seite.
Aufruf (im Projektordner):  python3 scripts/media-v4.py <pfad-zu-v4\\out>
Bereits vorhandene, neuere Dateien werden übersprungen (mit --force neu bauen).
Ergebnis (alles WebP/MP4, nichts davon wird beim Start geladen, nur bei Bedarf):
  media/wrap/m/{box,hood}-<farbe>-<finish>.webp   mobil: Box 1440x2560, Haube 720x1280
  media/wrap/d/{box,hood}-<farbe>-<finish>.webp   Desktop: Box 2560x1440, Haube 1280x720
  media/d/box-clean.webp, st-<id>.webp            Desktop-Bühne und Stationen (2560x1440)
  media/d/clip-{lack,wheel,interior}.mp4 + *-clean/dirty.webp + zone-*.png (Maske aus dem Unterschied)
  media/intro-{m,d}.mp4 + poster-{m,d}.webp
"""
import sys, os, subprocess, json
from concurrent.futures import ProcessPoolExecutor
from PIL import Image, ImageFilter, ImageChops

SRC = sys.argv[1]
FORCE = '--force' in sys.argv
WEBP_ONLY = '--webp-only' in sys.argv
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'media')
P = lambda *a: os.path.join(SRC, *a)
O = lambda *a: os.path.join(OUT, *a)
COLORS = ['nordlicht', 'chromrose', 'perlmutt', 'pistazie', 'kirsch', 'tiefsee', 'giftgruen', 'graphit']
FIN = ['matt', 'satin', 'glanz']

def webp(src, dst, q, size=None):
    if not FORCE and os.path.exists(dst) and os.path.getmtime(dst) > os.path.getmtime(src): return dst
    if os.path.exists(dst): os.truncate(dst, 0)  # Überschreiben statt Löschen (Löschen ist im Projektordner gesperrt)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    im = Image.open(src).convert('RGB')
    if size and im.size != tuple(size): im = im.resize(size, Image.LANCZOS)
    im.save(dst, 'WEBP', quality=q, method=6)
    return dst

def job(a): return webp(*a)

def zone(dirty, clean, dst):
    """Maske: wo sich das Bild zwischen 'stumpf' und 'sauber' unterscheidet (Lack, Reifen, Felgen)."""
    if not FORCE and os.path.exists(dst): return
    a = Image.open(dirty).convert('RGB'); b = Image.open(clean).convert('RGB')
    d = ImageChops.difference(a, b).convert('L')
    d = d.point(lambda v: 255 if v > 5 else 0).filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.GaussianBlur(3))
    d = d.point(lambda v: min(255, v * 2))
    rgba = Image.new('RGBA', a.size, (0, 0, 0, 0)); rgba.putalpha(d)
    rgba.save(dst, 'PNG', optimize=True)

def video(src, dst, crf, scale=None):
    if not FORCE and os.path.exists(dst) and os.path.getmtime(dst) > os.path.getmtime(src): return
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    cmd = ['ffmpeg', '-y', '-v', 'error', '-i', src, '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', str(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-g', '48', dst]
    subprocess.run(cmd, check=True)

def poster(src, dst, q=78):
    if not FORCE and os.path.exists(dst): return
    import tempfile
    with tempfile.TemporaryDirectory() as td:  # Zwischendatei nicht im Projekt (Löschen ist dort gesperrt)
        tmp = os.path.join(td, 'f.png')
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', src, '-frames:v', '1', tmp], check=True)
        Image.open(tmp).convert('RGB').save(dst, 'WEBP', quality=q, method=6)

if __name__ == '__main__':
    jobs = []
    for c in COLORS:
        for f in FIN:
            jobs.append((P('wrap', f'box_{c}_{f}.png'), O('wrap', 'm', f'box-{c}-{f}.webp'), 84))
            jobs.append((P('wrap', f'hood_{c}_{f}.png'), O('wrap', 'm', f'hood-{c}-{f}.webp'), 86))
            jobs.append((P('wrap-desktop', f'box_{c}_{f}.png'), O('wrap', 'd', f'box-{c}-{f}.webp'), 84))
            jobs.append((P('wrap-desktop', f'hood_{c}_{f}.png'), O('wrap', 'd', f'hood-{c}-{f}.webp'), 86))
    jobs.append((P('desktop', 'box_clean.png'), O('d', 'box-clean.webp'), 90))
    for s in ['zeiten', 'anfahrt', 'auftrag', 'gaestebuch', 'funk', 'recht', 'folie']:
        jobs.append((P('desktop', 'stations', f'st_{s}.png'), O('d', f'st-{s}.webp'), 88))
    for n, k in [('lack', 'lack'), ('wheel', 'wheel'), ('interior', 'interior')]:
        jobs.append((P('desktop-clips', f'box_to_{k}_last_clean.png'), O('d', f'{n}-clean.webp'), 88))
        if n != 'interior': jobs.append((P('desktop-clips', f'box_to_{k}_last_dirty.png'), O('d', f'{n}-dirty.webp'), 88))
    with ProcessPoolExecutor(2) as ex: list(ex.map(job, jobs, chunksize=4))
    print('webp:', len(jobs))
    if WEBP_ONLY: sys.exit(0)
    for n in ['lack', 'wheel']:
        zone(P('desktop-clips', f'box_to_{n}_last_dirty.png'), P('desktop-clips', f'box_to_{n}_last_clean.png'), O('d', f'zone-{n}.png'))
    for n in ['lack', 'wheel', 'interior']:
        video(P('desktop-clips', f'box_to_{n}.mp4'), O('d', f'clip-{n}.mp4'), 24)
    video(P('intro', 'final', 'intro_mobile_720x1280.mp4'), O('intro-m.mp4'), 27)
    video(P('intro', 'final', 'intro_desktop_1280x720.mp4'), O('intro-d.mp4'), 26)
    poster(P('intro', 'final', 'intro_mobile_720x1280.mp4'), O('poster-m.webp'))
    poster(P('intro', 'final', 'intro_desktop_1280x720.mp4'), O('poster-d.webp'))
    print('fertig')
