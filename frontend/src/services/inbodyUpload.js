import { API_BASE } from './api.js'

export async function getInbodyBodyPreview(token, measurements, signal) {
  const response = await fetch(`${API_BASE}/inbody/body-preview`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(measurements), signal,
  })
  if (!response.ok) {
    const error = new Error(response.status === 401 ? '다시 로그인해 주세요.'
      : response.status === 422 ? '키·체중·골격근량·체지방률을 확인해 주세요.' : '체형 제안을 불러오지 못했습니다.')
    error.status = response.status
    throw error
  }
  const data = await response.json()
  if (data.composition?.kind !== 'inbody' || !data.personalized_measurements || data.approximate !== true || !data.measurements
      || !Array.isArray(data.reasons) || !Array.isArray(data.limitations)) throw new Error('체형 응답 형식이 올바르지 않습니다.')
  return data
}

export async function extractInbody(token, file, signal) {
  if (!file || file.size === 0) throw new Error('내용이 있는 파일을 선택해 주세요.')
  if (file.size > 10 * 1024 * 1024) throw new Error('파일은 10MiB 이하여야 합니다.')
  const form = new FormData()
  form.append('file', file)
  const response = await fetch(`${API_BASE}/inbody/extract`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form, signal,
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const messages = { 401: '로그인이 만료되었습니다. 다시 로그인해 주세요.',
      413: '파일 용량·페이지 수·해상도 제한을 초과했습니다.',
      415: 'PDF, PNG, JPEG 파일을 선택해 주세요.',
      422: '파일을 읽지 못했습니다. 손상·암호화 여부와 화질을 확인해 주세요.',
      503: '인증·DB 또는 OCR 엔진 설정이 필요합니다.' }
    const error = new Error(typeof data?.detail === 'string' ? data.detail : messages[response.status] || '추출 요청에 실패했습니다.')
    error.status = response.status
    throw error
  }
  if (!data?.values || !Array.isArray(data.warnings)) throw new Error('추출 응답 형식을 확인할 수 없습니다.')
  return data
}

export async function saveConfirmedInbody(token, record, signal) {
  const response = await fetch(`${API_BASE}/inbody/records`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(record), signal,
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const messages = { 401: '로그인이 만료되었습니다. 다시 로그인해 주세요.',
      422: '필수 수치와 측정 시각을 확인해 주세요.', 503: '인증 또는 DB 설정이 필요합니다.' }
    const error = new Error(typeof data?.detail === 'string' ? data.detail : messages[response.status] || '인바디 기록 저장에 실패했습니다.')
    error.status = response.status
    throw error
  }
  return data
}

export async function listInbodyRecords(token, signal) {
  const response = await fetch(`${API_BASE}/inbody/records?limit=20&offset=0`, {
    headers: { Authorization: `Bearer ${token}` }, signal,
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(response.status === 401 ? '로그인이 만료되었습니다.' : '인바디 기록을 불러오지 못했습니다.')
    error.status = response.status
    throw error
  }
  if (!Array.isArray(data)) throw new Error('인바디 기록 응답 형식이 올바르지 않습니다.')
  return data
}
