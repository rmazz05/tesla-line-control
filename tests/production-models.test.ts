import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import test from "node:test";
import * as THREE from "three";
import { normalizeLineVehicle } from "../src/lib/priority/model-geometry";
import { MANAGER_LINE, LINE_STATIONS, PLANT_FRAMES } from "../src/lib/priority/plant-layout";
import { createSimulation, getStationReadings } from "../src/lib/priority/engine";

test("vehicle normalization grounds rotated parts using actual vertices and preserves source", () => {
  const source = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 4)); body.position.y = 2; source.add(body);
  // A slanted mesh's transformed local AABB reaches far below its true vertices.
  const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-2, -2, 0), new THREE.Vector3(2, 2, 0), new THREE.Vector3(1.9, 2, 0)]);
  const wiper = new THREE.Mesh(geometry); wiper.rotation.z = -Math.PI / 4; wiper.position.y = 3; source.add(wiper);
  const normalized = normalizeLineVehicle(source, 4.694);
  const box = new THREE.Box3().setFromObject(normalized, true);
  assert.ok(Math.abs(box.min.y) < 1e-8, "car must touch its deck, not float");
  assert.ok(Math.abs(box.getSize(new THREE.Vector3()).x - 4.694) < 1e-8);
  assert.ok(Math.abs(box.getCenter(new THREE.Vector3()).x) < 1e-8);
  assert.ok(Math.abs(box.getCenter(new THREE.Vector3()).z) < 1e-8);
  assert.deepEqual(source.scale.toArray(), [1, 1, 1]);
  assert.equal(source.children[0].position.y, 2);
});

function glb(file: string) {
  const bytes = readFileSync(file);
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, `${file} GLB magic`);
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.byteLength, `${file} not truncated`);
  return JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
}

test("shipped production GLBs are complete and self-contained; local Draco decoder exists", () => {
  const files = readdirSync("public/assets/line").filter(f => f.endsWith(".glb")).map(f => `public/assets/line/${f}`);
  files.push("public/assets/vehicles/tesla-model-3.glb");
  for (const file of files) {
    const asset = glb(file);
    assert.ok(asset.meshes.length > 0, `${file} has real geometry`);
    for (const resource of [...asset.buffers ?? [], ...asset.images ?? []]) assert.ok(!resource.uri || resource.uri.startsWith("data:"), `${file} depends on an external resource`);
  }
  for (const file of ["draco_decoder.wasm", "draco_wasm_wrapper.js"]) assert.ok(statSync(`public/assets/draco/${file}`).size > 1000);
  const robot = glb("public/assets/line/abb-irb6700.glb");
  for (let joint = 1; joint <= 6; joint++) assert.ok(robot.nodes.some((node: { name: string }) => node.name === `joint_${joint}`));
  assert.equal(glb("public/assets/line/marriage-lift.glb").animations[0].name, "open");
});

test("manager focus covers exactly this workspace's production stations within its frame", () => {
  const ids = getStationReadings(createSimulation()).map(s => s.id);
  assert.deepEqual(MANAGER_LINE.stationIds, ids);
  const frame = PLANT_FRAMES.focus;
  for (const station of LINE_STATIONS) assert.ok(Math.abs(station.x - frame.target[0]) + 8 < frame.width / 2);
});

test("incident labels can fit the gap between fixed rows without hiding the incident", async () => {
  const { chooseCalloutLeader } = await import("../src/lib/priority/plant-labels");
  const occupied = [{ left: 203, right: 285, top: 149, bottom: 204 }];
  const length = chooseCalloutLeader(319, 234, 41, 55, 1032, 520, 62, occupied);
  assert.ok(length !== undefined, "the 82–143 px gap can fit this 55 px incident pin");
  assert.ok(234-length-55 >= 82);
  assert.ok(234-length+5 < occupied[0].top);
});
