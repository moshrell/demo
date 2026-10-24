"""Glanzleistung: Medien aus dem Blender-Paket (bay-film/v3) für die Seite aufbereiten.

Aufruf:  python3 scripts/media.py <pfad-zu-bay-film/v3>
Schreibt nach public/media/ (WebP, MP4/WebM) und src/data/media.json (Maße, Ausschnitte).
Läuft gleich in der Cloud und auf dem PC, damit keine großen Dateien hin- und herkopiert werden müssen.
"""
import json, subprocess, sys
from pathlib import Path
from PIL import Image, ImageFilter
import numpy as np

SRC = Path(sys.argv[1] if len(sys.argv) > 1 else '../bay-film/v3').resolve()
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'media'
OUT.mkdir(parents=True, exist_ok=True)
for old in OUT.glob('*'):
    old.unlink()

def webp(src, dst, q=80, size=None, mode='RGB'):
    im = Image.open(SRC / src).convert(mode)
    if size: im = im.resize(size, Image.LANCZOS)
    im.save(OUT / dst, 'WEBP', quality=q, method=6)

def ff(*args):
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *args], check=True)

# --- Box (Gesamtbild) ---
webp('box_clean.png', 'box-clean.webp', 82)

# Zone „Lack“ (Kuppelmaske) in halber Auflösung, als Alpha
def mk(n): return np.asarray(Image.open(SRC / f'masks/mask_{n}.png').convert('L'), dtype=np.float32) / 255

# --- Folie: Licht-, Glanz- und Normalen-Pass, auf das Auto zugeschnitten ---
mask = np.asarray(Image.open(SRC / 'masks/mask_body.png').convert('L'))
ys, xs = np.where(mask > 4)
pad = 6
x0, y0 = max(0, xs.min() - pad), max(0, ys.min() - pad)
x1, y1 = min(mask.shape[1], xs.max() + pad + 1), min(mask.shape[0], ys.max() + pad + 1)
box = (int(x0), int(y0), int(x1), int(y1))
d = Image.open(SRC / 'passes/body_diffuse_light.png').convert('RGB').crop(box)
d.putalpha(Image.fromarray(mask).crop(box))


# --- Staub-Ebene für die Box (sichtbarer Schmutz; blendet nach dem Intro ein) ---
rng = np.random.default_rng(7)
def fbm(h, w, cells, octaves=4, seed=0):
    r = np.random.default_rng(seed); out = np.zeros((h, w), np.float32); amp, tot = 1.0, 0.0
    for o in range(octaves):
        ch, cw = max(2, int(cells[0] * 2 ** o)), max(2, int(cells[1] * 2 ** o))
        a = Image.fromarray((r.random((ch, cw)) * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
        out += np.asarray(a, np.float32) / 255 * amp; tot += amp; amp *= 0.5
    return out / tot
x0, y0, x1, y1 = box
# Ebene deckt Karosserie, Räder, Reifen, Glas ab
allm = np.maximum.reduce([mk('body'), mk('wheels'), mk('tires'), mk('glass')])
ys2, xs2 = np.where(allm > 0.02)
dx0, dy0, dx1, dy1 = max(0, xs2.min() - 4), max(0, ys2.min() - 4), min(1440, xs2.max() + 5), min(2560, ys2.max() + 5)
dbox = (int(dx0), int(dy0), int(dx1), int(dy1))
cr = lambda a: a[dbox[1]:dbox[3], dbox[0]:dbox[2]]
h, w = cr(allm).shape
b, wh, ti, gl = [cr(mk(n)) for n in ('body', 'wheels', 'tires', 'glass')]
lum = np.asarray(Image.open(SRC / 'passes/body_diffuse_light.png').convert('L'), np.float32)[dbox[1]:dbox[3], dbox[0]:dbox[2]] / 255
blot = fbm(h, w, (2, 3), 3, 1)
fine = fbm(h, w, (h // 6, w // 6), 2, 2)
streak = fbm(h, w, (3, w // 5), 3, 3)
ygrad = np.linspace(0.75, 1.25, h, dtype=np.float32)[:, None]
dots = (np.random.default_rng(5).random((h, w)) > 0.9935).astype(np.float32)
spots = np.clip(np.asarray(Image.fromarray((dots * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.8)), np.float32) / 255 * 10, 0, 1)
a_body = np.clip(b * (0.10 + 0.20 * (blot - 0.35) + 0.11 * (streak - 0.3) + 0.35 * spots + 0.22 * np.clip(lum, 0, 1)) * ygrad, 0, 0.58)
a_wheel = np.clip(wh * (0.30 + 0.30 * blot + 0.2 * spots), 0, 0.6)
a_tire = np.clip(ti * (0.26 + 0.24 * blot + 0.16 * streak), 0, 0.6)
a_glass = np.clip(gl * (0.06 + 0.14 * blot + 0.2 * spots), 0, 0.3)
shade = 0.7 + 0.5 * np.clip(lum, 0, 1)
c_body = np.array([160, 156, 148], np.float32)[None, None] * shade[..., None]
c_wheel = np.array([70, 56, 48], np.float32)[None, None] * np.ones((h, w, 1), np.float32)
c_tire = np.array([128, 120, 108], np.float32)[None, None] * np.ones((h, w, 1), np.float32)
c_glass = np.array([170, 170, 160], np.float32)[None, None] * np.ones((h, w, 1), np.float32)
A = a_body + a_wheel + a_tire + a_glass
rgb = (a_body[..., None] * c_body + a_wheel[..., None] * c_wheel + a_tire[..., None] * c_tire + a_glass[..., None] * c_glass) / np.maximum(A[..., None], 1e-4)

# --- Zonen der Clip-Standbilder (wo sich Schmutz- und Sauberbild unterscheiden) + mehr Schmutz im Rad ---
from PIL import ImageFilter
def zone_from(dirty, clean, name, gain=18):
    A_ = np.asarray(Image.open(SRC / dirty).convert('RGB'), np.float32); B_ = np.asarray(Image.open(SRC / clean).convert('RGB'), np.float32)
    d = np.abs(A_ - B_).mean(2)
    z_ = Image.fromarray(np.clip(d * gain, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(5))
    zz = Image.new('RGBA', z_.size, (255, 255, 255, 0)); zz.putalpha(z_); zz.save(OUT / f'zone-{name}.png', optimize=True)
    return np.asarray(z_, np.float32) / 255
zone_from('clips/box_to_lack_under_lamp_dirty.png', 'clips/box_to_lack_under_lamp_clean.png', 'lack')
zw = zone_from('clips/box_to_wheel_last_dirty.png', 'clips/box_to_wheel_last_clean.png', 'wheel')
# Rad: Bremsstaub und Straßenfilm in das Schmutzbild einbacken
wd = np.asarray(Image.open(SRC / 'clips/box_to_wheel_last_dirty.png').convert('RGB'), np.float32)
hh, ww = wd.shape[:2]
bl = fbm(hh, ww, (4, 3), 5, 11); sp = np.clip((fbm(hh, ww, (hh // 5, ww // 5), 2, 12) - 0.6) * 5, 0, 1)
aw = np.clip(zw * (0.38 + 0.35 * bl + 0.25 * sp), 0, 0.8)[..., None]
wd = wd * (1 - aw) + np.array([112, 100, 88], np.float32) * (0.55 + 0.6 * (wd.mean(2, keepdims=True) / 255)) * aw
Image.fromarray(np.clip(wd, 0, 255).astype(np.uint8)).save(OUT / 'wheel-dirty.webp', 'WEBP', quality=82, method=6)

# --- Stationen (Nahaufnahmen derselben Kamera) ---
stations = json.loads((SRC / 'stations/stations.json').read_text())
for sid in ['st_zeiten', 'st_anfahrt', 'st_auftrag', 'st_gaestebuch', 'st_funk', 'st_recht']:
    Image.open(SRC / f'stations/{sid}.png').convert('RGB').resize((900, 1600), Image.LANCZOS).save(OUT / (sid.replace('st_', 'st-') + '.webp'), 'WEBP', quality=76, method=6)

# --- Kamerafahrten (Clips) + End-Standbilder ---
for name, src in [('lack', 'box_to_lack'), ('wheel', 'box_to_wheel'), ('interior', 'box_to_interior')]:
    ff('-i', str(SRC / f'clips/{src}.mp4'), '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '24',
       '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(OUT / f'clip-{name}.mp4'))
    if name != 'wheel': webp(f'clips/{src}_last_dirty.png', f'{name}-dirty.webp', 80)
    webp(f'clips/{src}_last_clean.png', f'{name}-clean.webp', 80)
webp('clips/box_to_lack_under_lamp_dirty.png', 'lamp-dirty.webp', 80)
webp('clips/box_to_lack_under_lamp_clean.png', 'lamp-clean.webp', 80)


hs = json.loads((SRC / 'hotspots.json').read_text())
stations['st_gaestebuch']['corners'] = [[484, 918], [1020, 914], [988, 1282], [468, 1280]]  # nur das Papier, nicht das ganze Notizbuch
meta = {
    'W': 1440, 'H': 2560,
    'paintBox': [box[0], box[1], box[2] - box[0], box[3] - box[1]],
    'surfaces': hs['surfaces'],
    'hotspots': {k: v['px'] for k, v in hs['hotspots'].items()},
    'stations': {k.replace('st_', ''): {'crop': v['crop'], 'corners': v['corners'], 'surface': v['surface']} for k, v in stations.items()},
}
(ROOT / 'src' / 'data' / 'media.json').write_text(json.dumps(meta, indent=1))
total = 0
for f in sorted(OUT.iterdir()):
    total += f.stat().st_size
    print(f'{f.stat().st_size / 1024:8.0f} KB  {f.name}')
print(f'{total / 1024 / 1024:.1f} MB gesamt')
