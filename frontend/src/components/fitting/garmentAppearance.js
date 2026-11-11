import { Color } from 'three'
import { createCapAppearance } from './capAppearance.js'
import { createProductAppearance } from './productAppearance.js'

export function createModelAppearance(scene, model) {
  if (model?.colorProfile === 'product') return createProductAppearance(scene)
  if (model?.colorProfile === 'cap') return createCapAppearance(scene)
  return model?.tintable === false ? null : createGarmentAppearance(scene, { preservePattern: model?.preservePattern !== false })
}

export const GARMENT_COLORS = [
  { id: 'white', label: '화이트', hex: '#F2F2F2' },
  { id: 'black', label: '블랙', hex: '#16181D' },
  { id: 'charcoal', label: '차콜', hex: '#373B43' },
  { id: 'navy', label: '네이비', hex: '#1B2944' },
]

// Calibrated to this MPFB asset's neutral ~208/255 sRGB cloth texture. Its orange
// and blue-grey MakeHuman print has chroma, so retain those original texels.
// This is not a universal logo detector for arbitrary future garment textures.
export const FABRIC_REFERENCE = new Color('#D0D0D0').r
export const PATTERN_CHROMA = [0.015, 0.05]
const fabricFragment = `
  #include <map_fragment>
  #ifdef USE_MAP
    float onfitChroma = max(sampledDiffuseColor.r, max(sampledDiffuseColor.g, sampledDiffuseColor.b))
      - min(sampledDiffuseColor.r, min(sampledDiffuseColor.g, sampledDiffuseColor.b));
    float onfitPatternWeight = smoothstep(${PATTERN_CHROMA[0]}, ${PATTERN_CHROMA[1]}, onfitChroma);
    float onfitLuminance = dot(sampledDiffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
    float onfitShade = clamp(onfitLuminance / ${FABRIC_REFERENCE.toFixed(8)}, 0.35, 1.18);
    diffuseColor.rgb = mix(onfitFabricColor * onfitShade, diffuseColor.rgb, onfitPatternWeight);
  #else
    diffuseColor.rgb = onfitFabricColor;
  #endif
`

export function createGarmentAppearance(scene, { preservePattern = true } = {}) {
  const fabricColor = { value: new Color(GARMENT_COLORS[0].hex) }
  const fabricEnabled = { value: 1 }
  const cloned = new Map(), originals = new Map()
  let disposed = false
  scene.traverse(mesh => {
    if (!mesh.isMesh || !mesh.material) return
    originals.set(mesh, mesh.material)
    const prepare = source => {
      if (cloned.has(source)) return cloned.get(source)
      const material = source.clone()
      const authoredCompile = source.onBeforeCompile
      const authoredKey = source.customProgramCacheKey()
      material.onBeforeCompile = (shader, renderer) => {
        authoredCompile.call(material, shader, renderer)
        shader.uniforms.onfitFabricColor = fabricColor
        shader.uniforms.onfitFabricEnabled = fabricEnabled
        const fragment = preservePattern ? fabricFragment : fabricFragment.replace('float onfitPatternWeight = smoothstep(0.015, 0.05, onfitChroma);', 'float onfitPatternWeight = 0.0;')
        shader.fragmentShader = 'uniform vec3 onfitFabricColor;\nuniform float onfitFabricEnabled;\n' +
          shader.fragmentShader.replace('#include <map_fragment>', fragment.replace('#include <map_fragment>', '#include <map_fragment>\nif(onfitFabricEnabled > 0.5) {') + '\n}')
      }
      material.customProgramCacheKey = () => `${authoredKey}|onfit-fabric-color-v2|${preservePattern}`
      // Keep maps, UVs, normal maps and their authored transforms. Only the
      // cloned garment's albedo shader and matte PBR parameters change.
      if (material.isMeshStandardMaterial) {
        material.roughness = Math.max(.84, Math.min(.95, source.roughness))
        material.metalness = 0
        material.emissive.set(0)
      }
      material.needsUpdate = true
      cloned.set(source, material)
      return material
    }
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(prepare) : prepare(mesh.material)
  })
  return {
    setColor(id) {
      if (id === 'default') {
        if (disposed) return
        fabricEnabled.value=0
        cloned.forEach((material,source)=>{material.roughness=source.roughness;material.metalness=source.metalness;material.emissive?.copy(source.emissive)})
        return
      }
      const selected = GARMENT_COLORS.find(color => color.id === id)
      const hex = selected?.hex ?? (/^#[0-9a-f]{6}$/i.test(id ?? '') ? id : null)
      if (!hex) throw new Error('지원하지 않는 티셔츠 색상입니다.')
      if (disposed) return
      fabricEnabled.value=1
      cloned.forEach(material=>{if(material.isMeshStandardMaterial){material.roughness=.9;material.metalness=0;material.emissive.set(0)}})
      // Stable uniform: changing color requires no fetch, geometry edit or shader
      // recompilation, including when the GPU program is already cached.
      fabricColor.value.set(hex)
    },
    dispose() {
      if (disposed) return
      originals.forEach((material, mesh) => { mesh.material = material })
      cloned.forEach(material => material.dispose())
      disposed = true
    },
  }
}
