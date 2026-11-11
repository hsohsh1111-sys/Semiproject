import { printGeometry, createPrintUniforms, attachPrintShader, updatePrintUniforms } from './productDesign.js'
import { applyProductSize } from './productSizing.js'
import { measurementComparison } from './tshirtMeasurements.js'
import { Vector3 } from 'three'
// A comparison template, never a reconstruction of the product's cut or fabric.
export function createProductAppearance(scene) {
  const originals = new Map(), clones = new Map()
  const geometries = new Map(), uniforms = createPrintUniforms()
  let printInstalled = false
  let disposed = false
  let calibration = null
  function ownGeometry() {
    scene.traverse(mesh => {
      if (!mesh.isMesh || geometries.has(mesh)) return
      geometries.set(mesh, mesh.geometry)
      mesh.geometry = printGeometry(mesh.geometry)
    })
  }
  scene.traverse(mesh => {
    if (!mesh.isMesh || !mesh.material) return
    originals.set(mesh, mesh.material)
    const prepare = source => {
      if (!clones.has(source)) {
        const material = source.clone()
        // Authored MPFB graphics are not the selected shop product's graphics.
        for (const map of ['map', 'normalMap', 'bumpMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap', 'aoMap']) material[map] = null
        material.color.set('#808080'); material.roughness = .9; material.metalness = 0
        material.transparent = false; material.opacity = 1; material.emissive?.set(0)
        material.needsUpdate = true
        clones.set(source, material)
      }
      return clones.get(source)
    }
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(prepare) : prepare(mesh.material)
  })
  return {
    measureSize(size) {
      if (!size || disposed) return null
      const [mesh, source] = Array.from(geometries.entries())[0] ?? []
      if (!mesh) return null
      return { productKey: size.table.productKey, sizeName: size.name,
        ...measurementComparison(size, mesh.geometry, source, index => mesh.getVertexPosition(index,new Vector3()).toArray()), calibration }
    },
    setSize(size) {
      if (disposed) return
      if (size) ownGeometry()
      geometries.forEach((source, mesh) => { calibration = applyProductSize(mesh.geometry, source, size) })
    },
    setDesign(design) {
      if (disposed) return
      if (design?.texture && !printInstalled) {
        ownGeometry()
        clones.forEach(material => attachPrintShader(material, uniforms))
        printInstalled = true
      }
      updatePrintUniforms(uniforms, design)
    },
    setColor(hex) {
      if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error('상품 색상값을 확인하세요.')
      if (!disposed) clones.forEach(material => material.color.set(hex))
    },
    dispose() {
      if (disposed) return
      originals.forEach((material, mesh) => { mesh.material = material })
      geometries.forEach((geometry, mesh) => { mesh.geometry.dispose(); mesh.geometry = geometry })
      clones.forEach(material => material.dispose()); disposed = true
    },
  }
}
