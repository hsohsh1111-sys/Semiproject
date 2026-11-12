import { useEffect, useState } from 'react'
import Icon from '../components/common/Icon.jsx'
import { API_BASE } from '../services/api.js'

function formatDate(value, compact = false) {
  if (!value) return '—'
  const options = compact
    ? { month: '2-digit', day: '2-digit' }
    : { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }
  return new Intl.DateTimeFormat('ko-KR', options).format(new Date(value))
}

export default function AdminPage({ session }) {
  const [memberData, setMemberData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    async function loadMembers() {
      setLoading(true)
      setError('')
      try {
        const response = await fetch(`${API_BASE}/auth/public-members`, { signal: controller.signal, headers: {Authorization: `Bearer ${session.access_token}`} })
        const result = await response.json()
        if (!response.ok) throw new Error(result.detail || '가입 정보를 불러오지 못했습니다.')
        setMemberData(result)
      } catch (requestError) {
        if (requestError.name !== 'AbortError') {
          setError('가입 정보를 가져오지 못했습니다. 백엔드 배포 상태를 확인해 주세요.')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    loadMembers()
    return () => controller.abort()
  }, [refreshKey, session.access_token])

  const members = memberData?.members ?? []
  const latestSignup = members[0]?.created_at

  return (
    <main className="inner-page admin-page">
      <section className="admin-hero">
        <div className="section-wrap">
          <span className="eyebrow">ONFIT · ADMIN</span>
          <h1>가입 현황을 한눈에</h1>
          <p>서비스 가입 통계와 최근 가입 내역을 확인할 수 있습니다.</p>
        </div>
      </section>

      <section className="section-wrap admin-dashboard">
        <div className="admin-public-note">
          <strong>관리자 전용</strong>
          <span>권한이 있는 계정만 접근할 수 있습니다. 닉네임과 연락처는 일부만 표시합니다.</span>
        </div>

        <div className="admin-stat-grid">
          <article className="admin-stat-card">
            <span>전체 가입자</span>
            <strong>{loading ? '—' : (memberData?.total_count ?? 0).toLocaleString('ko-KR')}</strong>
          </article>
          <article className="admin-stat-card">
            <span>화면에 표시된 가입자</span>
            <strong>{loading ? '—' : (memberData?.visible_count ?? 0).toLocaleString('ko-KR')}</strong>
          </article>
          <article className="admin-stat-card">
            <span>최근 가입일</span>
            <strong>{loading ? '—' : formatDate(latestSignup, true)}</strong>
          </article>
        </div>

        <div className="admin-table-heading">
          <div>
            <span className="eyebrow">MEMBER DATA · LATEST 100</span>
            <h2>최근 가입 정보</h2>
          </div>
          <button className="admin-refresh" type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}>
            <Icon name="RefreshCw" size={14} /> 새로고침
          </button>
        </div>

        <div className="admin-table-wrap">
          {loading ? (
            <p className="admin-state" role="status">가입 정보를 불러오는 중입니다…</p>
          ) : error ? (
            <p className="admin-state admin-state-error" role="alert">{error}</p>
          ) : members.length === 0 ? (
            <p className="admin-state">아직 가입한 회원이 없습니다.</p>
          ) : (
            <table className="admin-member-table">
              <thead>
                <tr><th>회원</th><th>닉네임 (마스킹)</th><th>연락처 (마스킹)</th><th>이벤트 문자</th><th>가입일</th></tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id}>
                    <td>{member.member_label}</td>
                    <td>{member.masked_name}</td>
                    <td>{member.masked_phone || member.masked_email || '미등록'}</td>
                    <td>{member.sms_marketing_consent ? '수신 동의' : '미동의'}</td>
                    <td>{formatDate(member.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </main>
  )
}
