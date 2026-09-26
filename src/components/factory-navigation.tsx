"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { PLANT_FRAMES, type PlantScope } from "@/lib/priority/plant-layout";

export type FactoryViewCommand = { id: number; kind: "fit" | "in" | "out" | "supervisor" };
type Pose = { position: THREE.Vector3; target: THREE.Vector3 };

/** Scope changes move the camera, never the plant or the simulation. */
export function FactoryNavigation({ mode, command, reducedMotion, scope = "line" }: {
  mode: "orbit" | "pan"; command: FactoryViewCommand; reducedMotion: boolean; scope?: PlantScope;
}) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { get, size } = useThree();
  const previous = useRef<{ command: number; scope: PlantScope; aspect: number } | null>(null);
  const saved = useRef<Partial<Record<PlantScope, Pose>>>({});
  const destination = useRef<Pose | null>(null);
  useEffect(() => {
    const orbit = controls.current, camera = get().camera;
    if (!orbit || !(camera instanceof THREE.PerspectiveCamera) || size.width < 1 || size.height < 1) return;
    const aspect = size.width / size.height;
    const old = previous.current;
    const switched = old && old.scope !== scope;
    const issued = !old || old.command !== command.id;
    if (switched) saved.current[old.scope] = { position: camera.position.clone(), target: orbit.target.clone() };
    let pose: Pose;
    if (switched && saved.current[scope] && !issued) {
      const cached = saved.current[scope]!;
      pose = { position: cached.position.clone(), target: cached.target.clone() };
    } else if (!old || switched || issued && command.kind === "fit") {
      const frame = PLANT_FRAMES[scope], target = new THREE.Vector3(...frame.target);
      const direction = new THREE.Vector3(...frame.direction).normalize();
      const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0), direction).normalize();
      const up = new THREE.Vector3().crossVectors(direction, right).normalize();
      const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      let distance = 0;
      for (const x of [-frame.width/2,frame.width/2]) for (const z of [-frame.depth/2,frame.depth/2]) {
        const corner = new THREE.Vector3(x,12,z);
        distance = Math.max(distance, Math.abs(corner.dot(right))/(tan*aspect)+corner.dot(direction), Math.abs(corner.dot(up))/tan+corner.dot(direction));
      }
      pose = { target, position: direction.multiplyScalar(distance*1.14).add(target) };
    } else if (issued && command.kind === "supervisor" && scope !== "plant") {
      pose = { position: new THREE.Vector3(87,1.7,139), target: new THREE.Vector3(108,1.45,131.5) };
    } else {
      const offset = camera.position.clone().sub(orbit.target);
      const factor = issued ? command.kind === "in" ? .78 : 1/.78 : old.aspect/aspect;
      offset.setLength(THREE.MathUtils.clamp(offset.length()*factor, 8, 2600));
      pose = { target: orbit.target.clone(), position: offset.add(orbit.target) };
    }
    // Stop old damping before a programmatic camera change.
    orbit.enableDamping = false;
    orbit.update();
    if (!old || reducedMotion) {
      camera.position.copy(pose.position); orbit.target.copy(pose.target); orbit.update();
      destination.current = null;
    } else destination.current = pose;
    orbit.enableDamping = !reducedMotion;
    previous.current = { command: command.id, scope, aspect };
  }, [get, command, scope, size.width, size.height, reducedMotion]);

  useFrame(({ camera }, delta) => {
    const orbit = controls.current;
    if (!orbit) return;
    const pose = destination.current;
    if (pose) {
      const t = 1-Math.exp(-Math.min(delta,.1)*9);
      camera.position.lerp(pose.position,t); orbit.target.lerp(pose.target,t);
      if (camera.position.distanceTo(pose.position)<.03) { camera.position.copy(pose.position); orbit.target.copy(pose.target); destination.current=null; }
      orbit.update();
    }
    // Do not constrain intermediate targets while flying from campus to the line.
    if (destination.current) return;
    const x = THREE.MathUtils.clamp(orbit.target.x,scope === "focus" ? 60 : -90,scope === "focus" ? 230 : 760)-orbit.target.x;
    const z = THREE.MathUtils.clamp(orbit.target.z,scope === "focus" ? 115 : -490,scope === "focus" ? 150 : 400)-orbit.target.z;
    const y = THREE.MathUtils.clamp(orbit.target.y,.1,20)-orbit.target.y;
    orbit.target.add(new THREE.Vector3(x,y,z));camera.position.add(new THREE.Vector3(x,y,z));
  });
  return <OrbitControls ref={controls} makeDefault enablePan screenSpacePanning={false}
    onStart={()=>{destination.current=null;}}
    zoomToCursor minDistance={8} maxDistance={2600} minPolarAngle={.12} maxPolarAngle={Math.PI/2-.008}
    enableDamping={!reducedMotion} dampingFactor={.12} rotateSpeed={.55} panSpeed={.65} zoomSpeed={.65}
    mouseButtons={{ LEFT: mode === "pan" ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: mode === "pan" ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN }}
    touches={{ ONE: mode === "pan" ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }} />;
}
