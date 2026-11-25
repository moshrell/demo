import sys, bpy, numpy as np, math
sys.path.insert(0, '/home/claude/bay3d')
import car_import
bpy.ops.wm.read_factory_settings(use_empty=True)
car, spins, beams, meshes = car_import.import_car()
for sp in spins:
    tire = [c for c in sp.children if 'tire' in c.name.lower()][0]
    axes = []; cents = []
    for a in np.linspace(0, 2 * math.pi, 7):
        sp.rotation_euler = (0, a, 0); bpy.context.view_layer.update()
        P = np.array([tuple(tire.matrix_world @ v.co) for v in list(tire.data.vertices)[::7]])
        c = P.mean(0); w, V = np.linalg.eigh(np.cov((P - c).T)); ax = V[:, 0] * np.sign(V[1, 0] or 1)
        axes.append(ax); cents.append(c)
    axes = np.array(axes); cents = np.array(cents)
    print('wobble° max', round(np.degrees(np.arccos(np.clip(np.abs(axes @ axes[0]), -1, 1))).max(), 3), 'center drift mm', round(np.abs(cents - cents[0]).max() * 1000, 2))
