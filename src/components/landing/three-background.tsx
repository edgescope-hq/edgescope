import { useRef, useMemo, useState, useEffect, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

// ─── Floating Particles ───
function Particles({ count = 80, mouse }: { count?: number; mouse: React.RefObject<THREE.Vector2> }) {
  const mesh = useRef<THREE.InstancedMesh>(null!);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const particles = useMemo(() => {
    return Array.from({ length: count }, () => ({
      position: new THREE.Vector3(
        (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 10 - 2,
      ),
      speed: Math.random() * 0.15 + 0.03,
      offset: Math.random() * Math.PI * 2,
      scale: Math.random() * 0.08 + 0.02,
      rotSpeed: (Math.random() - 0.5) * 0.5,
    }));
  }, [count]);

  useFrame((state) => {
    if (!mesh.current) return;
    const t = state.clock.getElapsedTime();
    const mx = mouse.current?.x ?? 0;
    const my = mouse.current?.y ?? 0;

    particles.forEach((p, i) => {
      const x = p.position.x + Math.sin(t * p.speed + p.offset) * 0.6 + mx * 1.2;
      const y = p.position.y + Math.cos(t * p.speed * 0.7 + p.offset) * 0.4 + my * 0.8;
      const z = p.position.z + Math.sin(t * p.speed * 0.3) * 0.3;

      dummy.position.set(x, y, z);
      dummy.rotation.set(
        t * p.rotSpeed * 0.3,
        t * p.rotSpeed * 0.5,
        0,
      );
      dummy.scale.setScalar(p.scale * (1 + Math.sin(t * 0.5 + p.offset) * 0.15));
      dummy.updateMatrix();
      mesh.current.setMatrixAt(i, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]}>
      <icosahedronGeometry args={[1, 1]} />
      <meshPhysicalMaterial
        color={new THREE.Color("#8b5cf6")}
        transparent
        opacity={0.35}
        roughness={0.1}
        metalness={0.3}
        envMapIntensity={0.5}
        clearcoat={1}
        clearcoatRoughness={0.1}
      />
    </instancedMesh>
  );
}

// ─── Glass Orbs ───
function GlassOrbs({ mouse }: { mouse: React.RefObject<THREE.Vector2> }) {
  const group = useRef<THREE.Group>(null!);

  const orbs = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => ({
      position: new THREE.Vector3(
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 6 - 3,
      ),
      scale: Math.random() * 0.55 + 0.25,
      speed: Math.random() * 0.08 + 0.02,
      offset: Math.random() * Math.PI * 2,
      color: i % 3 === 0 ? "#a78bfa" : i % 3 === 1 ? "#c084fc" : "#7c3aed",
    }));
  }, []);

  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.getElapsedTime();
    const mx = mouse.current?.x ?? 0;
    const my = mouse.current?.y ?? 0;

    group.current.children.forEach((child, i) => {
      const orb = orbs[i];
      if (!orb) return;
      child.position.x = orb.position.x + Math.sin(t * orb.speed + orb.offset) * 1.5 + mx * 2;
      child.position.y = orb.position.y + Math.cos(t * orb.speed * 0.6 + orb.offset) * 1 + my * 1.5;
      child.position.z = orb.position.z + Math.sin(t * orb.speed * 0.4) * 0.5;
      child.rotation.set(t * 0.1, t * 0.15, 0);
    });
  });

  return (
    <group ref={group}>
      {orbs.map((orb, i) => (
        <mesh key={i} position={orb.position.toArray()}>
          <sphereGeometry args={[orb.scale, 48, 48]} />
          <meshPhysicalMaterial
            color={new THREE.Color(orb.color)}
            transparent
            opacity={0.28}
            roughness={0.02}
            metalness={0.0}
            transmission={0.85}
            thickness={1.2}
            ior={1.4}
            envMapIntensity={0.6}
            clearcoat={1}
            clearcoatRoughness={0.04}
            emissive={new THREE.Color(orb.color)}
            emissiveIntensity={0.25}
          />
        </mesh>
      ))}
    </group>
  );
}

// ─── Volumetric back-glow ───
function VolumetricGlow() {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.getElapsedTime();
    ref.current.rotation.z = t * 0.02;
    const s = 1 + Math.sin(t * 0.4) * 0.04;
    ref.current.scale.set(s, s, s);
  });
  return (
    <mesh ref={ref} position={[0, 0, -5]}>
      <sphereGeometry args={[4.5, 64, 64]} />
      <meshBasicMaterial
        color={new THREE.Color("#7c3aed")}
        transparent
        opacity={0.18}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

// ─── Soft moving light trails ───
function LightTrails() {
  const group = useRef<THREE.Group>(null!);

  const trails = useMemo(() => {
    return Array.from({ length: 4 }, (_, i) => {
      const points: THREE.Vector3[] = [];
      const radius = 3 + i * 0.8;
      const segs = 80;
      for (let j = 0; j <= segs; j++) {
        const a = (j / segs) * Math.PI * 2;
        points.push(new THREE.Vector3(
          Math.cos(a) * radius,
          Math.sin(a) * (radius * 0.55) + Math.sin(a * 3) * 0.4,
          Math.sin(a * 2) * 1.2 - 2,
        ));
      }
      const curve = new THREE.CatmullRomCurve3(points, true, "catmullrom", 0.5);
      return {
        geometry: new THREE.TubeGeometry(curve, 220, 0.025 + i * 0.008, 12, true),
        color: i % 2 === 0 ? "#a78bfa" : "#c084fc",
        speed: 0.08 + i * 0.04,
        offset: i * Math.PI * 0.5,
      };
    });
  }, []);

  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.getElapsedTime();
    group.current.children.forEach((child, i) => {
      const tr = trails[i];
      if (!tr) return;
      child.rotation.y = t * tr.speed + tr.offset;
      child.rotation.x = Math.sin(t * tr.speed * 0.5) * 0.25;
    });
  });

  return (
    <group ref={group}>
      {trails.map((tr, i) => (
        <mesh key={i} geometry={tr.geometry}>
          <meshBasicMaterial
            color={new THREE.Color(tr.color)}
            transparent
            opacity={0.55}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}


// ─── Ambient Light Rig ───
function LightRig() {
  const ref = useRef<THREE.Group>(null!);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.getElapsedTime();
    ref.current.rotation.y = t * 0.02;
    ref.current.rotation.x = Math.sin(t * 0.015) * 0.1;
  });

  return (
    <group ref={ref}>
      <pointLight position={[5, 4, 3]} intensity={0.6} color="#8b5cf6" distance={20} />
      <pointLight position={[-5, -3, 2]} intensity={0.4} color="#c084fc" distance={18} />
      <pointLight position={[0, 6, -4]} intensity={0.3} color="#6366f1" distance={16} />
      <pointLight position={[3, -5, -2]} intensity={0.2} color="#8b5cf6" distance={14} />
      <ambientLight intensity={0.08} color="#7c3aed" />
    </group>
  );
}

// ─── Camera Rig (ambient + mouse) ───
function CameraRig({ mouse }: { mouse: React.RefObject<THREE.Vector2> }) {
  const { camera } = useThree();
  const target = useRef({ x: 0, y: 0 });

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    const mx = mouse.current?.x ?? 0;
    const my = mouse.current?.y ?? 0;

    target.current.x += (mx * 0.8 - target.current.x) * 0.02;
    target.current.y += (my * 0.5 - target.current.y) * 0.02;

    camera.position.x = Math.sin(t * 0.05) * 0.8 + target.current.x;
    camera.position.y = Math.cos(t * 0.04) * 0.4 + target.current.y + 0.5;
    camera.position.z = 6 + Math.sin(t * 0.03) * 0.3;
    camera.lookAt(0, 0, 0);
  });

  return null;
}

// ─── Main 3D Scene ───
function Scene({ mouse }: { mouse: React.RefObject<THREE.Vector2> }) {
  return (
    <>
      <CameraRig mouse={mouse} />
      <LightRig />
      <VolumetricGlow />
      <LightTrails />
      <Particles count={90} mouse={mouse} />
      <GlassOrbs mouse={mouse} />
      <fog attach="fog" args={["#05030a", 8, 22]} />
    </>
  );
}

// ─── Exported Component ───
export function ThreeBackground() {
  const mouse = useRef<THREE.Vector2>(new THREE.Vector2(0, 0));
  const [hasWebGL, setHasWebGL] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    // Check WebGL support
    try {
      const testCanvas = document.createElement("canvas");
      const gl =
        testCanvas.getContext("webgl2") ||
        testCanvas.getContext("webgl") ||
        (testCanvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
      setHasWebGL(!!gl);
    } catch {
      setHasWebGL(false);
    }

    // Check reduced motion
    if (typeof window !== "undefined" && window.matchMedia) {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      setReducedMotion(mq.matches);
      const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const x = (e.clientX / window.innerWidth) * 2 - 1;
    const y = -(e.clientY / window.innerHeight) * 2 + 1;
    mouse.current.set(x, y);
  }, []);

  // Fallback static background
  if (!hasWebGL || reducedMotion) {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#05030a]"
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,oklch(0.68_0.23_295/0.35),transparent_55%),radial-gradient(ellipse_at_bottom_right,oklch(0.7_0.2_330/0.25),transparent_50%),radial-gradient(ellipse_at_center,oklch(0.5_0.15_270/0.15),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,#05030a_100%)]" />
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-0 pointer-events-none"
      onMouseMove={handleMouseMove}
    >
      <Canvas
        camera={{ position: [0, 0.5, 6], fov: 50, near: 0.1, far: 30 }}
        dpr={[1, 1.5]}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        }}
        style={{ background: "#05030a", width: "100%", height: "100%" }}
      >
        <Scene mouse={mouse} />
      </Canvas>

      {/* Vignette overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,#05030a_85%)] pointer-events-none" />
    </div>
  );
}
