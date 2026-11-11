import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Texture, Group } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { headwearForBody } from './headwearFit.js'
import { BODY_MORPH_MODEL_URL, FEMALE_BODY_MODEL_URL } from './bodyMorphs.js'
import { NEUTRAL_CAP_GLB } from './garmentGlb.js'
import { preciseBounds, modelLayout, modelHeightLayout } from './glbGeometry.js'

async function load(url) {
  const bytes = await readFile(new URL('../../../public' + url, import.meta.url))
  return (await new GLTFLoader().register(() => ({ name: 'TextureStub', loadTexture: () => Promise.resolve(new Texture()) }))
    .parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene
}
test('female cap preserves male scalp overlap across proportional heights without changing geometry', async () => {
  const male = await load(BODY_MORPH_MODEL_URL), female = await load(FEMALE_BODY_MODEL_URL)
  const cap = await load(NEUTRAL_CAP_GLB.url)
  const before = preciseBounds(cap).clone(), original = JSON.stringify(NEUTRAL_CAP_GLB)
  const correction = headwearForBody(NEUTRAL_CAP_GLB, FEMALE_BODY_MODEL_URL)
  assert.equal(headwearForBody(NEUTRAL_CAP_GLB, BODY_MORPH_MODEL_URL), NEUTRAL_CAP_GLB)
  assert.equal(correction.url, NEUTRAL_CAP_GLB.url)
  assert.deepEqual(correction.scale, NEUTRAL_CAP_GLB.scale)
  const roofClearance = before.max.y - preciseBounds(male).max.y
  assert.ok(Math.abs(before.max.y + correction.position[1] - preciseBounds(female).max.y - roofClearance) < 1e-7)
  for (const height of [1, 1.7, 1.8, 2.3]) {
    const layout = modelHeightLayout(modelLayout(female), height)
    const root = new Group(), hat = new Group()
    root.scale.fromArray(layout.scale); root.position.fromArray(layout.position)
    hat.position.fromArray(correction.position); hat.add(cap.clone(true))
    root.add(female.clone(true), hat); root.updateMatrixWorld(true)
    assert.ok(Math.abs((preciseBounds(hat).max.y - preciseBounds(root.children[0]).max.y) / layout.scale[1] - roofClearance) < 1e-7)
  }
  assert.deepEqual(preciseBounds(cap), before)
  assert.equal(JSON.stringify(NEUTRAL_CAP_GLB), original)
})
