// Separate from the tee's pattern-preserving shader: this derivative contains
// a plain white albedo, so ordinary PBR material color is sufficient.
export const CAP_COLORS = [
  { id: 'black', label: '블랙', hex: '#16181D' },
  { id: 'navy', label: '네이비', hex: '#1B2944' },
  { id: 'beige', label: '베이지', hex: '#C8B89D' },
  { id: 'charcoal', label: '차콜', hex: '#373B43' },
]

export function createCapAppearance(scene) {
  const originals = new Map(), clones = new Map()
  let disposed = false
  scene.traverse(mesh => {
    if (!mesh.isMesh || !mesh.material) return
    originals.set(mesh, mesh.material)
    const prepare = source => {
      if (!clones.has(source)) {
        const material = source.clone()
        material.color.set(CAP_COLORS[0].hex)
        clones.set(source, material)
      }
      return clones.get(source)
    }
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(prepare) : prepare(mesh.material)
  })
  return {
    setColor(id) {
      if (id === 'default') { if(!disposed)clones.forEach((material,source)=>material.color.copy(source.color)); return }
      const selected = CAP_COLORS.find(color => color.id === id)
      const hex=selected?.hex??(/^#[0-9a-f]{6}$/i.test(id??'')?id:null)
      if (!hex) throw new Error('지원하지 않는 모자 색상입니다.')
      if (!disposed) clones.forEach(material => material.color.set(hex))
    },
    dispose() {
      if (disposed) return
      originals.forEach((material, mesh) => { mesh.material = material })
      clones.forEach(material => material.dispose())
      disposed = true
    },
  }
}
