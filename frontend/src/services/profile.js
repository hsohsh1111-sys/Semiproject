import { API_BASE } from './api.js'

async function request(token, method, values, fetcher) {
  if (!token) throw new Error('로그인 후 저장해 주세요.')
  const response = await fetcher(`${API_BASE}/profiles/me`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(values ? { 'Content-Type': 'application/json' } : {}) },
    ...(values ? { body: JSON.stringify(values) } : {}),
  })
  if (method === 'GET' && response.status === 404) return null
  if (!response.ok) {
    const error = new Error(response.status === 401 ? '로그인이 만료되었습니다. 다시 로그인해 주세요.'
      : response.status === 409 ? '프로필이 변경되었습니다. 페이지를 다시 열어 주세요.'
        : '프로필 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.')
    error.status = response.status
    throw error
  }
  return response.json()
}

export const loadProfile = (token, fetcher = fetch) => request(token, 'GET', null, fetcher)
// PATCH preserves height, inbody-independent values and other profile fields.
export const saveStyleProfile = (token, values, exists, fetcher = fetch) =>
  request(token, exists ? 'PATCH' : 'PUT', {
    preferred_style: values.style,
    preferred_fit: values.fit,
    preferred_colors: [values.color],
  }, fetcher)
