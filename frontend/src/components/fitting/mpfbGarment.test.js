import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { Box3, Group, Texture, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { createGarmentInstance, TSHIRT_GLB } from './garmentGlb.js'
import { modelLayout, preciseBounds } from './glbGeometry.js'

const models = new URL('../../../public/models/', import.meta.url)
const data = await readFile(new URL('ONFIT_TShirt.glb', models))
const report = JSON.parse(await readFile(new URL('../../../../assets/blender/ONFIT_TShirt.source.json', import.meta.url), 'utf8'))
const document = JSON.parse(data.subarray(20, 20 + data.readUInt32LE(12)).toString())
// Node lacks browser image decoding. Inspect embedded PNG buffers below, and
// stub only GPU texture decoding for geometry/material-loader verification.
const loader = new GLTFLoader().register(() => ({
  name: 'NodeTextureDecodeStub', loadTexture: () => Promise.resolve(new Texture()),
}))
const garment = await loader.parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '')
const bodyBytes = await readFile(new URL('ONFIT_Human_Test_BodyOnly.glb', models))
const body = await new GLTFLoader().parseAsync(bodyBytes.buffer.slice(bodyBytes.byteOffset, bodyBytes.byteOffset + bodyBytes.byteLength), '')

test('generated GLB matches the provenance and contains the real CC0 shirt only', () => {
  assert.equal(createHash('sha256').update(data).digest('hex'), report.glb_sha256)
  assert.equal(report.license, 'CC0')
  assert.equal(report.asset_name, 'male_casualsuit06')
  assert.equal(report.mpfb, '2.0.18')
  assert.equal(document.meshes.length, 1)
  assert.deepEqual(document.nodes.map(n => n.name), ['ONFIT_TShirt'])
  assert.equal(document.meshes[0].primitives[0].targets, undefined)
  assert.equal(TSHIRT_GLB.url, '/models/ONFIT_TShirt.glb')
})

test('authored color/normal PNG textures and UVs are embedded and fabric is opaque', () => {
  assert.ok(document.images.length >= 2)
  const binaryOffset = 20 + data.readUInt32LE(12) + 8
  for (const image of document.images) {
    assert.equal(image.uri, undefined)
    assert.equal(image.mimeType, 'image/png')
    const view = document.bufferViews[image.bufferView]
    const header = data.subarray(binaryOffset + (view.byteOffset ?? 0), binaryOffset + (view.byteOffset ?? 0) + 8)
    assert.deepEqual([...header], [137, 80, 78, 71, 13, 10, 26, 10])
  }
  const instance = createGarmentInstance(garment)
  const mesh = instance.getObjectByName('ONFIT_TShirt')
  assert.ok(mesh.geometry.attributes.uv.count > 10000)
  assert.equal(mesh.material.transparent, false)
  assert.equal(mesh.material.opacity, 1)
  assert.ok(mesh.material.map?.isTexture)
  assert.ok(mesh.material.normalMap?.isTexture)
  assert.ok([...mesh.geometry.attributes.normal.array].every(Number.isFinite))
  assert.equal(mesh.geometry.index.count / 3, report.triangles)
})

test('shared mannequin layout places the shirt around the torso without resizing or recentering it', () => {
  const raw = preciseBounds(garment.scene)
  raw.min.toArray().forEach((v, i) => assert.ok(Math.abs(v - report.bounds.min[i]) < 1e-6))
  raw.max.toArray().forEach((v, i) => assert.ok(Math.abs(v - report.bounds.max[i]) < 1e-6))
  const layout = modelLayout(body.scene), wrapper = new Group()
  wrapper.scale.setScalar(layout.scale); wrapper.position.fromArray(layout.position)
  const instance = createGarmentInstance(garment)
  wrapper.add(body.scene, instance)
  const bodyBounds = preciseBounds(body.scene), shirtBounds = preciseBounds(instance)
  assert.ok(shirtBounds.min.y > bodyBounds.min.y + .6)
  assert.ok(shirtBounds.max.y < bodyBounds.max.y - .15)
  assert.ok(shirtBounds.min.x > bodyBounds.min.x && shirtBounds.max.x < bodyBounds.max.x)
  assert.deepEqual(instance.scale.toArray(), [1, 1, 1])
  const size = raw.getSize(new Vector3())
  assert.ok(size.y > .5 && size.y < .8)
  assert.ok(report.penetration_check.inside_over_10mm / report.penetration_check.samples < .03)
})
