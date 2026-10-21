import { useState } from 'react'
import Icon from '../components/common/Icon.jsx'
import StyleChips from '../components/outfit/StyleChips.jsx'
const palettes = ['#e8c6b7', '#c47f66', '#9f5949', '#d6bd8a', '#9eaf93', '#869cab', '#b5a6bf', '#353239']

export default function StyleProfilePage() {
  const [style, setStyle] = useState('미니멀')
  const [color, setColor] = useState(palettes[0])
  const [done, setDone] = useState(false)
  return <main className="inner-page"><div className="page-hero page-hero-blush"><span className="eyebrow">01 / YOUR STYLE PROFILE</span><h1>나를 알아가는<br /><em>첫 번째 핏.</em></h1><p>몇 가지 취향을 알려주시면, 당신다운 스타일을 더 잘 찾아볼게요.</p><span className="page-hero-mark">O</span></div>
    <section className="profile-form section-wrap"><div className="form-intro"><span className="eyebrow">STYLE DIAGNOSIS</span><h2>당신의 취향을<br />들려주세요.</h2><p>선택한 답변은 추천 코디를 만드는 데 활용돼요.</p></div><div className="form-fields">
      <fieldset><legend><b>01</b> 평소 좋아하는 스타일은?</legend><StyleChips selected={style} onSelect={setStyle} /></fieldset>
      <fieldset><legend><b>02</b> 자주 손이 가는 컬러를 골라주세요.</legend><div className="color-swatches">{palettes.map((swatch, i) => <button key={swatch} style={{ backgroundColor: swatch }} className={color === swatch ? 'active' : ''} aria-label={`컬러 ${i + 1}`} onClick={() => setColor(swatch)} />)}</div></fieldset>
      <fieldset><legend><b>03</b> 선호하는 핏을 선택해 주세요.</legend><div className="fit-options"><button className="selected">편안하고 여유롭게</button><button>깔끔하고 정돈된</button><button>실루엣을 살려서</button></div></fieldset>
      <button className="button button-dark form-submit" onClick={() => setDone(true)}>내 스타일 저장하기 <Icon name="ArrowRight" size={16} /></button>{done && <p className="inline-notice">좋아요! 선택한 취향으로 맞춤 스타일 페이지를 준비했어요. <a href="#/outfits">추천 코디 보기 →</a></p>}
    </div></section>
  </main>
}
