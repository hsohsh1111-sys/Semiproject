import React from 'react'
import BeforeAfterSlider from './BeforeAfterSlider.jsx'
import './LandingPage.css'

function LandingIcon({ name }) {
  const paths = {
    camera: <><path d="M3 7h4l2-2h6l2 2h4v12H3z" /><circle cx="12" cy="13" r="3.5" /></>,
    image: <><rect x="3" y="4" width="18" height="16" rx="1" /><circle cx="8" cy="9" r="1.5" /><path d="m4 18 5-5 3 3 3-4 5 6" /></>,
    select: <><path d="M8 3H4v4m12-4h4v4M4 17v4h4m12-4v4h-4" /><circle cx="12" cy="12" r="4" strokeDasharray="2 2" /></>,
    hanger: <><path d="M10 7a2 2 0 1 1 2 2v3l9 6-2 2H5l-2-2 9-6" /></>,
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

const steps = [
  { icon: 'image', title: '사진 선택', text: '촬영하거나 이미지를 업로드하세요.' },
  { icon: 'select', title: '원하는 아이템 선택', text: '찾고 싶은 옷이나 소품을 둘러 그리세요.' },
  { icon: 'hanger', title: 'AI 추천 · 가상 착용', text: '유사한 상품을 확인하고 가상으로 착용해 보세요.' },
]

export default function LandingPage({ onCamera, onUpload, busy = false, error = '' }) {
  return <div className="landing-page">
    <header className="landing-header">
      <a href="/#/home">← ONFIT 쇼핑몰</a>
      <span>ONFIT</span>
    </header>
    <section className="landing-hero">
      <div className="landing-copy">
        <p className="landing-kicker">AI FASHION SEARCH</p>
        <h1>AI 패션 검색</h1>
        <p className="landing-tagline">사진 속 스타일을, <strong>나의 스타일로.</strong></p>
        <p className="landing-description">마음에 드는 옷이나 패션 아이템을 사진에서 골라보세요. 비슷한 상품을 찾아보고, 내 사진에 가상으로 착용할 수 있습니다.</p>
        <div className="landing-actions">
          <button type="button" className="landing-primary" onClick={onCamera} disabled={busy}>
            <LandingIcon name="camera" />카메라로 촬영
          </button>
          <button type="button" className="landing-secondary" onClick={onUpload} disabled={busy}>
            <LandingIcon name="image" />사진 업로드
          </button>
        </div>
        {error && <p className="landing-error" role="alert">{error}</p>}
      </div>
      <div className="landing-visual"><BeforeAfterSlider /></div>
    </section>
    <section className="landing-steps" aria-label="AI 패션 검색 이용 방법">
      <ol>{steps.map((step, index) => <li key={step.title}>
        <span className="landing-step-icon"><LandingIcon name={step.icon} /></span>
        <div><span className="landing-step-number">0{index + 1}</span><h2>{step.title}</h2><p>{step.text}</p></div>
      </li>)}</ol>
    </section>
  </div>
}
