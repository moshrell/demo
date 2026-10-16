---
name: scroll-bake-hero
description: Use for scroll-driven "transformation" hero sections built from two or three still images with a WebGL shader instead of video (dough→baked croissant, raw→finished, before/after). Includes the working reference implementation.
---

# Scroll-driven transformation without video

Technique used in `artisanal-bakery`. Two photos with IDENTICAL framing on a pure black background (state A, state B). One fragment shader computes everything between them, driven by scroll progress. Cost: ~190 KB of images, no video, no frame sequence.

## Inputs
- `A.webp` raw / before, `B.webp` baked / after. Same camera, same position, pure black background, 16:9, ~1400 px wide, WebP q≈84.
- Generate B from A as a reference image in Gemini ("same scene, same position, only the state changes"), otherwise they will not align.

## Reference
`bake.reference.js` in this folder = full working module (`initBake(root)`), pinned-section scroll logic, rAF smoothing, fallbacks. Page markup contract:
`section[data-bake][data-hours]` (height ≈ 480vh) → sticky `.hero__stick` → `canvas[data-bake-canvas][data-a][data-b]`, `[data-bake-fallback]` (two stacked `<img>`, second has `data-fb-baked`), `[data-clock]`, `[data-stage]` captions, `[data-scroll-hint]`.

## Shader recipe (all in the fragment shader)
- contain-fit (whole subject visible, black fills the rest; works on portrait phones).
- puff: scale the sample point by `1 + 0.075*ease(p)`.
- heat shimmer: fbm warp of uv, strongest mid-progress (`sin(pi*p)`).
- transformation front: `t = 0.5*fbm + 0.5*distanceFromCenter`, `m = smoothstep(t-.1, t+.1, p*1.38-.12)`: spreads from the centre outward, ragged. Dough warms just ahead of the front, ember glow on the front, vignette + film grain.
- Tune: front threshold (speed/shape), puff amount, glow colour, grain.

## Must-haves
- Fallbacks: no WebGL → stacked `<img>` crossfade; `prefers-reduced-motion` → show final state, no pinned scroll, no rAF loop.
- Pause the rAF loop off-screen (IntersectionObserver). DPR capped at 1.75.
- No inline `eval`; works under the demo CSP. `assetsInlineLimit: 0` so textures are real files.
- Verify headlessly (swiftshader flags) by sampling mean colour at progress 0/.5/1; do not look at screenshots unless asked.

## Next level (when the budget exists)
Video clips (Veo/Seedance first+last frame) can be extracted into a canvas frame sequence for physical realism, but dough-rolling fails in current models; baking/puffing works. The shader approach needs no generation credits.
