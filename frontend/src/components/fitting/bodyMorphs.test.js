import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { applyBodyMorphs, BODY_MORPH_REQUIREMENTS } from './bodyMorphs.js'
import { applyMorphTest, captureMorphWeights } from './glbGeometry.js'

const bytes = await readFile(new URL('../../../public/models/ONFIT_Human_Test_BodyOnly.glb', import.meta.url))
const asset = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
function fixture() {
  const scene = asset.scene.clone(true)
  let mesh
  scene.traverse(o => { if (o.isMesh) mesh = o })
  return { scene, mesh, defaults: captureMorphWeights(scene) }
}
function vertices(mesh) {
  return Array.from({ length: mesh.geometry.attributes.position.count }, (_, i) =>
    mesh.getVertexPosition(i, new Vector3()).toArray())
}

test('actual asset has no required independent body keys; base pregnancy weight is preserved', () => {
  const { scene, mesh, defaults } = fixture()
  assert.equal(Object.keys(mesh.morphTargetDictionary).length, 11)
  assert.equal(mesh.morphTargetInfluences[mesh.morphTargetDictionary['stomach-pregnant-incr']], 0.5)
  for (const [, , requested] of BODY_MORPH_REQUIREMENTS) assert.equal(mesh.morphTargetDictionary[requested], undefined)
  const before = mesh.morphTargetInfluences.slice()
  assert.deepEqual(applyBodyMorphs(scene, defaults, {}).supported, [])
  assert.deepEqual(mesh.morphTargetInfluences, before)
})

test('unsupported slider extremes do not alter any actual vertices or cached asset weights', () => {
  const { scene, mesh, defaults } = fixture()
  const baseline = vertices(mesh)
  for (const [field] of BODY_MORPH_REQUIREMENTS) {
    for (const value of [0, 0.2, 2.3, -1, NaN, Infinity]) {
      const status = applyBodyMorphs(scene, defaults, { [field]: value })
      assert.ok(status.unsupported.includes(field))
      assert.deepEqual(vertices(mesh), baseline)
    }
  }
  let original
  asset.scene.traverse(o => { if (o.isMesh) original = o })
  assert.deepEqual(mesh.morphTargetInfluences, original.morphTargetInfluences)
})

test('pregnancy target actually changes all three axes and cannot be claimed as forward-only', () => {
  const { scene, mesh, defaults } = fixture()
  applyMorphTest(scene, defaults, 'stomach-pregnant-incr', 0)
  const zero = vertices(mesh)
  applyMorphTest(scene, defaults, 'stomach-pregnant-incr', 1)
  const one = vertices(mesh)
  const maxDelta = [0, 0, 0]
  one.forEach((v, i) => v.forEach((x, axis) => { maxDelta[axis] = Math.max(maxDelta[axis], Math.abs(x - zero[i][axis])) }))
  assert.ok(maxDelta[0] > 0.02)
  assert.ok(maxDelta[1] > 0.04)
  assert.ok(maxDelta[2] > 0.09)
  const index = mesh.morphTargetDictionary['stomach-pregnant-incr']
  defaults.get(mesh.uuid).forEach((weight, i) => { if (i !== index) assert.equal(mesh.morphTargetInfluences[i], weight) })
  applyBodyMorphs(scene, defaults, { abdomen_protrusion_m: 0.2, pelvis_width_m: 0.2 })
  assert.deepEqual(mesh.morphTargetInfluences, defaults.get(mesh.uuid))
})
