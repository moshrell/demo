# car_import.py — импорт модели «BMW E34 [stance style]» (Myedsu, CC BY 4.0, https://skfb.ly/oIEuv)
# Удаляем эмблему, номера, надписи BBS, наклейку и ёлочку-ароматизатор.
# Результат: пустышка 'Car' (перед машины = +X локально, земля z=0, центр между осями),
# список «пауков» колёс (крутить по локальной X), споты фар.
import bpy, math
from mathutils import Vector, Matrix

GLB = '/home/claude/bay3d/assets/car.glb'
WR = 0.335
DROP = ('logo', 'number', 'bbs', 'body print', 'tree')

def _bbox(objs):
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    mn = Vector([min(p[i] for p in pts) for i in range(3)]); mx = Vector([max(p[i] for p in pts) for i in range(3)])
    return mn, mx

def import_car():
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=GLB)
    new = [o for o in bpy.data.objects if o not in before]
    # удаляем брендовые и лишние объекты (по имени объекта или материала)
    for o in list(new):
        names = o.name.lower() + ' ' + ' '.join((m.name.lower() for m in getattr(o.data, 'materials', []) if m))
        if o.type == 'MESH' and (any(k in names for k in DROP) or not o.name.isascii()):
            new.remove(o); bpy.data.objects.remove(o, do_unlink=True)
    meshes = [o for o in new if o.type == 'MESH']
    bpy.context.view_layer.update()
    # корень: модель смотрит в +Y → поворачиваем, чтобы перед был +X
    car = bpy.data.objects.new('Car', None); bpy.context.scene.collection.objects.link(car)
    model = bpy.data.objects.new('CarModel', None); bpy.context.scene.collection.objects.link(model)
    model.parent = car; model.rotation_euler = (0, 0, -math.pi / 2)
    tops = [o for o in new if o.parent is None]
    for o in tops:
        mw = o.matrix_world.copy(); o.parent = model; o.matrix_world = model.matrix_world @ mw
    bpy.context.view_layer.update()
    # колёса: свой шарнир в центре каждого колеса
    spins = []
    for grp in [o for o in new if o.type == 'EMPTY' and o.name.lower().startswith('wheel')]:
        parts = [c for c in grp.children_recursive if c.type == 'MESH']
        if not parts: continue
        mn, mx = _bbox(parts); c = (mn + mx) / 2
        piv = bpy.data.objects.new('wheel_pivot', None); bpy.context.scene.collection.objects.link(piv)
        piv.parent = car; piv.location = car.matrix_world.inverted() @ c
        bpy.context.view_layer.update()
        for p in parts:
            mw = p.matrix_world.copy(); p.parent = piv; p.matrix_world = mw
        spins.append(piv)
    for o in meshes:
        for p in o.data.polygons: p.use_smooth = p.use_smooth
    # фары: споты
    beams = []
    for sy in (-1, 1):
        ld = bpy.data.lights.new('beam', 'SPOT'); ld.energy = 0; ld.spot_size = math.radians(60); ld.spot_blend = 0.6
        ld.color = (1.0, 0.93, 0.82); ld.shadow_soft_size = 0.04
        lo = bpy.data.objects.new('beam', ld); bpy.context.scene.collection.objects.link(lo)
        lo.parent = car; lo.location = (2.15, sy * 0.58, 0.60); lo.rotation_euler = (0, math.radians(90 + 5), 0)
        beams.append(lo)
    return car, spins, beams, meshes

def lamp_materials():
    """Материалы стёкол фар и задних фонарей — для подсветки (имена из модели)."""
    return [m for m in bpy.data.materials if m.name in ('Material.013', 'Material.003', 'headlight')]
