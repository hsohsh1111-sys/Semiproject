import test from 'node:test'
import assert from 'node:assert/strict'
import { Vector3 } from 'three'
import { FITTING_AMBIENT, FITTING_HEMISPHERE, FITTING_LIGHTS } from './fittingLighting.js'

// Analytical diffuse-light check using the actual scene configuration. This does
// not replace browser/WebGL visual validation of materials and exposure.
const energy = normal => FITTING_AMBIENT + FITTING_HEMISPHERE.intensity * (normal.y + 1) / 2 +
  FITTING_LIGHTS.reduce((sum, light) => sum + light.intensity *
    Math.max(0, normal.dot(new Vector3(...light.position).normalize())), 0)

test('front and back receive equal diffuse light at matching surface slopes', () => {
  for (const y of [-.5, 0, .5, .9]) for (let degrees = 0; degrees < 360; degrees += 5) {
    const angle = degrees * Math.PI / 180, radius = Math.sqrt(1 - y * y)
    const normal = new Vector3(radius * Math.sin(angle), y, radius * Math.cos(angle))
    const reversed = new Vector3(-normal.x, normal.y, -normal.z)
    assert.ok(Math.abs(energy(normal) - energy(reversed)) < 1e-12)
    assert.ok(energy(normal) > .5, 'unlit rotation direction')
  }
})

test('horizontal torso lighting varies smoothly around a complete rotation', () => {
  const samples = Array.from({ length: 361 }, (_, i) => energy(new Vector3(Math.sin(i * Math.PI / 180), 0, Math.cos(i * Math.PI / 180))))
  assert.ok(Math.max(...samples) / Math.min(...samples) < 1.3)
  assert.ok(samples.every((value, i) => i === 0 || Math.abs(value - samples[i - 1]) < .025))
})
