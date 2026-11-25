import bpy, sys
p = bpy.context.preferences.addons['cycles'].preferences
print("BLENDER", bpy.app.version_string)
for t in ('OPTIX', 'CUDA', 'HIP', 'ONEAPI'):
    try:
        p.compute_device_type = t
        p.get_devices()
        devs = [(d.name, d.type, d.use) for d in p.devices]
        print("BACKEND", t, devs)
    except Exception as e:
        print("BACKEND", t, "n/a", e)
