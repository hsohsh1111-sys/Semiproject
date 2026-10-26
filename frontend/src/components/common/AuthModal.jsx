import { useState } from 'react'
import Icon from './Icon.jsx'
import { API_BASE } from '../../services/api.js'

export default function AuthModal({ mode, onClose }) {
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  if (!mode) return null
  const signup = mode === 'signup'
  async function submit(event) {
    event.preventDefault()
    setNotice('')
    setBusy(true)
    const form = new FormData(event.currentTarget)
    const payload = {
      email: form.get('email'),
      password: form.get('password'),
      ...(signup ? { name: form.get('name') } : {}),
    }
    try {
      const response = await fetch(`${API_BASE}/auth/${signup ? 'signup' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.detail || '요청을 처리하지 못했습니다.')
      localStorage.setItem('onfit_access_token', result.access_token)
      localStorage.setItem('onfit_user', JSON.stringify(result.user))
      setNotice(`${result.user.name}님, ${signup ? '회원가입이 완료되었습니다.' : '로그인되었습니다.'}`)
      window.setTimeout(() => onClose(), 900)
    } catch (error) {
      setNotice(error instanceof TypeError ? '서버에 연결할 수 없습니다. FastAPI 실행 상태를 확인해 주세요.' : error.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button type="button" className="modal-close" onClick={() => onClose()} aria-label="닫기"><Icon name="X" /></button>
        <img className="auth-logo" src="/onfit-mark.svg" alt="ONFIT" />
        <p className="eyebrow">WELCOME TO ONFIT</p>
        <h2 id="auth-title">{signup ? '나만의 핏을 시작해요' : '다시 만나 반가워요'}</h2>
        <p className="auth-copy">취향에 꼭 맞는 아이템과 코디를 발견해 보세요.</p>
        <form onSubmit={submit} className="auth-form">
          {signup && <label>이름<input name="name" required maxLength="80" placeholder="이름을 입력해 주세요" /></label>}
          <label>이메일<input name="email" required type="email" autoComplete="email" placeholder="name@example.com" /></label>
          <label>비밀번호<input name="password" required type="password" minLength={signup ? 8 : 1} maxLength="128" autoComplete={signup ? 'new-password' : 'current-password'} placeholder={signup ? '8자 이상 입력해 주세요' : '비밀번호를 입력해 주세요'} /></label>
          <button disabled={busy} className="button button-dark auth-submit">{busy ? '처리 중…' : signup ? '무료로 가입하기' : '로그인하기'} <Icon name="ArrowRight" size={16} /></button>
        </form>
        {notice && <p className="auth-notice" role="status">{notice}</p>}
        <p className="auth-switch">{signup ? '이미 계정이 있나요?' : '아직 회원이 아니신가요?'} <button onClick={() => { setNotice(''); onClose(signup ? 'login' : 'signup') }}>{signup ? '로그인' : '회원가입'}</button></p>
        <button type="button" className="auth-admin-link" onClick={() => { onClose(); window.location.hash = '#/admin' }}>
          관리자 화면 미리보기
        </button>
      </section>
    </div>
  )
}
