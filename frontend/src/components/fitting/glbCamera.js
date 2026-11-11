import { Vector3 } from 'three'
import { cameraFit } from './glbGeometry.js'

// One session per model/OrbitControls lifetime. Body geometry updates and
// viewport resize can request initialization without replacing a user's view.
export function createGlbCameraSession(camera, controls) {
  let initialized = false
  return {
    initialize(frame, aspect) {
      if (initialized) return false
      const fit = cameraFit(frame.bounds, aspect, camera.fov, .8, frame.points)
      camera.position.copy(fit.position)
      camera.near = fit.near
      camera.far = fit.far
      camera.zoom = 1
      camera.updateProjectionMatrix()
      controls.target.copy(fit.target)
      controls.minDistance = fit.distance * .15
      controls.maxDistance = fit.distance * 5
      controls.update()
      initialized = true
      return true
    },
    showSelectedView() {
      if (!initialized) return
      // The outer model group supplies the selected yaw. Reset only camera
      // direction, retaining orbit radius, optical zoom and the current target.
      const distance = camera.position.distanceTo(controls.target)
      camera.position.copy(controls.target).add(new Vector3(0, 0, distance))
      camera.up.set(0, 1, 0)
      controls.update()
    },
  }
}
