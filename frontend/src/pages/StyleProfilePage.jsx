import { useEffect, useRef, useState } from 'react'
import { loadProfile, saveStyleProfile } from '../services/profile.js'
import Icon from '../components/common/Icon.jsx'
import StyleChips from '../components/outfit/StyleChips.jsx'
const palettes = ['#e8c6b7', '#c47f66', '#9f5949', '#d6bd8a', '#9eaf93', '#869cab', '#b5a6bf', '#353239']

export default function StyleProfilePage({ session }) {
  const [style, setStyle] = useState('미니멀')
  const [color, setColor] = useState(palettes[0])
  const [done, setDone] = useState(false)
  const [fit, setFit] = useState('편안하고 여유롭게')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [exists, setExists] = useState(false)
  const [ready, setReady] = useState(false)
  const token = session?.access_token
  const activeToken = useRef(token)
  activeToken.current = token
  useEffect(() => {
    let active = true
    setDone(false); setNotice(''); setExists(false); setReady(false); setSaving(false)
    setStyle('미니멀'); setColor(palettes[0]); setFit('편안하고 여유롭게')
    if (!token) { setLoading(false); return () => { active = false } }
    setLoading(true)
    loadProfile(token).then(profile => {
      if (!active) return
      setExists(Boolean(profile)); setReady(true)
      if (profile?.preferred_style) setStyle(profile.preferred_style)
      if (profile?.preferred_fit) setFit(profile.preferred_fit)
      if (profile?.preferred_colors?.[0]) setColor(profile.preferred_colors[0])
    }).catch(error => { if (active) setNotice(error.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [token])
  async function save() {
    if (!token || !ready || saving) return
    setSaving(true); setDone(false); setNotice('')
    try {
      await saveStyleProfile(token, { style, fit, color }, exists)
      if (activeToken.current !== token) return
      setExists(true); setDone(true)
    } catch (error) {
      if (activeToken.current === token) setNotice(error.message)
    } finally {
      if (activeToken.current === token) setSaving(false)
    }
  }
  function choose(setter, value) { setter(value); setDone(false); setNotice('') }
  return <main className="inner-page"><div className="page-hero page-hero-blush"><span className="eyebrow">01 / YOUR STYLE PROFILE</span><h1>나를 알아가는<br /><em>첫 번째 핏.</em></h1><p>몇 가지 취향을 알려주시면, 당신다운 스타일을 더 잘 찾아볼게요.</p><span className="page-hero-mark">O</span></div>
    <section className="profile-form section-wrap"><div className="form-intro"><span className="eyebrow">STYLE DIAGNOSIS</span><h2>당신의 취향을<br />들려주세요.</h2><p>선택한 답변은 추천 코디를 만드는 데 활용돼요.</p></div><div className="form-fields">
      <fieldset disabled={loading || saving}><legend><b>01</b> 평소 좋아하는 스타일은?</legend><StyleChips selected={style} onSelect={value => choose(setStyle, value)} /></fieldset>
      <fieldset disabled={loading || saving}><legend><b>02</b> 자주 손이 가는 컬러를 골라주세요.</legend><div className="color-swatches">{palettes.map((swatch, i) => <button key={swatch} style={{ backgroundColor: swatch }} className={color === swatch ? 'active' : ''} aria-label={`컬러 ${i + 1}`} onClick={() => choose(setColor, swatch)} />)}</div></fieldset>
      <fieldset disabled={loading || saving}><legend><b>03</b> 선호하는 핏을 선택해 주세요.</legend><div className="fit-options">{['편안하고 여유롭게', '깔끔하고 단정하게', '실루엣을 살려서'].map(option => <button key={option} className={fit === option ? 'selected' : ''} onClick={() => choose(setFit, option)}>{option}</button>)}</div></fieldset>
      <button className="button button-dark form-submit" disabled={!token || !ready || loading || saving} onClick={save}>내 스타일 저장하기 <Icon name="ArrowRight" size={16} /></button>{!token && <p role="status">로그인 후 스타일을 저장할 수 있습니다.</p>}{loading && <p role="status">저장된 스타일을 불러오는 중입니다.</p>}{saving && <p role="status">저장 중입니다.</p>}{notice && <p role="alert">{notice}</p>}{done && <p className="inline-notice">스타일을 저장했습니다. <a href="#/outfits">추천 코디 보기 →</a></p>}
    </div></section>
  </main>
}
