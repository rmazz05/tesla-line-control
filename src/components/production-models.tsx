"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Environment, useAnimations, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { LINE_CENTER, LINE_ENTRY, LINE_STATIONS, advancePlantVehicles, createPlantVehicleSlots } from "@/lib/priority/plant-layout";
import { getStationEffect } from "@/lib/priority/station-effect";
import type { StationId, StationReading } from "@/lib/priority/types";
import { normalizeLineVehicle } from "@/lib/priority/model-geometry";

export const MODEL_URLS = {
  tesla: "/assets/vehicles/tesla-model-3.glb",
  robot: "/assets/line/abb-irb6700.glb",
  conveyor: "/assets/line/conveyor.glb",
  skid: "/assets/line/body-skid.glb",
  cockpit: "/assets/line/dashboard-cart.glb",
  marriage: "/assets/line/marriage-lift.glb",
  wheel: "/assets/line/wheel-station.glb",
  fluids: "/assets/line/fluid-station.glb",
  roller: "/assets/line/roller-test.glb",
  inspection: "/assets/line/inspection-tunnel.glb",
  worker: "/assets/line/line-worker.glb",
  supervisor: "/assets/line/supervisor.glb",
} as const;
export const LOCAL_DRACO = "/assets/draco/";

/** Local procedural light probe: painted vehicles/metal get reflections without
 * depending on an external HDR service or downloading a runtime environment. */
export function ModelLighting() {
  const { gl } = useThree();
  const target = useMemo(() => {
    const room = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(gl);
    const target = pmrem.fromScene(room, .04);
    room.dispose(); pmrem.dispose();
    return target;
  }, [gl]);
  useEffect(() => () => target.dispose(), [target]);
  return <Environment map={target.texture} environmentIntensity={.35} />;
}

type TeslaPart = { name: string; geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[]; matrix: THREE.Matrix4; installedAt: number; carrier?: boolean };

/** Real licensed Tesla Model 3 asset, normalised to a 4.694 m length. This is
 * explicitly a Model 3 visual substitute for the Berlin Model Y reference. */
export function TeslaFleet({ readings, moving }: { readings: StationReading[]; moving: boolean }) {
  const { scene } = useGLTF(MODEL_URLS.tesla, LOCAL_DRACO);
  const { scene: skid } = useGLTF(MODEL_URLS.skid, LOCAL_DRACO);
  const slots = useRef(createPlantVehicleSlots());
  const parts = useMemo(() => {
    const root = normalizeLineVehicle(scene, 4.694);
    const result: TeslaPart[] = [];
    root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      const materialName = materials.map(material => material.name).join(" ");
      result.push({ name: object.name, geometry: object.geometry, material: object.material, matrix: object.matrixWorld.clone(),
        installedAt: /^(hub_|wheels\.)/.test(materialName) ? 156 : /^glass\./.test(materialName) ? 120 : -Infinity });
    });
    const carrier = skid.clone(true);
    carrier.rotation.y = Math.PI / 2;
    carrier.updateMatrixWorld(true);
    carrier.traverse(object => {
      if (object instanceof THREE.Mesh) result.push({ name: `carrier-${object.name}`, geometry: object.geometry, material: object.material,
        matrix: object.matrixWorld.clone(), installedAt: -Infinity, carrier: true });
    });
    return result;
  }, [scene, skid]);
  // Runs before the part updaters, so all instances share the same new positions.
  useFrame((_, delta) => { if (moving) slots.current = advancePlantVehicles(slots.current, readings, delta, true); }, -2);
  return <group name="tesla-model-3-fleet" dispose={null}>{parts.map((part, i) => <TeslaInstances key={i} part={part} slots={slots} />)}</group>;
}
function TeslaInstances({ part, slots }: { part: TeslaPart; slots: RefObject<(number | null)[]> }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  useFrame(() => {
    if (!mesh.current) return;
    slots.current.forEach((x, i) => {
      if (x === null || x < part.installedAt || part.carrier && x >= 156) matrix.makeScale(0, 0, 0);
      else matrix.makeTranslation(x, part.carrier || x >= 156 ? .535 : 1.12, LINE_CENTER[2]).multiply(part.matrix);
      mesh.current!.setMatrixAt(i, matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  }, -1);
  return <instancedMesh ref={mesh} name={`tesla-${part.name}`} args={[part.geometry, part.material, slots.current.length]} castShadow receiveShadow frustumCulled={false} />;
}

/** Imported station models retain metre dimensions. Animations are visual cycles,
 * gated by each station's actual simulated flow, not claimed robot programs. */
function EquipmentModel({ url, position, rotation = 0, moving = false, reading, animation, scale = 1 }: {
  url: string; position: [number, number, number]; rotation?: number; scale?: number;
  moving?: boolean; reading?: StationReading; animation?: string;
}) {
  const { scene, animations } = useGLTF(url, LOCAL_DRACO);
  const model = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse(object => { if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true; } });
    // Imported roller drums originally turn along vehicle travel; use transverse axes.
    if (url === MODEL_URLS.roller) for (const name of ["roller-l1", "roller-l2", "roller-r1", "roller-r2"]) {
      const drum = clone.getObjectByName(name); if (!drum?.parent) continue;
      const pivot = new THREE.Group();
      pivot.position.set(drum.position.x + drum.position.z, drum.position.y, 0);
      pivot.rotation.y = -Math.PI / 2;
      drum.parent.add(pivot); pivot.add(drum); drum.position.set(0, 0, 0); drum.scale.x *= 1.5;
    }
    return clone;
  }, [scene, url]);
  const { actions } = useAnimations(animations, model);
  useEffect(() => {
    if (!animation) return;
    const action = actions[animation];
    action?.play();
    return () => { action?.stop(); };
  }, [actions, animation]);
  useEffect(() => {
    if (animation) actions[animation]?.setEffectiveTimeScale(moving && reading ? getStationEffect(reading).speedFactor : 0);
  }, [actions, animation, moving, reading]);
  return <primitive object={model} position={position} rotation={[0, rotation, 0]} scale={scale} dispose={null} />;
}

function ABBRobot({ x, z, direction, moving, reading }: { x: number; z: number; direction: number; moving: boolean; reading?: StationReading }) {
  const { scene } = useGLTF(MODEL_URLS.robot, LOCAL_DRACO);
  const model = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse(object => { if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true; } });
    return clone;
  }, [scene]);
  const base = useMemo(() => model.getObjectByName("joint_1"), [model]);
  const initial = useMemo(() => base?.quaternion.clone(), [base]);
  const spin = useMemo(() => new THREE.Quaternion(), []);
  const axis = useMemo(() => new THREE.Vector3(0, 0, 1), []);
  const phase = useRef(0);
  useFrame((_, delta) => {
    if (!moving || !reading || !base || !initial) return;
    phase.current += Math.min(delta, .05) * getStationEffect(reading).speedFactor;
    spin.setFromAxisAngle(axis, Math.sin(phase.current * .55) * .08);
    base.quaternion.copy(initial).multiply(spin);
  });
  return <group position={[x, .16, z]} rotation={[0, direction, 0]} name="ABB-IRB-6700-cell">
    <primitive object={model} dispose={null} />
    <mesh position={[0, .04, 0]} receiveShadow><boxGeometry args={[1.7, .08, 1.5]} /><meshStandardMaterial color="#59656d" metalness={.45} roughness={.5} /></mesh>
  </group>;
}

export function ProductionEquipment({ readings, moving }: { readings: StationReading[]; moving: boolean }) {
  const reading = (id: StationId) => readings.find(r => r.id === id);
  return <group name="imported-production-equipment">
    {Array.from({ length: 38 }, (_, i) => <EquipmentModel key={`conveyor-${i}`} url={MODEL_URLS.conveyor} position={[LINE_ENTRY + i * 4, .1, 132]} rotation={Math.PI / 2} />)}
    <EquipmentModel url={MODEL_URLS.cockpit} position={[101, 0, 129.5]} rotation={Math.PI / 2} />
    <ABBRobot x={103} z={129.4} direction={-Math.PI / 2} moving={moving} reading={reading("GA-18")} />
    <ABBRobot x={120} z={129.4} direction={-Math.PI / 2} moving={moving} reading={reading("GA-24")} />
    <EquipmentModel url={MODEL_URLS.marriage} position={[138, -.2, 132]} rotation={Math.PI / 2} moving={moving} reading={reading("GA-28")} animation="open" />
    <EquipmentModel url={MODEL_URLS.wheel} position={[156, 0, 129.2]} moving={moving} reading={reading("GA-32")} animation="open" />
    <ABBRobot x={156} z={134.8} direction={Math.PI / 2} moving={moving} reading={reading("GA-32")} />
    <EquipmentModel url={MODEL_URLS.fluids} position={[174, 0, 129]} />
    <EquipmentModel url={MODEL_URLS.roller} position={[192, 0, 132]} moving={moving} reading={reading("EOL-41")} animation="spin" />
    <EquipmentModel url={MODEL_URLS.inspection} position={[210, 0, 132]} rotation={Math.PI / 2} />
    {LINE_STATIONS.filter((_,i)=>i!==2&&i!==6).map(s=><EquipmentModel key={s.id} url={MODEL_URLS.worker} position={[s.x+2,0,134.4]} rotation={Math.PI} />)}
    <EquipmentModel url={MODEL_URLS.supervisor} position={[65.5,0,143]} rotation={Math.PI / 2} />
  </group>;
}
