"use client";

import {
  ContactShadows,
  OrbitControls,
  Preload,
  useAnimations,
  useGLTF,
  useProgress,
} from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { getStation, type Incident, severityRank } from "@/lib/line-data";

type FactoryTwinProps = {
  incidents: Incident[];
  selectedId: string;
  onSelectIncident: (id: string) => void;
};

type ControlsHandle = {
  target: THREE.Vector3;
  update: () => void;
};

function ResponsiveCamera() {
  const { camera, size } = useThree();
  const previousMode = useRef<"compact" | "wide" | null>(null);

  useEffect(() => {
    const mode = size.width < 650 ? "compact" : "wide";
    if (mode === previousMode.current) return;
    previousMode.current = mode;
    camera.position.set(mode === "compact" ? 3 : 4, mode === "compact" ? 24 : 20, mode === "compact" ? 46 : 38);
    camera.lookAt(0, 1.35, 0);
    camera.updateProjectionMatrix();
  }, [camera, size.width]);

  return null;
}

type LineAssetProps = {
  src: string;
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
  animation?: string;
  animationSpeed?: number;
};

const conveyorPositions = [-10, -6, -2, 2, 6] as const;

function LineAsset({
  src,
  position,
  rotation = [0, 0, 0],
  scale = 1,
  animation,
  animationSpeed = 1,
}: LineAssetProps) {
  const { scene, animations } = useGLTF(src);
  const model = useMemo(() => scene.clone(true), [scene]);
  const { actions } = useAnimations(animations, model);

  useEffect(() => {
    model.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
  }, [model]);

  useEffect(() => {
    if (!animation) return;
    const action = actions[animation];
    if (!action) return;
    action.reset().setEffectiveTimeScale(animationSpeed).fadeIn(0.25).play();
    return () => {
      action.fadeOut(0.2);
    };
  }, [actions, animation, animationSpeed]);

  return <primitive object={model} position={position} rotation={rotation} scale={scale} />;
}

function StationPlacard({ stationId }: { stationId: string }) {
  const station = getStation(stationId);
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 112;
    const context = canvas.getContext("2d");
    if (!context) return null;

    context.fillStyle = "rgba(247, 247, 244, 0.96)";
    context.beginPath();
    context.roundRect(2, 2, 508, 108, 8);
    context.fill();
    context.strokeStyle = "rgba(69, 74, 77, 0.4)";
    context.lineWidth = 3;
    context.stroke();
    context.fillStyle = "#25282a";
    context.font = "600 30px ui-monospace, SFMono-Regular, Menlo, monospace";
    context.textBaseline = "middle";
    context.fillText(station.id, 24, 38);
    context.fillStyle = "#62686c";
    context.font = "500 25px Arial, sans-serif";
    context.fillText(station.shortName.toUpperCase(), 24, 76);

    const nextTexture = new THREE.CanvasTexture(canvas);
    nextTexture.colorSpace = THREE.SRGBColorSpace;
    nextTexture.minFilter = THREE.LinearFilter;
    nextTexture.needsUpdate = true;
    return nextTexture;
  }, [station.id, station.shortName]);

  useEffect(() => () => texture?.dispose(), [texture]);
  if (!texture) return null;

  return (
    <sprite position={[station.position[0], 1.15, -3.55]} scale={[3.45, 0.76, 1]}>
      <spriteMaterial map={texture} transparent depthTest={false} />
    </sprite>
  );
}

function LineFloor({ selectedStationId }: { selectedStationId?: string }) {
  const selectedX = selectedStationId ? getStation(selectedStationId).position[0] : 0;

  return (
    <group>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]}>
        <planeGeometry args={[31, 9]} />
        <meshStandardMaterial color="#cfd3d5" roughness={0.92} metalness={0.02} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[selectedX, -0.025, 0]}>
        <planeGeometry args={[5.5, 6.5]} />
        <meshBasicMaterial color="#e82127" transparent opacity={0.055} depthWrite={false} />
      </mesh>
      {[-7.5, -2.5, 2.5, 7.5].map((x) => (
        <mesh key={x} position={[x, 0.005, 0]}>
          <boxGeometry args={[0.035, 0.025, 6.5]} />
          <meshStandardMaterial color="#a7adaf" roughness={1} />
        </mesh>
      ))}
      {[-3.28, 3.28].map((z) => (
        <mesh key={z} position={[0, 0.012, z]}>
          <boxGeometry args={[30, 0.03, 0.065]} />
          <meshStandardMaterial color="#d1a93f" roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function SingleLineModel({
  selectedStationId,
  lineStopped,
}: {
  selectedStationId?: string;
  lineStopped: boolean;
}) {
  return (
    <group>
      <LineFloor selectedStationId={selectedStationId} />

      {conveyorPositions.map((x) => (
        <LineAsset
          key={x}
          src="/assets/line/conveyor.glb"
          position={[x, 0, 0]}
          rotation={[0, Math.PI / 2, 0]}
        />
      ))}

      <LineAsset
        src="/assets/line/painted-shell.glb"
        position={[-9.5, 0.435, 0]}
        rotation={[0, Math.PI / 2, 0]}
      />
      <LineAsset
        src="/assets/line/trimmed-body.glb"
        position={[-4.8, 1.68, 0]}
        rotation={[0, Math.PI / 2, 0]}
      />
      <LineAsset
        src="/assets/vehicles/tesla-model-3.glb"
        position={[5, 1.545, 0]}
        rotation={[0, Math.PI / 2, 0]}
        scale={0.009}
      />
      <LineAsset
        src="/assets/vehicles/tesla-model-3.glb"
        position={[10.5, 1.545, 0]}
        rotation={[0, Math.PI / 2, 0]}
        scale={0.009}
      />

      <LineAsset
        src="/assets/line/dashboard-cart.glb"
        position={[-5, 0, 2.4]}
        rotation={[0, Math.PI, 0]}
      />
      <LineAsset
        src="/assets/line/glass-robot.glb"
        position={[0, 0, 2.05]}
        rotation={[0, Math.PI / 2, 0]}
        animation={lineStopped ? undefined : "arm-swing"}
        animationSpeed={0.28}
      />
      <LineAsset
        src="/assets/line/wheel-station.glb"
        position={[5, 0, -2.05]}
        rotation={[0, 0, 0]}
      />
      <LineAsset
        src="/assets/line/roller-test.glb"
        position={[10.5, 0, 0]}
        animation={lineStopped ? undefined : "spin"}
        animationSpeed={0.42}
      />

      <LineAsset
        src="/assets/line/worker-torque.glb"
        position={[5.2, 0, 2.25]}
        rotation={[0, Math.PI, 0]}
      />
      <LineAsset
        src="/assets/line/quality-inspector.glb"
        position={[10.1, 0, -2.45]}
        rotation={[0, -Math.PI / 2, 0]}
      />
      <LineAsset
        src="/assets/line/maintenance-tech.glb"
        position={[0.15, 0, -2.15]}
        rotation={[0, -Math.PI / 2, 0]}
      />

      {(["GA-12", "GA-18", "GA-24", "GA-32", "EOL-41"] as const).map((stationId) => (
        <StationPlacard key={stationId} stationId={stationId} />
      ))}
    </group>
  );
}

function CameraDirector({
  selected,
  controls,
}: {
  selected?: Incident;
  controls: React.RefObject<ControlsHandle | null>;
}) {
  const { camera } = useThree();
  const selectedId = selected?.id;
  const stationId = selected?.stationId;
  const animation = useRef({
    active: false,
    elapsed: 0,
    fromCamera: new THREE.Vector3(),
    toCamera: new THREE.Vector3(),
    fromTarget: new THREE.Vector3(),
    toTarget: new THREE.Vector3(),
  });
  const firstSelection = useRef(true);

  useEffect(() => {
    if (!stationId || !controls.current) return;
    if (firstSelection.current) {
      firstSelection.current = false;
      return;
    }
    const position = getStation(stationId).position;
    const target = new THREE.Vector3(position[0], 1.6, position[2]);
    animation.current = {
      active: true,
      elapsed: 0,
      fromCamera: camera.position.clone(),
      toCamera: new THREE.Vector3(position[0] + 2, 9.5, position[2] + 15),
      fromTarget: controls.current.target.clone(),
      toTarget: target,
    };
  }, [camera, controls, selectedId, stationId]);

  useFrame((_, delta) => {
    const current = animation.current;
    if (!current.active || !controls.current) return;
    current.elapsed = Math.min(current.elapsed + delta / 0.72, 1);
    const eased = 1 - Math.pow(1 - current.elapsed, 4);
    camera.position.lerpVectors(current.fromCamera, current.toCamera, eased);
    controls.current.target.lerpVectors(current.fromTarget, current.toTarget, eased);
    controls.current.update();
    if (current.elapsed >= 1) current.active = false;
  });

  return null;
}

function MarkerSprite({
  count,
  color,
  selected,
  onSelect,
}: {
  count: number;
  color: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) return null;

    context.translate(128, 128);
    context.fillStyle = "rgba(31, 34, 36, 0.98)";
    context.beginPath();
    context.moveTo(0, -111);
    context.lineTo(111, 0);
    context.lineTo(0, 111);
    context.lineTo(-111, 0);
    context.closePath();
    context.fill();
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(0, -98);
    context.lineTo(98, 0);
    context.lineTo(0, 98);
    context.lineTo(-98, 0);
    context.closePath();
    context.fill();

    context.strokeStyle = selected ? "#f7f7f4" : "rgba(247, 247, 244, 0.72)";
    context.lineWidth = selected ? 9 : 5;
    context.stroke();

    context.fillStyle = "#25282a";
    context.font = "800 112px Arial, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("!", -7, 4);

    context.fillStyle = "#25282a";
    context.beginPath();
    context.arc(75, -72, 34, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#f7f7f4";
    context.lineWidth = 5;
    context.stroke();
    context.fillStyle = "#f7f7f4";
    context.font = "700 35px ui-monospace, SFMono-Regular, Menlo, monospace";
    context.fillText(String(count), 75, -69);

    const nextTexture = new THREE.CanvasTexture(canvas);
    nextTexture.colorSpace = THREE.SRGBColorSpace;
    nextTexture.minFilter = THREE.LinearFilter;
    nextTexture.needsUpdate = true;
    return nextTexture;
  }, [color, count, selected]);

  useEffect(() => () => texture?.dispose(), [texture]);

  if (!texture) return null;

  return (
    <sprite
      position={[0, 0.62, 0]}
      scale={selected ? [1.6, 1.6, 1] : [1.28, 1.28, 1]}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "default";
      }}
    >
      <spriteMaterial map={texture} transparent depthTest={false} />
    </sprite>
  );
}

function IncidentMarkers({
  incidents,
  selectedId,
  onSelect,
}: {
  incidents: Incident[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const grouped = useMemo(() => {
    const byStation = new Map<string, Incident[]>();
    for (const incident of incidents) {
      const group = byStation.get(incident.stationId) ?? [];
      group.push(incident);
      byStation.set(incident.stationId, group);
    }
    for (const group of byStation.values()) {
      group.sort((a, b) => severityRank[b.severity] - severityRank[a.severity]);
    }
    return [...byStation.entries()];
  }, [incidents]);

  return grouped.map(([stationId, stationIncidents]) => {
    const station = getStation(stationId);
    const lead = stationIncidents[0];
    const selected = stationIncidents.some((incident) => incident.id === selectedId);
    const color =
      lead.severity === "critical"
        ? "#e82127"
        : lead.severity === "high"
          ? "#e57b38"
          : "#d2a94f";

    return (
      <group position={station.position} key={stationId}>
        <mesh position={[0, -1.18, 0]}>
          <cylinderGeometry args={[0.045, 0.045, 2.38, 12]} />
          <meshBasicMaterial color={color} transparent opacity={0.9} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -2.78, 0]}>
          <ringGeometry args={[0.38, 0.58, 32]} />
          <meshBasicMaterial color={color} transparent opacity={0.94} side={THREE.DoubleSide} />
        </mesh>
        <MarkerSprite
          count={stationIncidents.length}
          color={color}
          selected={selected}
          onSelect={() => onSelect(lead.id)}
        />
      </group>
    );
  });
}

function Scene({ incidents, selectedId, onSelectIncident }: FactoryTwinProps) {
  const controls = useRef<ControlsHandle | null>(null);
  const selected = incidents.find((incident) => incident.id === selectedId);
  const lineStopped = incidents.some(
    (incident) => incident.impact === "safety_stop" || incident.impact === "line_stop",
  );

  return (
    <>
      <color attach="background" args={["#e2e5e6"]} />
      <fog attach="fog" args={["#e2e5e6", 38, 72]} />
      <hemisphereLight args={["#ffffff", "#7f858a", 2.35]} />
      <directionalLight
        castShadow
        intensity={3.15}
        position={[-12, 28, 16]}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-bias={-0.00025}
      />
      <directionalLight intensity={1.05} position={[20, 12, -16]} color="#dbe7f0" />
      <SingleLineModel selectedStationId={selected?.stationId} lineStopped={lineStopped} />
      <ContactShadows position={[0, 0.02, 0]} opacity={0.22} scale={36} blur={2.3} far={9} />
      <IncidentMarkers incidents={incidents} selectedId={selectedId} onSelect={onSelectIncident} />
      <ResponsiveCamera />
      <OrbitControls
        ref={controls as never}
        makeDefault
        target={[0, 1.35, 0]}
        minDistance={8}
        maxDistance={54}
        minPolarAngle={0.35}
        maxPolarAngle={Math.PI / 2.08}
        enablePan={false}
        dampingFactor={0.08}
      />
      <CameraDirector selected={selected} controls={controls} />
      <Preload all />
    </>
  );
}

function ProgressOverlay() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div className="canvas-progress" aria-live="polite">
      <span style={{ transform: `scaleX(${progress / 100})` }} />
      <small>Loading line model · {Math.round(progress)}%</small>
    </div>
  );
}

export function FactoryTwin(props: FactoryTwinProps) {
  return (
    <div className="canvas-shell">
      <Canvas
        shadows
        dpr={[1, 1.75]}
        camera={{ position: [4, 20, 38], fov: 30, near: 0.1, far: 120 }}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
        }}
      >
        <Suspense fallback={null}>
          <Scene {...props} />
        </Suspense>
      </Canvas>
      <ProgressOverlay />
    </div>
  );
}

[
  "/assets/line/conveyor.glb",
  "/assets/line/painted-shell.glb",
  "/assets/line/trimmed-body.glb",
  "/assets/vehicles/tesla-model-3.glb",
  "/assets/line/dashboard-cart.glb",
  "/assets/line/glass-robot.glb",
  "/assets/line/wheel-station.glb",
  "/assets/line/roller-test.glb",
  "/assets/line/worker-torque.glb",
  "/assets/line/quality-inspector.glb",
  "/assets/line/maintenance-tech.glb",
].forEach((src) => useGLTF.preload(src));
