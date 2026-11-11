import test from 'node:test'
import assert from 'node:assert/strict'
import { SphereGeometry } from 'three'
import { garmentRings, bodyRings, ringPoint, ringVertices, thighEllipsoid, circumferenceEase } from './silhouette.js'
const base = { height_m: 1.75, shoulder_width_m: .42, waist_radius_m: .13, chest_radius_m: .15, abdomen_protrusion_m: 0, pelvis_width_m: .3, hip_radius_m: .15, thigh_radius_m: .08 }
const named = (rings, name) => rings.find(r => r[0] === name)
const ringIndex = (rings, name) => rings.findIndex(r => r[0] === name)
const vertex = (vertices, row, segment, segments = 64) => {
  const offset = (row * (segments + 1) + segment) * 3
  return Array.from(vertices.slice(offset, offset + 3))
}

test('fixed garment stays unchanged while growing body reduces circumference ease', () => {
  const fixed = { ...base }
  const before = garmentRings(fixed, 'regular')
  const original = circumferenceEase(base, fixed, 'regular')
  const grown = { ...base, chest_radius_m: base.chest_radius_m + .04, waist_radius_m: base.waist_radius_m + .05 }
  const after = circumferenceEase(grown, fixed, 'regular')
  assert.ok(after.chest < 0 && after.waist < 0)
  assert.ok(Math.abs(original.waist - after.waist - .05 * 200 * Math.PI) < 1e-9)
  assert.deepEqual(garmentRings(fixed, 'regular'), before)
  assert.ok(Math.abs(circumferenceEase(grown, grown, 'regular').waist - original.waist) < 1e-9)
})

test('fit envelopes stay outside the torso at boundary dimensions', () => {
  for (const height_m of [1, 2.3]) for (const shoulder_width_m of [.25, .65]) {
    for (const waist_radius_m of [.07, .29]) for (const abdomen_protrusion_m of [0, .2]) {
      const p = { ...base, height_m, shoulder_width_m, waist_radius_m, abdomen_protrusion_m }
      const body = bodyRings(p)
      const fits = ['slim', 'regular', 'oversized'].map(fit => garmentRings(p, fit))
      for (let i = 0; i < fits[0].length; i++) for (const dim of [2, 3, 4]) {
        assert.ok(body[i][dim] < fits[0][i][dim])
        assert.ok(fits[0][i][dim] < fits[1][i][dim])
        assert.ok(fits[1][i][dim] < fits[2][i][dim])
      }
    }
  }
})

test('independent body controls propagate to corresponding garment ring', () => {
  for (const [field, value, name] of [['chest_radius_m', .2, 'chest'], ['pelvis_width_m', .45, 'pelvis'], ['hip_radius_m', .22, 'hip'], ['abdomen_protrusion_m', .1, 'abdomen'], ['shoulder_width_m', .5, 'shoulder']]) {
    const changed = { ...base, [field]: value }
    for (const original of bodyRings(base)) {
      const next = named(bodyRings(changed), original[0])
      if (original[0] === name) assert.notDeepEqual(next, original)
      else assert.deepEqual(next, original)
    }
    assert.notDeepEqual(named(garmentRings(changed, 'regular'), name), named(garmentRings(base, 'regular'), name))
  }
  assert.deepEqual(bodyRings({ ...base, thigh_radius_m: .15 }), bodyRings(base))
  assert.throws(() => garmentRings(base, 'unknown'))
})

test('abdomen moves forward only and surface coordinates remain finite', () => {
  const original = named(bodyRings(base), 'abdomen')
  const changed = named(bodyRings({ ...base, abdomen_protrusion_m: .2 }), 'abdomen')
  assert.deepEqual(ringPoint(original, -Math.PI / 2), ringPoint(changed, -Math.PI / 2))
  assert.deepEqual(ringPoint(original, 0), ringPoint(changed, 0))
  assert.ok(ringPoint(changed, Math.PI / 2)[2] > ringPoint(original, Math.PI / 2)[2])
  for (const r of bodyRings({ ...base, abdomen_protrusion_m: .2 })) {
    for (let i = 0; i <= 64; i++) assert.ok(ringPoint(r, i / 64 * Math.PI * 2).every(Number.isFinite))
  }
})

test('server garment parameters drive the mesh rings directly', () => {
  const calculated = {
    fit: 'regular', shoulder_half_width_m: .235, chest_radius_m: .175,
    waist_radius_m: .155, abdomen_front_depth_m: .355, pelvis_half_width_m: .175,
    hip_radius_m: .175, thigh_radius_m: .105, hem_half_width_m: .20,
    chest_ease_cm: 5, waist_ease_cm: 5,
    abdomen_front_clearance_m: .025, hem_clearance_m: .025,
  }
  const rings = garmentRings(base, 'regular', calculated)
  assert.deepEqual(named(rings, 'abdomen').slice(2), [.155, .355, .155])
  assert.deepEqual(named(rings, 'pelvis').slice(2), [.175, .145, .145])
  assert.deepEqual(named(rings, 'hip').slice(2), [.20, .175, .175])
  assert.deepEqual(named(rings, 'chest').slice(2), [.175, .175, .175])
  assert.throws(() => garmentRings(base, 'slim', calculated), /핏이 현재 선택과 다릅니다/)
})

test('server abdomen and pelvis outputs deform separate garment regions', () => {
  const bodyAbdomen = { ...base, abdomen_protrusion_m: .2 }
  const bodyPelvis = { ...base, pelvis_width_m: .2 }
  const abdomenResult = {
    fit: 'regular', shoulder_half_width_m: .235, chest_radius_m: .175,
    waist_radius_m: .155, abdomen_front_depth_m: .355, pelvis_half_width_m: .175,
    hip_radius_m: .175, thigh_radius_m: .105, hem_half_width_m: .20,
    chest_ease_cm: 5, waist_ease_cm: 5,
    abdomen_front_clearance_m: .025, hem_clearance_m: .025,
  }
  const pelvisResult = {
    ...abdomenResult,
    abdomen_front_depth_m: .155,
    pelvis_half_width_m: .125,
    hem_half_width_m: .175,
  }
  const abdomenRings = garmentRings(bodyAbdomen, 'regular', abdomenResult)
  const pelvisRings = garmentRings(bodyPelvis, 'regular', pelvisResult)
  assert.equal(named(abdomenRings, 'abdomen')[3], .355)
  assert.equal(named(abdomenRings, 'pelvis')[2], .175)
  assert.equal(named(pelvisRings, 'abdomen')[3], .155)
  assert.equal(named(pelvisRings, 'pelvis')[2], .125)
  assert.equal(named(pelvisRings, 'hip')[2], .175)
})

test('extreme abdomen and pelvis values change actual Three.js position-buffer vertices independently', () => {
  const abdomenMin = bodyRings({ ...base, abdomen_protrusion_m: 0 })
  const abdomenMax = bodyRings({ ...base, abdomen_protrusion_m: .2 })
  const abdomenMinVertices = ringVertices(abdomenMin)
  const abdomenMaxVertices = ringVertices(abdomenMax)
  const abdomenRow = ringIndex(abdomenMin, 'abdomen')
  const pelvisRow = ringIndex(abdomenMin, 'pelvis')
  assert.notDeepEqual(vertex(abdomenMinVertices, abdomenRow, 16), vertex(abdomenMaxVertices, abdomenRow, 16))
  assert.deepEqual(vertex(abdomenMinVertices, pelvisRow, 16), vertex(abdomenMaxVertices, pelvisRow, 16))
  assert.ok(vertex(abdomenMaxVertices, abdomenRow, 16)[2] > vertex(abdomenMinVertices, abdomenRow, 16)[2])

  const pelvisMin = bodyRings({ ...base, pelvis_width_m: .2 })
  const pelvisMax = bodyRings({ ...base, pelvis_width_m: .6 })
  const pelvisMinVertices = ringVertices(pelvisMin)
  const pelvisMaxVertices = ringVertices(pelvisMax)
  const pelvisRowAtExtremes = ringIndex(pelvisMin, 'pelvis')
  assert.notDeepEqual(vertex(pelvisMinVertices, pelvisRowAtExtremes, 0), vertex(pelvisMaxVertices, pelvisRowAtExtremes, 0))
  assert.deepEqual(
    vertex(pelvisMinVertices, ringIndex(pelvisMin, 'abdomen'), 16),
    vertex(pelvisMaxVertices, ringIndex(pelvisMax, 'abdomen'), 16),
  )
})

test('extreme garment fits and fixed-size basis change actual position-buffer vertices', () => {
  // Sample API results: this test checks mesh application, not backend formulas.
  const serverGarments = {
    slim: { fit: 'slim', shoulder_half_width_m: .218, chest_radius_m: .158, waist_radius_m: .138,
      abdomen_front_depth_m: .138, pelvis_half_width_m: .158, hip_radius_m: .158, thigh_radius_m: .088,
      hem_half_width_m: .158, chest_ease_cm: 0, waist_ease_cm: 0, abdomen_front_clearance_m: 0, hem_clearance_m: 0 },
    regular: { fit: 'regular', shoulder_half_width_m: .235, chest_radius_m: .175, waist_radius_m: .155,
      abdomen_front_depth_m: .155, pelvis_half_width_m: .175, hip_radius_m: .175, thigh_radius_m: .105,
      hem_half_width_m: .175, chest_ease_cm: 0, waist_ease_cm: 0, abdomen_front_clearance_m: 0, hem_clearance_m: 0 },
    oversized: { fit: 'oversized', shoulder_half_width_m: .265, chest_radius_m: .205, waist_radius_m: .185,
      abdomen_front_depth_m: .185, pelvis_half_width_m: .205, hip_radius_m: .205, thigh_radius_m: .135,
      hem_half_width_m: .205, chest_ease_cm: 0, waist_ease_cm: 0, abdomen_front_clearance_m: 0, hem_clearance_m: 0 },
  }
  const fitVertices = ['slim', 'regular', 'oversized'].map(fit =>
    ringVertices(garmentRings(base, fit, serverGarments[fit])))
  const chestRow = ringIndex(garmentRings(base, 'slim'), 'chest')
  assert.notDeepEqual(vertex(fitVertices[0], chestRow, 0), vertex(fitVertices[2], chestRow, 0))
  assert.ok(vertex(fitVertices[0], chestRow, 0)[0] < vertex(fitVertices[1], chestRow, 0)[0])
  assert.ok(vertex(fitVertices[1], chestRow, 0)[0] < vertex(fitVertices[2], chestRow, 0)[0])

  const fixedBasis = { ...base, abdomen_protrusion_m: .04, pelvis_width_m: .4 }
  const fixedResult = {
    fit: 'regular', shoulder_half_width_m: .235, chest_radius_m: .175, waist_radius_m: .155,
    abdomen_front_depth_m: .195, pelvis_half_width_m: .225, hip_radius_m: .175, thigh_radius_m: .105,
    hem_half_width_m: .225, chest_ease_cm: 0, waist_ease_cm: 0,
    abdomen_front_clearance_m: 0, hem_clearance_m: 0,
  }
  const fixedBefore = ringVertices(garmentRings(fixedBasis, 'regular', fixedResult))
  const changedBody = { ...base, abdomen_protrusion_m: .2, pelvis_width_m: .2 }
  const fixedAfter = ringVertices(garmentRings(fixedBasis, 'regular', fixedResult))
  assert.deepEqual(fixedAfter, fixedBefore)
  assert.notDeepEqual(ringVertices(garmentRings(changedBody, 'regular')), fixedBefore)
})

test('extreme chest, hip, and thigh inputs change their body mesh vertex coordinates', () => {
  const smallCircumference = 55 / (200 * Math.PI)
  const largeCircumference = 180 / (200 * Math.PI)
  const smallBody = { ...base, chest_radius_m: smallCircumference, hip_radius_m: smallCircumference, thigh_radius_m: 25 / (200 * Math.PI) }
  const largeBody = { ...base, chest_radius_m: largeCircumference, hip_radius_m: largeCircumference, thigh_radius_m: 100 / (200 * Math.PI) }
  const smallRings = bodyRings(smallBody)
  const largeRings = bodyRings(largeBody)
  const smallVertices = ringVertices(smallRings)
  const largeVertices = ringVertices(largeRings)
  for (const name of ['chest', 'hip']) {
    const row = ringIndex(smallRings, name)
    assert.notDeepEqual(vertex(smallVertices, row, 0), vertex(largeVertices, row, 0))
  }

  const sphere = new SphereGeometry(1, 32, 24)
  const positions = sphere.getAttribute('position')
  let xVertex = 0
  for (let i = 1; i < positions.count; i++) if (positions.getX(i) > positions.getX(xVertex)) xVertex = i
  const sphereX = positions.getX(xVertex)
  const smallThigh = thighEllipsoid(smallBody, 1)
  const largeThigh = thighEllipsoid(largeBody, 1)
  const smallWorldX = smallThigh.position[0] + sphereX * smallThigh.scale[0]
  const largeWorldX = largeThigh.position[0] + sphereX * largeThigh.scale[0]
  assert.notEqual(smallWorldX, largeWorldX)
  sphere.dispose()
})
