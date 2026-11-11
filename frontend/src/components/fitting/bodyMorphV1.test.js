import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { applyBodyMorphs, BODY_MORPH_MODEL_URL } from './bodyMorphs.js'
import { captureMorphWeights } from './glbGeometry.js'

const folder = new URL('../../../public/models/', import.meta.url)
const bytes = await readFile(new URL('ONFIT_Human_BodyMorph_v1.glb', folder))
const report = JSON.parse(await readFile(new URL('ONFIT_Human_BodyMorph_v1.json', folder), 'utf8'))
const load = data => new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '')
const asset = await load(bytes)
const original = await load(await readFile(new URL('ONFIT_Human_Test_BodyOnly.glb', folder)))
const getMesh = scene => { let mesh; scene.traverse(o => { if (o.isMesh) mesh = o }); return mesh }
const coords = mesh => Array.from({ length: mesh.geometry.attributes.position.count }, (_, i) => mesh.getVertexPosition(i, new Vector3()).toArray())
function setup() {
  const scene = asset.scene.clone(true), mesh = getMesh(scene), defaults = captureMorphWeights(scene)
  const apply = (abdomen, pelvis) => applyBodyMorphs(scene, defaults, { abdomen_protrusion_m: abdomen, pelvis_width_m: pelvis }, BODY_MORPH_MODEL_URL)
  return { scene, mesh, defaults, apply }
}
const near = (a, b) => assert.ok(Math.abs(a-b) < 1e-6, `${a} != ${b}`)

test('export retains original base shape and weights and adds exactly two zero-weight keys', () => {
  assert.equal(createHash('sha256').update(bytes).digest('hex'), report.glb_sha256)
  const { mesh } = setup(), old = getMesh(original.scene)
  assert.equal(Object.keys(mesh.morphTargetDictionary).length, 13)
  for (const [key, index] of Object.entries(old.morphTargetDictionary)) {
    assert.equal(mesh.morphTargetInfluences[mesh.morphTargetDictionary[key]], old.morphTargetInfluences[index])
  }
  for (const name of ['abdomen_front', 'pelvis_width']) assert.equal(mesh.morphTargetInfluences[mesh.morphTargetDictionary[name]], 0)
  // UV export may split vertices differently; compare sorted positions.
  const sort = points => points.map(p => p.map(v => v.toFixed(5)).join(',')).sort()
  assert.deepEqual(sort(coords(mesh)), sort(coords(old)))
  assert.equal(report.restored_exactly, true)
  assert.ok(report.checks.every(c => c.flipped_triangles === 0))
})

test('real abdomen/pelvis vertices move independently and combined deltas add without cross-axis changes', () => {
  const { mesh, apply } = setup()
  apply(0, .30); const base = coords(mesh)
  apply(.2, .30); const abdomen = coords(mesh)
  apply(0, .60); const pelvis = coords(mesh)
  apply(.2, .60); const combined = coords(mesh)
  let front = 0, width = 0, overlap = 0
  base.forEach((p, i) => {
    const a = abdomen[i].map((x, axis) => x-p[axis]), b = pelvis[i].map((x, axis) => x-p[axis])
    near(a[0], 0); near(a[1], 0); near(b[1], 0); near(b[2], 0)
    if (Math.abs(p[0]) >= .27) b.forEach(delta => near(delta, 0))
    front = Math.max(front, a[2]); width = Math.max(width, Math.abs(b[0]))
    if (Math.abs(a[2]) > 1e-6 && Math.abs(b[0]) > 1e-6) overlap++
    p.forEach((x, axis) => near(combined[i][axis], x+a[axis]+b[axis]))
  })
  assert.ok(front > .063); assert.ok(width > .024); assert.equal(overlap, 0)
  apply(0, .30); assert.deepEqual(coords(mesh), base)
})

test('pelvis widening is symmetric and narrowing retains abdomen protrusion', () => {
  const { mesh, apply } = setup()
  apply(.2, .30); const base = coords(mesh)
  apply(.2, .60); const wide = coords(mesh)
  apply(.2, .20); const narrow = coords(mesh)
  let left = 0, right = 0
  base.forEach((p, i) => {
    const d = wide[i][0]-p[0]
    left = Math.min(left, d); right = Math.max(right, d)
    near(narrow[i][0]-p[0], -d)
    near(narrow[i][2], p[2]); near(wide[i][2], p[2])
  })
  near(left, -right)
})

test('extreme inputs clamp safely; unrelated original keys and cached GLB remain unchanged', () => {
  const { mesh, apply } = setup()
  const originalWeights = mesh.morphTargetInfluences.slice()
  assert.deepEqual(apply(.2, .60).supported, ['abdomen_protrusion_m', 'pelvis_width_m'])
  assert.equal(mesh.morphTargetInfluences[mesh.morphTargetDictionary.abdomen_front], .8)
  assert.equal(mesh.morphTargetInfluences[mesh.morphTargetDictionary.pelvis_width], 1)
  apply(-1, .20)
  assert.equal(mesh.morphTargetInfluences[mesh.morphTargetDictionary.abdomen_front], 0)
  assert.equal(mesh.morphTargetInfluences[mesh.morphTargetDictionary.pelvis_width], -1)
  for (const [name, i] of Object.entries(mesh.morphTargetDictionary)) {
    if (!['abdomen_front', 'pelvis_width'].includes(name)) assert.equal(mesh.morphTargetInfluences[i], originalWeights[i])
  }
  apply(NaN, Infinity)
  assert.deepEqual(mesh.morphTargetInfluences, originalWeights)
  assert.deepEqual(getMesh(asset.scene).morphTargetInfluences, originalWeights)
})
