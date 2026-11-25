# stations.py — крупные планы станций: ТА ЖЕ камера финального кадра, меняются только lens и shift.
# Крупный план = точный кроп box-кадра 1440x2560. JSON: focal, shift_x, shift_y, crop (x,y,w,h) в box-пикселях,
# corners — 4 угла пустой поверхности в пикселях крупного плана (TL, TR, BR, BL).
import sys, json, math, bpy
sys.path.insert(0, '/home/claude/bay3d/v3')
import build_v3, final_v3
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

BW, BH = 1440, 2560
FILL = 0.60      # предмет ≈ 60% ширины кадра

STATIONS = {
    'st_zeiten':     (('panel', 'neon_frame'), 'neon_panel'),
    'st_anfahrt':    (('poster_frame',), 'poster_map'),
    'st_auftrag':    (('cashreg', 'receipt'), 'receipt'),
    'st_gaestebuch': (('book_',), 'book_page'),
    'st_funk':       (('radio',), 'radio_screen'),
    'st_recht':      (('elbox',), 'elbox'),
    'st_folie':      (('rack_post', 'film_roll'), 'film_rack'),
}

def proj(sc, cam, p, W, H):
    v = world_to_camera_view(sc, cam, Vector(p)); return (v.x * W, (1 - v.y) * H)

def order_quad(pts):
    """TL, TR, BR, BL по экрану."""
    pts = sorted(pts, key=lambda q: q[1]); top = sorted(pts[:2], key=lambda q: q[0]); bot = sorted(pts[2:], key=lambda q: q[0])
    return [top[0], top[1], bot[1], bot[0]]

def bbox_px(S, prefixes):
    sc = S['scene']; cam = S['cam']; xs = []; ys = []
    for o in bpy.data.objects:
        if o.type == 'MESH' and o.name.startswith(prefixes):
            for c in o.bound_box:
                x, y = proj(sc, cam, o.matrix_world @ Vector(c), BW, BH); xs.append(x); ys.append(y)
    return min(xs), min(ys), max(xs), max(ys)

def plan(S):
    """Считает кропы на базовой камере (lens/shift финального кадра)."""
    final_v3.pose_final(S, 1.0); bpy.context.view_layer.update()
    cam = S['cam']; base_lens = cam.data.lens
    out = {}
    for name, (prefixes, surf) in STATIONS.items():
        x0, y0, x1, y1 = bbox_px(S, prefixes)
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        ow, oh = x1 - x0, y1 - y0
        w = max(ow / FILL, oh / FILL * 9 / 16)            # и по высоте с воздухом
        h = w * 16 / 9
        x = min(max(cx - w / 2, 0), BW - w); y = min(max(cy - h / 2, 0), BH - h)
        k = BH / h
        cxc, cyc = x + w / 2, y + h / 2
        out[name] = dict(focal=round(base_lens * k, 4),
                         shift_x=round((cxc - BW / 2) / BH * k, 6),
                         shift_y=round(-(cyc - BH / 2) / BH * k, 6),
                         crop=[round(x, 2), round(y, 2), round(w, 2), round(h, 2)],
                         surface=surf)
    return out

def apply(S, p):
    cam = S['cam']; cam.data.lens = p['focal']; cam.data.shift_x = p['shift_x']; cam.data.shift_y = p['shift_y']
    bpy.context.view_layer.update()

def reset(S):
    final_v3.pose_final(S, 1.0); S['cam'].data.shift_x = 0; S['cam'].data.shift_y = 0; bpy.context.view_layer.update()

def corners(S, surf):
    sc = S['scene']; cam = S['cam']
    pts = [proj(sc, cam, p, BW, BH) for p in build_v3.SURF[surf]]
    return [[round(a, 1), round(b, 1)] for a, b in order_quad(pts)]

if __name__ == '__main__':
    # python3 stations.py W H SPP outdir dirt [only]
    w, h, spp, outdir, dirt = int(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3]), sys.argv[4], float(sys.argv[5])
    only = sys.argv[6].split(',') if len(sys.argv) > 6 else None
    import os; os.makedirs(outdir, exist_ok=True)
    S = build_v3.build_all((w, h), spp)
    P = plan(S); data = {}
    for name, p in P.items():
        if only and name not in only: continue
        final_v3.pose_final(S, dirt); apply(S, p)
        d = dict(p); d['corners'] = corners(S, p['surface']); data[name] = d
        S['scene'].render.filepath = f'{outdir}/{name}.png'; bpy.ops.render.render(write_still=True)
    reset(S)
    json.dump(data, open(f'{outdir}/stations.json', 'w'), indent=2, ensure_ascii=False)
    print('STATIONS', json.dumps({k: (v['focal'], v['crop']) for k, v in data.items()}))
