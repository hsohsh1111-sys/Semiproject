import { useEffect, useState } from 'react'
import Icon from './Icon.jsx'
import { authenticateAccount } from '../../services/auth.js'
import './AuthModal.css'
import SignupTerms, { requiredTermsAccepted } from './SignupTerms.jsx'

export default function AuthModal({ mode, onClose, onAuthenticated }) {
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [agreements, setAgreements] = useState({age14:false,terms:false,privacy:false,marketing:false})
  const [termsDone, setTermsDone] = useState(false)
  useEffect(() => {
    if (!mode) return
    const escape = event => { if (event.key === 'Escape' && !busy) onClose() }
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('keydown', escape) }
  }, [mode, busy, onClose])
  if (!mode) return null
  const signup = mode === 'signup'
  async function submit(event) {
    event.preventDefault()
    setNotice('')
    setBusy(true)
    const form = new FormData(event.currentTarget)
    if (signup && !requiredTermsAccepted(agreements)) {
      setBusy(false); setTermsDone(false); setNotice('필수 약관에 동의해 주세요.'); return
    }
    if (signup && (form.get('password') !== form.get('password_confirm'))) {
      setNotice('비밀번호가 서로 다릅니다.')
      setBusy(false); return
    }
    const payload = {
      ...(signup ? {} : {email:form.get('email')}),
      password: form.get('password'),
      ...(signup ? { username:form.get('username'), name: form.get('name'), phone_number:form.get('phone_number'), phone_collection_consent:agreements.privacy, privacy_agreed:agreements.privacy, terms_agreed:agreements.terms, age_14_or_over:agreements.age14, sms_marketing_consent:agreements.marketing } : {}),
    }
    try {
      const result = await authenticateAccount(payload, signup)
      onAuthenticated?.(result)
      setNotice(`${result.user.name}님, ${signup ? '회원가입이 완료되었습니다.' : '로그인되었습니다.'}`)
      onClose()
      if (result.auth_type === 'admin') window.location.hash = '#/admin'
    } catch (error) {
      setNotice(error instanceof TypeError ? '서버에 연결할 수 없습니다. FastAPI 실행 상태를 확인해 주세요.' : error.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="modal-backdrop" onMouseDown={(e) => !busy && e.target === e.currentTarget && onClose()}>
      <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button type="button" disabled={busy} className="modal-close" onClick={() => onClose()} aria-label="닫기"><Icon name="X" /></button>
        <img className="auth-logo" src="/onfit-mark.svg" alt="ONFIT" />
        <p className="eyebrow">WELCOME TO ONFIT</p>
        <h2 id="auth-title">{signup && !termsDone ? <>서비스 이용약관에<br />동의해 주세요.</> : signup ? '나만의 핏을 시작해요' : '다시 만나 반가워요'}</h2>
        {(!signup || termsDone) && <p className="auth-copy">{signup ? '나만의 계정을 만들고 체형과 스타일을 저장하세요.' : '저장한 체형과 코디를 이어서 확인하세요.'}</p>}
        {signup && !termsDone ? <SignupTerms value={agreements} onChange={setAgreements} onContinue={() => {setTermsDone(true);setNotice('')}} /> : <form onSubmit={submit} className="auth-form">
          {signup && <label>사용할 아이디<input name="username" required minLength={4} maxLength={32} pattern="[A-Za-z0-9_.\-]+" autoComplete="username" placeholder="영문·숫자·._- 조합 4~32자" disabled={busy} /></label>}
          {signup && <label>닉네임 또는 별명<input name="name" required maxLength="80" autoComplete="nickname" placeholder="다른 사용자에게 표시할 이름" disabled={busy} /></label>}
          {signup ? <label>휴대폰 번호<input name="phone_number" type="tel" required autoComplete="tel-national" inputMode="tel" maxLength={20} placeholder="010-1234-5678" disabled={busy} /></label> : <label>아이디 또는 이메일<input name="email" required type="text" maxLength={255} autoComplete="username" placeholder="아이디 또는 이메일을 입력해 주세요" value={email} disabled={busy} onChange={event => setEmail(event.target.value)} /></label>}
          <label>{signup ? '사용할 비밀번호' : '비밀번호'}<input name="password" required type="password" minLength={signup ? 8 : 1} maxLength={128} autoComplete={signup ? 'new-password' : 'current-password'} placeholder={signup ? '8자 이상 입력해 주세요' : '비밀번호를 입력해 주세요'} /></label>
          {signup && <label>사용할 비밀번호 확인<input name="password_confirm" required type="password" minLength={8} maxLength={128} autoComplete="new-password" placeholder="비밀번호를 한 번 더 입력해 주세요" disabled={busy} /></label>}
          {signup && <button type="button" className="terms-back" disabled={busy} onClick={() => setTermsDone(false)}>약관 동의 다시 보기</button>}
          <button disabled={busy} className="button button-dark auth-submit">{busy ? '처리 중…' : signup ? '가입하고 시작하기' : '로그인하기'} <Icon name="ArrowRight" size={16} /></button>
        </form>}
        {notice && <p className="auth-notice" role="status">{notice}</p>}
        <p className="auth-switch">{signup ? '이미 계정이 있나요?' : '아직 회원이 아니신가요?'} <button disabled={busy} onClick={() => { setNotice(''); onClose(signup ? 'login' : 'signup') }}>{signup ? '로그인' : '회원가입'}</button></p>
      </section>
    </div>
  )
}
