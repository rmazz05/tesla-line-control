/** Rebuild the ABB visual mesh from the pinned ROS-Industrial Apache-2.0 sources.
 * Usage: node scripts/build-abb-model.mjs [source-directory]
 * Source STLs are in metres and Z-up; output is metres/Y-up with named URDF joints.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const source = process.argv[2] ?? path.join(tmpdir(), 'tesla-model-sources');
const revision = '45f4769d826cf3ac62a65495f2db67b78b0c81df';
const meshPaths = [
  ...['base_link', 'cylinder', 'link_1', 'link_5', 'link_6', 'piston'].map(name => `irb6700/visual/${name}.stl`),
  ...['link_2', 'link_3', 'link_4'].map(name => `irb6700_200_260/visual/${name}.stl`),
];
await mkdir(source, { recursive: true });
const provenance = { revision, files: meshPaths.map(mesh => ({
  path: `abb_irb6700_support/meshes/${mesh}`, file: path.join(source, path.basename(mesh)),
})) };
for (const item of provenance.files) {
  // Fetch pinned public sources; never disable TLS verification.
  execFileSync('curl', ['--fail', '--silent', '--show-error', '--location',
    `https://raw.githubusercontent.com/ros-industrial/abb/${revision}/${item.path}`, '-o', item.file]);
}
await writeFile(path.join(source, 'abb-source.json'), JSON.stringify(provenance, null, 2));
// GLTFExporter requires this browser adapter to assemble its binary Blob in Node.
globalThis.FileReader = class {
  async readAsArrayBuffer(blob) { this.result = await blob.arrayBuffer(); this.onloadend?.(); }
  async readAsDataURL(blob) { this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`; this.onloadend?.(); }
};
const root = new THREE.Group(); root.name = 'ABB_IRB_6700_200_260'; root.rotation.x = -Math.PI / 2;
root.userData = { model: 'ABB IRB 6700-200/2.60', source: `https://github.com/ros-industrial/abb/tree/${provenance.revision}/abb_irb6700_support`, license: 'Apache-2.0', modifications: 'STL to indexed GLB, white/metal materials, metre Y-up conversion, demonstration pose; no dimensions rescaled.' };
const white = new THREE.MeshStandardMaterial({ name:'ABB white', color:'#e2e1d7', roughness:.37, metalness:.28 });
const steel = new THREE.MeshStandardMaterial({ name:'machined steel', color:'#929da4', roughness:.28, metalness:.8 });
const links = {};
for (const item of provenance.files) {
  const name = path.basename(item.file, '.stl');
  const bytes = await readFile(item.file);
  const raw = new STLLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset+bytes.byteLength));
  const geometry = mergeVertices(raw, 1e-5); raw.dispose();
  const group = new THREE.Group(); group.name = name;
  const mesh = new THREE.Mesh(geometry, ['piston','link_6'].includes(name) ? steel : white);
  mesh.name = `${name}_visual`; group.add(mesh); links[name] = group;
}
root.add(links.base_link);
const joints = [
  ['joint_1','base_link','link_1',[0,0,.78],[0,0,1],0],
  ['joint_2','link_1','link_2',[.32,0,0],[0,1,0],.4],
  ['joint_3','link_2','link_3',[0,0,1.125],[0,1,0],-.1],
  ['joint_4','link_3','link_4',[0,0,.2],[1,0,0],0],
  ['joint_5','link_4','link_5',[1.1425,0,0],[0,1,0],.6],
  ['joint_6','link_5','link_6',[.2,0,0],[1,0,0],0],
  ['cylinder_joint','link_1','cylinder',[-.349,-.194,-.142],[0,1,0],-.1],
];
for(const [name,parent,child,position,axis,angle] of joints) {
  const joint = new THREE.Group(); joint.name = name; joint.position.set(...position);
  joint.quaternion.setFromAxisAngle(new THREE.Vector3(...axis),angle); joint.add(links[child]); links[parent].add(joint);
}
links.piston.position.set(0,.06,0); links.piston.rotation.set(.20897,0,-Math.PI/2,'ZYX'); links.cylinder.add(links.piston);
const tip = new THREE.Group(); tip.name='tool_mount'; tip.position.set(.1,0,0); links.link_6.add(tip);
root.updateMatrixWorld(true);
const bytes = await new GLTFExporter().parseAsync(root,{binary:true});
await writeFile('public/assets/line/abb-irb6700.glb',Buffer.from(bytes));
const box = new THREE.Box3().setFromObject(root);
console.log(JSON.stringify({file:'public/assets/line/abb-irb6700.glb',bytes:bytes.byteLength,size:box.getSize(new THREE.Vector3()).toArray(),min:box.min.toArray(),source:provenance.revision}));
