import test from 'node:test'
import assert from 'node:assert/strict'
import { Box3, Group, Texture, Vector3 } from 'three'
import { createGarmentInstance, disposeGarmentAsset, loadGarmentAsset, TSHIRT_GLB } from './garmentGlb.js'

// Ephemeral loader fixture only: one triangle, no wearable model or disk asset.
function fixture() {
  const bin = new ArrayBuffer(60)
  new Float32Array(bin, 0, 9).set([0, 0, 0, .2, 0, 0, 0, .1, 0])
  new Float32Array(bin, 36, 6).set([0, 0, 1, 0, 0, 1])
  const json = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ name: 'FixtureSurface', mesh: 0, translation: [.03, .8, -.02] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, material: 0 }] }],
    materials: [{ doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [.01, .02, .03, 1], metallicFactor: 0, roughnessFactor: .9 } }],
    buffers: [{ byteLength: 60 }], bufferViews: [{ buffer: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 24 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [.2, .1, 0] },
      { bufferView: 1, componentType: 5126, count: 3, type: 'VEC2' }],
  }
  const text = new TextEncoder().encode(JSON.stringify(json))
  const size = Math.ceil(text.length / 4) * 4, result = new ArrayBuffer(12 + 8 + size + 8 + bin.byteLength)
  const view = new DataView(result)
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, result.byteLength, true)
  view.setUint32(12, size, true); view.setUint32(16, 0x4e4f534a, true)
  new Uint8Array(result, 20, size).fill(32); new Uint8Array(result, 20, text.length).set(text)
  view.setUint32(20 + size, bin.byteLength, true); view.setUint32(24 + size, 0x004e4942, true)
  new Uint8Array(result, 28 + size).set(new Uint8Array(bin))
  return result
}
const fetcher = async () => ({ status: 200, ok: true, arrayBuffer: async () => fixture() })

test('missing garment returns a missing status without invoking GLTF parsing', async () => {
  await assert.rejects(loadGarmentAsset('/missing.glb', {
    fetcher: async () => ({ status: 404, ok: false }),
    loader: { parseAsync() { assert.fail('missing model must not be parsed') } },
  }), error => error.kind === 'missing')
})

test('HTTP failure, network failure and SPA HTML fallback reject without a substitute model', async () => {
  await assert.rejects(loadGarmentAsset('/error.glb', { fetcher: async () => ({ status: 500, ok: false }) }), /HTTP 500/)
  await assert.rejects(loadGarmentAsset('/offline.glb', { fetcher: async () => { throw new Error('offline') } }), /offline/)
  await assert.rejects(loadGarmentAsset('/missing.glb', {
    fetcher: async () => ({ status: 200, ok: true, arrayBuffer: async () => new TextEncoder().encode('<html>SPA fallback</html>').buffer }),
  }), error => error.kind === 'error')
})

test('successful loading retains authored UV, PBR material, texture and original model transforms', async () => {
  const { asset, scene } = await loadGarmentAsset('/models/fixture.glb', { fetcher })
  const original = asset.scene.getObjectByName('FixtureSurface'), mesh = scene.getObjectByName('FixtureSurface')
  assert.notEqual(scene, asset.scene)
  assert.notEqual(mesh, original)
  assert.deepEqual(mesh.position.toArray(), [.03, .8, -.02])
  assert.deepEqual(Array.from(mesh.geometry.attributes.uv.array), [0, 0, 1, 0, 0, 1])
  assert.equal(mesh.material, original.material)
  assert.equal(mesh.material.roughness, .9)
  original.material.map = new Texture()
  const another = createGarmentInstance(asset)
  assert.equal(another.getObjectByName('FixtureSurface').material.map, original.material.map)
  assert.deepEqual(new Box3().setFromObject(scene, true), new Box3().setFromObject(asset.scene, true))
  disposeGarmentAsset(asset)
})

test('common body layout and garment-only adjustment compose without auto-scaling to human height', async () => {
  const { asset, scene } = await loadGarmentAsset('/models/fixture.glb', { fetcher })
  const correction = new Group(), layout = new Group(), yaw = new Group()
  correction.position.set(.01, .02, .03); correction.rotation.y = .2; correction.scale.setScalar(.95)
  layout.position.set(0, .04, -.08); layout.scale.setScalar(1.02)
  yaw.rotation.y = Math.PI / 2
  yaw.add(layout); layout.add(correction); correction.add(scene); yaw.updateMatrixWorld(true)
  const mesh = scene.getObjectByName('FixtureSurface')
  const actual = mesh.localToWorld(new Vector3())
  const expected = mesh.position.clone().multiplyScalar(.95).applyAxisAngle(new Vector3(0, 1, 0), .2)
    .add(correction.position).multiplyScalar(1.02).add(layout.position).applyAxisAngle(new Vector3(0, 1, 0), Math.PI / 2)
  assert.ok(actual.distanceTo(expected) < 1e-8)
  assert.deepEqual(TSHIRT_GLB.scale, [1, 1, 1])
  assert.deepEqual(mesh.scale.toArray(), [1, 1, 1])
  disposeGarmentAsset(asset)
})

test('empty scene and corrupt GLB fail cleanly', async () => {
  assert.throws(() => createGarmentInstance({ scene: new Group() }), /메시/)
  await assert.rejects(loadGarmentAsset('/corrupt.glb', {
    fetcher: async () => ({ status: 200, ok: true, arrayBuffer: async () => fixture().slice(0, 16) }),
  }))
})

test('resource base resolves relative textures next to the garment model', async () => {
  let resourceBase
  const result = await loadGarmentAsset('/models/shirts/top.glb', {
    fetcher, baseUrl: 'http://localhost:5173/#/fitting',
    loader: { async parseAsync(data, path) {
      resourceBase = path
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js')
      return new GLTFLoader().parseAsync(data, path)
    } },
  })
  assert.equal(resourceBase, 'http://localhost:5173/models/shirts/')
  disposeGarmentAsset(result.asset)
})

test('an aborted request never produces a mounted garment instance', async () => {
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(loadGarmentAsset('/models/fixture.glb', { fetcher, signal: controller.signal }), error => error.name === 'AbortError')
})
