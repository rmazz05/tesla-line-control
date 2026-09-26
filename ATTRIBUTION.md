# 3D assets

## Assembly equipment

The representative conveyors, carriers, workstation equipment and figures use **Car Factory Production Line** by 3D Assets. The supplier describes this pack as AI-generated geometry, not manufacturer CAD.

- Source: https://3dassets.dev/packs/car-factory-production-line
- License: CC0 1.0 Universal
- Local files: `public/assets/line/*.glb`, **excluding `abb-irb6700.glb`**
- Individual new asset sources: `public/assets/line/sources.json`

The composition, station layout and mock telemetry are prototype representations. They are not Tesla factory CAD or process data.

Attribution is not required by the license, but the source is recorded here for provenance.

## Vehicle

The vehicles use **Tesla White car.** by **aarajesh**.

- Original source: https://sketchfab.com/3d-models/tesla-white-car-2a4ee44439dc4b1b98f452a9ff427116
- License: Creative Commons Attribution 4.0 International (CC BY 4.0)
- Local file: `public/assets/vehicles/tesla-model-3.glb`
- Changes: re-oriented and optimized by the TeslaHub project; further simplified, joined and compressed for this browser prototype with glTF-Transform.

License: https://creativecommons.org/licenses/by/4.0/

## Additional station equipment

The body-transfer gantry, cockpit fixture, battery lift, fluid-fill equipment and inspection gate are procedural meshes authored for this prototype in `src/components/factory-equipment.tsx`. They are schematic representations, not manufacturer CAD or verified automotive process layouts.

## ABB IRB 6700-200/2.60

- Source: ROS-Industrial ABB support, https://github.com/ros-industrial/abb/tree/45f4769d826cf3ac62a65495f2db67b78b0c81df/abb_irb6700_support
- License: Apache License 2.0, retained in `public/assets/licenses/ABB-Apache-2.0.txt`.
- Local model: `public/assets/line/abb-irb6700.glb`.
- Modifications: visual STL meshes indexed and combined into GLB; URDF joints retained; white/steel materials, Y-up conversion and demonstration pose. Source metre dimensions are preserved.
- Rebuild: `node scripts/build-abb-model.mjs`. Downloads pinned source meshes into a temporary cache, then converts locally. Requires Node and curl; Three.js is already a project dependency.

This is geometry for a named industrial robot. Its placement, tooling and motion are illustrative; there is no claim that Tesla uses this robot at these stations. Remaining factory-pack machines are representative geometry.

## Current priority visualization

The priority dashboard and audience presenter use the imported Tesla Model 3 (not a Model Y), ABB robot, and CC0 equipment. Runtime changes to the Tesla asset: precise vertex-bound scaling to 4.694 m, +X travel orientation, instancing, and staged glass/wheel visibility. Assembly staging is illustrative; the downloaded vehicle is a finished-car mesh, not a complete parts/process model. Vehicle bodies before wheel installation travel on modeled carrier skids.

The original procedural equipment module remains for legacy views. All model credits are also available from the live visualization at `/assets/model-credits.html`.

## Draco decoder

Local decoder files under `public/assets/draco/` are distributed with Three.js and originate from Google Draco (Apache License 2.0). License retained at `public/assets/draco/LICENSE.txt`. Decoding uses the local files without a third-party runtime CDN request.
