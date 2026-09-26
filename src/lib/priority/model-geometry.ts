import * as THREE from "three";

/** Turn the source vehicle's -Z nose along the line (+X), preserving proportions.
 * Precise vertex bounds matter: transformed local AABBs greatly overestimate
 * rotated steering/wiper parts, lifting the entire car off the conveyor. */
export function normalizeLineVehicle(source: THREE.Object3D, length: number) {
  const root = new THREE.Group();
  const car = source.clone(true);
  car.rotation.y = -Math.PI / 2;
  root.add(car);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root, true);
  const center = box.getCenter(new THREE.Vector3());
  const factor = length / box.getSize(new THREE.Vector3()).x;
  root.scale.setScalar(factor);
  root.position.set(-center.x * factor, -box.min.y * factor, -center.z * factor);
  root.updateMatrixWorld(true);
  return root;
}
