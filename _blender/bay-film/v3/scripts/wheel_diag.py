import sys, bpy, numpy as np
sys.path.insert(0, '/home/claude/bay3d')
import car_import
bpy.ops.wm.read_factory_settings(use_empty=True)
car, spins, beams, meshes = car_import.import_car()
bpy.context.view_layer.update()
for piv in spins:
    tires = [c for c in piv.children if c.type == 'MESH' and 'tire' in c.name.lower()]
    for t in tires:
        P = np.array([tuple(t.matrix_world @ v.co) for v in t.data.vertices])
        c = P.mean(0); w, V = np.linalg.eigh(np.cov((P - c).T)); ax = V[:, 0]
        if ax[1] < 0: ax = -ax
        camber = np.degrees(np.arcsin(abs(ax[2]))); toe = np.degrees(np.arctan2(ax[0], ax[1]))
        off = np.array(piv.matrix_world.translation) - c
        print(piv.name, 'axis', np.round(ax, 3), 'camber°', round(camber, 2), 'toe°', round(toe, 2), 'pivot-center offset mm', np.round(off * 1000, 1))
