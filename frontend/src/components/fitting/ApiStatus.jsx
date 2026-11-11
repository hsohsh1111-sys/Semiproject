import { useState } from 'react'
import { getFittingApiStatus } from '../../services/fitting.js'

export default function ApiStatus() {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  async function check() {
    setLoading(true)
    try { setStatus(await getFittingApiStatus()) }
    finally { setLoading(false) }
  }
  return <section className="fitting-panel fitting-api-status" aria-label="백엔드 연결 상태">
    <div><strong>백엔드 연결</strong>
      {!status ? <p>아직 확인하지 않았습니다.</p> : <>
        <p>{status.available ? 'API 서버 응답 정상' : 'API 서버에 연결할 수 없습니다. 백엔드 실행 주소를 확인해 주세요.'}</p>
        <p>{status.configured === true ? '로그인 설정 완료(설정값 확인)' : status.configured === false
          ? '로그인 설정이 필요합니다. backend 환경변수와 DB 설정을 확인해 주세요.'
          : '로그인 설정 상태를 확인할 수 없습니다. CORS와 백엔드 실행 상태를 확인해 주세요.'}</p>
        {status.configured === true && <small>설정값 존재 여부만 확인했습니다. 실제 DB 접속은 검사하지 않습니다.</small>}
      </>}
    </div>
    <button type="button" onClick={check} disabled={loading}>{loading ? '확인 중…' : '연결 확인'}</button>
  </section>
}
