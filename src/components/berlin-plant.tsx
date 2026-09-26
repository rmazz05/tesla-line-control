"use client";

import { memo, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { GA_DEPTH, GA_OUTLINE, GA_WIDTH, GRID_BAY, LINE_CENTER, LINE_ENTRY, LINE_EXIT, LINE_STATIONS, PLANT_BUILDINGS, isInsideGA, type PlantScope, type Point3 } from "@/lib/priority/plant-layout";
import type { StationId, StationReading } from "@/lib/priority/types";
import { ProductionEquipment, TeslaFleet } from "./production-models";
import { getStationEffect, getStationStatus } from "@/lib/priority/station-effect";

type Box = { p: Point3; s: Point3; color: string; ry?: number; rz?: number };
const STEEL = "#8e9ba2", RED = "#a53233", FLOOR = "#9da8a3", YELLOW = "#dbb94d";

/** Repeated architectural/detail parts share geometry/material and draw calls. */
function Boxes({ items, shadows = false }: { items: Box[]; shadows?: boolean }) {
  const batches = useMemo(() => {
    const groups = new Map<string, Box[]>();
    items.forEach(item => { const batch = groups.get(item.color) ?? []; batch.push(item); groups.set(item.color, batch); });
    return [...groups.entries()];
  }, [items]);
  return <>{batches.map(([color, boxes]) => <BoxBatch key={color} color={color} boxes={boxes} shadows={shadows} />)}</>;
}
function BoxBatch({ color, boxes, shadows }: { color: string; boxes: Box[]; shadows: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const object = new THREE.Object3D();
    boxes.forEach((b, i) => { object.position.set(...b.p); object.scale.set(...b.s); object.rotation.set(0, b.ry ?? 0, b.rz ?? 0); object.updateMatrix(); ref.current!.setMatrixAt(i, object.matrix); });
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [boxes]);
  return <instancedMesh ref={ref} args={[undefined, undefined, boxes.length]} castShadow={shadows} receiveShadow>
    <boxGeometry /><meshStandardMaterial color={color} roughness={.76} metalness={.13} />
  </instancedMesh>;
}
const addBox = (items: Box[], p: Point3, s: Point3, color: string, ry = 0, rz = 0) => items.push({ p, s, color, ry, rz });

const Campus = memo(function Campus() {
  const items = useMemo(() => {
    const b: Box[] = [];
    addBox(b, [310, -1.2, -30], [970, 1, 1050], "#b9c5b2");
    // Service roads and loading aprons follow the main north/south circulation.
    [-35, 355, 675].forEach(x => addBox(b, [x, -.56, -75], [22, .2, 870], "#8c9597"));
    [-470, 285].forEach(z => addBox(b, [310, -.55, z], [710, .2, 20], "#8c9597"));
    addBox(b, [160, -.6, 343], [345, .15, 92], "#929c9c");
    for (let i = 0; i < 50; i++) {
      const x = i * 6.2 + 10;
      [315, 338, 361].forEach(z => {
        addBox(b, [x, -.49, z], [.14, .03, 10], "#dfe3dd");
        if (i % 3 !== 0) addBox(b, [x + 3, .6, z], [2.1, 1.3, 4.5], i % 4 ? "#d8dfdc" : "#626e76");
      });
    }
    PLANT_BUILDINGS.forEach(s => {
      addBox(b, [s.x + s.width / 2, s.height / 2, s.z + s.depth / 2], [s.width, s.height, s.depth], "#c3cbca");
      addBox(b, [s.x + s.width / 2, s.height + .5, s.z + s.depth / 2], [s.width + 1, 1, s.depth + 1], "#e3e7e2");
      // Clerestory strips, roof service units and parapets. Approximate architecture.
      for (let z = s.z + 18; z < s.z + s.depth - 8; z += 28) {
        addBox(b, [s.x + s.width / 2, s.height + 1.2, z], [s.width - 14, 1, 3], "#a5b8bd");
        addBox(b, [s.x + 9, s.height + 1.5, z], [5, 2, 5], STEEL);
      }
      [s.x + .1, s.x + s.width - .1].forEach(x => addBox(b, [x, s.height - 4, s.z + s.depth / 2], [.3, 2.2, s.depth - 5], "#657981"));
      for (let z = s.z + 8; z < s.z + s.depth; z += 14) addBox(b, [s.x - .1, 4, z], [.4, 7, 4.5], "#72818a");
    });
    // Tree belts stay clear of roads/loading. Simple repeated crowns at campus scale.
    for (let i = 0; i < 46; i++) {
      addBox(b, [-76, 3.5, -450 + i * 18], [8, 7, 9], "#72876e");
      if (i < 37) addBox(b, [726, 3.5, -450 + i * 19], [8, 7, 9], "#7c9177");
    }
    return b;
  }, []);
  return <Boxes items={items} />;
});

const AssemblyHall = memo(function AssemblyHall({ detail }: { detail: boolean }) {
  const shape = useMemo(() => { const s = new THREE.Shape(); GA_OUTLINE.forEach(([x, z], i) => i ? s.lineTo(x, -z) : s.moveTo(x, -z)); s.closePath(); return s; }, []);
  const ceiling = useRef<THREE.Mesh>(null);
  useFrame(({ camera }) => { if (ceiling.current) ceiling.current.visible = detail && camera.position.y < 12.4; });
  const architecture = useMemo(() => {
    const b: Box[] = [];
    // Documented 14 m bay grid. Cutaway exposes the production floor.
    for (let x = 0; x <= 308; x += GRID_BAY) for (let z = 0; z <= GA_DEPTH; z += GRID_BAY) {
      if (!isInsideGA(x, z)) continue;
      // Interior columns don't lie on the selected conveyor. Perimeter + every other row.
      if (z % 28 === 0 || x === 0 || x === 308) {
        addBox(b, [x, 6.4, z], [.65, 12.8, .65], "#c7cdcb");
        addBox(b, [x, .5, z], [.88, 1, .88], YELLOW);
      }
    }
    for (let z = 14; z < 252; z += 14) addBox(b, [GA_WIDTH / 2, .015, z], [GA_WIDTH, .018, .055], "#9fa8a4");
    for (let x = 14; x < GA_WIDTH; x += 14) {
      const maxZ = x >= 64 ? 252 : 196 + x * 56 / 64;
      addBox(b, [x, .015, maxZ / 2], [.055, .018, maxZ], "#9fa8a4");
    }
    addBox(b, [GA_WIDTH / 2, 3, 0], [GA_WIDTH, 6, .45], "#c1c9c7");
    addBox(b, [GA_WIDTH, 2, GA_DEPTH / 2], [.45, 4, GA_DEPTH], "#ccd2cf");
    addBox(b, [187, 1.3, GA_DEPTH], [246, 2.6, .45], "#ccd2cf");
    addBox(b, [0, 1.3, 98], [.45, 2.6, 196], "#ccd2cf");
    // SW diagonal entry facade, approximate to the traced footprint.
    addBox(b, [32, 1.3, 224], [85, 2.6, .45], "#b7c7c9", -Math.atan2(56, 64));
    // Ground-floor logistics circulation and cross-aisles from the plan, approximate widths.
    [28, 96, 280].forEach(x => addBox(b, [x, .025, 118], [5, .025, 232], "#a0aaa5"));
    [42, 84, 112, 168, 210, 238].forEach(z => addBox(b, [170, .035, z], [266, .025, 4], "#d3d4c5"));
    // Peripheral offices / break areas: footprints inferred from the architectural sheet.
    [[49, 49, 11, 10], [49, 124, 11, 9], [114, 90, 15, 9], [191, 90, 15, 9], [265, 175, 11, 10], [265, 219, 13, 12], [245, 140, 20, 10]].forEach(([x,z,w,d]) => {
      addBox(b, [x, .04, z], [w, .07, d], "#d3c8ad");
      addBox(b, [x, 1.25, z - d/2], [w, 2.5, .18], "#e6e6dd");
      addBox(b, [x - w/2, 1.25, z], [.18, 2.5, d], "#e6e6dd");
      addBox(b, [x + w/2, 1.25, z], [.18, 2.5, d], "#e6e6dd");
    });
    // Docks along the ground floor edges, as distinct from production stations.
    for (let z = 18; z < 190; z += 28) {
      [1, 309].forEach(x => {
        addBox(b, [x, 1.5, z], [.4, 3, 4.2], "#77858b");
        addBox(b, [x < 2 ? -4 : 315, -.1, z], [8, .2, 5], "#8c9797");
      });
    }
    // Low-detail reference production islands beyond the supervisor's simulated line.
    // Exact equipment placement is not present in the source drawing.
    for (const z of [23, 64, 94, 185, 220]) for (let x = 68; x < 251; x += 18) {
      addBox(b,[x,.25,z],[10,.5,4],"#889995");
      addBox(b,[x-4,1.15,z-3],[1.6,2.3,1],"#a0aeac");
      addBox(b,[x+3,1.2,z+3],[2.4,2.4,1.2],"#a9b6af");
      addBox(b,[x,3.8,z],[.2,.25,7],"#ad7771");
      [-3.4,3.4].forEach(dz=>addBox(b,[x,1.9,z+dz],[.16,3.8,.16],"#9daead"));
      rack(b,x,z-7,5);
    }
    return b;
  }, []);
  const services = useMemo(() => {
    const b: Box[] = [];
    // Roof is cut away. Retain flanking structure so equipment reads at human scale.
    for (let x = 56; x < 239; x += 14) {
      [104, 160].forEach(z => {
        addBox(b, [x, 9.6, z], [13.9, .3, .32], "#bbc4c6");
        addBox(b, [x, 8.8, z], [13.9, .2, .25], STEEL);
        for (let i = 0; i < 7; i++) addBox(b, [x - 6 + i * 2, 9.2, z], [2.2, .1, .12], STEEL, 0, i % 2 ? -.38 : .38);
      });
      addBox(b, [x, 7, 132], [.15, .15, 28], "#acb5b9");
      [123, 142].forEach(z => addBox(b, [x, 6.9, z], [5, .15, .5], "#f6f5e7"));
    }
    return b;
  }, []);
  return <group>
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><shapeGeometry args={[shape]} /><meshStandardMaterial color={FLOOR} roughness={.94} side={THREE.DoubleSide} /></mesh>
    <mesh ref={ceiling} visible={false} position={[0,13,0]} rotation={[-Math.PI / 2,0,0]}><shapeGeometry args={[shape]}/><meshStandardMaterial color="#c5ccc7" side={THREE.DoubleSide} roughness={.9}/></mesh>
    <Boxes items={architecture} />
    {detail && <Boxes items={services} />}
  </group>;
});

function rack(b: Box[], x: number, z: number, length = 4) {
  [-length/2, length/2].forEach(dx => [-.65,.65].forEach(dz => addBox(b, [x+dx,1.65,z+dz], [.11,3.3,.11], "#526b7c")));
  [.15, 1.25, 2.35].forEach((y, level) => {
    addBox(b, [x,y,z], [length,.12,1.5], "#ba804b");
    for (let j = 0; j < 3; j++) addBox(b, [x-length/2+.7+j*1.2,y+.4,z], [1,.7,1.15], level%2 ? "#6c858d" : "#adb3a3");
  });
}
function desk(b: Box[], x: number, z: number) {
  addBox(b, [x,.76,z], [1.8,.09,.8], "#e0ddd0");
  [-.75,.75].forEach(dx => addBox(b,[x+dx,.36,z],[.08,.72,.6],STEEL));
  addBox(b,[x,1.12,z-.16],[.63,.4,.055],"#26383f");
  addBox(b,[x,.86,z-.16],[.06,.2,.08],STEEL);
  addBox(b,[x,.83,z+.15],[.52,.025,.18],"#444d50");
  addBox(b,[x,.5,z+.7],[.47,.1,.48],"#34454a");
  addBox(b,[x,.8,z+.95],[.47,.55,.07],"#34454a");
}
const LineInfrastructure = memo(function LineInfrastructure() {
  const items = useMemo(() => {
    const b: Box[] = [], z = LINE_CENTER[2], length = LINE_EXIT - LINE_ENTRY;
    addBox(b,[(LINE_ENTRY+LINE_EXIT)/2,.05,z],[length+8,.1,20],"#adb5af");
    addBox(b,[(LINE_ENTRY+LINE_EXIT)/2,.11,z],[length,.14,3.5],"#6d777b");
    [-1.25,1.25].forEach(dz=>addBox(b,[148,.26,z+dz],[length,.16,.2],"#b2bdbe"));
    // Protected pedestrian lane, material delivery lane, and white crossings.
    [5.4,-6.5].forEach(dz=>{
      addBox(b,[147,.13,z+dz],[length+10,.04,2.2],"#6a8a7f");
      [-1.2,1.2].forEach(edge=>addBox(b,[147,.16,z+dz+edge],[length+10,.035,.1],YELLOW));
    });
    for(let x = 74; x < 222; x += 9) {
      addBox(b,[x,.18,z],[.12,.025,3.2],"#a8b1b1");
      [-4,4].forEach(dz=>addBox(b,[x,1,z+dz],[.08,2,.08],RED));
      addBox(b,[x,4.8,z-2.8],[.15,9.6,.15],"#b4babc");
    }
    [-2.8,2.8].forEach(dz=>{
      addBox(b,[147,5.4,z+dz],[length,.22,.28],RED);
      addBox(b,[147,5.9,z+dz],[length,.1,.4],"#9ca8af");
    });
    LINE_STATIONS.forEach(s=>{
      // Open fixtures preserve human access; guarded robots have distinct yellow perimeters.
      addBox(b,[s.x,5.4,z],[.2,.28,6],RED);
      addBox(b,[s.x-6,.18,z],[.13,.03,8],"#d6d9cd");
      addBox(b,[s.x+5,1.1,z+3.1],[.58,1.7,.5],"#cdd5d3");
      addBox(b,[s.x+5,1.65,z+3.37],[.42,.4,.04],"#253e49");
      rack(b,s.x,z-10.4);
      rack(b,s.x+5,z-10.4,3);
      // Line-side parts cart and torque-tool balancer.
      addBox(b,[s.x-4,.8,z+3],[1.4,1.25,.8],"#788d92");
      addBox(b,[s.x-4,1.5,z+3],[1.5,.12,.9],"#d4d8d0");
      addBox(b,[s.x+1,3.6,z+2.6],[.035,3.5,.035],"#35424a");
      addBox(b,[s.x+1,1.8,z+2.6],[.24,.32,.13],"#b7ac55");
      // Local white aisle crossing, offset from fixtures.
      for(let c=0;c<5;c++)addBox(b,[s.x+7,.18,z+4+c*.55],[1.6,.03,.26],"#e8e9df");
    });
    // Supervisor workstation on the west side; exact furniture is illustrative.
    desk(b,65,141);desk(b,68,141);
    addBox(b,[65,1.5,138.8],[4,2,.13],"#e1e5de");
    addBox(b,[65,1.55,138.7],[3.7,1.5,.03],"#66818b");
    addBox(b,[70,1,142],[1.2,2,.6],"#b0393b");
    // Guard rails at the supervisor area and material lane.
    for(let x=60;x<76;x+=3) addBox(b,[x,.65,145],[.1,1.3,.1],YELLOW);
    addBox(b,[67.5,1.1,145],[15,.09,.09],YELLOW);
    return b;
  },[]);
  return <Boxes items={items} shadows />;
});

export function BerlinPlant({ scope, readings, moving, selectedStation, simulationRun }: { scope: PlantScope; readings: StationReading[]; moving: boolean; selectedStation?: StationId; simulationRun: number }) {
  const detail=scope!=="plant";
  const isolated=scope==="focus";
  return <group>
    <group name="plant-context" visible={!isolated}><Campus/><AssemblyHall detail={detail && !isolated}/></group>
    <mesh name="manager-line-floor" visible={isolated} position={[143,-.08,133]} receiveShadow><boxGeometry args={[174,.15,32]}/><meshStandardMaterial color="#b6c0ba" roughness={.9}/></mesh>
    {/* The same line stays mounted at the same coordinates in both camera scopes. */}
    <group name="manager-line-1"><LineInfrastructure/><ProductionEquipment readings={readings} moving={moving}/><TeslaFleet key={simulationRun} readings={readings} moving={moving}/></group>
    {LINE_STATIONS.map(s=>{
      const reading=readings.find(r=>r.id===s.id);
      const status=reading?getStationStatus(reading):null;
      const effect=reading?getStationEffect(reading):null;
      const selected=selectedStation===s.id;
      return <group key={s.id} position={[s.x,0,132]}>
        <mesh position={[0,.21,0]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[16,9]}/><meshBasicMaterial color={selected?"#5d879e":status?.tone==="waiting"?"#688a9d":effect?.kind==="stopped"?"#b2443d":effect?.kind==="slowed"?"#bb9246":"#7e9a8f"} transparent opacity={selected ? .26 : effect?.kind === "running" ? .07 : .2} depthWrite={false}/></mesh>
        <mesh position={[5,2.25,3.1]}><cylinderGeometry args={[.1,.1,.25,8]}/><meshBasicMaterial color={effect?.kind==="stopped"?"#c2413e":effect?.kind==="slowed"?"#d6a541":"#7bbda3"}/></mesh>
      </group>;
    })}
    {scope==="plant"&&<mesh position={[147,.3,132]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[160,25]}/><meshBasicMaterial color="#b53f3e" transparent opacity={.4} depthWrite={false}/></mesh>}
  </group>;
}
