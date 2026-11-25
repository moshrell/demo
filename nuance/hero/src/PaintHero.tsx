import {useMemo} from 'react';
import {useCurrentFrame} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import * as THREE from 'three';
import {mergeVertices} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {useThree} from '@react-three/fiber';

export const LOOP_FRAMES = 450; // 15 s at 30 fps, seamless loop

type BlobSpec = {
  color: string;
  pos: [number, number, number];
  radius: number;
  drift: [number, number, number]; // integer cycles per loop => seamless
  phase: number;
  wobble: number;
  seed: number;
  spin: number; // whole turns per loop (sign = direction)
};

// Soft, salon-like pigments: peach, rose, lilac, honey, sage, cream
const COLORS = ['#ee8f72', '#d2699a', '#9d83de', '#e6b04f', '#86bb9c', '#f2b5a6'];

// Deterministic RNG so every render is identical
const rng = (seed: number) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Visible area at z=0 is about 14.7 x 8.3 units (see camera below).
// A jittered 6 x 3 grid fills the whole background evenly.
const COLS = 6;
const ROWS = 3;
const W = 15.4;
const H = 8.8;
const BLOBS: BlobSpec[] = (() => {
  const r = rng(7);
  const out: BlobSpec[] = [];
  for (let cy = 0; cy < ROWS; cy++) {
    for (let cx = 0; cx < COLS; cx++) {
      const i = cy * COLS + cx;
      const depth = r(); // 0 = far, 1 = near
      out.push({
        color: COLORS[(i * 5 + cy) % COLORS.length],
        pos: [
          -W / 2 + ((cx + 0.15 + r() * 0.7) / COLS) * W,
          H / 2 - ((cy + 0.15 + r() * 0.7) / ROWS) * H,
          -2 + depth * 3,
        ],
        radius: 0.45 + depth * 0.85 + r() * 0.25,
        drift: [1, 1, 1],
        phase: r() * Math.PI * 2,
        wobble: 0.14 + r() * 0.12,
        seed: i + 1,
        spin: (r() < 0.5 ? -1 : 1),
      });
    }
  }
  return out;
})();

const Environment: React.FC = () => {
  const {gl, scene} = useThree();
  useMemo(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    return env;
  }, [gl, scene]);
  return null;
};

const Blob: React.FC<{spec: BlobSpec; theta: number}> = ({spec, theta}) => {
  const {geometry, base} = useMemo(() => {
    // Weld shared vertices, otherwise normals stay flat and the blob looks faceted
    const raw = new THREE.IcosahedronGeometry(1, 5);
    raw.deleteAttribute('normal');
    raw.deleteAttribute('uv');
    const g = mergeVertices(raw);
    return {geometry: g, base: Float32Array.from(g.attributes.position.array as Float32Array)};
  }, []);

  // Vertex displacement: sums of sines in 3D, time enters only as integer
  // multiples of theta => the last frame flows straight into the first.
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const s = spec.seed;
  for (let i = 0; i < pos.count; i++) {
    const x = base[i * 3];
    const y = base[i * 3 + 1];
    const z = base[i * 3 + 2];
    const d =
      Math.sin(x * 2.1 + s + theta * 1) * 0.5 +
      Math.sin(y * 2.7 + s * 2 - theta * 1) * 0.35 +
      Math.sin(z * 3.3 + s * 3 + theta * 1) * 0.3 +
      Math.sin((x + y + z) * 1.7 + theta * 1) * 0.2;
    const k = 1 + spec.wobble * d;
    pos.setXYZ(i, x * k, y * k, z * k);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();

  const [dx, dy, dz] = spec.drift;
  const p = spec.phase;
  const px = spec.pos[0] + Math.sin(theta * dx + p) * 0.55;
  const py = spec.pos[1] + Math.sin(theta * dy + p * 1.3) * 0.45;
  const pz = spec.pos[2] + Math.sin(theta * dz + p * 0.7) * 0.3;

  return (
    <mesh geometry={geometry} position={[px, py, pz]} scale={spec.radius} rotation={[p + Math.sin(theta + p) * 0.35, theta * spec.spin, p]}>
      <meshPhysicalMaterial
        color={spec.color}
        roughness={0.12}
        metalness={0}
        clearcoat={1}
        clearcoatRoughness={0.05}
        sheen={0.15}
        sheenColor={new THREE.Color('#ffffff')}
        iridescence={0.15}
        iridescenceIOR={1.3}
        envMapIntensity={0.5}
      />
    </mesh>
  );
};

export const PaintHero: React.FC = () => {
  const frame = useCurrentFrame();
  const theta = (frame / LOOP_FRAMES) * Math.PI * 2;

  return (
    <ThreeCanvas
      width={1920}
      height={1080}
      gl={{alpha: true, antialias: true, premultipliedAlpha: true}}
      camera={{position: [0, 0, 12], fov: 38}}
      style={{background: 'transparent'}}
    >
      <Environment />
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 6, 6]} intensity={1.1} />
      {BLOBS.map((b) => (
        <Blob key={b.seed} spec={b} theta={theta} />
      ))}
    </ThreeCanvas>
  );
};
