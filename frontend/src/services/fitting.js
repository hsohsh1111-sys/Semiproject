import { API_BASE } from './api.js'

async function request(path, token, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (!response.ok) {
    const error = new Error(response.status === 401 ? '로그인이 만료되었거나 계정 정보가 맞지 않습니다.'
      : response.status === 503 ? '백엔드 인증·DB 설정이 필요합니다.' : '요청에 실패했습니다. 입력값과 서버 상태를 확인해 주세요.')
    error.status = response.status
    throw error
  }
  return response.json()
}

export const fittingLogin = (email, password) => request('/auth/login', null, { email, password })
export const getFittingAccount = (token) => request('/auth/me', token)
export const getFittingDefaults = (token) => request('/fitting/defaults', token)
export const getFittingPreview = (token, measurements, garmentOptions = {}) =>
  request('/fitting/preview', token, { ...measurements, ...garmentOptions })

export async function getFittingApiStatus() {
  const healthUrl = new URL(API_BASE, globalThis.location?.origin ?? 'http://localhost:8000').origin + '/health'
  const authUrl = `${API_BASE}/auth/status`
  const [healthResult, authResult] = await Promise.all([
    fetch(healthUrl).then(async response => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
      .then(data => ({ available: data.status === 'ok', service: data.service }))
      .catch(() => ({ available: false })),
    fetch(authUrl).then(async response => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
      .then(data => ({ configured: data.status === 'configured' }))
      .catch(() => ({ configured: null })),
  ])
  return { ...healthResult, ...authResult }
}

const SESSION_PREFIX = 'onfit:fitting-measurements:v1:'
const MEASUREMENT_RANGES = {
  height_cm: [100, 230], weight_kg: [20, 300], shoulder_width_cm: [25, 65], waist_circumference_cm: [45, 180],
  chest_circumference_cm: [55, 180], abdomen_protrusion_cm: [0, 20], pelvis_width_cm: [20, 60],
  hip_circumference_cm: [55, 180], thigh_circumference_cm: [25, 100],
}

function sessionKey(userId) { return `${SESSION_PREFIX}${userId}` }

export function readFittingMeasurements(userId) {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(sessionKey(userId)))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const restored = {}
    for (const [key, [min, max]] of Object.entries(MEASUREMENT_RANGES)) {
      const value = parsed[key]
      if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) return null
      restored[key] = value
    }
    return restored
  } catch { return null }
}

export function writeFittingMeasurements(userId, values) {
  try {
    const safe = {}
    for (const [key, [min, max]] of Object.entries(MEASUREMENT_RANGES)) {
      const value = values[key]
      if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) return false
      safe[key] = value
    }
    sessionStorage.setItem(sessionKey(userId), JSON.stringify(safe))
    return true
  } catch { return false }
}

export function clearFittingMeasurements(userId) {
  try { sessionStorage.removeItem(sessionKey(userId)) } catch { /* Storage may be disabled by the browser. */ }
}

// Same geometric unit conversion as the server, for explicitly labeled local previews.
export function localParameters(values) {
  return { height_m: values.height_cm / 100, shoulder_width_m: values.shoulder_width_cm / 100,
    waist_radius_m: values.waist_circumference_cm / (200 * Math.PI),
    chest_radius_m: (values.chest_circumference_cm ?? 95) / (200 * Math.PI),
    abdomen_protrusion_m: (values.abdomen_protrusion_cm ?? 0) / 100,
    pelvis_width_m: (values.pelvis_width_cm ?? 30) / 100,
    hip_radius_m: (values.hip_circumference_cm ?? 95) / (200 * Math.PI),
    thigh_radius_m: (values.thigh_circumference_cm ?? 50) / (200 * Math.PI) }
}
