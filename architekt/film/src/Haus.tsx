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

export const FILM = { w: 1200, h: 920, fps: 30, frames: 300 };

// Farben (Papier = Weiß, Rest geteilt durch Papier #f9f6f1, damit nach multiply exakt die Seitenfarben entstehen)
const C = { ink: '#1d1814', accent: '#a4431f', floor: '#f6f5f3', wall: '#ffffff', shadow: '#2b2218' };

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

function useGeometry() {
  return useMemo(() => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="${plan.fill}"/></svg>`;
    const data = new SVGLoader().parse(svg);
    const shapes = data.paths.flatMap((p) => SVGLoader.createShapes(p));
    const walls = new THREE.ExtrudeGeometry(shapes, { depth: 1, bevelEnabled: false, curveSegments: 4 });
    walls.translate(-CX, -CY, 0);
    walls.rotateX(Math.PI / 2); // SVG y → Welt z, Extrusion nach unten (y = -1..0)
    walls.computeVertexNormals();
    const outer = SVGLoader.createShapes(new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${plan.paths[0].d}"/></svg>`).paths[0]);
    const floor = new THREE.ShapeGeometry(outer, 4);
    floor.translate(-CX, -CY, 0);
    floor.rotateX(Math.PI / 2);
    return { walls, floor };
  }, []);
}

function Szene({ f }: { f: number }) {
  const { camera } = useThree();
  const { walls, floor } = useGeometry();
  const t = timeline(f);
  const h = Math.max(0.0001, t.up) * WALL;

  // Kamera: Kugelkoordinaten um die Hausmitte, ohne Rollen
  const polar = t.tilt * 52 * Math.PI / 180;
  const az = (-t.tilt * 32 - t.drift * 10 * (1 - k(f, 228, 282, 0, 1))) * Math.PI / 180;
  const dist = DIST * (1 + t.tilt * 0.12);
  const target = new THREE.Vector3(0, h * 0.3, t.tilt * 10);
  const dir = new THREE.Vector3(Math.sin(polar) * Math.sin(az), Math.cos(polar), Math.sin(polar) * Math.cos(az));
  camera.position.copy(target).addScaledVector(dir, dist);
  const upH = new THREE.Vector3(-Math.sin(az), 0, -Math.cos(az));
  camera.up.copy(upH.multiplyScalar(Math.cos(polar)).add(new THREE.Vector3(0, Math.sin(polar), 0))).normalize();
  camera.lookAt(target);
  (camera as THREE.PerspectiveCamera).fov = FOV;
  camera.near = 50; camera.far = 6000;
  camera.updateProjectionMatrix();

  // Sonne: Bogen von Ost (rechts unten) über Süd nach West
  const sa = interpolate(t.sun, [0, 1], [118, 248]) * Math.PI / 180;
  const se = (18 + 40 * Math.sin(t.sun * Math.PI)) * Math.PI / 180;
  const sunPos = new THREE.Vector3(Math.cos(se) * Math.sin(sa), Math.sin(se), Math.cos(se) * Math.cos(sa)).multiplyScalar(1800);

  const cap = new THREE.Color(C.ink).lerp(new THREE.Color(C.wall), k(t.up, 0, 0.35, 0, 1));
  return (
    <>
      <ambientLight intensity={1.9} />
      <hemisphereLight args={['#ffffff', '#e9e2d8', 0.6]} />
      <directionalLight
        position={sunPos.toArray()}
        intensity={2.2 * t.up}
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-camera-left={-800} shadow-camera-right={800} shadow-camera-top={800} shadow-camera-bottom={-800}
        shadow-camera-near={100} shadow-camera-far={4000}
        shadow-bias={-0.0004} shadow-normalBias={0.6} shadow-radius={5}
      />
      {/* Papier */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.5, 0]}>
        <planeGeometry args={[8000, 8000]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.3, 0]} receiveShadow>
        <planeGeometry args={[8000, 8000]} />
        <shadowMaterial color={C.shadow} opacity={0.2 * t.up} transparent />
      </mesh>
      {/* Boden im Haus */}
      <mesh geometry={floor} position={[0, 0.2, 0]} receiveShadow>
        <meshStandardMaterial color={C.floor} transparent opacity={k(t.up, 0.1, 0.6, 0, 1)} roughness={1} />
      </mesh>
      {/* Wände */}
      <mesh geometry={walls} position={[0, h, 0]} scale={[1, h, 1]} castShadow receiveShadow>
        <meshStandardMaterial attach="material-0" color={cap} roughness={0.95} />
        <meshStandardMaterial attach="material-1" color={C.wall} roughness={0.95} />
      </mesh>
    </>
  );
}

function PlanSvg({ o }: { o: number }) {
  const L = 70, R = 730, T = 70, B = 543, d = 38, cx = (L + R) / 2, cy = (T + B) / 2;
  return (
    <svg viewBox="0 0 800 613" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: o }}>
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
      {/* Füllung des Plans liegt im 3D (Wandoberkanten), hier nur Linien und Maße */}
      <PlanSvg o={t.svg} />
    </AbsoluteFill>
  );
};
