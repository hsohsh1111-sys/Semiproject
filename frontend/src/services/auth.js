import { API_BASE } from './api.js'

export const AUTH_CHANGE_EVENT = 'onfit-auth-change'

export function getAccessToken() {
  let saved
  try {
    saved = JSON.parse(window.sessionStorage.getItem('onfit:auth-session:v1') || 'null')
  } catch {
    return null
  }
  if (typeof saved?.access_token !== 'string' || !saved.access_token
      || !Number.isFinite(saved.expires_at) || saved.expires_at <= Date.now()) {
    return null
  }
  return saved.access_token
}

export function notifyAuthenticationChanged() {
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT))
}

export async function authenticateAccount({ email, password, name }, signup = false, fetcher = fetch) {
  async function request(path, body, token) {
    const response = await fetcher(`${API_BASE}/auth/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const data = await response.json()
    if (!response.ok) {
      throw new Error(typeof data.detail === 'string'
        ? data.detail
        : Array.isArray(data.detail)
          ? data.detail.map(item => item.msg).join('; ')
          : '인증 요청을 처리하지 못했습니다.')
    }
    return data
  }

  if (signup) await request('signup', { email, password, name })
  const token = await request('login', { email, password })
  if (!token.access_token) throw new Error('로그인 토큰을 받지 못했습니다.')
  const user = await request('me', null, token.access_token)
  return { ...token, user }
}
