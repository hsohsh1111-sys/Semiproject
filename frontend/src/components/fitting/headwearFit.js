import { FEMALE_BODY_MODEL_URL } from './bodyMorphs.js'

// Authored GLB coordinates, before the shared proportional height transform.
// Preserve the cap's existing scalp overlap; female scalp is 6.94 cm lower.
const FEMALE_SCALP_OFFSET_Y = 1.5900158482052085 - 1.659431363048494
export function headwearForBody(model, bodyUrl) {
  if (!model || bodyUrl !== FEMALE_BODY_MODEL_URL) return model
  const [x, y, z] = model.position ?? [0, 0, 0]
  return { ...model, position: [x, y + FEMALE_SCALP_OFFSET_Y, z] }
}
