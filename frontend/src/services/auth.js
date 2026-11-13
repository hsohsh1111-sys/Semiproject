import { API_BASE } from './api.js'

export const AUTH_CHANGE_EVENT = 'onfit-auth-change'

export function getAccessToken() {
  let saved
  try {
    saved = JSON.parse(window.sessionStorage.getItem('onfit:auth-session:v1') || 'null')
  } catch {
    return null
  }
  if (saved?.auth_type === 'admin' || typeof saved?.access_token !== 'string' || !saved.access_token
      || !Number.isFinite(saved.expires_at) || saved.expires_at <= Date.now()) {
    return null
  }
  return saved.access_token
}

export function notifyAuthenticationChanged() {
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT))
}

export async function authenticateAccount({ email, username, phone_number, phone_collection_consent, sms_marketing_consent, terms_agreed, privacy_agreed, age_14_or_over, password, name, verification_token }, signup = false, fetcher = fetch) {
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

  if (signup) {
    const session = await request('signup-session', { email, username, phone_number, phone_collection_consent, sms_marketing_consent, terms_agreed, privacy_agreed, age_14_or_over, password, name, verification_token })
    if (!session.access_token || !Number.isInteger(session.user?.id)) throw new Error('가입 결과를 확인하지 못했습니다. 로그인 화면에서 다시 확인해 주세요.')
    return session
  }
  const token = await request('login', { email, password })
  if (!token.access_token) throw new Error('로그인 토큰을 받지 못했습니다.')
  const admin = token.auth_type === 'admin'
  const user = await request(admin ? 'admin/me' : 'me', null, token.access_token)
  if (admin && (user.is_admin !== true || typeof user.id !== 'string' || !user.id.startsWith('admin:'))) throw new Error('관리자 권한을 확인하지 못했습니다.')
  return { ...token, user }
}

export async function verifySignupEmail(action, payload, fetcher = fetch) {
  const response = await fetcher(`${API_BASE}/auth/email-verification/${action}`, {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload),
  })
  const data = await response.json()
  if (!response.ok) {
    const error = new Error(typeof data.detail === 'string' ? data.detail : '이메일 인증 정보를 확인해 주세요.')
    if (response.status === 429) {
      const retry = Number(response.headers?.get('Retry-After'))
      if (Number.isFinite(retry) && retry > 0) error.retryAfter = retry
    }
    throw error
  }
  return data
}
