import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { DoubleSide, Group, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { applyMorphTest, captureMorphWeights, modelLayout, preciseFrame } from './glbGeometry.js'
import { boundaryLoops, createTShirt, LOGO_RECT } from './tshirtGeometry.js'

const base = { height_m: 1.75, shoulder_width_m: .42, chest_radius_m: 95 / (200 * Math.PI),
  waist_radius_m: 80 / (200 * Math.PI), abdomen_protrusion_m: 0, pelvis_width_m: .3,
  hip_radius_m: 95 / (200 * Math.PI), thigh_radius_m: 50 / (200 * Math.PI) }
const bytes = await readFile(new URL('../../../public/models/ONFIT_Human_Test_BodyOnly.glb', import.meta.url))
const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
const layout = modelLayout(gltf.scene), root = new Group()
root.position.fromArray(layout.position); root.scale.setScalar(layout.scale); root.add(gltf.scene)
const surface = preciseFrame(root)
function dispose(model) { model.geometry.dispose(); model.logo.dispose() }

test('separate 3D shirt has two short sleeves, open round neck, full front/back and finite geometry', () => {
  const shirt = createTShirt(base, 'regular', null, surface)
  const pos = shirt.geometry.attributes.position.array
  assert.ok(Array.from(pos).every(Number.isFinite))
  assert.ok(shirt.geometry.index.count > 3000)
  assert.ok(shirt.geometry.boundingBox.max.x > shirt.anchors.shoulder)
  assert.ok(shirt.geometry.boundingBox.min.x < -shirt.anchors.shoulder)
  assert.ok(shirt.geometry.boundingBox.max.z - shirt.geometry.boundingBox.min.z > .15)
  assert.ok(shirt.collar.some(p => p.y < shirt.anchors.neckY - .05))
  assert.ok(shirt.collar.some(p => p.y > shirt.anchors.neckY - .02))
  assert.ok(shirt.anchors.hemY > surface.bounds.min.y && shirt.anchors.neckY < surface.bounds.max.y)
  assert.equal(shirt.logo.attributes.position.count, shirt.logo.attributes.uv.count)
  dispose(shirt)
})

test('abdomen, shoulder, chest, waist and pelvis input extremes change actual shirt vertices, not the GLB body', () => {
  const bodyBefore = gltf.scene.children[0].morphTargetInfluences.slice()
  const original = createTShirt(base, 'regular', null, surface)
  for (const [field, value] of [['abdomen_protrusion_m', .2], ['shoulder_width_m', .65],
    ['chest_radius_m', .27], ['waist_radius_m', .26], ['pelvis_width_m', .6]]) {
    const changed = createTShirt({ ...base, [field]: value }, 'regular', null, surface)
    assert.notDeepEqual(changed.geometry.attributes.position.array, original.geometry.attributes.position.array, field)
    assert.ok(Array.from(changed.geometry.attributes.position.array).every(Number.isFinite))
    dispose(changed)
  }
  assert.deepEqual(gltf.scene.children[0].morphTargetInfluences, bodyBefore)
  dispose(original)
})

test('existing garment API outputs and fixed basis are consumed without recomputing backend formulas', () => {
  const server = { fit: 'regular', shoulder_half_width_m: .26, chest_radius_m: .2,
    waist_radius_m: .18, abdomen_front_depth_m: .32, pelvis_half_width_m: .25,
    hip_radius_m: .2, hem_half_width_m: .26 }
  const first = createTShirt(base, 'regular', server, surface)
  const again = createTShirt({ ...base }, 'regular', { ...server }, surface)
  assert.equal(first.anchors.shoulder, .26)
  assert.ok(first.geometry.boundingBox.max.z > .2)
  assert.deepEqual(first.geometry.attributes.position.array, again.geometry.attributes.position.array)
  assert.throws(() => createTShirt(base, 'slim', server, surface))
  dispose(first); dispose(again)
})

test('torso sample points have front and back shirt surfaces outside the GLB skin', () => {
  const shirt = createTShirt(base, 'regular', null, surface)
  const mesh = new Mesh(shirt.geometry, new MeshBasicMaterial({ side: DoubleSide }))
  mesh.updateMatrixWorld(true)
  const candidates = surface.points.filter(p => Math.abs(p.x) < .1 && p.y > .9 && p.y < 1.28)
  const ray = new Raycaster(), sampled = candidates.filter((_, i) => i % 15 === 0)
  assert.ok(sampled.length > 10)
  for (const p of sampled) {
    ray.set(new Vector3(p.x, p.y, 2), new Vector3(0, 0, -1))
    const hits = ray.intersectObject(mesh)
    assert.ok(hits.length >= 2)
    assert.ok(hits[0].point.z >= p.z - .003)
    assert.ok(hits.at(-1).point.z <= p.z + .003)
  }
  mesh.material.dispose(); dispose(shirt)
})

test('explicit abdomen GLB morph is sampled by the shirt without mutating file defaults', () => {
  const scene = gltf.scene.clone(true)
  const defaults = captureMorphWeights(scene)
  const wrapper = new Group()
  wrapper.position.fromArray(layout.position); wrapper.scale.setScalar(layout.scale); wrapper.add(scene)
  const before = createTShirt(base, 'regular', null, preciseFrame(wrapper))
  applyMorphTest(scene, defaults, 'stomach-pregnant-incr', 1)
  const after = createTShirt(base, 'regular', null, preciseFrame(wrapper))
  assert.notDeepEqual(before.geometry.attributes.position.array, after.geometry.attributes.position.array)
  dispose(before); dispose(after)
})

test('logo UVs crop the original provided product photo without replacing or mirroring its artwork', async () => {
  const photo = await readFile(new URL('../../../public/textures/nike-shirt-reference.png', import.meta.url))
  assert.equal(photo.subarray(1, 4).toString(), 'PNG')
  assert.equal(photo.readUInt32BE(16), 358)
  assert.equal(photo.readUInt32BE(20), 349)
  const shirt = createTShirt(base, 'regular', null, surface)
  const uv = shirt.logo.attributes.uv
  for (let i = 0; i < uv.count; i++) {
    assert.ok(uv.getX(i) >= LOGO_RECT[0] - 1e-6 && uv.getX(i) <= LOGO_RECT[2] + 1e-6)
    assert.ok(uv.getY(i) >= LOGO_RECT[1] - 1e-6 && uv.getY(i) <= LOGO_RECT[3] + 1e-6)
  }
  assert.ok(uv.getX(1) > uv.getX(0))
  dispose(shirt)
})

test('torso, rounded shoulders and sleeves form one manifold with exactly four garment openings', () => {
  const shirt = createTShirt(base, 'regular', null, surface)
  const index = shirt.geometry.index.array, edges = new Map(), adjacency = new Map()
  for (let i = 0; i < index.length; i += 3) for (let j = 0; j < 3; j++) {
    const a = index[i + j], b = index[i + (j + 1) % 3], key = [Math.min(a, b), Math.max(a, b)].join(',')
    const edge = edges.get(key) ?? { count: 0, winding: 0 }
    edge.count++; edge.winding += a < b ? 1 : -1; edges.set(key, edge)
    if (!adjacency.has(a)) adjacency.set(a, new Set())
    adjacency.get(a).add(b)
  }
  for (const edge of edges.values()) {
    assert.ok(edge.count <= 2, 'non-manifold seam')
    if (edge.count === 2) assert.equal(edge.winding, 0, 'inverted face along seam')
  }
  const visited = new Set(), pending = [index[0]]
  while (pending.length) {
    const id = pending.pop()
    if (visited.has(id)) continue
    visited.add(id)
    for (const other of adjacency.get(id) ?? []) pending.push(other)
  }
  assert.equal(visited.size, new Set(index).size, 'sleeve disconnected from torso')
  assert.equal(boundaryLoops(shirt.geometry).length, 4)
  for (const cuff of [shirt.trims.leftCuff, shirt.trims.rightCuff]) {
    assert.ok(cuff.length >= 48, 'cuff needs enough angular segments')
    assert.ok(Math.max(...cuff.map(p => p.z)) - Math.min(...cuff.map(p => p.z)) > .08, 'flat sleeve')
  }
  dispose(shirt)
})

test('round neckline is an actual opening and bowed hem remains open with a curved cross section', () => {
  const shirt = createTShirt(base, 'regular', null, surface)
  const mesh = new Mesh(shirt.geometry, new MeshBasicMaterial({ side: DoubleSide }))
  mesh.updateMatrixWorld(true)
  const neckZ = shirt.collar.reduce((sum, p) => sum + p.z, 0) / shirt.collar.length
  const ray = new Raycaster(new Vector3(0, 2, neckZ), new Vector3(0, -1, 0))
  assert.equal(ray.intersectObject(mesh).length, 0, 'neck/hem were capped')
  const hem = shirt.trims.hem
  assert.ok(Math.max(...hem.map(p => p.y)) - Math.min(...hem.map(p => p.y)) > .002)
  assert.ok(Math.max(...hem.map(p => p.z)) - Math.min(...hem.map(p => p.z)) > .15)
  mesh.material.dispose(); dispose(shirt)
})

test('every rendered triangle has nonzero area and normalized finite surface normals', () => {
  const shirt = createTShirt(base, 'regular', null, surface)
  const p = shirt.geometry.attributes.position, n = shirt.geometry.attributes.normal, index = shirt.geometry.index.array
  for (const id of new Set(index)) {
    const normal = new Vector3().fromBufferAttribute(n, id)
    assert.ok(normal.toArray().every(Number.isFinite))
    assert.ok(Math.abs(normal.length() - 1) < 1e-5)
  }
  for (let i = 0; i < index.length; i += 3) {
    const a = new Vector3().fromBufferAttribute(p, index[i])
    const b = new Vector3().fromBufferAttribute(p, index[i + 1])
    const c = new Vector3().fromBufferAttribute(p, index[i + 2])
    assert.ok(b.sub(a).cross(c.sub(a)).lengthSq() > 1e-20)
  }
  dispose(shirt)
})

test('printed logo keeps its XY size, aspect ratio and UVs when chest, waist or belly changes', () => {
  const first = createTShirt(base, 'regular', null, surface)
  first.logo.computeBoundingBox()
  const size = first.logo.boundingBox.getSize(new Vector3())
  assert.ok(Math.abs(size.x / size.y - 109 / 61) < 1e-5)
  for (const changes of [{ chest_radius_m: .27 }, { waist_radius_m: .24 }, { abdomen_protrusion_m: .2 }]) {
    const shirt = createTShirt({ ...base, ...changes }, 'regular', null, surface)
    shirt.logo.computeBoundingBox()
    const next = shirt.logo.boundingBox.getSize(new Vector3())
    assert.equal(next.x, size.x); assert.equal(next.y, size.y)
    assert.deepEqual(shirt.logo.attributes.uv.array, first.logo.attributes.uv.array)
    dispose(shirt)
  }
  dispose(first)
})
