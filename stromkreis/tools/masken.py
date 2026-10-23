"""Kontur-Maske der Räume aus der Differenz haus-dunkel.jpg / haus-hell.jpg (Gemini, gleicher Ausschnitt).
Aufruf: python3 tools/masken.py public/img  -> schreibt Polygone, Lampen- und Pin-Punkte (in %) nach stdout als JSON.
Nur Auswertung vorhandener Bilder (Kontur nach Bild), nichts wird gezeichnet."""
import sys, json
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from scipy.spatial import ConvexHull

img = sys.argv[1] if len(sys.argv) > 1 else 'public/img'
d = np.asarray(Image.open(f'{img}/haus-dunkel.jpg').convert('L'), dtype=float)
rgbh = np.asarray(Image.open(f'{img}/haus-hell.jpg').convert('RGB'), dtype=float)
h = rgbh.mean(axis=2)
H, W = d.shape
diff = ndi.gaussian_filter(h - d, 3)
m = diff > 25
m = ndi.binary_fill_holes(ndi.binary_opening(ndi.binary_closing(m, iterations=8), iterations=4))
lab, n = ndi.label(m)
blobs = []
for i in range(1, n + 1):
    ys, xs = np.where(lab == i)
    if len(ys) < 0.003 * H * W:
        continue
    blobs.append((i, ys, xs))

def hull(ys, xs, k=8):
    pts = np.c_[xs, ys].astype(float)
    hv = pts[ConvexHull(pts).vertices]
    # auf ≤k Ecken vereinfachen: kleinste Dreiecksflächen zuerst entfernen
    while len(hv) > k:
        a = np.roll(hv, 1, 0); c = np.roll(hv, -1, 0)
        area = 0.5 * np.abs((hv[:, 0] - a[:, 0]) * (c[:, 1] - a[:, 1]) - (c[:, 0] - a[:, 0]) * (hv[:, 1] - a[:, 1]))
        hv = np.delete(hv, area.argmin(), 0)
    return [[round(100 * x / W, 1), round(100 * y / H, 1)] for x, y in hv]

res = {}
for i, ys, xs in blobs:
    cx, cy = 100 * xs.mean() / W, 100 * ys.mean() / H
    x0, x1, y0, y1 = 100 * xs.min() / W, 100 * xs.max() / W, 100 * ys.min() / H, 100 * ys.max() / H
    # Lampe: stärkste Aufhellung im oberen Drittel des Raums
    top = ys < ys.min() + (ys.max() - ys.min()) * 0.4
    k = np.argmax(diff[ys[top], xs[top]])
    lamp = [round(100 * xs[top][k] / W, 1), round(100 * ys[top][k] / H, 1)]
    area = 100 * len(ys) / (H * W)
    res[i] = dict(area=round(area, 1), cx=round(cx, 1), cy=round(cy, 1), bbox=[round(x0, 1), round(y0, 1), round(x1, 1), round(y1, 1)], poly=hull(ys, xs), lamp=lamp)

# Garten: grün dominierende Pixel im linken Streifen des hellen Bildes
strip = rgbh[:, : int(W * 0.24)]
g = (strip[:, :, 1] > strip[:, :, 0] * 1.08) & (strip[:, :, 1] > strip[:, :, 2] * 1.08) & (strip[:, :, 1] > 40)
g = ndi.binary_opening(g, iterations=2)
ys, xs = np.where(g)
if len(ys):
    res['garten_gruen'] = dict(bbox=[round(100 * xs.min() / W, 1), round(100 * ys.min() / H, 1), round(100 * xs.max() / W, 1), round(100 * ys.max() / H, 1)], n=int(len(ys)))
print(json.dumps(res, indent=1))
