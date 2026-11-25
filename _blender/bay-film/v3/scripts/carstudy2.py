import sys, math, bpy
sys.path.insert(0, '/home/claude/bay3d')
import build, car_import
from mathutils import Vector
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = build.setup_render(360, 640, 16)
sc.render.use_freestyle = False
sc.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.05, 0.055, 0.065, 1)
car, spins, beams, meshes = car_import.import_car()
print('spins', [tuple(round(x,2) for x in s.location) for s in spins])
ld = bpy.data.lights.new('key', 'AREA'); ld.energy = 900; ld.size = 5
lo = bpy.data.objects.new('key', ld); sc.collection.objects.link(lo); lo.location = (2, -3, 5); lo.rotation_euler = (0.6, 0, 0.5)
import bmesh; me = bpy.data.meshes.new('gp'); b = bmesh.new(); bmesh.ops.create_grid(b, x_segments=1, y_segments=1, size=20); b.to_mesh(me)
g = bpy.data.objects.new('ground', me); sc.collection.objects.link(g); me.materials.append(build.mat('gnd', (0.08, 0.08, 0.09), 0.5))
cd = bpy.data.cameras.new('cam'); cd.lens = 35; cd.sensor_fit = 'VERTICAL'; cd.sensor_height = 24
cam = bpy.data.objects.new('cam', cd); sc.collection.objects.link(cam); sc.camera = cam
for name, pos in (('front34', (8.0, 5.5, 1.4)), ('rear34', (-7.5, 6, 1.9)), ('front', (9, 0, 1.1))):
    cam.location = pos; d = Vector((0, 0, 0.6)) - Vector(pos); cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = f'/home/claude/bay3d/out/e34_{name}.png'; bpy.ops.render.render(write_still=True)
