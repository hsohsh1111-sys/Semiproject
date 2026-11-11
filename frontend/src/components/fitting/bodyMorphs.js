import { applyMorphTest } from './glbGeometry.js'

export const BODY_MORPH_MODEL_URL = '/models/ONFIT_Human_BodyBuild_v11.glb'
export const FEMALE_BODY_MODEL_URL = '/models/ONFIT_Human_Female_v2.glb'
export const supportsBodyMorphs = url => url === BODY_MORPH_MODEL_URL || url === FEMALE_BODY_MODEL_URL
export const MUSCULAR_ABS_WEIGHT=.25

// Composition is a visual preset, separate from measured lengths/circumferences.
export function bodyBuildWeights(build='average') {
  if (build?.kind === 'inbody') {
    const safe = value => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
    const lean = safe(build.build_lean), muscular = safe(build.build_muscular)
    const scale = Math.max(1, lean + muscular)
    return { build_lean: lean / scale, build_muscular: muscular / scale }
  }
  return {build_lean:build==='slim'?1:0,build_muscular:build==='muscular'?1:0}
}

// Body-only contract shared by future garment slots; includes implemented and
// still-required targets. Availability is checked against the actual mesh.
export const BODY_MORPH_REQUIREMENTS = [
  ['shoulder_width_m', '어깨너비', 'shoulder_width'],
  ['chest_radius_m', '가슴둘레', 'chest_volume'],
  ['waist_radius_m', '허리둘레', 'waist_width'],
  ['abdomen_protrusion_m', '복부 전방 돌출', 'abdomen_front'],
  ['pelvis_width_m', '골반 폭', 'pelvis_width'],
  ['hip_radius_m', '엉덩이 볼륨', 'hip_volume'],
  ['thigh_radius_m', '허벅지 둘레', 'thigh_girth'],
  ['height_m', '키', 'ONFIT_Height'],
]

export const BODY_MORPH_FIELDS = ['abdomen_protrusion_m', 'pelvis_width_m', 'shoulder_width_m', 'chest_radius_m', 'waist_radius_m', 'hip_radius_m', 'thigh_radius_m']
const clamp = value => Math.max(-1, Math.min(1, value))
// Signed visual controls across the existing input ranges, around the example
// reference (42/95/80cm). The asset is not calibrated to exact circumferences.
function signedRange(value, minimum, reference, maximum) {
  if (!Number.isFinite(value)) return 0
  return clamp((value-reference)/(value<reference ? reference-minimum : maximum-reference))
}

// One visual-weight conversion shared by the body and independent garments.
export function bodyMorphWeights(parameters) {
  return {
    // Full validated slider range is 0..20cm. Apply the strength AFTER
    // normalization, so the response never plateaus within that range.
    abdomen_front: Number.isFinite(parameters?.abdomen_protrusion_m) ? Math.max(0, clamp(parameters.abdomen_protrusion_m / .20)) * .8 : 0,
    pelvis_width: signedRange(parameters?.pelvis_width_m, .20, .30, .60),
    shoulder_width: signedRange(parameters?.shoulder_width_m, .25, .42, .65),
    chest_volume: signedRange(parameters?.chest_radius_m, .55/(2*Math.PI), .95/(2*Math.PI), 1.80/(2*Math.PI)),
    waist_width: signedRange(parameters?.waist_radius_m, .45/(2*Math.PI), .80/(2*Math.PI), 1.80/(2*Math.PI)),
    hip_volume: signedRange(parameters?.hip_radius_m, .55/(2*Math.PI), .95/(2*Math.PI), 1.80/(2*Math.PI)),
    thigh_girth: signedRange(parameters?.thigh_radius_m, .25/(2*Math.PI), .50/(2*Math.PI), 1.00/(2*Math.PI)),
  }
}

// Explicitly calibrated ONLY for the authored v3 asset. This converts meters
// into visual weights, not measurements into medically estimated anatomy.
// Garment dimensions/slots are intentionally absent from this body contract.
export function applyBodyMorphs(scene, defaults, parameters, modelUrl, build='average') {
  applyMorphTest(scene, defaults, '', 0)
  const supported = new Set()
  const weights = bodyMorphWeights(parameters)
  if (supportsBodyMorphs(modelUrl)) scene.traverse(mesh => {
    if (!mesh.isMesh || !mesh.morphTargetInfluences) return
    const bindings = [
      ['abdomen_protrusion_m', 'abdomen_front'],
      ['pelvis_width_m', 'pelvis_width'],
      ['shoulder_width_m', 'shoulder_width'],
      ['chest_radius_m', 'chest_volume'],
      ['waist_radius_m', 'waist_width'],
      ['hip_radius_m', 'hip_volume'],
      ['thigh_radius_m', 'thigh_girth'],
    ]
    for (const [field, target] of bindings) {
      const index = mesh.morphTargetDictionary?.[target]
      if (index === undefined) continue
      supported.add(field)
      if (Number.isFinite(parameters?.[field])) mesh.morphTargetInfluences[index] = weights[target]
    }
    for(const [name,value] of Object.entries(bodyBuildWeights(build))){
      const index=mesh.morphTargetDictionary?.['body_'+name]
      if(index!==undefined)mesh.morphTargetInfluences[index]=value
    }
    const absIndex=mesh.morphTargetDictionary?.body_abdominal_definition
    if(absIndex!==undefined)mesh.morphTargetInfluences[absIndex]=modelUrl===BODY_MORPH_MODEL_URL
      ? build==='muscular' ? MUSCULAR_ABS_WEIGHT
        : build?.kind==='inbody'&&Number.isFinite(build.abdominal_definition)
          ? Math.max(0,Math.min(MUSCULAR_ABS_WEIGHT,build.abdominal_definition)) : 0
      : 0
  })
  return { supported: [...supported], unsupported: BODY_MORPH_REQUIREMENTS.map(([field]) => field).filter(field => !supported.has(field)) }
}
