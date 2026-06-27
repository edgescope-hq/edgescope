import { useRef, useMemo, useState, useEffect, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Premium 3D background — V2.
 * Designed to sit calmly behind UI: slow motion, soft glow, low contrast.
 * Used on landing + auth pages. Scale prop tunes intensity for smaller surfaces.
 */

type Scale = "hero" | "auth";

function Particles({ count, mouse, scale }: { count: number; mouse: React.RefObject<THREE.Vector2>; scale: Scale }) {
  const mesh = useRef<THREE.InstancedMesh>(null!);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const spread = scale === "hero" ? 18 : 12;

  const particles = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        position: new THREE.Vector3(
          (Math.random() - 0.5) * spread,
          (Math.random() - 0.5) * (spread * 0.7),
          (Math.random() - 0.5) * 8 - 2,
        ),
        speed: Math.random() * 0.08 + 0.015,
        offset: Math.random() * Math.PI * 2,
        scale: Math.random() * 0.05 + 0.015,
      })),
    [count, spread],
  );

  useFrame((state) => {
    if (!mesh.current) return;
    const t = state.clock.getElapsedTime();
    const mx = mouse.current?.x ?? 0;
    const my = mouse.current?.y ?? 0;
    particles.forEach((p, i) => {
      const x = p.position.x + Math.sin(t * p.speed + p.offset) * 0.5 + mx * 0.6;
      const y = p.position.y + Math.cos(t * p.speed * 0.7 + p.offset) * 0.35 + my * 0.4;
      const z = p.position.z + Math.sin(t * p.speed * 0.3) * 0.2;
      dummy.position.set(x, y, z);
      dummy.scale.setScalar(p.scale * (1 + Math.sin(t * 0.4 + p.offset) * 0.1));
      dummy.updateMatrix();
      mesh.current.setMatrixAt(i, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]}>
      <sphereGeometry args={[1, 12, 12]} />
      <meshBasicMaterial
        color={new THREE.Color("#c4b5fd")}
        transparent
        opacity={0.55}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

function GlassOrbs({ mouse, scale }: { mouse: React.RefObject<THREE.Vector2>; scale: Scale }) {
  const group = useRef<THREE.Group>(null!);
  const orbs = useMemo(() => {
    const count = scale === "hero" ? 5 : 3;
    const spread = scale === "hero" ? 10 : 7;
    return Array.from({ length: count }, (_, i) => ({
      position: new THREE.Vector3(
        (Math.random() - 0.5) * spread,
        (Math.random() - 0.5) * (spread * 0.7),
        (Math.random() - 0.5) * 5 - 3,
      ),
      scale: (scale === "hero" ? 0.45 : 0.32) + Math.random() * 0.25,
      speed: Math.random() * 0.05 + 0.015,
      offset: Math.random() * Math.PI * 2,
      color: i % 2 === 0 ? "#a78bfa" : "#7c3aed",
    }));
  }, [scale]);

  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.getElapsedTime();
    const mx = mouse.current?.x ?? 0;
    const my = mouse.current?.y ?? 0;
    group.current.children.forEach((child, i) => {
      const o = orbs[i];
      if (!o) return;
      child.position.x = o.position.x + Math.sin(t * o.speed + o.offset) * 1.2 + mx * 1.2;
      child.position.y = o.position.y + Math.cos(t * o.speed * 0.6 + o.offset) * 0.8 + my * 0.9;
      child.position.z = o.position.z + Math.sin(t * o.speed * 0.4) * 0.3;
      child.rotation.set(t * 0.06, t * 0.08, 0);
    });
  });

  return (
    <group ref={group}>
      {orbs.map((o, i) => (
        <mesh key={i} position={o.position.toArray()}>
          <sphereGeometry args={[o.scale, 48, 48]} />
          <meshPhysicalMaterial
            color={new THREE.Color(o.color)}
            transparent
            opacity={0.22}
            roughness={0.05}
            metalness={0}
            transmission={0.9}
            thickness={1.4}
            ior={1.45}
            clearcoat={1}
            clearcoatRoughness={0.05}
            emissive={new THREE.Color(o.color)}
            emissiveIntensity={0.18}
          />
        </mesh>
      ))}
    </group>
  );
}

function LightTrail({ scale }: { scale: Scale }) {
  const ref = useRef<THREE.Group>(null!);
  const trails = useMemo(() => {
    const count = scale === "hero" ? 3 : 2;
    return Array.from({ length: count }, (_, i) => {
      const r = (scale === "hero" ? 3.2 : 2.4) + i * 0.7;
      const pts: THREE.Vector3[] = [];
      const segs = 70;
      for (let j = 0; j <= segs; j++) {
        const a = (j / segs) * Math.PI * 2;
        pts.push(
          new THREE.Vector3(
            Math.cos(a) * r,
            Math.sin(a) * (r * 0.5) + Math.sin(a * 3) * 0.3,
            Math.sin(a * 2) * 0.9 - 2,
          ),
        );
      }
      const curve = new THREE.CatmullRomCurve3(pts, true, "catmullrom", 0.5);
      return {
        geometry: new THREE.TubeGeometry(curve, 180, 0.018 + i * 0.006, 10, true),
        color: i === 0 ? "#a78bfa" : "#c084fc",
        speed: 0.05 + i * 0.025,
        offset: i * Math.PI * 0.5,
      };
    });
  }, [scale]);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.getElapsedTime();
    ref.current.children.forEach((child, i) => {
      const tr = trails[i];
      if (!tr) return;
      child.rotation.y = t * tr.speed + tr.offset;
      child.rotation.x = Math.sin(t * tr.speed * 0.5) * 0.18;
    });
  });

  return (
    <group ref={ref}>
      {trails.map((tr, i) => (
        <mesh key={i} geometry={tr.geometry}>
          <meshBasicMaterial
            color={new THREE.Color(tr.color)}
            transparent
            opacity={scale === "hero" ? 0.45 : 0.32}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function AmbientGlow() {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.getElapsedTime();
    const s = 1 + Math.sin(t * 0.3) * 0.04;
    ref.current.scale.set(s, s, s);
    ref.current.rotation.z = t * 0.015;
  });
  return (
    <mesh ref={ref} position={[0, 0, -5]}>
      <sphereGeometry args={[4, 48, 48]} />
      <meshBasicMaterial
        color={new THREE.Color("#7c3aed")}
        transparent
        opacity={0.16}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

function LightRig() {
  const ref = useRef<THREE.Group>(null!);
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.getElapsedTime();
    ref.current.rotation.y = t * 0.015;
  });
  return (
    <group ref={ref}>
      <pointLight position={[5, 4, 3]} intensity={0.5} color="#a78bfa" distance={20} />
      <pointLight position={[-5, -3, 2]} intensity={0.35} color="#c084fc" distance={18} />
      <pointLight position={[0, 5, -4]} intensity={0.25} color="#7c3aed" distance={16} />
      <ambientLight intensity={0.06} color="#7c3aed" />
    </group>
  );
}

function CameraRig({ mouse, scale }: { mouse: React.RefObject<THREE.Vector2>; scale: Scale }) {
  const { camera } = useThree();
  const target = useRef({ x: 0, y: 0 });
  const amp = scale === "hero" ? 0.6 : 0.35;
  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    const mx = mouse.current?.x ?? 0;
    const my = mouse.current?.y ?? 0;
    target.current.x += (mx * amp - target.current.x) * 0.02;
    target.current.y += (my * amp * 0.7 - target.current.y) * 0.02;
    camera.position.x = Math.sin(t * 0.03) * 0.5 + target.current.x;
    camera.position.y = Math.cos(t * 0.025) * 0.3 + target.current.y + 0.3;
    camera.position.z = 6 + Math.sin(t * 0.02) * 0.2;
    camera.lookAt(0, 0, 0);
  });
  return null;
}

function Scene({ mouse, scale }: { mouse: React.RefObject<THREE.Vector2>; scale: Scale }) {
  return (
    <>
      <CameraRig mouse={mouse} scale={scale} />
      <LightRig />
      <AmbientGlow />
      <LightTrail scale={scale} />
      <Particles count={scale === "hero" ? 70 : 40} mouse={mouse} scale={scale} />
      <GlassOrbs mouse={mouse} scale={scale} />
      <fog attach="fog" args={["#05030a", 7, 20]} />
    </>
  );
}

export function Premium3DBackground({ scale = "hero" }: { scale?: Scale }) {
  const mouse = useRef<THREE.Vector2>(new THREE.Vector2(0, 0));
  const [hasWebGL, setHasWebGL] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    try {
      const c = document.createElement("canvas");
      const gl =
        c.getContext("webgl2") ||
        c.getContext("webgl") ||
        (c.getContext("experimental-webgl") as WebGLRenderingContext | null);
      setHasWebGL(!!gl);
    } catch {
      setHasWebGL(false);
    }
    if (typeof window !== "undefined" && window.matchMedia) {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      setReducedMotion(mq.matches);
      const h = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
      mq.addEventListener("change", h);
      return () => mq.removeEventListener("change", h);
    }
  }, []);

  const onMove = useCallback((e: React.MouseEvent) => {
    const x = (e.clientX / window.innerWidth) * 2 - 1;
    const y = -(e.clientY / window.innerHeight) * 2 + 1;
    mouse.current.set(x, y);
  }, []);

  // Fallback: static gradient + radial purple glow
  if (!hasWebGL || reducedMotion) {
    return (
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#05030a]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,oklch(0.68_0.23_295/0.28),transparent_55%),radial-gradient(ellipse_at_bottom_right,oklch(0.7_0.2_330/0.18),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,#05030a_100%)]" />
      </div>
    );
  }

  return (
    <div aria-hidden className="fixed inset-0 z-0 pointer-events-none" onMouseMove={onMove}>
      <Canvas
        camera={{ position: [0, 0.3, 6], fov: 50, near: 0.1, far: 30 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        style={{ background: "#05030a", width: "100%", height: "100%" }}
      >
        <Scene mouse={mouse} scale={scale} />
      </Canvas>
      {/* Readability vignette — kept very soft so the animated background reads edge-to-edge across the hero */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,oklch(0.08_0.02_270/0.6)_110%)]" />
    </div>
  );
}
