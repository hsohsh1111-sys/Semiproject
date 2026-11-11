import { Box3, Vector3 } from 'three'

export function captureMorphWeights(scene) {
  const defaults = new Map()
  scene.traverse(mesh => {
    if (mesh.isMesh && mesh.morphTargetInfluences) defaults.set(mesh.uuid, mesh.morphTargetInfluences.slice())
  })
  return defaults
}

// Empty target means file defaults. Explicit tests override only one key with
// its actual 0..1 influence, rather than interpolating from the default weight.
export function applyMorphTest(scene, defaults, targetName, weight) {
  scene.traverse(mesh => {
    const base = defaults.get(mesh.uuid)
    if (!base) return
    mesh.morphTargetInfluences.splice(0, base.length, ...base)
    const index = mesh.morphTargetDictionary?.[targetName]
    if (index !== undefined) mesh.morphTargetInfluences[index] = weight
  })
}

export function preciseFrame(scene) {
  scene.updateWorldMatrix(true, true)
  const points = []
  scene.traverse(mesh => {
    if (!mesh.isMesh || !mesh.geometry.attributes.position) return
    for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
      points.push(mesh.getVertexPosition(i, new Vector3()).applyMatrix4(mesh.matrixWorld))
    }
  })
  // Cached geometry bounds include unweighted extremes of all morph targets.
  const bounds = new Box3().setFromPoints(points)
  if (bounds.isEmpty() || ![...bounds.min, ...bounds.max].every(Number.isFinite)) {
    throw new Error('GLB has no finite visible bounds')
  }
  return { bounds, points }
}

export function preciseBounds(scene) {
  return preciseFrame(scene).bounds
}

export function modelLayout(scene, displayHeight = 1.7) {
  const bounds = preciseBounds(scene)
  const height = bounds.getSize(new Vector3()).y
  if (height <= 0) throw new Error('GLB height must be positive')
  const scale = displayHeight / height
  const center = bounds.getCenter(new Vector3())
  return { scale, position: [-center.x * scale, -bounds.min.y * scale, -center.z * scale] }
}

// Preserve the authored head/torso/limb proportions when changing stature.
// This is proportional scaling, not a prediction of anatomy from height.
// The body and clothes share the transform, anchored at ground level.
export function modelHeightLayout(layout,heightM,displayHeight=1.7) {
  const height=Number.isFinite(heightM)?Math.min(2.3,Math.max(1,heightM)):displayHeight
  const ratio=height/displayHeight
  return {scale:[layout.scale*ratio,layout.scale*ratio,layout.scale*ratio],
    position:layout.position.map(value=>value*ratio)}
}

export function cameraFit(bounds, aspect, fovDegrees, coverage = 0.8, points = null) {
  const center = bounds.getCenter(new Vector3())
  const half = bounds.getSize(new Vector3()).multiplyScalar(0.5)
  const tanVertical = Math.tan(fovDegrees * Math.PI / 360)
  const tanHorizontal = tanVertical * aspect
  // Fit the nearest box corners in both axes, including on portrait canvases.
  let distance = Math.max(half.y / (tanVertical * coverage),
    half.x / (tanHorizontal * coverage)) + half.z
  if (points?.length) {
    // Box corners combine head height with arm depth even where no vertex exists.
    // Fit the real silhouette at 80%, while still keeping the full box in frame.
    distance = Math.max(half.y / tanVertical, half.x / tanHorizontal) + half.z
    for (const point of points) {
      const z = point.z - center.z
      distance = Math.max(distance, Math.abs(point.y - center.y) / (tanVertical * coverage) + z,
        Math.abs(point.x - center.x) / (tanHorizontal * coverage) + z)
    }
  }
  return {
    target: center,
    position: center.clone().add(new Vector3(0, 0, distance)),
    near: Math.max(0.001, (distance - half.z) / 100),
    far: Math.max(100, distance + half.length() * 10),
    distance,
  }
}
