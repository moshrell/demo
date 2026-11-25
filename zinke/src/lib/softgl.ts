/** Rechnet der Browser WebGL nur in Software (kein Grafikchip: Messroboter, sehr alte Geräte)? Dann gibt es den schlanken Ersatz statt Dauer-3D. */
export function softwareGL(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    const info = gl && gl.getExtension('WEBGL_debug_renderer_info');
    const name = gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
  } catch (error) {
    console.error('[softgl] GPU-Erkennung', error);
    return false;
  }
}
