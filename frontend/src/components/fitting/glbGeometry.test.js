import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { Box3, Group, PerspectiveCamera, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { applyMorphTest, cameraFit, captureMorphWeights, modelLayout, preciseBounds, preciseFrame } from './glbGeometry.js'

const models = new URL('../../../public/models/', import.meta.url)
const report = JSON.parse(await readFile(new URL('ONFIT_Human_Test_BodyOnly.json', models), 'utf8'))
async function load(name) {
  const data = await readFile(new URL(name, models))
  const gltf = await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '')
  return { ...gltf, hash: createHash('sha256').update(data).digest('hex') }
}
const original = await load(report.original_glb)
const body = await load(report.derivative_glb)
function meshes(scene) {
  const result = []
  scene.traverse(object => { if (object.isMesh) result.push(object) })
  return result
}
function close(actual, expected, epsilon = 1e-6) {
  assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`)
}
function positions(mesh) {
  return Array.from({ length: mesh.geometry.attributes.position.count }, (_, i) =>
    mesh.getVertexPosition(i, new Vector3()).toArray()).flat()
}
function normalizedScene() {
  const scene = body.scene.clone(true)
  const layout = modelLayout(scene)
  const wrapper = new Group()
  wrapper.position.fromArray(layout.position)
  wrapper.scale.setScalar(layout.scale)
  wrapper.add(scene)
  const yaw = new Group()
  yaw.add(wrapper)
  return { scene, yaw }
}

test('body-only derivative matches Blender MASK geometry and keeps original GLB intact', () => {
  assert.equal(original.hash, report.original_glb_sha256)
  assert.equal(body.hash, report.derivative_glb_sha256)
  assert.equal(report.mask_modifier, 'Hide helpers')
  assert.equal(report.mask_group, 'body')
  assert.ok(report.hidden_helper_groups.includes('helper-hair'))
  assert.ok(report.hidden_helper_groups.includes('helper-skirt'))
  assert.equal(meshes(original.scene).length, 1)
  assert.equal(meshes(original.scene)[0].name, 'Human')
  const model = meshes(body.scene)[0]
  assert.equal(model.geometry.index.count / 3, report.body_triangles)
  assert.ok(report.body_polygons < report.source_polygons)
  assert.equal(meshes(original.scene)[0].geometry.index.count / 3 - report.body_triangles, 10216)
  const bounds = preciseBounds(body.scene)
  bounds.min.toArray().forEach((v, i) => close(v, report.body_bounds.min[i]))
  bounds.max.toArray().forEach((v, i) => close(v, report.body_bounds.max[i]))
  assert.deepEqual(model.morphTargetDictionary, meshes(original.scene)[0].morphTargetDictionary)
  assert.deepEqual(model.morphTargetInfluences, Object.values(report.default_weights))
})

test('file defaults, test weight 0, and test weight 1 change actual vertices while preserving other keys', () => {
  const scene = body.scene.clone(true)
  const mesh = meshes(scene)[0]
  const defaults = captureMorphWeights(scene)
  const baseWeights = mesh.morphTargetInfluences.slice()
  const rawPositions = mesh.geometry.attributes.position.array.slice()
  const targetName = Object.keys(mesh.morphTargetDictionary)[0]
  const index = mesh.morphTargetDictionary[targetName]
  applyMorphTest(scene, defaults, '', 0)
  const basePositions = positions(mesh)
  assert.deepEqual(mesh.morphTargetInfluences, baseWeights)
  applyMorphTest(scene, defaults, targetName, 0)
  const zeroPositions = positions(mesh)
  assert.equal(mesh.morphTargetInfluences[index], 0)
  assert.notDeepEqual(zeroPositions, basePositions)
  applyMorphTest(scene, defaults, targetName, 1)
  assert.equal(mesh.morphTargetInfluences[index], 1)
  assert.notDeepEqual(positions(mesh), zeroPositions)
  baseWeights.forEach((value, i) => { if (i !== index) assert.equal(mesh.morphTargetInfluences[i], value) })
  applyMorphTest(scene, defaults, '', 0)
  assert.deepEqual(positions(mesh), basePositions)
  assert.deepEqual(mesh.geometry.attributes.position.array, rawPositions)
  assert.deepEqual(meshes(body.scene)[0].morphTargetInfluences, baseWeights)
})

test('switching test keys restores the previous key and exact bounds sample current vertices', () => {
  const scene = body.scene.clone(true)
  const mesh = meshes(scene)[0]
  const defaults = captureMorphWeights(scene)
  const keys = Object.keys(mesh.morphTargetDictionary)
  applyMorphTest(scene, defaults, keys[0], 1)
  applyMorphTest(scene, defaults, keys[1], 0)
  assert.equal(mesh.morphTargetInfluences[0], defaults.get(mesh.uuid)[0])
  const manual = new Box3()
  scene.updateWorldMatrix(true, true)
  for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
    manual.expandByPoint(mesh.getVertexPosition(i, new Vector3()).applyMatrix4(mesh.matrixWorld))
  }
  assert.deepEqual(preciseBounds(scene), manual)
  applyMorphTest(scene, defaults, '', 0)
  const conservative = new Box3().setFromObject(scene)
  assert.ok(conservative.getSize(new Vector3()).y > preciseBounds(scene).getSize(new Vector3()).y)
})

test('normalization puts feet on the floor, centers the body, and stays fixed during morph tests', () => {
  const { scene, yaw } = normalizedScene()
  const base = preciseBounds(yaw)
  close(base.min.y, 0)
  close(base.getSize(new Vector3()).y, 1.7)
  close(base.getCenter(new Vector3()).x, 0)
  close(base.getCenter(new Vector3()).z, 0)
  const scale = scene.parent.scale.clone()
  applyMorphTest(scene, captureMorphWeights(scene), 'stomach-pregnant-incr', 1)
  assert.deepEqual(scene.parent.scale, scale)
})

test('front/side/back cameras fit the full box and actual body silhouette at 75–85 percent height', () => {
  const { yaw } = normalizedScene()
  for (const angle of [0, 90, 180]) for (const aspect of [0.75, 1.25, 16 / 9]) {
    yaw.rotation.y = angle * Math.PI / 180
    const { bounds, points } = preciseFrame(yaw)
    const fit = cameraFit(bounds, aspect, 42, 0.8, points)
    const camera = new PerspectiveCamera(42, aspect, fit.near, fit.far)
    camera.position.copy(fit.position)
    camera.lookAt(fit.target)
    camera.updateMatrixWorld(true)
    assert.deepEqual(fit.target, bounds.getCenter(new Vector3()))
    close(fit.target.clone().project(camera).x, 0)
    close(fit.target.clone().project(camera).y, 0)
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        const p = new Vector3(x, y, z).project(camera)
        assert.ok(Math.abs(p.x) <= 1.000001 && Math.abs(p.y) <= 1.000001)
        assert.ok(p.z > -1 && p.z < 1)
      }
    }
    const projected = points.map(p => p.clone().project(camera))
    assert.ok(projected.every(p => Math.abs(p.x) <= 0.800001 && Math.abs(p.y) <= 0.800001))
    const occupancy = (Math.max(...projected.map(p => p.y)) - Math.min(...projected.map(p => p.y))) / 2
    assert.ok(occupancy >= 0.75 && occupancy <= 0.85)
  }
})
