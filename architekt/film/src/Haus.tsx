/**
 * «Vom Strich zum Haus»: Grundriss → Wände wachsen → Sonnenstudie → zurück zum Grundriss (nahtlose Schleife).
 * Hintergrund weiß: auf der Seite liegt das Video mit mix-blend-mode: multiply auf dem Papier,
 * dadurch ist der Rand des Videos unsichtbar. Farben sind durch die Papierfarbe geteilt (siehe C).
 */
import { AbsoluteFill, interpolate, Easing, useCurrentFrame } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import '@fontsource/ibm-plex-mono/400.css';
import plan from '../../src/data/plan.json';
import haus from './haus.json';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const FILM = { w: 1200, h: 920, fps: 30, frames: 300 };

// Farben (Papier = Weiß, Rest geteilt durch Papier #f9f6f1, damit nach multiply exakt die Seitenfarben entstehen)
const C = { ink: '#1d1814', accent: '#a4431f', floor: '#f6f5f3', wall: '#ffffff', shadow: '#3a2a18' };

// Plan: 800 × 613 px, Haus x 70..730, y 70..543 = 12,00 × 8,60 m → 55 px/m
const PX = 55, WALL = 2.8 * PX, CX = 400, CY = 306.5;
const FOV = 20;
const DIST = (FILM.h / FILM.w * 800 / 2) / Math.tan((FOV / 2) * Math.PI / 180);

const ease = Easing.bezier(0.65, 0, 0.35, 1);
const k = (f: number, a: number, b: number, from: number, to: number) =>
  interpolate(f, [a, b], [from, to], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });

// Zeitplan (Frames bei 30 fps)
function timeline(f: number) {
  const up = f < 200 ? k(f, 30, 120, 0, 1) : k(f, 228, 282, 1, 0);           // Wandhöhe 0..1
  const tilt = f < 200 ? k(f, 30, 120, 0, 1) : k(f, 228, 282, 1, 0);         // Kamera von oben → schräg
  const svg = f < 200 ? k(f, 22, 46, 1, 0) : k(f, 268, 290, 0, 1);           // Plan-Linien
  const sun = k(f, 96, 250, 0, 1);                                            // Tageslauf 0 = Morgen, 1 = Abend
  const drift = k(f, 100, 240, 0, 1);
  return { up, tilt, svg, sun, drift };
}

const M = (m: number) => m * PX; // Meter → Plan-Pixel
const OPEN = {
  fenster: { sill: 0.9, top: 2.2, glass: true },
  terrasse: { sill: 0, top: 2.3, glass: true },
  haustuer: { sill: 0, top: 2.1, glass: false },
  tuer: { sill: 0, top: 2.1, glass: false },
} as const;

/** Prisma auf Grundfläche (Plan-Koordinaten), Höhe y0..y1 in Weltpixeln */
function boxGeo(o: { x0: number; x1: number; y0: number; y1: number }, y0: number, y1: number) {
  const g = new THREE.BoxGeometry(o.x1 - o.x0, y1 - y0, o.y1 - o.y0);
  g.translate((o.x0 + o.x1) / 2 - CX, (y0 + y1) / 2, (o.y0 + o.y1) / 2 - CY);
  return g;
}

function useGeometry() {
  return useMemo(() => {
    const shapes = haus.walls.map((w) => {
      const s = new THREE.Shape(w.outer.map(([x, y]) => new THREE.Vector2(x, y)));
      s.holes = w.holes.map((h) => new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
      return s;
    });
    const walls = new THREE.ExtrudeGeometry(shapes, { depth: 1, bevelEnabled: false });
    walls.translate(-CX, -CY, 0);
    walls.rotateX(Math.PI / 2); // Plan-y → Welt-z, Extrusion nach unten (y = -1..0)
    walls.computeVertexNormals();

    const outer = SVGLoader.createShapes(new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${plan.paths[0].d}"/></svg>`).paths[0]);
    const floor = new THREE.ShapeGeometry(outer, 4);
    floor.translate(-CX, -CY, 0);
    floor.rotateX(Math.PI / 2);

    // Linien des Plans (Möbel, Türbögen) als Zeichnung auf dem Boden
    const pts: number[] = [];
    const parsed = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg">${plan.paths.slice(1).map((p) => `<path d="${p.d}"/>`).join('')}</svg>`);
    for (const path of parsed.paths) for (const sub of path.subPaths) {
      const ps = sub.getPoints(6);
      for (let i = 1; i < ps.length; i++) pts.push(ps[i - 1].x - CX, 0, ps[i - 1].y - CY, ps[i].x - CX, 0, ps[i].y - CY);
    }
    const lines = new THREE.BufferGeometry();
    lines.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));

    // Öffnungen: Brüstung, Sturz, Glas (Einheitshöhe 1, skaliert mit der Wandhöhe)
    const solid: THREE.BufferGeometry[] = [], glass: THREE.BufferGeometry[] = [];
    for (const o of haus.openings) {
      const t = OPEN[o.kind as keyof typeof OPEN];
      const H = 2.8;
      if (t.sill > 0) solid.push(boxGeo(o, 0, t.sill / H));
      solid.push(boxGeo(o, t.top / H, 1));
      if (t.glass) {
        const mid = (o.x1 - o.x0) > (o.y1 - o.y0) ? { ...o, y0: (o.y0 + o.y1) / 2 - 0.6, y1: (o.y0 + o.y1) / 2 + 0.6 } : { ...o, x0: (o.x0 + o.x1) / 2 - 0.6, x1: (o.x0 + o.x1) / 2 + 0.6 };
        glass.push(boxGeo(mid, t.sill / H, t.top / H));
      }
    }
    return { walls, floor, lines, solid: mergeGeometries(solid, true), glass: mergeGeometries(glass) };
  }, []);
}

function Szene({ f }: { f: number }) {
  const { camera } = useThree();
  const { walls, floor, lines, solid, glass } = useGeometry();
  const t = timeline(f);
  const u = Math.max(0.0001, t.up);
  const h = u * WALL;

  // Kamera: Kugelkoordinaten um die Hausmitte, ohne Rollen
  const back = k(f, 228, 282, 0, 1);
  const polar = t.tilt * 50 * Math.PI / 180;
  const az = (-t.tilt * 28 - t.drift * 12 * (1 - back)) * Math.PI / 180;
  const dist = DIST * (1 + t.tilt * 0.45);
  const target = new THREE.Vector3(0, h * 0.2, t.tilt * 24);
  const dir = new THREE.Vector3(Math.sin(polar) * Math.sin(az), Math.cos(polar), Math.sin(polar) * Math.cos(az));
  camera.position.copy(target).addScaledVector(dir, dist);
  const upH = new THREE.Vector3(-Math.sin(az), 0, -Math.cos(az));
  camera.up.copy(upH.multiplyScalar(Math.cos(polar)).add(new THREE.Vector3(0, Math.sin(polar), 0))).normalize();
  camera.lookAt(target);
  (camera as THREE.PerspectiveCamera).fov = FOV;
  camera.near = 50; camera.far = 8000;
  camera.updateProjectionMatrix();

  // Sonne: morgens vorn rechts (Fassade im Licht), abends hinten (lange Schatten nach vorn), mittags am höchsten
  const sa = interpolate(t.sun, [0, 1], [35, 205]) * Math.PI / 180;
  const se = (30 + 28 * Math.sin(t.sun * Math.PI)) * Math.PI / 180;
  const sunPos = new THREE.Vector3(Math.cos(se) * Math.sin(sa), Math.sin(se), Math.cos(se) * Math.cos(sa)).multiplyScalar(2000);
  const lit = k(t.up, 0, 0.5, 0, 1);

  return (
    <>
      <ambientLight intensity={1.35} />
      <hemisphereLight args={['#ffffff', '#d9cfc0', 0.38]} />
      <directionalLight
        position={sunPos.toArray()}
        intensity={2.0 * lit}
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-camera-left={-700} shadow-camera-right={700} shadow-camera-top={700} shadow-camera-bottom={-700}
        shadow-camera-near={200} shadow-camera-far={4500}
        shadow-bias={-0.0003} shadow-normalBias={0.4} shadow-radius={4}
      />
      {/* Papier */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.5, 0]}>
        <planeGeometry args={[10000, 10000]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.3, 0]} receiveShadow>
        <planeGeometry args={[10000, 10000]} />
        <shadowMaterial color={C.shadow} opacity={0.16 * lit} transparent />
      </mesh>
      {/* Boden im Haus + Zeichnung */}
      <mesh geometry={floor} position={[0, 0.1, 0]} receiveShadow>
        <meshStandardMaterial color={C.floor} emissive="#ffffff" emissiveIntensity={0.14} transparent opacity={lit} roughness={1} />
      </mesh>
      <lineSegments geometry={lines} position={[0, 0.4, 0]}>
        <lineBasicMaterial color={C.ink} transparent opacity={0.45 * lit} />
      </lineSegments>
      {/* Wände: Schnittkante oben dunkel wie im Plan */}
      <mesh geometry={walls} position={[0, h, 0]} scale={[1, h, 1]} castShadow receiveShadow>
        <meshBasicMaterial attach="material-0" color={C.ink} />
        <meshStandardMaterial attach="material-1" color={C.wall} roughness={1} />
      </mesh>
      <mesh visible={u > 0.03} geometry={solid} scale={[1, WALL * u, 1]} castShadow receiveShadow>
        <meshStandardMaterial color={C.wall} roughness={1} />
      </mesh>
      <mesh visible={u > 0.03} geometry={glass} scale={[1, WALL * u, 1]}>
        <meshStandardMaterial color="#e4eaec" transparent opacity={0.35 * lit} roughness={0.2} metalness={0} />
      </mesh>
    </>
  );
}

function PlanSvg({ o }: { o: number }) {
  const L = 70, R = 730, T = 70, B = 543, d = 38, cx = (L + R) / 2, cy = (T + B) / 2;
  return (
    <svg viewBox="0 0 800 613" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: o }}>
      <path d={plan.fill} fillRule="evenodd" fill={C.ink} />
      {plan.paths.map((p, i) => (
        <path key={i} d={p.d} fill="none" stroke={C.ink} strokeWidth={1.5} strokeLinejoin="round" />
      ))}
      <g fill="none" stroke={C.accent} strokeWidth={2}>
        <path d={`M${L} ${d} H${cx - 75} M${cx + 75} ${d} H${R} M${L} ${d - 10} V${d + 10} M${R} ${d - 10} V${d + 10}`} />
        <path d={`M${d} ${T} V${cy - 75} M${d} ${cy + 75} V${B} M${d - 10} ${T} H${d + 10} M${d - 10} ${B} H${d + 10}`} />
      </g>
      <g fontFamily="'IBM Plex Mono', monospace" fontSize={32} fill={C.accent}>
        <text x={cx} y={d + 11} textAnchor="middle">12,00 m</text>
        <text x={d + 11} y={cy} textAnchor="middle" transform={`rotate(-90 ${d + 11} ${cy})`}>8,60 m</text>
      </g>
    </svg>
  );
}

export const Haus = () => {
  const f = useCurrentFrame();
  const t = timeline(f);
  return (
    <AbsoluteFill style={{ background: '#ffffff' }}>
      <ThreeCanvas width={FILM.w} height={FILM.h} shadows flat camera={{ fov: FOV, position: [0, DIST, 0] }} gl={{ antialias: true, preserveDrawingBuffer: true }}>
        <Szene f={f} />
      </ThreeCanvas>
      {/* Plan exakt wie auf der Seite (Füllung, Linien, Maße), blendet in das Modell über */}
      <PlanSvg o={t.svg} />
    </AbsoluteFill>
  );
};
