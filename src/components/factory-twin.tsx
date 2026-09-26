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
import { WrenchIcon } from "@phosphor-icons/react";
import { Component, Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import * as THREE from "three";
import { getStation, type Incident, severityRank } from "@/lib/line-data";
import { type RankedIncident, type StationId, type StationReading } from "@/lib/priority/types";
import { getStationEffect, getStationStatus } from "@/lib/priority/station-effect";
import { advanceFactoryVehicleSlots, createFactoryVehicleSlots, FACTORY_STATION_X, VEHICLE_ENTRY_X, VEHICLE_EXIT_X, VEHICLE_SLOT_COUNT, type FactoryVehicleSlot } from "@/lib/priority/factory-motion";
import { getIncidentPresentation } from "@/lib/priority/presentation";
import priorityStyles from "./priority-factory-twin.module.css";

type FactoryTwinProps = {
  incidents: Incident[];
  selectedId: string;
  onSelectIncident: (id: string) => void;
  vehiclesRerouted?: boolean;
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
    camera.position.set(
      mode === "compact" ? 2 : 4,
      mode === "compact" ? 15 : 20,
      38,
    );
    camera.lookAt(0, mode === "compact" ? 0.9 : 1.35, 0);
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
  fadeAtEdges?: boolean;
};

const conveyorPositions = [-10, -6, -2, 2, 6] as const;
const vehiclePositions = createFactoryVehicleSlots().filter((x): x is number => x !== null);
// The GLB nose points toward -Z. Face +X, from body input to inspection.
const vehicleForwardRotation = -Math.PI / 2;
const reroutedVehicleOffset = 42;

function LineAsset({
  src,
  position,
  rotation = [0, 0, 0],
  scale = 1,
  animation,
  animationSpeed = 1,
  fadeAtEdges = false,
}: LineAssetProps) {
  const { scene, animations } = useGLTF(src);
  const model = useMemo(() => {
    const clone = scene.clone(true);
    if (src === "/assets/line/roller-test.glb") {
      // The supplied drums run along X, parallel to vehicle travel. Place two
      // transverse drums at each axle. A static pivot turns both the geometry
      // and its existing X-axis spin animation onto the lane's Z axis.
      for (const name of ["roller-l1", "roller-l2", "roller-r1", "roller-r2"]) {
        const drum = clone.getObjectByName(name);
        if (!drum?.parent) continue;
        const parent = drum.parent;
        const pivot = new THREE.Group();
        pivot.name = `${name}-transverse-axis`;
        pivot.position.set(drum.position.x + drum.position.z, drum.position.y, 0);
        pivot.rotation.y = -Math.PI / 2;
        parent.add(pivot);
        pivot.add(drum);
        drum.position.set(0, 0, 0);
        drum.scale.x *= 1.5;
      }
    }
    return clone;
  }, [scene, src]);
  const { actions } = useAnimations(animations, model);
  const fadingMaterials = useRef<THREE.Material[]>([]);

  useEffect(() => {
    model.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
        if (fadeAtEdges) {
          const materials = (Array.isArray(object.material) ? object.material : [object.material]).map(material => {
            const copy = material.clone(); copy.transparent = true; fadingMaterials.current.push(copy); return copy;
          });
          object.material = Array.isArray(object.material) ? materials : materials[0];
        }
      }
    });
    return () => { fadingMaterials.current.forEach(material => material.dispose()); fadingMaterials.current = []; };
  }, [model, fadeAtEdges]);

  useFrame(() => {
    if (!fadeAtEdges || !model.parent) return;
    const x = model.parent.position.x;
    const opacity = Math.min(1, Math.max(0, (x - VEHICLE_ENTRY_X)), Math.max(0, (VEHICLE_EXIT_X - x)));
    fadingMaterials.current.forEach(material => { material.opacity = opacity; });
  });

  useEffect(() => {
    if (!animation) return;
    const action = actions[animation];
    if (!action) return;
    action.setEffectiveTimeScale(animationSpeed).play();
    return () => {
      action.setEffectiveTimeScale(0);
    };
  }, [actions, animation, animationSpeed]);

  return (
    <primitive
      object={model}
      position={position}
      rotation={rotation}
      scale={scale}
    />
  );
}

function LineFloor({
  selectedStationId,
  selectedFloorX,
}: {
  selectedStationId?: string;
  selectedFloorX?: number | null;
}) {
  const selectedX = selectedFloorX !== undefined
    ? selectedFloorX
    : selectedStationId ? getStation(selectedStationId).position[0] : 0;

  return (
    <group>
      <mesh
        receiveShadow
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.04, 0]}
      >
        <planeGeometry args={[31, 9]} />
        <meshStandardMaterial
          color="#cfd3d5"
          roughness={0.92}
          metalness={0.02}
        />
      </mesh>
      {selectedX !== null ? <mesh rotation={[-Math.PI / 2, 0, 0]} position={[selectedX, -0.025, 0]}>
        <planeGeometry args={[5.5, 6.5]} />
        <meshBasicMaterial
          color="#e82127"
          transparent
          opacity={0.055}
          depthWrite={false}
        />
      </mesh> : null}
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

function ReroutableVehicles({ rerouted }: { rerouted: boolean }) {
  const group = useRef<THREE.Group>(null);
  const prefersReducedMotion = useRef(false);
  const [initialPosition] = useState<[number, number, number]>(() => [
    rerouted ? reroutedVehicleOffset : 0,
    0,
    0,
  ]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => {
      prefersReducedMotion.current = mediaQuery.matches;
    };

    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  useFrame((_, delta) => {
    if (!group.current) return;
    const targetX = rerouted ? reroutedVehicleOffset : 0;

    if (prefersReducedMotion.current) {
      group.current.position.x = targetX;
      return;
    }

    group.current.position.x = THREE.MathUtils.damp(
      group.current.position.x,
      targetX,
      22,
      delta,
    );

    if (Math.abs(group.current.position.x - targetX) < 0.01) {
      group.current.position.x = targetX;
    }
  });

  return (
    <group ref={group} position={initialPosition}>
      {vehiclePositions.map((x) => (
        <LineAsset
          key={x}
          src="/assets/vehicles/tesla-model-3.glb"
          position={[x, 1.11, 0]}
          rotation={[0, vehicleForwardRotation, 0]}
          scale={0.009}
        />
      ))}
    </group>
  );
}

function SingleLineModel({
  selectedStationId,
  selectedFloorX,
  lineStopped,
  vehiclesRerouted,
  priorityMotion,
}: {
  selectedStationId?: string;
  selectedFloorX?: number | null;
  lineStopped: boolean;
  vehiclesRerouted: boolean;
  priorityMotion?: { readings: StationReading[]; moving: boolean };
}) {
  return (
    <group>
      <LineFloor selectedStationId={selectedStationId} selectedFloorX={selectedFloorX} />

      {conveyorPositions.map((x) => (
        <LineAsset
          key={x}
          src="/assets/line/conveyor.glb"
          position={[x, 0, 0]}
          rotation={[0, Math.PI / 2, 0]}
        />
      ))}

      {priorityMotion ? <FlowVehicles readings={priorityMotion.readings} moving={priorityMotion.moving} /> : <ReroutableVehicles rerouted={vehiclesRerouted} />}

      <LineAsset
        src="/assets/line/glass-robot.glb"
        position={[0, 0, 2.05]}
        rotation={[0, Math.PI / 2, 0]}
        animation="arm-swing"
        animationSpeed={priorityMotion ? (priorityMotion.moving ? (priorityMotion.readings.find(r => r.id === "GA-24")?.ratePerHour ?? 0) / 60 * .4 : 0) : lineStopped ? 0 : .28}
      />
      <LineAsset
        src="/assets/line/wheel-station.glb"
        position={[5, 0, -2.05]}
        rotation={[0, 0, 0]}
      />
      <LineAsset
        src="/assets/line/roller-test.glb"
        position={[10.5, 0, 0]}
        animation="spin"
        animationSpeed={priorityMotion ? (priorityMotion.moving ? (priorityMotion.readings.find(r => r.id === "EOL-41")?.ratePerHour ?? 0) / 60 * .7 : 0) : lineStopped ? 0 : .42}
      />
    </group>
  );
}

function CameraDirector({
  selected,
  controls,
  overview,
}: {
  selected?: Incident;
  controls: React.RefObject<ControlsHandle | null>;
  overview: boolean;
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
    if (!controls.current) return;
    if (overview) {
      animation.current = {
        active: true,
        elapsed: 0,
        fromCamera: camera.position.clone(),
        toCamera: new THREE.Vector3(4, 20, 38),
        fromTarget: controls.current.target.clone(),
        toTarget: new THREE.Vector3(0, 1.35, 0),
      };
      return;
    }
    if (!stationId) return;
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
  }, [camera, controls, overview, selectedId, stationId]);

  useFrame((_, delta) => {
    const current = animation.current;
    if (!current.active || !controls.current) return;
    current.elapsed = Math.min(current.elapsed + delta / 0.72, 1);
    const eased = 1 - Math.pow(1 - current.elapsed, 4);
    camera.position.lerpVectors(current.fromCamera, current.toCamera, eased);
    controls.current.target.lerpVectors(
      current.fromTarget,
      current.toTarget,
      eased,
    );
    controls.current.update();
    if (current.elapsed >= 1) current.active = false;
  });

  return null;
}

function IncidentBeacon({
  color,
  selected,
  onSelect,
}: {
  color: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    if (!context) return null;

    context.translate(64, 64);
    context.fillStyle = color;
    context.beginPath();
    context.arc(0, 0, 35, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = selected ? "#ffffff" : "rgba(255, 255, 255, 0.82)";
    context.lineWidth = selected ? 10 : 7;
    context.stroke();

    const nextTexture = new THREE.CanvasTexture(canvas);
    nextTexture.colorSpace = THREE.SRGBColorSpace;
    nextTexture.minFilter = THREE.LinearFilter;
    nextTexture.needsUpdate = true;
    return nextTexture;
  }, [color, selected]);

  useEffect(() => () => texture?.dispose(), [texture]);

  if (!texture) return null;

  return (
    <sprite
      scale={selected ? [0.66, 0.66, 1] : [0.5, 0.5, 1]}
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

function SelectedIncidentLabel({
  stationName,
  count,
  color,
  onSelect,
}: {
  stationName: string;
  count: number;
  color: string;
  onSelect: () => void;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 112;
    const context = canvas.getContext("2d");
    if (!context) return null;

    context.fillStyle = "rgba(35, 38, 40, 0.96)";
    context.beginPath();
    context.roundRect(2, 2, 508, 108, 18);
    context.fill();

    context.fillStyle = color;
    context.beginPath();
    context.arc(38, 56, 13, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = "#f7f7f4";
    context.font = "600 32px Arial, sans-serif";
    context.textBaseline = "middle";
    context.fillText(stationName, 67, 56);

    if (count > 1) {
      const countLabel = String(count);
      context.font = "700 27px ui-monospace, SFMono-Regular, Menlo, monospace";
      const countWidth = context.measureText(countLabel).width;
      context.fillStyle = "rgba(247, 247, 244, 0.14)";
      context.beginPath();
      context.roundRect(452 - countWidth, 27, countWidth + 32, 58, 20);
      context.fill();
      context.fillStyle = "#f7f7f4";
      context.fillText(countLabel, 468 - countWidth, 57);
    }

    const nextTexture = new THREE.CanvasTexture(canvas);
    nextTexture.colorSpace = THREE.SRGBColorSpace;
    nextTexture.minFilter = THREE.LinearFilter;
    nextTexture.needsUpdate = true;
    return nextTexture;
  }, [color, count, stationName]);

  useEffect(() => () => texture?.dispose(), [texture]);
  if (!texture) return null;

  return (
    <sprite
      position={[0, 0.64, 0]}
      scale={[2.8, 0.61, 1]}
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
    const selectedIncident = stationIncidents.find(
      (incident) => incident.id === selectedId,
    );
    const selected = Boolean(selectedIncident);
    const incidentId = selectedIncident?.id ?? lead.id;
    const color =
      lead.severity === "critical"
        ? "#e82127"
        : lead.severity === "high"
          ? "#e57b38"
          : "#d2a94f";

    return (
      <group position={station.position} key={stationId}>
        <IncidentBeacon
          color={color}
          selected={selected}
          onSelect={() => onSelect(incidentId)}
        />
        {selected ? (
          <SelectedIncidentLabel
            stationName={station.shortName}
            count={stationIncidents.length}
            color={color}
            onSelect={() => onSelect(incidentId)}
          />
        ) : null}
      </group>
    );
  });
}

function Scene({
  incidents,
  selectedId,
  onSelectIncident,
  vehiclesRerouted = false,
}: FactoryTwinProps) {
  const controls = useRef<ControlsHandle | null>(null);
  const selected = incidents.find((incident) => incident.id === selectedId);
  const lineStopped = incidents.some(
    (incident) =>
      incident.impact === "safety_stop" || incident.impact === "line_stop",
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
      <directionalLight
        intensity={1.05}
        position={[20, 12, -16]}
        color="#dbe7f0"
      />
      <SingleLineModel
        selectedStationId={selected?.stationId}
        lineStopped={lineStopped}
        vehiclesRerouted={vehiclesRerouted}
      />
      <ContactShadows
        position={[0, 0.02, 0]}
        opacity={0.22}
        scale={36}
        blur={2.3}
        far={9}
      />
      <IncidentMarkers
        incidents={incidents}
        selectedId={selectedId}
        onSelect={onSelectIncident}
      />
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
      <CameraDirector
        selected={selected}
        controls={controls}
        overview={vehiclesRerouted}
      />
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

export function FactoryTwin({
  vehiclesRerouted = false,
  ...props
}: FactoryTwinProps) {
  return (
    <div className="canvas-shell">
      <Canvas
        shadows
        dpr={[1, 1.75]}
        camera={{ position: [4, 20, 38], fov: 30, near: 0.1, far: 120 }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
        }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
        }}
      >
        <Suspense fallback={null}>
          <Scene {...props} vehiclesRerouted={vehiclesRerouted} />
        </Suspense>
      </Canvas>
      <ProgressOverlay />
    </div>
  );
}


type PriorityFactoryTwinProps = {
  ranking: RankedIncident[];
  readings: StationReading[];
  minute?: number;
  simulationRun?: number;
  playing?: boolean;
  projection?: boolean;
  selectedId: string | null;
  onSelectIncident: (id: string) => void;
};

// Five original equipment anchors, with three additional logical process zones.
// The priority simulation shares the original factory model without adding machinery.
const priorityStationXs = FACTORY_STATION_X;

// Attachment points lie on the existing equipment, not above it in empty space.
// Extra process zones share the physical conveyor; inspection uses its exit bed.
const priorityStationAnchors: Record<StationId, [number, number, number]> = {
  "GA-12": [priorityStationXs["GA-12"], 0.43, 1.25],
  "GA-18": [priorityStationXs["GA-18"], 0.43, 1.25],
  "GA-24": [priorityStationXs["GA-24"], 1.8, 2.05],
  "GA-28": [priorityStationXs["GA-28"], 0.43, 1.25],
  "GA-32": [priorityStationXs["GA-32"], 2.7, -2.05],
  "GA-36": [priorityStationXs["GA-36"], 0.43, 1.25],
  "EOL-41": [priorityStationXs["EOL-41"], 0.72, 0],
  "EOL-45": [priorityStationXs["EOL-45"], 0.72, 0],
};

function subscribeToMotionPreference(onChange: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getMotionPreference() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function PriorityCamera({ resetVersion }: { resetVersion: number }) {
  const { camera, size, controls } = useThree();

  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const compact = size.width < 650;
    const target = new THREE.Vector3(0, compact ? 0.9 : 1.35, 0);
    // Preserve the original viewing angle, perspective, and fog depth. Adapt
    // the field of view to this shorter panel instead of rebuilding the line.
    camera.position.set(compact ? 2 : 4, compact ? 15 : 20, 38);
    const aspect = size.width / Math.max(size.height, 1);
    const distance = camera.position.distanceTo(target);
    camera.setFocalLength(camera.getFilmHeight() * distance * aspect / 34);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    if (controls && "target" in controls) {
      const orbit = controls as unknown as ControlsHandle;
      orbit.target.copy(target);
      orbit.update();
    }
  }, [camera, controls, resetVersion, size.width, size.height]);

  return null;
}

/** Representative vehicles advance only where simulated material is flowing.
 * Keep spacing; a stopped section backs up the cars behind it. Motion is illustrative,
 * not a discrete-body reconstruction of the simulator's fractional inventory. */
function FlowVehicles({ readings, moving }: { readings: StationReading[]; moving: boolean }) {
  const cars = useRef<(THREE.Group | null)[]>([]);
  const [initialSlots] = useState(createFactoryVehicleSlots);
  const positions = useRef<FactoryVehicleSlot[]>(initialSlots);
  useFrame((_, delta) => {
    if (!moving) return;
    const next = advanceFactoryVehicleSlots(positions.current, readings, delta, moving);
    next.forEach((x, index) => {
      const car = cars.current[index];
      if (!car) return;
      car.visible = x !== null;
      if (x !== null) car.position.x = x;
    });
    positions.current = next;
  });
  return <group>{Array.from({ length: VEHICLE_SLOT_COUNT }, (_, i) => <group key={i} ref={node => { cars.current[i] = node; }} visible={initialSlots[i] !== null} position={[initialSlots[i] ?? VEHICLE_ENTRY_X,0,0]}><LineAsset src="/assets/vehicles/tesla-model-3.glb" position={[0,1.11,0]} rotation={[0,vehicleForwardRotation,0]} scale={.009} fadeAtEdges /></group>)}</group>;
}

function PriorityStationMarker({
  reading,
  stationRanking,
  minute,
  selectedId,
  onSelectIncident,
  floorRef,
  calloutRef,
}: {
  reading: StationReading;
  stationRanking: RankedIncident[];
  minute: number;
  selectedId: string | null;
  onSelectIncident: (id: string) => void;
  floorRef: (element: HTMLDivElement | null) => void;
  calloutRef: (element: HTMLDivElement | null) => void;
}) {
  const selected = stationRanking.find((item) => item.incident.id === selectedId);
  const waiting = stationRanking.find((item) => item.incident.status === "open");
  const visible = (selected?.incident.status === "open" ? selected : waiting) ?? selected ?? stationRanking[0];
  const repairing = visible?.incident.status === "repairing";
  const safety = stationRanking.some((item) => item.decision.evidence.safetyReview);
  const presentation = visible ? getIncidentPresentation(visible, minute) : null;
  const effect = getStationEffect(reading);
  const status = getStationStatus(reading);
  return (
    <>
      <div ref={floorRef} className={priorityStyles.floorProjection}>
        <span className={priorityStyles.stationLabel} data-selected={Boolean(selected)} title={`${reading.name} · ${reading.state}`}>
          {!visible && effect.kind === "running" ? ({"GA-12":"Body input","GA-18":"Cockpit","GA-24":"Glass","GA-28":"Battery","GA-32":"Wheels","GA-36":"Fluids","EOL-41":"Roller test","EOL-45":"Inspection"}[reading.id]) : ""}
        </span>
      </div>
      <div ref={calloutRef} className={priorityStyles.calloutProjection}>
        {visible && presentation ? (
          <div className={priorityStyles.markerAnchor} data-station={reading.id} data-raised={["GA-18", "GA-28", "GA-36", "EOL-45"].includes(reading.id)}>
          <button
            type="button"
            className={priorityStyles.marker}
            data-selected={Boolean(selected)}
            data-safety={safety}
            data-repairing={repairing}
            data-urgency={presentation.urgency}
            onClick={(event) => {
              event.stopPropagation();
              onSelectIncident(visible.incident.id);
            }}
            aria-label={`Highlight ${repairing ? "repair in progress" : `priority ${visible.rank}`}: ${presentation.title} at ${reading.id}. ${presentation.timingLabel}${stationRanking.length > 1 ? `. ${stationRanking.length} incidents at this station` : ""}`}
            aria-pressed={Boolean(selected)}
            title={`${reading.id} · ${presentation.title} · ${presentation.timingLabel}`}
          >
            {repairing ? <WrenchIcon size={14} aria-hidden="true" /> : <span className={priorityStyles.rank}>{visible.rank}</span>}<span className={priorityStyles.markerStation}>{reading.id}</span>
            {stationRanking.length > 1 ? <span className={priorityStyles.count}>+{stationRanking.length - 1}</span> : null}
          </button>
          {effect.kind !== "running" && <span className={priorityStyles.markerEffect} data-effect={status.tone} title={status.description}>{status.label}</span>}
          <span className={priorityStyles.markerLeader} aria-hidden="true" />
          </div>
        ) : effect.kind !== "running" ? <div className={priorityStyles.markerAnchor} data-station={reading.id} data-raised={["GA-18", "GA-28", "GA-36", "EOL-45"].includes(reading.id)}>
          <span className={priorityStyles.flowMarker} data-effect={status.tone} title={status.description}><strong>{reading.id}</strong>{status.label}</span>
          <span className={priorityStyles.markerLeader} aria-hidden="true" />
        </div> : null}
      </div>
    </>
  );
}

type IncidentLabelRefs = {
  floorLabels: RefObject<(HTMLDivElement | null)[]>;
  calloutLabels: RefObject<(HTMLDivElement | null)[]>;
};

function PriorityScene({
  ranking,
  readings,
  simulationRun = 0,
  playing = false,
  projection = false,
  selectedId,
  reducedMotion,
  resetVersion,
  projectionLabels,
  floorLabels,
  calloutLabels,
}: PriorityFactoryTwinProps & IncidentLabelRefs & { reducedMotion: boolean; resetVersion: number; projectionLabels: RefObject<(HTMLSpanElement | null)[]> }) {
  const selectedStation = ranking.find((item) => item.incident.id === selectedId)?.incident.assessment.stationId;
  const selectedFloorX = selectedStation ? priorityStationXs[selectedStation] : null;
  const moving = playing && !reducedMotion;
  const lineStopped = !moving;
  return (
    <>
      <color attach="background" args={["#e2e5e6"]} />
      <fog attach="fog" args={["#e2e5e6", 38, 72]} />
      <hemisphereLight args={["#ffffff", "#7f858a", 2.35]} />
      <directionalLight castShadow intensity={3.15} position={[-12, 28, 16]} shadow-mapSize={[2048, 2048]} shadow-camera-left={-20} shadow-camera-right={20} shadow-camera-top={14} shadow-camera-bottom={-14} shadow-bias={-0.00025} />
      <directionalLight intensity={1.05} position={[20, 12, -16]} color="#dbe7f0" />
      {/* Preserve animation state across clock ticks, pause/resume and dispatch.
          Only an explicit simulation restart creates a fresh model. */}
      <SingleLineModel key={simulationRun} selectedFloorX={selectedFloorX} lineStopped={lineStopped} vehiclesRerouted={false} priorityMotion={{ readings, moving }} />
      <ContactShadows position={[0, 0.02, 0]} opacity={0.22} scale={36} blur={2.3} far={9} />
      {readings.map((reading) => (
          <group key={reading.id} position={[priorityStationXs[reading.id], 0, 0]}>
            {(projection || getStationEffect(reading).kind !== "running") && <ProjectedStation reading={reading} />}
          </group>
      ))}
      <OrbitControls makeDefault target={[0, 1.35, 0]} minDistance={8} maxDistance={54} minPolarAngle={0.35} maxPolarAngle={Math.PI / 2.08} enablePan={false} dampingFactor={0.08} />
      <PriorityCamera resetVersion={resetVersion} />
      {projection && <ProjectLabels labels={projectionLabels} readings={readings} />}
      {!projection && <ProjectIncidentLabels floorLabels={floorLabels} calloutLabels={calloutLabels} readings={readings} />}
      <Preload all />
    </>
  );
}

/** In a forecast the visible consequence matters, including stations with no fault of their own. */
function ProjectedStation({ reading }: { reading: StationReading }) {
  const effect = getStationEffect(reading);
  const stopped = effect.kind === "stopped";
  const waiting = getStationStatus(reading).tone === "waiting";
  const color = waiting ? "#7d9199" : stopped ? "#b74136" : effect.kind === "slowed" ? "#b48739" : "#5f8e78";
  return <mesh position={[0, .06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[1.6, 4.4]} />
      <meshBasicMaterial color={color} transparent opacity={waiting ? .2 : stopped ? .38 : effect.kind === "slowed" ? .28 : .12} depthWrite={false} />
    </mesh>;
}

// Keep labels in the parent React DOM tree so canvas teardown cannot synchronously
// unmount nested DOM roots while the responsive dashboard is rendering.
function ProjectIncidentLabels({ floorLabels, calloutLabels, readings }: IncidentLabelRefs & { readings: StationReading[] }) {
  const { camera, size } = useThree();
  const point = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const project = (element: HTMLDivElement | null, x: number, y: number, z: number) => {
      if (!element) return;
      point.set(x, y, z).project(camera);
      element.style.transform = `translate(${(point.x + 1) * size.width / 2}px, ${(1 - point.y) * size.height / 2}px)`;
      element.style.visibility = point.z >= -1 && point.z <= 1 && Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1 ? "visible" : "hidden";
    };
    readings.forEach((reading, index) => {
      project(floorLabels.current[index], priorityStationXs[reading.id], 0.04, reading.id === "EOL-45" ? 4.9 : 3.7);
      project(calloutLabels.current[index], ...priorityStationAnchors[reading.id]);
    });
  });
  return null;
}

function ProjectLabels({ labels, readings }: { labels: RefObject<(HTMLSpanElement | null)[]>; readings: StationReading[] }) {
  const {camera,size}=useThree();
  const point=useMemo(()=>new THREE.Vector3(),[]);
  useFrame(()=>{
    const occupied: {left:number; top:number; width:number; height:number}[] = [];
    readings.forEach((reading,index)=>{
      const element=labels.current[index];
      if(!element) return;
      point.set(...priorityStationAnchors[reading.id]).project(camera);
      const leaderLength = size.width < 400 ? 16 + (index % 3) * 42 : index % 2 ? 54 : 18;
      const anchorX=(point.x+1)*size.width/2;
      const anchorY=(1-point.y)*size.height/2;
      const width=element.offsetWidth, height=element.offsetHeight;
      const left=Math.max(6,Math.min(size.width-width-6,anchorX-width/2));
      const desiredTop=size.width<400 ? 6+(2-index%3)*42 : anchorY-leaderLength-height;
      const overlaps=(top:number)=>occupied.some(box=>left<box.left+box.width+6 && left+width+6>box.left && top<box.top+box.height+6 && top+height+6>box.top);
      const candidates=[desiredTop,6,anchorY-height-8,...occupied.flatMap(box=>[box.top-height-6,box.top+box.height+6])];
      const top=candidates.filter(y=>y>=6 && y<=anchorY-height-8 && !overlaps(y))
        .sort((a,b)=>Math.abs(a-desiredTop)-Math.abs(b-desiredTop))[0] ?? Math.max(6,desiredTop);
      const visible=point.z>=-1 && point.z<=1 && Math.abs(point.x)<=1 && Math.abs(point.y)<=1;
      if(visible) occupied.push({left,top,width,height});
      element.style.setProperty("--marker-leader", `${anchorY-top-height}px`);
      element.style.setProperty("--marker-leader-x", `${anchorX-left}px`);
      element.style.transform=`translate(${left}px,${top}px)`;
      element.style.visibility=visible?"visible":"hidden";
    });
  });
  return null;
}

function FactoryUnavailable() {
  return <div className={priorityStyles.unavailable}><strong>Factory view unavailable</strong><span>Select an incident from the priority list to continue.</span></div>;
}

class PriorityCanvasBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <FactoryUnavailable /> : this.props.children; }
}

/** Spatial overview of the same eight stations used by the incident simulation. */
export function PriorityFactoryTwin(props: PriorityFactoryTwinProps) {
  const reducedMotion = useSyncExternalStore(subscribeToMotionPreference, getMotionPreference, () => true);
  const [resetVersion, setResetVersion] = useState(0);
  const projectionLabels=useRef<(HTMLSpanElement|null)[]>([]);
  const floorLabels = useRef<(HTMLDivElement | null)[]>([]);
  const calloutLabels = useRef<(HTMLDivElement | null)[]>([]);
  return (
    <div className={priorityStyles.shell}>
      <PriorityCanvasBoundary>
        <Canvas
          style={{ position: "absolute", inset: 0 }}
          shadows
          dpr={[1, 1.5]}
          camera={{ position: [4, 20, 38], fov: 30, near: 0.1, far: 120 }}
          gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
          fallback={<FactoryUnavailable />}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.05;
          }}
        >
          <Suspense fallback={null}>
            <PriorityScene {...props} reducedMotion={reducedMotion} resetVersion={resetVersion} projectionLabels={projectionLabels} floorLabels={floorLabels} calloutLabels={calloutLabels} />
          </Suspense>
        </Canvas>
      </PriorityCanvasBoundary>
      {props.projection && <div className={priorityStyles.projectedLabels}>{props.readings.map((reading,index)=><span key={reading.id} ref={element=>{projectionLabels.current[index]=element;}} className={priorityStyles.projectedMarker} data-state={getStationStatus(reading).tone} title={getStationStatus(reading).description}><small>{reading.id}</small><strong>{getStationStatus(reading).label}</strong></span>)}</div>}
      {!props.projection && <div className={priorityStyles.incidentLabels}>{props.readings.map((reading, index) => <PriorityStationMarker
        key={reading.id}
        reading={reading}
        stationRanking={props.ranking.filter((item) => item.incident.status !== "resolved" && item.incident.assessment.stationId === reading.id)}
        minute={props.minute ?? 0}
        selectedId={props.selectedId}
        onSelectIncident={props.onSelectIncident}
        floorRef={(element) => { floorLabels.current[index] = element; }}
        calloutRef={(element) => { calloutLabels.current[index] = element; }}
      />)}</div>}
      <div className={priorityStyles.controls}>
        {reducedMotion ? <span>Reduced motion enabled</span> : !props.playing && !props.projection ? <span>Simulation paused</span> : null}
        <button type="button" onClick={() => setResetVersion((version) => version + 1)}>Reset view</button>
      </div>
      <ProgressOverlay />
    </div>
  );
}

[
  "/assets/line/conveyor.glb",
  "/assets/vehicles/tesla-model-3.glb",
  "/assets/line/glass-robot.glb",
  "/assets/line/wheel-station.glb",
  "/assets/line/roller-test.glb",
].forEach((src) => useGLTF.preload(src));
