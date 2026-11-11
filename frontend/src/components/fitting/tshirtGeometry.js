import { BufferGeometry, Float32BufferAttribute, ShapeUtils, Vector2, Vector3 } from 'three'
import { garmentRings } from './silhouette.js'

export const SHIRT_PHOTO = '/textures/nike-shirt-reference.png'
// The user's original photograph and crop are unchanged.
export const LOGO_RECT = [128 / 358, 1 - 148 / 349, 237 / 358, 1 - 87 / 349]
const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t) }
const mix = (a, b, t) => a * (1 - t) + b * t
const softMax = (a, b, k) => (a + b + Math.sqrt((a - b) ** 2 + k * k)) / 2

function interpolate(rows, y, column) {
  if (y <= rows[0][1]) return rows[0][column]
  for (let i = 1; i < rows.length; i++) {
    if (y <= rows[i][1]) {
      const t = smooth((y - rows[i - 1][1]) / (rows[i][1] - rows[i - 1][1]))
      return mix(rows[i - 1][column], rows[i][column], t)
    }
  }
  return rows.at(-1)[column]
}

// Round only sewn corners. Cuffs, neck and hem retain explicit open boundaries.
function roundedOutline(points, stitch, unit) {
  const output = [], sewing = []
  const append = (p, sewn) => { output.push(p); sewing.push(sewn) }
  for (let i = 0; i < points.length; i++) {
    const p = points[i], prev = points[(i + points.length - 1) % points.length], next = points[(i + 1) % points.length]
    const a = Math.hypot(p[0] - prev[0], p[1] - prev[1]), b = Math.hypot(p[0] - next[0], p[1] - next[1])
    const trim = stitch[(i + points.length - 1) % points.length] && stitch[i]
      ? Math.min(.032 * unit, a * .3, b * .3) : 0
    if (!trim) {
      append(p, stitch[i])
      if (!stitch[i] && b > .09 * unit) {
        const outward = [(next[1] - p[1]) / b, -(next[0] - p[0]) / b]
        for (let j = 1; j < 8; j++) {
          const t = j / 8, bow = Math.sin(Math.PI * t) * Math.min(.004 * unit, b * .03)
          append(p.map((v, axis) => mix(v, next[axis], t) + outward[axis] * bow), false)
        }
      }
      continue
    }
    const before = p.map((v, axis) => mix(v, prev[axis], trim / a))
    const after = p.map((v, axis) => mix(v, next[axis], trim / b))
    for (let j = 0; j <= 6; j++) {
      const t = j / 6
      append(p.map((v, axis) => (1 - t) ** 2 * before[axis] + 2 * (1 - t) * t * v + t * t * after[axis]),
        j === 6 ? stitch[i] : true)
    }
  }
  return { points: output, stitch: sewing }
}

// Also used for topology verification: a shirt has neck, hem and two cuff loops.
export function boundaryLoops(geometry) {
  const edges = new Map(), index = geometry.index.array
  for (let i = 0; i < index.length; i += 3) for (let j = 0; j < 3; j++) {
    const a = index[i + j], b = index[i + (j + 1) % 3], key = [Math.min(a, b), Math.max(a, b)].join(',')
    const edge = edges.get(key)
    if (edge) edge.count++
    else edges.set(key, { a, b, count: 1 })
  }
  const adjacent = new Map()
  for (const { a, b, count } of edges.values()) if (count === 1) {
    if (!adjacent.has(a)) adjacent.set(a, [])
    if (!adjacent.has(b)) adjacent.set(b, [])
    adjacent.get(a).push(b); adjacent.get(b).push(a)
  }
  const invalid = [...adjacent.entries()].filter(([, v]) => v.length !== 2)
  if (invalid.length) throw new Error('Shirt boundary contains a gap or T-junction: ' + JSON.stringify(invalid.slice(0, 4).map(([id, links]) => ({ id, links, point: new Vector3().fromBufferAttribute(geometry.attributes.position, id).toArray() }))))
  const remaining = new Set(adjacent.keys()), loops = [], position = geometry.attributes.position
  while (remaining.size) {
    const start = remaining.values().next().value, loop = []
    let previous = -1, current = start
    do {
      loop.push(new Vector3().fromBufferAttribute(position, current))
      remaining.delete(current)
      const next = adjacent.get(current).find(v => v !== previous)
      previous = current; current = next
      if (loop.length > adjacent.size) throw new Error('Shirt boundary is not closed')
    } while (current !== start)
    loops.push(loop)
  }
  return loops
}

// Render-only geometry; backend sizes and the existing garment preview remain
// authoritative. No manufacturer dimensions or cloth physics are inferred here.
export function createTShirt(parameters, fit = 'regular', calculatedGarment = null, surface = null) {
  const h = surface?.bounds?.getSize(new Vector3()).y ?? parameters.height_m, unit = h / 1.7
  const rings = garmentRings(parameters, fit, calculatedGarment).filter(r => r[0] !== 'base')
    .map(r => [r[0], r[1] / parameters.height_m * h, ...r.slice(2)])
  const row = name => rings.find(r => r[0] === name), body = surface?.points ?? []
  const centerPoints = body.filter(p => Math.abs(p.x) < .1 * unit && p.y > .55 * h && p.y < .77 * h)
  const centerZ = centerPoints.length
    ? (Math.max(...centerPoints.map(p => p.z)) + Math.min(...centerPoints.map(p => p.z))) / 2 : 0
  const hemY = h * .47, shoulderY = h * .82, neckY = h * .85
  const shoulder = Math.max(row('shoulder')[2], .215 * unit), neck = .064 * unit
  const bodyWidth = y => Math.max(0, ...body.filter(p => Math.abs(p.y - y) < .018 * unit && Math.abs(p.x) < .25 * unit).map(p => Math.abs(p.x)))
  const hem = Math.max(row('pelvis')[2], row('hip')[2], bodyWidth(hemY) + .019 * unit)
  const armpit = Math.min(Math.max(row('chest')[2], .16 * unit), shoulder + .01 * unit)
  const widthRows = [
    ['hem', hemY, hem],
    ['pelvis', .50 * h, Math.max(row('pelvis')[2], bodyWidth(.50 * h) + .019 * unit)],
    ['waist', .56 * h, Math.max(row('waist')[2], bodyWidth(.56 * h) + .019 * unit)],
    ['abdomen', .60 * h, Math.max(row('abdomen')[2], bodyWidth(.60 * h) + .019 * unit)],
    ['chest', .69 * h, Math.max(row('chest')[2], bodyWidth(.69 * h) + .019 * unit)],
    ['armpit', .72 * h, armpit], ['shoulder', shoulderY, shoulder],
  ]
  const widthAt = y => interpolate(widthRows, y, 2)
  const cuffX = shoulder + .10 * unit, cuffY = shoulderY - .145 * unit
  const cuffDX = .052 * unit, cuffDY = .043 * unit, cuffRadius = Math.hypot(cuffDX, cuffDY)
  const outline = drop => {
    const left = [[-neck, neckY], [-shoulder, shoulderY], [-cuffX - cuffDX, cuffY + cuffDY],
      [-cuffX + cuffDX, cuffY - cuffDY], [-armpit, .72 * h],
      ...widthRows.slice(0, 5).reverse().map(r => [-r[2], r[1]])]
    const right = left.slice().reverse().map(([x, y]) => [-x, y])
    const p = [...left, ...right]
    const stitch = p.map(() => true)
    stitch[2] = false; stitch[left.length - 1] = false; stitch[p.length - 4] = false
    stitch[p.length - 1] = false
    for (let i = 1; i < 24; i++) {
      const a = i / 24 * Math.PI
      p.push([neck * Math.cos(a), neckY - Math.sin(a) * drop]); stitch.push(false)
    }
    return roundedOutline(p, stitch, unit)
  }
  const front = outline(.073 * unit), back = outline(.014 * unit)
  const cell = .025 * unit, bins = new Map()
  for (const p of body) {
    const key = [Math.floor(p.x / cell), Math.floor(p.y / cell)].join(',')
    if (!bins.has(key)) bins.set(key, [])
    bins.get(key).push(p)
  }
  const skinDepth = (x, y, sign) => {
    const ix = Math.floor(x / cell), iy = Math.floor(y / cell)
    let sum = 0, weight = 0
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
      for (const p of bins.get([ix + dx, iy + dy].join(',')) ?? []) {
        const r = ((p.x - x) ** 2 + (p.y - y) ** 2) / (cell * 1.5) ** 2
        if (r >= 1) continue
        const w = (1 - r) ** 3
        sum += w * Math.exp(sign * (p.z - centerZ) / (.012 * unit)); weight += w
      }
    }
    return weight ? centerZ + sign * (.012 * unit * Math.log(sum / weight) + .021 * unit) : null
  }
  const depthCache = new Map()
  const depth = (x, y, isFront) => {
    const cacheKey = [x.toFixed(8), y.toFixed(8), isFront].join(',')
    if (depthCache.has(cacheKey)) return depthCache.get(cacheKey)
    const sign = isFront ? 1 : -1, width = widthAt(y)
    const torsoFactor = Math.sqrt(Math.max(0, 1 - Math.min(1, Math.abs(x) / width) ** 2))
    const torso = interpolate(rings, y, isFront ? 3 : 4) * torsoFactor
    const side = x < 0 ? -1 : 1
    const q = ((side * x - cuffX) * cuffDX + (y - cuffY) * cuffDY) / (cuffRadius * cuffRadius)
    const sleeve = .077 * unit * Math.sqrt(Math.max(0, 1 - Math.min(1, Math.abs(q)) ** 2))
    const sleeveBlend = smooth((Math.abs(x) - armpit + .035 * unit) / (.11 * unit))
      * smooth((y - .70 * h) / (.055 * h))
    let z = centerZ + sign * mix(torso, sleeve, sleeveBlend)
    const support = skinDepth(x, y, sign)
    if (support !== null) {
      const blend = 1 - sleeveBlend * smooth((Math.abs(q) - .78) / .22)
      const padded = sign * softMax(sign * z, sign * support, .003 * unit)
      z = mix(z, padded, blend)
    }
    depthCache.set(cacheKey, z)
    return z
  }
  const positions = [], indices = [], unique = new Map(), subdivisions = 2, steps = 2 ** subdivisions
  const vertex = (x, y, isFront) => {
    const z = depth(x, y, isFront), key = [x, y, z].map(v => v.toFixed(8)).join(',')
    if (!unique.has(key)) { unique.set(key, positions.length / 3); positions.push(x, y, z) }
    return unique.get(key)
  }
  const addTriangle = (a, b, c) => {
    if (a === b || b === c || c === a) return
    const va = new Vector3().fromArray(positions, a * 3), vb = new Vector3().fromArray(positions, b * 3), vc = new Vector3().fromArray(positions, c * 3)
    if (vb.sub(va).cross(vc.sub(va)).lengthSq() > 1e-20) indices.push(a, b, c)
  }
  const triangle = (a, b, c, isFront, level = subdivisions) => {
    if (level) {
      const mid = (p, q) => p.map((v, i) => (v + q[i]) / 2)
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a)
      triangle(a, ab, ca, isFront, level - 1); triangle(ab, b, bc, isFront, level - 1)
      triangle(ca, bc, c, isFront, level - 1); triangle(ab, bc, ca, isFront, level - 1)
    } else {
      const ids = [a, b, c].map(p => vertex(p[0], p[1], isFront))
      const positive = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0
      addTriangle(...(positive === isFront ? ids : ids.reverse()))
    }
  }
  for (const [panel, isFront] of [[front.points, true], [back.points, false]]) {
    for (const face of ShapeUtils.triangulateShape(panel.map(p => new Vector2(...p)), [])) {
      triangle(...face.map(i => panel[i]), isFront)
    }
  }
  // Front/back share subdivided boundary vertices. Winding follows each edge's
  // outward XY normal instead of applying the same orientation to both sides.
  for (let edge = 0; edge < front.points.length; edge++) if (front.stitch[edge]) {
    const next = (edge + 1) % front.points.length
    for (let i = 0; i < steps; i++) {
      const point = (panel, t) => panel[edge].map((v, a) => mix(v, panel[next][a], t))
      const afp = point(front.points, i / steps), bfp = point(front.points, (i + 1) / steps)
      const abp = point(back.points, i / steps), bbp = point(back.points, (i + 1) / steps)
      const af = vertex(...afp, true), bf = vertex(...bfp, true), ab = vertex(...abp, false), bb = vertex(...bbp, false)
      addTriangle(af, ab, bf); addTriangle(bf, ab, bb)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingBox()
  const loops = boundaryLoops(geometry)
  const mean = (points, axis) => points.reduce((s, p) => s + p[axis], 0) / points.length
  const sorted = loops.slice().sort((a, b) => mean(a, 'y') - mean(b, 'y'))
  const trims = { hem: sorted[0], neck: sorted.at(-1),
    leftCuff: sorted.slice(1, -1).find(p => mean(p, 'x') < 0),
    rightCuff: sorted.slice(1, -1).find(p => mean(p, 'x') > 0) }
  if (loops.length !== 4 || Object.values(trims).some(p => !p)) throw new Error('Expected neck, hem and two sleeve openings')
  // Keep the printed artwork's physical aspect ratio and size stable as body
  // radii change; the small patch bends with the chest without stretching its UVs.
  const logoPositions = [], uvs = [], logoIndices = [], columns = 20, rows = 12, logoWidth = .21 * unit
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= columns; i++) {
    const u = i / columns, v = j / rows
    const x = (u - .5) * logoWidth, y = shoulderY - .165 * unit + (v - .5) * logoWidth * 61 / 109
    logoPositions.push(x, y, depth(x, y, true) + .002 * unit)
    uvs.push(mix(LOGO_RECT[0], LOGO_RECT[2], u), mix(LOGO_RECT[1], LOGO_RECT[3], v))
    if (i < columns && j < rows) {
      const a = j * (columns + 1) + i, b = a + 1, c = a + columns + 1
      logoIndices.push(a, b, c, b, c + 1, c)
    }
  }
  const logo = new BufferGeometry()
  logo.setAttribute('position', new Float32BufferAttribute(logoPositions, 3))
  logo.setAttribute('uv', new Float32BufferAttribute(uvs, 2)); logo.setIndex(logoIndices); logo.computeVertexNormals()
  return { geometry, logo, collar: trims.neck, trims, anchors: { hemY, shoulderY, shoulder, hem, cuffX, cuffY, neckY } }
}
