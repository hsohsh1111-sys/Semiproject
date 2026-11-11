export const MAX_TRYON_BYTES = 8 * 1024 * 1024
export const TRYON_CATEGORIES = ['tops', 'bottoms', 'one-pieces']
const STATUSES = ['queued', 'processing', 'succeeded', 'failed', 'model_unavailable']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function validateTryOnInputs({ personImage, garmentImage, backImage, category }) {
  if (!TRYON_CATEGORIES.includes(category)) throw new Error('상품 종류를 선택하세요.')
  for (const [file, label, required] of [[personImage, '사용자 이미지', true], [garmentImage, '상품 앞면', true], [backImage, '상품 뒷면', false]]) {
    if (!file) { if (required) throw new Error(`${label} 이미지를 선택하세요.`); continue }
    if (!file.size) throw new Error(`${label}: 빈 파일은 사용할 수 없습니다.`)
    if (file.size > MAX_TRYON_BYTES) throw new Error(`${label}: 한 장당 8MiB 이하로 선택하세요.`)
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) &&
      !(file.type === '' && /\.(png|jpe?g|webp)$/i.test(file.name))) {
      throw new Error(`${label}: PNG, JPEG, WEBP만 지원합니다.`)
    }
  }
}

function assertJob(job) {
  if (!job || !UUID.test(job.job_id ?? '') || !STATUSES.includes(job.status) || !TRYON_CATEGORIES.includes(job.category)) {
    throw new Error('피팅 작업 응답을 확인할 수 없습니다.')
  }
  if (job.status === 'succeeded' && (!job.result_url || job.error)) throw new Error('생성 결과 정보가 없습니다.')
  if (job.status !== 'succeeded' && job.result_url) throw new Error('완료되지 않은 결과가 반환되었습니다.')
  if (['failed', 'model_unavailable'].includes(job.status) && !job.error?.code) throw new Error('실패 원인이 누락되었습니다.')
  return job
}

function requireToken(token) {
  if (!token) { const error = new Error('기존 피팅 로그인 후 실행하세요.'); error.status = 401; throw error }
}

async function responseError(response, body) {
  const detail = typeof body?.detail === 'string' ? body.detail : null
  const messages = { 401: '로그인이 만료되었습니다. 다시 로그인하세요.', 413: '이미지 용량 또는 해상도가 제한을 초과했습니다.',
    415: '지원하지 않는 이미지 형식입니다.', 422: '필수 입력·파일 손상·이미지 크기·상품 종류를 확인하세요.',
    404: '작업이 없거나 만료되었습니다.', 409: '생성된 AI 결과가 없습니다.', 503: '서버 또는 인증 설정을 확인하세요.' }
  const error = new Error(detail || messages[response.status] || '2D 피팅 요청에 실패했습니다.')
  error.status = response.status
  throw error
}

export function createTryOnClient(apiBase, fetcher = globalThis.fetch) {
  const base = apiBase.replace(/\/$/, '')
  const jobPath = id => {
    if (!UUID.test(id)) throw new Error('잘못된 작업 ID입니다.')
    return `${base}/tryon2d/jobs/${id}`
  }
  return {
    async submit(token, inputs, signal) {
      requireToken(token)
      validateTryOnInputs(inputs)
      const form = new FormData()
      form.append('person_image', inputs.personImage)
      form.append('garment_image', inputs.garmentImage)
      form.append('category', inputs.category)
      if (inputs.backImage) form.append('garment_back_image', inputs.backImage)
      const response = await fetcher(`${base}/tryon2d/jobs`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form, signal,
      })
      const body = await response.json().catch(() => null)
      if (!response.ok && !(response.status === 503 && body?.status === 'model_unavailable')) await responseError(response, body)
      return assertJob(body)
    },
    async status(token, id, signal) {
      requireToken(token)
      const response = await fetcher(jobPath(id), { headers: { Authorization: `Bearer ${token}` }, signal })
      const body = await response.json().catch(() => null)
      if (!response.ok) await responseError(response, body)
      return assertJob(body)
    },
    async result(token, job, signal) {
      requireToken(token)
      assertJob(job)
      if (job.status !== 'succeeded') throw new Error('실제 생성이 완료된 작업만 표시할 수 있습니다.')
      // Never send a bearer token to an arbitrary result_url from a response.
      const response = await fetcher(`${jobPath(job.job_id)}/result`, {
        headers: { Authorization: `Bearer ${token}` }, signal,
      })
      if (!response.ok) await responseError(response, await response.json().catch(() => null))
      const blob = await response.blob()
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(blob.type) || !blob.size || blob.size > MAX_TRYON_BYTES) {
        throw new Error('생성된 이미지 형식 또는 크기가 올바르지 않습니다.')
      }
      return blob
    },
  }
}

export function pollingDelay(signal, milliseconds = 1200) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Aborted', 'AbortError')); return }
    const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, milliseconds)
    signal.addEventListener('abort', abort, { once: true })
  })
}
