import { useState } from 'react'
import Icon from './Icon.jsx'

export default function AuthModal({ mode, onClose }) {
  const [notice, setNotice] = useState('')
  if (!mode) return null
  const signup = mode === 'signup'
  function submit(event) {
    event.preventDefault()
    setNotice('회원 기능은 FastAPI 인증 API 연결 후 이용할 수 있어요.')
  }
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button type="button" className="modal-close" onClick={() => onClose()} aria-label="닫기"><Icon name="X" /></button>
        <div className="auth-monogram">O</div>
        <p className="eyebrow">WELCOME TO ONFIT</p>
        <h2 id="auth-title">{signup ? '나만의 핏을 시작해요' : '다시 만나 반가워요'}</h2>
        <p className="auth-copy">취향에 꼭 맞는 아이템과 코디를 발견해 보세요.</p>
        <form onSubmit={submit} className="auth-form">
          {signup && <label>이름<input required placeholder="이름을 입력해 주세요" /></label>}
          <label>이메일<input required type="email" placeholder="name@example.com" /></label>
          <label>비밀번호<input required type="password" minLength="6" placeholder="비밀번호를 입력해 주세요" /></label>
          <button className="button button-dark auth-submit">{signup ? '무료로 가입하기' : '로그인하기'} <Icon name="ArrowRight" size={16} /></button>
        </form>
        {notice && <p className="auth-notice">{notice}</p>}
        <p className="auth-switch">{signup ? '이미 계정이 있나요?' : '아직 회원이 아니신가요?'} <button onClick={() => { setNotice(''); onClose(signup ? 'login' : 'signup') }}>{signup ? '로그인' : '회원가입'}</button></p>
      </section>
    </div>
  )
}
