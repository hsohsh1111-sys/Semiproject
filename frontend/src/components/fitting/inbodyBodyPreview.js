// Python owns continuous estimation; JS only validates and applies its output.
export function applyInbodyBodyPreview(preview) {
  const values = preview?.personalized_measurements
  const composition = preview?.composition
  const ranges = {
    height_cm: [100, 230], weight_kg: [20, 300], shoulder_width_cm: [25, 65],
    chest_circumference_cm: [55, 180], waist_circumference_cm: [45, 180],
    abdomen_protrusion_cm: [0, 20], pelvis_width_cm: [20, 60],
    hip_circumference_cm: [55, 180], thigh_circumference_cm: [25, 100],
  }
  if (preview?.approximate !== true || !values || composition?.kind !== 'inbody'
      || !Object.entries(ranges).every(([key, [min, max]]) => Number.isFinite(values[key]) && values[key] >= min && values[key] <= max)
      || !['build_lean', 'build_muscular', 'abdominal_definition'].every(key => Number.isFinite(composition[key]) && composition[key] >= 0)
      || composition.build_lean + composition.build_muscular > 1.000001 || composition.abdominal_definition > 0.25
      || values.height_cm !== preview.measurements?.height_cm || values.weight_kg !== preview.measurements?.weight_kg) {
    throw new Error('확인한 인바디 체형 계산값이 필요합니다.')
  }
  return { values: { ...values }, bodyBuild: { ...composition } }
}
