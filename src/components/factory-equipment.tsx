"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { StationId, StationReading } from "@/lib/priority/types";
import { FACTORY_STATION_X } from "@/lib/priority/factory-motion";

type Point = [number, number, number];
const steel = "#a5b2b9", blue = "#527f98", dark = "#35434c";
function Block({ at, size, color = steel }: { at: Point; size: Point; color?: string }) {
  return <mesh position={at} castShadow receiveShadow><boxGeometry args={size} /><meshStandardMaterial color={color} roughness={.65} metalness={.3} /></mesh>;
}
function Bar({ from, to, radius = .055, color = dark }: { from: Point; to: Point; radius?: number; color?: string }) {
  const { midpoint, rotation, length } = useMemo(() => {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), axis = b.clone().sub(a);
    return { midpoint: a.add(b).multiplyScalar(.5), length: axis.length(), rotation: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.normalize()) };
  }, [from, to]);
  return <mesh position={midpoint} quaternion={rotation} castShadow><cylinderGeometry args={[radius, radius, length, 12]} /><meshStandardMaterial color={color} roughness={.65} metalness={.35} /></mesh>;
}
function Cabinet({ at, width = .8 }: { at: Point; width?: number }) {
  return <group position={at}><Block at={[0, .9, 0]} size={[width, 1.8, .65]} color={blue} /><Block at={[0, 1.24, .337]} size={[width * .65, .36, .03]} color={dark} /><Block at={[0, 1.24, .358]} size={[width * .5, .22, .015]} color="#9abdc2" /><Block at={[width * .32, .65, .35]} size={[.035, .28, .05]} color={dark} /><Block at={[0, .09, 0]} size={[width + .1, .18, .75]} color={dark} /></group>;
}
function Beacon({ at, reading }: { at: Point; reading: StationReading | undefined }) {
  const color = !reading || reading.state === "running" ? "#539775" : reading.state === "slowed" ? "#d9a745" : reading.state === "stopped" ? "#c95546" : "#85939a";
  return <group position={at}><Bar from={[0, 0, 0]} to={[0, .24, 0]} radius={.025} /><mesh position={[0, .32, 0]}><cylinderGeometry args={[.075, .075, .16, 12]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={.3} roughness={.45} /></mesh></group>;
}
function Portal({ height = 3.7, width = 4.1, depth = .22 }: { height?: number; width?: number; depth?: number }) {
  return <>{[-1, 1].map(side => <group key={side}><Block at={[0, height / 2, side * width / 2]} size={[depth, height, .2]} /><Block at={[0, .08, side * width / 2]} size={[.65, .16, .6]} color={dark} /></group>)}<Block at={[0, height, 0]} size={[depth, .22, width + .2]} /></>;
}

/** Schematic station equipment, authored for this demo rather than plant CAD. */
export function FactoryEquipment({ readings, moving }: { readings: StationReading[]; moving: boolean }) {
  const arm = useRef<THREE.Group>(null);
  const lift = useRef<THREE.Group>(null);
  const phase = useRef({ cockpit: 0, battery: 0 });
  const reading = (id: StationId) => readings.find(item => item.id === id);
  const cockpit = reading("GA-18"), battery = reading("GA-28");
  useFrame((_, dt) => {
    if (!moving) return;
    phase.current.cockpit += Math.min(dt, .05) * (cockpit?.ratePerHour ?? 0) / 60;
    phase.current.battery += Math.min(dt, .05) * (battery?.ratePerHour ?? 0) / 60;
    if (arm.current) arm.current.rotation.y = Math.sin(phase.current.cockpit * .65) * .065;
    if (lift.current) lift.current.position.y = .06 * Math.sin(phase.current.battery * .7);
  });
  return <group name="additional-station-equipment">
    <group name="GA-12-body-transfer" position={[FACTORY_STATION_X["GA-12"], 0, 0]}>
      <Portal height={4} />
      <Block at={[0, 3.8, -1.05]} size={[.9, .4, .55]} color={blue} />
      <Bar from={[0, 3.6, -1.05]} to={[0, 2.9, -1.05]} radius={.035} />
      <Block at={[0, 2.87, -1.05]} size={[1.1, .1, .2]} color={dark} />
      {[-1.35, 1.35].map(z => <Bar key={z} from={[-1.5, .88, z]} to={[1.5, .88, z]} radius={.05} />)}
      <Cabinet at={[-1, 0, -2.6]} /><Beacon at={[-1, 1.8, -2.6]} reading={reading("GA-12")} />
    </group>
    <group name="GA-18-cockpit-fixture" position={[FACTORY_STATION_X["GA-18"], 0, -2.3]}>
      <Block at={[0, .1, 0]} size={[1.4, .2, 1.1]} color={dark} />
      <Block at={[0, 1.4, 0]} size={[.25, 2.6, .25]} />
      <group ref={arm} position={[0, 2.65, 0]}>
        <Block at={[.5, 0, .2]} size={[1.2, .18, .4]} color={blue} />
        <Bar from={[1, 0, .2]} to={[1, -.35, 1.05]} radius={.09} color={steel} />
        <Block at={[1, -.45, 1.05]} size={[1.1, .16, .38]} color={dark} />
        {[-.4, .4].map(x => <Bar key={x} from={[1 + x, -.45, .9]} to={[1 + x, -.85, .9]} radius={.035} />)}
      </group>
      <Cabinet at={[-.95, 0, -.15]} width={.65} /><Beacon at={[-.95, 1.8, -.15]} reading={cockpit} />
    </group>
    <group name="GA-28-battery-lift" position={[FACTORY_STATION_X["GA-28"], 0, -2.65]}>
      <Block at={[0, .12, 0]} size={[1.8, .24, 1.35]} color={dark} />
      {[-.48, .48].map(z => <group key={z}><Bar from={[-.65, .24, z]} to={[.65, .9, z]} radius={.07} color={blue} /><Bar from={[.65, .24, z]} to={[-.65, .9, z]} radius={.07} color={blue} /></group>)}
      <group ref={lift}><Block at={[0, .95, 0]} size={[1.9, .14, 1.4]} /><Block at={[0, 1.08, 0]} size={[1.6, .16, 1.1]} color={dark} />{[-.5, 0, .5].map(x => <Block key={x} at={[x, 1.18, 0]} size={[.035, .025, 1]} color={steel} />)}</group>
      <Cabinet at={[-.95, 0, -1.1]} width={.6} /><Beacon at={[-.95, 1.8, -1.1]} reading={battery} />
    </group>
    <group name="GA-36-fluid-fill" position={[FACTORY_STATION_X["GA-36"], 0, 2.55]}>
      <Cabinet at={[0, 0, 0]} width={1.2} />
      <Block at={[0, 2.1, 0]} size={[.12, .7, .12]} />
      <Block at={[0, 2.45, -.6]} size={[.12, .12, 1.4]} />
      {[-.35, .35].map(x => <group key={x}><Bar from={[x, 1.6, -.36]} to={[x, 2.35, -.7]} radius={.025} /><Bar from={[x, 2.35, -.7]} to={[x, 1.8, -1.25]} radius={.025} /><Block at={[x, 1.72, -1.25]} size={[.08, .22, .08]} color={blue} /></group>)}
      <Beacon at={[.45, 1.8, 0]} reading={reading("GA-36")} />
    </group>
    <group name="EOL-45-inspection-gate" position={[FACTORY_STATION_X["EOL-45"] + .45, 0, 0]}>
      <Portal height={3.5} width={4.3} depth={.16} />
      {[-1.85, 1.85].map(z => <group key={z}><Block at={[0, 2.9, z]} size={[.26, .35, .24]} color={dark} /><Block at={[-.15, 2.9, z]} size={[.06, .18, .18]} color="#537382" /></group>)}
      <Block at={[0, 3.35, 0]} size={[.1, .08, 3.7]} color="#f1eee0" />
      <Cabinet at={[.55, 0, -2.7]} width={.65} /><Beacon at={[.55, 1.8, -2.7]} reading={reading("EOL-45")} />
    </group>
  </group>;
}
