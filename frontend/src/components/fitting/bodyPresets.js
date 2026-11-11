// User-requested visual examples, not measurements or fit recommendations.
export const BODY_PRESETS = Object.freeze({
  slim: Object.freeze({ label: '마른 체형', values: Object.freeze({ height_cm:175, weight_kg:62,
    shoulder_width_cm:39, chest_circumference_cm:86, waist_circumference_cm:70,
    abdomen_protrusion_cm:0, pelvis_width_cm:28, hip_circumference_cm:88, thigh_circumference_cm:46 }) }),
  average: Object.freeze({ label: '보통 체형', values: Object.freeze({ height_cm:175, weight_kg:70,
    shoulder_width_cm:42, chest_circumference_cm:95, waist_circumference_cm:80,
    abdomen_protrusion_cm:0, pelvis_width_cm:30, hip_circumference_cm:95, thigh_circumference_cm:50 }) }),
  muscular: Object.freeze({ label: '근육형 체형', values: Object.freeze({ height_cm:175, weight_kg:78,
    shoulder_width_cm:50, chest_circumference_cm:116, waist_circumference_cm:74,
    abdomen_protrusion_cm:0, pelvis_width_cm:30, hip_circumference_cm:102, thigh_circumference_cm:62 }) }),
})

// Visual presets must not overwrite the user's height or weight.
export function applyBodyPresetValues(preset,current) {
  return {...preset.values,height_cm:current.height_cm,weight_kg:current.weight_kg}
}
export function matchesBodyPreset(preset,values) {
  return Object.entries(preset.values).every(([field,value])=>['height_cm','weight_kg'].includes(field)||Number(values[field])===value)
}
