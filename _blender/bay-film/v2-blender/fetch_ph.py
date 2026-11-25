# скачивает CC0-ассеты Poly Haven: текстуры (diff/nor_gl/rough), HDRI, модели (gltf)
import json, os, urllib.request, sys
OUT = '/home/claude/bay3d/assets/ph'
UA = {'User-Agent': 'bay-film/1.0 (Blender render, CC0 assets)'}
def get(u): return json.load(urllib.request.urlopen(urllib.request.Request(u, headers=UA)))
def dl(url, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if not os.path.exists(path):
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA)) as r, open(path, 'wb') as f: f.write(r.read())
TEX = ['garage_floor', 'asphalt_02', 'concrete_wall_008', 'concrete_wall_006']
HDRI = ['modern_buildings_night']
MODELS = ['Shelf_01', 'drawer_cabinet', 'industrial_storage_cart', 'hand_truck', 'Barrel_02', 'fire_hydrant', 'cardboard_box_01', 'WetFloorSign_01']
for t in TEX:
    f = get(f'https://api.polyhaven.com/files/{t}')
    for key, name in (('Diffuse', 'diff'), ('nor_gl', 'nor'), ('Rough', 'rough')):
        if key in f: dl(f[key]['2k']['jpg']['url'], f'{OUT}/tex/{t}_{name}.jpg')
    print('tex', t)
for h in HDRI:
    f = get(f'https://api.polyhaven.com/files/{h}'); dl(f['hdri']['2k']['hdr']['url'], f'{OUT}/hdri/{h}.hdr'); print('hdri', h)
for m in MODELS:
    try:
        f = get(f'https://api.polyhaven.com/files/{m}')['gltf']['1k']['gltf']
        d = f'{OUT}/models/{m}'; dl(f['url'], f'{d}/{m}.gltf')
        for rel, inc in f.get('include', {}).items(): dl(inc['url'], f'{d}/{rel}')
        print('model', m)
    except Exception as e: print('FAIL', m, e)
