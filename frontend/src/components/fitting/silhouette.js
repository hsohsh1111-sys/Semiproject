// Illustrative design allowances, not manufacturer measurements or a size recommendation.
export const FITS = {
  slim: { label: '슬림핏', radialEase: .008 },
  regular: { label: '레귤러핏', radialEase: .025 },
  oversized: { label: '오버핏', radialEase: .055 },
}

export function bodyRings(p) {
  const { height_m: h, shoulder_width_m: shoulder, waist_radius_m: waist } = p
  const hip = p.hip_radius_m ?? 95 / (200 * Math.PI)
  const chest = p.chest_radius_m ?? 95 / (200 * Math.PI)
  const pelvis = (p.pelvis_width_m ?? .3) / 2
  const belly = p.abdomen_protrusion_m ?? 0
  // [name, height, lateral radius, front depth (+Z), back depth (-Z)].
  // Each control targets its own ring; neighboring rings interpolate linearly.
  return [
    ['base', h * .40, 0, 0, 0],
    ['hip', h * .44, hip, hip, hip],
    ['pelvis', h * .49, pelvis, .12, .12],
    ['waist', h * .56, waist, waist, waist],
    ['abdomen', h * .60, waist, waist + belly, waist],
    ['chest', h * .69, chest, chest, chest],
    ['shoulder', h * .77, shoulder / 2, .12, .12],
    ['neck', h * .83, .055, .055, .055],
    ['top', h * .83, 0, 0, 0],
  ]
}

export function thighEllipsoid(parameters, side) {
  const h = parameters.height_m
  const radius = parameters.thigh_radius_m ?? 50 / (200 * Math.PI)
  return {
    position: [side * .085, h * .325, 0],
    scale: [radius, h * .115, radius],
  }
}

export function garmentRings(parameters, fit, calculatedGarment = null) {
  const preset = FITS[fit]
  if (!preset) throw new Error('지원하지 않는 핏입니다.')
  const rings = bodyRings(parameters)
  if (calculatedGarment) {
    if (calculatedGarment.fit !== fit) throw new Error('서버 의류 계산 결과의 핏이 현재 선택과 다릅니다.')
    // Use server dimensions where provided. The server's chest radial allowance
    // supplies the matching radial offset for mesh axes with no dedicated field.
    const ease = calculatedGarment.chest_radius_m - parameters.chest_radius_m
    return rings.slice(0, -1).map(([name, y, x, front, back]) => {
      if (name === 'base' || name === 'hip') {
        return [name, y, calculatedGarment.hem_half_width_m,
          calculatedGarment.hip_radius_m, calculatedGarment.hip_radius_m]
      }
      if (name === 'pelvis') return [name, y, calculatedGarment.pelvis_half_width_m, front + ease, back + ease]
      if (name === 'waist') {
        return [name, y, calculatedGarment.waist_radius_m,
          calculatedGarment.waist_radius_m, calculatedGarment.waist_radius_m]
      }
      if (name === 'abdomen') {
        return [name, y, calculatedGarment.waist_radius_m,
          calculatedGarment.abdomen_front_depth_m, calculatedGarment.waist_radius_m]
      }
      if (name === 'chest') {
        return [name, y, calculatedGarment.chest_radius_m,
          calculatedGarment.chest_radius_m, calculatedGarment.chest_radius_m]
      }
      if (name === 'shoulder') {
        return [name, y, calculatedGarment.shoulder_half_width_m, front + ease, back + ease]
      }
      // Neck geometry has no server output parameter; retain its existing
      // rule-based shape while applying the allowance returned by the server.
      return [name, y, ...[x, front, back].map(radius => radius + ease)]
    })
  }
  return rings.slice(0, -1).map(([name, y, x, front, back], index) => {
    const radii = index === 0 ? rings[1].slice(2) : [x, front, back]
    return [name, y, ...radii.map(radius => radius + preset.radialEase)]
  })
}

export function ringPoint(ring, angle) {
  const [, y, radius, front, back] = ring
  const sine = Math.sin(angle)
  return [Math.cos(angle) * radius, y, sine * (sine >= 0 ? front : back)]
}

// This is the exact position buffer consumed by RingSurface/Three.js.
export function ringVertices(rings, segments = 64) {
  const vertices = new Float32Array(rings.length * (segments + 1) * 3)
  let offset = 0
  for (const ring of rings) {
    for (let i = 0; i <= segments; i++) {
      const point = ringPoint(ring, i / segments * Math.PI * 2)
      vertices[offset++] = point[0]
      vertices[offset++] = point[1]
      vertices[offset++] = point[2]
    }
  }
  return vertices
}

export function circumferenceEase(body, garment, fit) {
  const allowance = FITS[fit]?.radialEase
  if (allowance === undefined) throw new Error('지원하지 않는 핏입니다.')
  return {
    chest: ((garment.chest_radius_m ?? 95 / (200 * Math.PI)) + allowance - (body.chest_radius_m ?? 95 / (200 * Math.PI))) * 200 * Math.PI,
    waist: (garment.waist_radius_m + allowance - body.waist_radius_m) * 200 * Math.PI,
  }
}
