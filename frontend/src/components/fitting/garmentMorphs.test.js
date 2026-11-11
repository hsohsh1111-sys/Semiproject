import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { Texture, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { applyGarmentMorphs, TSHIRT_MORPH_GLB } from './garmentGlb.js'
import { applyBodyMorphs, bodyMorphWeights, BODY_MORPH_MODEL_URL } from './bodyMorphs.js'
import { captureMorphWeights } from './glbGeometry.js'
import { createGarmentAppearance, GARMENT_COLORS } from './garmentAppearance.js'

const folder = new URL('../../../public/models/', import.meta.url)
const read = name => readFile(new URL(name, folder))
async function load(name) {
  const b = await read(name)
  const loader = new GLTFLoader().register(() => ({ name: 'NodeTextureDecodeStub', loadTexture: () => Promise.resolve(new Texture()) }))
  return loader.parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset+b.byteLength), '')
}
const garment = await load('ONFIT_TShirt_BodyMorph_v2.glb')
const previous = await load('ONFIT_TShirt_BodyMorph_v1.glb')
const original = await load('ONFIT_TShirt.glb')
const body = await load('ONFIT_Human_BodyMorph_v1.glb')
const report = JSON.parse(await read('ONFIT_TShirt_BodyMorph_v2.json'))
function mesh(scene) { let found; scene.traverse(o => { if (o.isMesh) found = o }); return found }
const coords = m => Array.from({ length: m.geometry.attributes.position.count }, (_, i) => m.getVertexPosition(i, new Vector3()).toArray())
const near = (a, b) => assert.ok(Math.abs(a-b) < 2e-6, `${a} != ${b}`)
function fixture() {
  const scene = garment.scene.clone(true), defaults = captureMorphWeights(scene)
  return { scene, defaults, m: mesh(scene), apply: p => applyGarmentMorphs(scene, defaults, bodyMorphWeights(p), TSHIRT_MORPH_GLB.url) }
}

test('new asset contains exactly two zero-weight keys, preserves UV/index/material and original files', async () => {
  const m = mesh(garment.scene), old = mesh(original.scene)
  assert.deepEqual(Object.keys(m.morphTargetDictionary), ['garment_abdomen_front', 'garment_pelvis_width'])
  assert.deepEqual(m.morphTargetInfluences, [0, 0])
  assert.deepEqual(m.geometry.attributes.uv.array, old.geometry.attributes.uv.array)
  assert.deepEqual(m.geometry.index.array, old.geometry.index.array)
  assert.equal(m.geometry.attributes.position.count, old.geometry.attributes.position.count)
  assert.equal(m.material.roughness, old.material.roughness)
  assert.ok(m.material.map && m.material.normalMap)
  assert.equal(m.material.transparent, false)
  for (const [path, hash] of Object.entries(report.original_hashes)) {
    const b = await readFile(path)
    assert.equal(createHash('sha256').update(b).digest('hex'), hash)
  }
})

test('body and garment share weights for all requested combinations and restore actual vertices', () => {
  const { m, apply } = fixture()
  const human = body.scene.clone(true), h = mesh(human), defaults = captureMorphWeights(human)
  const base = coords(m)
  for (const [abdomen, pelvis] of [[0,.30],[.2,.30],[0,.20],[.2,.20],[0,.30]]) {
    const p = { abdomen_protrusion_m: abdomen, pelvis_width_m: pelvis }
    apply(p); applyBodyMorphs(human, defaults, p, BODY_MORPH_MODEL_URL)
    for (const key of ['abdomen_front','pelvis_width']) {
      assert.equal(m.morphTargetInfluences[m.morphTargetDictionary['garment_'+key]], h.morphTargetInfluences[h.morphTargetDictionary[key]])
    }
    if (abdomen || pelvis !== .30) assert.notDeepEqual(coords(m), base)
  }
  assert.deepEqual(coords(m), base)
  for (const check of report.checks) {
    assert.equal(check.inside_over_2mm, 0)
    assert.equal(check.inside_over_10mm, 0)
    assert.equal(check.flipped_triangles, 0)
    assert.ok(check.min_signed_gap_m > 0)
    assert.equal(check.self_nonadjacent_overlap_candidates, 0)
    assert.equal(check.body_triangle_overlap_pairs, 0)
  }
})

test('garment front depth and hem width are independent; upper torso and sleeves remain unchanged', () => {
  const { m, apply } = fixture()
  apply({abdomen_protrusion_m:0, pelvis_width_m:.30}); const base = coords(m)
  apply({abdomen_protrusion_m:.2, pelvis_width_m:.30}); const a = coords(m)
  apply({abdomen_protrusion_m:0, pelvis_width_m:.25}); const p = coords(m)
  apply({abdomen_protrusion_m:.2, pelvis_width_m:.25}); const both = coords(m)
  let depth = 0, width = 0
  base.forEach((v,i) => {
    near(a[i][0],v[0]); near(a[i][1],v[1]); near(p[i][1],v[1]); near(p[i][2],v[2])
    depth = Math.max(depth,a[i][2]-v[2]); width = Math.max(width,Math.abs(p[i][0]-v[0]))
    if(v[1]>1.31 || Math.abs(v[0])>.3) {
      v.forEach((x,axis) => near(both[i][axis],x))
    }
    v.forEach((x,axis) => near(both[i][axis],a[i][axis]+p[i][axis]-x))
  })
  assert.ok(depth>.03); assert.ok(width>.005)
})

test('four colors, morph changes and remount preserve texture references and shared cached geometry', () => {
  for (let cycle=0;cycle<2;cycle++) {
    const { scene, m, apply } = fixture()
    const raw = m.geometry.attributes.position.array.slice()
    const map = m.material.map, normal = m.material.normalMap
    const appearance = createGarmentAppearance(scene)
    for (const color of GARMENT_COLORS) {
      appearance.setColor(color.id)
      apply({abdomen_protrusion_m:.2,pelvis_width_m:.25})
      assert.equal(m.material.map,map); assert.equal(m.material.normalMap,normal)
      assert.deepEqual(m.geometry.attributes.position.array,raw)
    }
    appearance.dispose()
  }
  assert.deepEqual(mesh(garment.scene).morphTargetInfluences,[0,0])
})

test('v2 distributes the belly displacement down to the hem with lower peak gradient', () => {
  assert.ok(report.abdomen_displacement_slope.current.max < report.abdomen_displacement_slope.v1.max * .6)
  const {m,apply}=fixture()
  const base=coords(m)
  apply({abdomen_protrusion_m:.1,pelvis_width_m:.30}); const middle=coords(m)
  apply({abdomen_protrusion_m:.2,pelvis_width_m:.30}); const full=coords(m)
  const old=mesh(previous.scene), oldBase=coords(old)
  old.morphTargetInfluences[old.morphTargetDictionary.garment_abdomen_front]=1
  const oldFull=coords(old)
  let hemSamples=0
  base.forEach((v,i)=>{
    near(middle[i][2]-v[2],(full[i][2]-v[2])*.5)
    // Front lower hem used to drop back to zero directly below the belly.
    if(v[1]<.98 && Math.abs(v[0])<.08 && v[2]>.10) {
      hemSamples++
      assert.ok(full[i][2]-v[2]>.07)
      assert.ok(oldFull[i][2]-oldBase[i][2]<.02)
      near(full[i][0],v[0])
    }
  })
  assert.ok(hemSamples>10)
  old.morphTargetInfluences.fill(0)
})

test('0/25/50/75/100 percent produces progressive shared weights and actual vertex displacement without early saturation', () => {
  const {m,apply}=fixture()
  const human=body.scene.clone(true), h=mesh(human), defaults=captureMorphWeights(human)
  const base=coords(m), humanBase=coords(h)
  let lastBody=-1, lastCloth=-1
  for(const fraction of [0,.25,.5,.75,1]) {
    const parameters={abdomen_protrusion_m:.20*fraction,pelvis_width_m:.30}
    const weights=bodyMorphWeights(parameters)
    near(weights.abdomen_front,.8*fraction)
    apply(parameters); applyBodyMorphs(human,defaults,parameters,BODY_MORPH_MODEL_URL)
    const cloth=coords(m), skin=coords(h)
    const bodyDelta=Math.max(...skin.map((p,i)=>p[2]-humanBase[i][2]))
    const clothDelta=Math.max(...cloth.map((p,i)=>p[2]-base[i][2]))
    near(bodyDelta,.08*.8*fraction)
    near(clothDelta,.09*.8*fraction)
    assert.ok(bodyDelta>lastBody); assert.ok(clothDelta>lastCloth)
    lastBody=bodyDelta; lastCloth=clothDelta
    // Changing pelvis must not alter the abdomen's applied weight/depth axis.
    apply({...parameters,pelvis_width_m:.20})
    coords(m).forEach((p,i)=>near(p[2],cloth[i][2]))
  }
  near(bodyMorphWeights({abdomen_protrusion_m:.19}).abdomen_front,.76)
  near(bodyMorphWeights({abdomen_protrusion_m:.20}).abdomen_front,.8)
  near(bodyMorphWeights({abdomen_protrusion_m:10}).abdomen_front,.8)
  apply({abdomen_protrusion_m:0,pelvis_width_m:.30})
  assert.deepEqual(coords(m),base)
})
