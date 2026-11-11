import test from 'node:test'
import assert from 'node:assert/strict'
import { Box3, PerspectiveCamera, Vector3, Group } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { createGlbCameraSession } from './glbCamera.js'

const frame = { bounds: new Box3(new Vector3(-.5, 0, -.2), new Vector3(.5, 1.7, .3)) }
const changedFrame = { bounds: new Box3(new Vector3(-.6, 0, -.2), new Vector3(.6, 1.7, .45)) }
function setup() {
  const camera = new PerspectiveCamera(42, 1, .1, 100)
  // Real controls math, without browser DOM events/WebGL rendering.
  const controls = new OrbitControls(camera, null)
  const document = { removeEventListener() {} }
  controls.domElement = { removeEventListener() {}, ownerDocument: document, getRootNode: () => document, style: {} }
  const session = createGlbCameraSession(camera, controls)
  assert.equal(session.initialize(frame, 1), true)
  return { camera, controls, session }
}
function snapshot(camera, controls) {
  return { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(),
    zoom: camera.zoom, target: controls.target.toArray(), near: camera.near, far: camera.far,
    minDistance: controls.minDistance, maxDistance: controls.maxDistance }
}

test('morph/bounds updates and viewport resize preserve free orbit, zoom, target and clipping', () => {
  const { camera, controls, session } = setup()
  controls.target.add(new Vector3(.1, .05, -.03))
  camera.position.copy(controls.target).add(new Vector3(1.1, .4, -.8))
  camera.zoom = 1.7; camera.updateProjectionMatrix(); controls.update()
  const before = snapshot(camera, controls)
  for (let i = 0; i < 30; i++) {
    assert.equal(session.initialize(i % 2 ? frame : changedFrame, i % 2 ? .5 : 2), false)
    assert.deepEqual(snapshot(camera, controls), before)
  }
  controls.dispose()
})

test('selected front/side/back keep radius, optical zoom and target; repeated selection overrides mouse orbit', () => {
  const { camera, controls, session } = setup()
  const model = new Group()
  controls.target.add(new Vector3(.08, -.05, .02))
  camera.zoom = 1.5
  for (const angle of [0, 90, 180, 180, 0]) {
    camera.position.copy(controls.target).add(new Vector3(.9, .2, -.7))
    controls.update()
    const distance = camera.position.distanceTo(controls.target)
    const target = controls.target.toArray()
    model.rotation.y = angle * Math.PI / 180
    session.showSelectedView()
    assert.ok(Math.abs(camera.position.distanceTo(controls.target)-distance) < 1e-10)
    assert.deepEqual(controls.target.toArray(), target)
    assert.equal(camera.zoom, 1.5)
    assert.ok(Math.abs(camera.position.x-controls.target.x) < 1e-10)
    assert.ok(camera.position.z > controls.target.z)
    const before = snapshot(camera, controls)
    session.initialize(changedFrame, 1)
    assert.deepEqual(snapshot(camera, controls), before)
    assert.equal(model.rotation.y, angle*Math.PI/180)
  }
  controls.dispose()
})

test('only a new model session permits automatic reframing', () => {
  const {camera, controls, session} = setup()
  camera.position.set(1, 2, 1); camera.zoom=2; controls.update()
  assert.equal(session.initialize(changedFrame,1),false)
  const next = createGlbCameraSession(camera,controls)
  assert.equal(next.initialize(changedFrame,1),true)
  assert.equal(camera.zoom,1)
  assert.deepEqual(controls.target.toArray(),changedFrame.bounds.getCenter(new Vector3()).toArray())
  controls.dispose()
})
