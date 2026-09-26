"use client";

import { useMemo, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { MANAGER_LINE, PLANT_BUILDINGS, PLANT_SOURCE, type PlantScope } from "@/lib/priority/plant-layout";
import styles from "./priority-factory-twin.module.css";

export const PLANT_LABELS = [
  { name: "General assembly", point: [155, 2, 190], id: "ga" },
  ...PLANT_BUILDINGS.filter(b=>b.id!=="utilities").map(b=>({name:b.name,point:[b.x+b.width/2,b.height+2,b.z+b.depth/2],id:b.id})),
];
export type PlantContextRefs = { labels: RefObject<(HTMLDivElement|null)[]>; compass: RefObject<HTMLSpanElement|null>; scale: RefObject<HTMLSpanElement|null> };

export function ProjectPlantContext({ scope, labels, compass, scale }: PlantContextRefs & { scope: PlantScope }) {
  const { camera, size }=useThree();
  const point=useMemo(()=>new THREE.Vector3(),[]), next=useMemo(()=>new THREE.Vector3(),[]);
  useFrame(()=>{
    PLANT_LABELS.forEach((label,i)=>{
      const el=labels.current[i];if(!el)return;
      point.set(label.point[0],label.point[1],label.point[2]).project(camera);
      el.style.transform=`translate(${(point.x+1)*size.width/2}px,${(1-point.y)*size.height/2}px) translate(-50%,-50%)`;
      el.style.visibility=scope==="plant"&&point.z>=-1&&point.z<=1&&Math.abs(point.x)<.96&&Math.abs(point.y)<.88?"visible":"hidden";
    });
    // Project real world north and a metre ruler at the current orbit target.
    const center=scope==="plant"?[300,0,-65]:[147,0,132];
    point.set(center[0],0,center[2]).project(camera);
    next.set(center[0],0,center[2]-10).project(camera);
    const compassElement=compass.current, scaleElement=scale.current;
    if(compassElement)compassElement.style.setProperty("transform", `rotate(${Math.atan2((next.x-point.x)*size.width,(next.y-point.y)*size.height)*180/Math.PI}deg)`);
    next.set(center[0]+(scope==="plant"?100:10),0,center[2]).project(camera);
    if(scaleElement)scaleElement.style.setProperty("width", `${Math.hypot((next.x-point.x)*size.width/2,(next.y-point.y)*size.height/2)}px`);
  });
  return null;
}

export function PlantContext({ scope, setScope, labels, compass, scale, projection }: PlantContextRefs & { scope: PlantScope; setScope:(scope:PlantScope)=>void; projection?:boolean }) {
  return <>
    <div className={styles.plantToolbar}>
      <div className={styles.scopeSwitch} role="group" aria-label="Factory scope">
        <button type="button" aria-pressed={scope==="plant"} onClick={()=>setScope("plant")}>Whole plant</button>
        <button type="button" aria-pressed={scope==="line"} onClick={()=>setScope("line")}>My line</button>
        <button type="button" aria-pressed={scope==="focus"} onClick={()=>setScope("focus")}>Focus visualization</button>
      </div>
      <div className={styles.plantTitle}><strong>{scope==="plant"?"Giga Berlin-Brandenburg":MANAGER_LINE.name}</strong><span>{scope==="plant"?"2023 plant layout · General assembly cutaway":scope==="focus"?"Your line only · GA-12 → EOL-45":projection?"Line forecast":"Ground floor · Line 1"}</span></div>
    </div>
    <div className={styles.plantLabels}>{PLANT_LABELS.map((label,i)=><div key={label.id} ref={el=>{labels.current[i]=el;}} className={styles.plantLabel} data-primary={label.id==="ga"}>{label.id==="ga"?<button type="button" onClick={()=>setScope("line")}><strong>General assembly</strong><span>Line 1 ↗</span></button>:<span>{label.name}</span>}</div>)}</div>
    <div className={styles.plantReference}>
      <details><summary>Plan reference</summary><div className={styles.referencePanel}><strong>Berlin · 2023 planning baseline</strong><p>The hall width (310.44 m), 14 m grid, southwest chamfer and department arrangement follow the public planning drawings.</p><p>Building depths, heights, rooms and campus proportions are approximated. Line 1, its equipment positions, vehicles and motion are an illustrative supervisor environment. Current as-built conditions are unverified.</p><p><strong>Models:</strong> Tesla Model 3 by aarajesh (CC BY 4.0), used as a visual substitute for Berlin’s Model Y. ABB IRB 6700 geometry from ROS-Industrial (Apache 2.0). Other equipment uses representative CC0 factory assets; it is not Tesla supplier CAD.</p><a href="/assets/model-credits.html" target="_blank" rel="noreferrer">Model sources, modifications and licenses ↗</a><a href={PLANT_SOURCE.plan} target="_blank" rel="noreferrer">GA floor plans · pp. 464, 476–477 ↗</a><a href={PLANT_SOURCE.site} target="_blank" rel="noreferrer">Campus plan · p. 15 ↗</a><a href={PLANT_SOURCE.record} target="_blank" rel="noreferrer">Official application record ↗</a></div></details>
      <div className={styles.mapScale}><span ref={scale}/><small>{scope==="plant"?"100 m":"10 m"}</small></div>
      <div className={styles.north} title="North"><span ref={compass}>↑</span><small>N</small></div>
    </div>
  </>;
}
