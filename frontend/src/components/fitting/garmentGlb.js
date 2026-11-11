import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone } from 'three/addons/utils/SkeletonUtils.js'

// Author against the same body reference in Blender. These optional corrections
// are in the exported model's coordinates, before the common mannequin layout.
export const TSHIRT_GLB = {
  slot: 'top',
  url: '/models/ONFIT_TShirt.glb',
  position: [0, 0, 0],
  rotation: [0, 0, 0], // radians
  scale: [1, 1, 1],
}

export const TSHIRT_MORPH_GLB = { ...TSHIRT_GLB, url: '/models/ONFIT_TShirt_BodyBuild_v10.glb' }
export const LONG_SLEEVE_GLB = { ...TSHIRT_GLB, url: '/models/ONFIT_LongSleeve_v1.glb', tintable: true, preservePattern: false }
export const LONG_SLEEVE_MORPH_GLB = { ...LONG_SLEEVE_GLB, url: '/models/ONFIT_LongSleeve_BodyBuild_v10.glb' }
export const HOODED_JACKET_GLB = {
  ...TSHIRT_GLB, url: '/models/ONFIT_HoodedJacket_v1.glb', tintable: true, preservePattern: false,
  supportsMorphs: false, supportsOuter: false,
}
export const HOODED_JACKET_MORPH_GLB = {
  ...HOODED_JACKET_GLB, url: '/models/ONFIT_HoodedJacket_BodyBuild_v10.glb', supportsMorphs: true,
}

export function getTopGarment(kind, modelType = 'test') {
  if (modelType === 'female') return kind === 'hooded_jacket' ? FEMALE_HOODED_JACKET_GLB : kind === 'long_sleeve' ? FEMALE_LONG_SLEEVE_GLB : FEMALE_TSHIRT_GLB
  const morphed = modelType === 'test' || modelType === 'female'
  if (kind === 'hooded_jacket') return morphed ? HOODED_JACKET_MORPH_GLB : HOODED_JACKET_GLB
  if (kind === 'long_sleeve') return morphed ? LONG_SLEEVE_MORPH_GLB : LONG_SLEEVE_GLB
  return morphed ? TSHIRT_MORPH_GLB : TSHIRT_GLB
}
export const PANTS_GLB = {
  slot: 'bottom', url: '/models/ONFIT_Pants_BodyBuild_v10.glb', tintable: true, preservePattern: false, defaultColor: 'default',
  position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
}

// Each authored garment owns one independent slot. Future top choices replace
// only top; no placeholder models are registered for unimplemented garments.
export const GARMENT_SLOTS = Object.freeze(['top', 'bottom', 'outer', 'headwear'])
export const CAP_GLB = {
  slot: 'headwear', url: '/models/ONFIT_Cap_v1.glb', tintable: false, supportsMorphs: false,
  position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
}
export const NEUTRAL_CAP_GLB = {
  ...CAP_GLB, url: '/models/ONFIT_Cap_Neutral_v1.glb', tintable: true,
  colorProfile: 'cap', defaultColor: 'black',
}
export const OUTER_GLB = {
  slot: 'outer', url: '/models/ONFIT_Outer_BodyBuild_v10.glb', tintable: true, preservePattern: false, defaultColor: 'default',
  position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
}

// Female-specific refits retain their own URLs/geometry; all slots still use
// the same body parameter contract and independent appearance state.
export const FEMALE_TSHIRT_GLB = {...TSHIRT_MORPH_GLB, url:'/models/ONFIT_TShirt_Female_v6.glb'}
export const FEMALE_LONG_SLEEVE_GLB = {...LONG_SLEEVE_MORPH_GLB, url:'/models/ONFIT_LongSleeve_Female_v6.glb'}
export const FEMALE_HOODED_JACKET_GLB = {...HOODED_JACKET_MORPH_GLB, url:'/models/ONFIT_HoodedJacket_Female_v5.glb'}
export const FEMALE_PANTS_GLB = {...PANTS_GLB, url:'/models/ONFIT_Pants_Female_v5.glb'}
export const FEMALE_OUTER_GLB = {...OUTER_GLB, url:'/models/ONFIT_Outer_Female_v5.glb'}
export const FEMALE_SKIRT_GLB = {...FEMALE_PANTS_GLB, url:'/models/ONFIT_Skirt_Female_v3.glb'}
export const getBottomGarment = (modelType, kind='pants') => modelType === 'female' ? kind === 'skirt' ? FEMALE_SKIRT_GLB : FEMALE_PANTS_GLB : PANTS_GLB
export const getOuterGarment = modelType => modelType === 'female' ? FEMALE_OUTER_GLB : OUTER_GLB

export function applyGarmentMorphs(scene, defaults, weights, url) {
  scene.traverse(mesh => {
    const base = defaults.get(mesh.uuid)
    if (!base) return
    mesh.morphTargetInfluences.splice(0, base.length, ...base)
    const targets = url === FEMALE_SKIRT_GLB.url ? ['waist_width','pelvis_width','hip_volume','abdomen_front']
      : [OUTER_GLB.url, LONG_SLEEVE_MORPH_GLB.url, HOODED_JACKET_MORPH_GLB.url, FEMALE_OUTER_GLB.url, FEMALE_LONG_SLEEVE_GLB.url, FEMALE_HOODED_JACKET_GLB.url].includes(url)
      ? ['shoulder_width', 'chest_volume', 'waist_width', 'abdomen_front', 'pelvis_width']
      : [PANTS_GLB.url, FEMALE_PANTS_GLB.url, '/models/ONFIT_Pants_BodyMorph_v1.glb'].includes(url)
      ? ['waist_width', 'pelvis_width', 'hip_volume', 'thigh_girth']
      : [TSHIRT_MORPH_GLB.url, FEMALE_TSHIRT_GLB.url, '/models/ONFIT_TShirt_BodyMorph_v4.glb', '/models/ONFIT_TShirt_BodyMorph_v3.glb'].includes(url)
        ? ['abdomen_front', 'pelvis_width', 'shoulder_width', 'chest_volume', 'waist_width', 'hip_volume'] : []
    for (const name of targets) {
      const index = mesh.morphTargetDictionary?.[`garment_${name}`]
      if (index !== undefined && Number.isFinite(weights?.[name])) {
        mesh.morphTargetInfluences[index] = Math.max(name === 'abdomen_front' ? 0 : -1, Math.min(1, weights[name]))
      }
    }
    for(const name of ['lean','muscular']){
      const index=mesh.morphTargetDictionary?.['garment_build_'+name]
      if(index!==undefined&&Number.isFinite(weights?.['build_'+name]))mesh.morphTargetInfluences[index]=Math.max(0,Math.min(1,weights['build_'+name]))
    }
  })
}

export class GarmentLoadError extends Error {
  constructor(kind, message) { super(message); this.kind = kind }
}

export function createGarmentInstance(asset) {
  let meshes = 0
  asset.scene.traverse(object => {
    if (object.isMesh && object.geometry?.attributes.position?.count) meshes++
  })
  if (!meshes) throw new GarmentLoadError('error', '의류 GLB에 표시할 메시가 없습니다.')
  // Keep authored transforms, skinning, default morph weights, materials and UVs.
  // No height normalization, replacement material or generated geometry here.
  return clone(asset.scene)
}

export function disposeGarmentAsset(asset) {
  const resources = new Set()
  asset.scene.traverse(object => {
    if (object.geometry) resources.add(object.geometry)
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material) continue
      resources.add(material)
      for (const value of Object.values(material)) if (value?.isTexture) resources.add(value)
    }
  })
  resources.forEach(resource => resource.dispose())
}

export async function loadGarmentAsset(url, { signal, fetcher = globalThis.fetch,
  loader = new GLTFLoader(), baseUrl = globalThis.location?.href ?? 'http://localhost/' } = {}) {
  const resolved = new URL(url, baseUrl)
  const response = await fetcher(resolved.href, { signal })
  if (response.status === 404) throw new GarmentLoadError('missing', '의류 GLB 파일이 아직 준비되지 않았습니다.')
  if (!response.ok) throw new GarmentLoadError('error', `의류 GLB 요청 실패 (HTTP ${response.status})`)
  const data = await response.arrayBuffer()
  signal?.throwIfAborted()
  // SPA hosts may return index.html with HTTP 200 for an absent model.
  if (data.byteLength < 12 || new DataView(data).getUint32(0, true) !== 0x46546c67) {
    throw new GarmentLoadError('error', '올바른 GLB 파일을 읽지 못했습니다.')
  }
  const asset = await loader.parseAsync(data, new URL('.', resolved).href)
  try {
    signal?.throwIfAborted()
    const scene = createGarmentInstance(asset)
    return { asset, scene }
  } catch (error) {
    disposeGarmentAsset(asset)
    throw error
  }
}
