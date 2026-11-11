import { useCallback, useEffect, useRef, useState } from 'react'
import MannequinCanvas from '../components/fitting/MannequinCanvas.jsx'
import { MANNEQUIN_MODEL_URLS } from '../components/fitting/GlbMannequinModel.jsx'
import { getTopGarment, getBottomGarment, getOuterGarment, NEUTRAL_CAP_GLB } from '../components/fitting/garmentGlb.js'
import { GARMENT_COLORS } from '../components/fitting/garmentAppearance.js'
import InbodyUploadPanel from '../components/fitting/InbodyUploadPanel.jsx'
import { planProductFitting } from '../components/fitting/productFitting.js'
import { localParameters,
  readFittingMeasurements, writeFittingMeasurements, clearFittingMeasurements } from '../services/fitting.js'
import './FittingPage.css'
import { circumferenceEase } from '../components/fitting/silhouette.js'
import { BODY_PRESETS, applyBodyPresetValues } from '../components/fitting/bodyPresets.js'
import { applyInbodyBodyPreview } from '../components/fitting/inbodyBodyPreview.js'

const EXAMPLE = { height_cm: 175, weight_kg: 70, shoulder_width_cm: 42, waist_circumference_cm: 80,
  chest_circumference_cm: 95, abdomen_protrusion_cm: 0, pelvis_width_cm: 30,
  hip_circumference_cm: 95, thigh_circumference_cm: 50 }
const fields = [
  ['height_cm', '키', 'cm', 100, 230],
  ['shoulder_width_cm', '어깨너비', 'cm', 25, 65], ['waist_circumference_cm', '허리둘레', 'cm', 45, 180],
  ['chest_circumference_cm', '가슴둘레', 'cm', 55, 180],
  ['abdomen_protrusion_cm', '복부 앞쪽 추가 돌출', 'cm', 0, 20],
  ['pelvis_width_cm', '골반너비', 'cm', 20, 60],
  ['hip_circumference_cm', '엉덩이둘레', 'cm', 55, 180],
  ['thigh_circumference_cm', '한쪽 허벅지둘레', 'cm', 25, 100],
]

export default function FittingPage({session=null,onSessionChange,onRequestLogin}={}) {
  const [values, setValues] = useState(EXAMPLE)
  const [bodyBuild,setBodyBuild]=useState('average')
  const [personalBody, setPersonalBody] = useState(null)
  const [baseline, setBaseline] = useState({ values: EXAMPLE, source: '예시 치수',bodyBuild:'average' })
  const [token, setToken] = useState('') // memory only; never persist passwords or body measurements
  const [accountId, setAccountId] = useState(null)
  const previousAccount = useRef(null)
  useEffect(() => {
    const nextAccount = session?.user?.id ?? null
    if (previousAccount.current !== null && previousAccount.current !== nextAccount) {
      clearFittingMeasurements(previousAccount.current)
      setValues(EXAMPLE)
      setBaseline({ values: EXAMPLE, source: '예시 치수', bodyBuild: 'average' })
      setSource('예시 치수')
      setServerPreview(null)
      setFixedGarment(null)
      setPersonalBody(null)
      setBodyBuild('average')
    }
    previousAccount.current = nextAccount
    setToken(session?.access_token ?? '')
    setAccountId(session?.user?.id ?? null)
    if (session?.access_token && session?.user?.id) {
      const savedMeasurements = readFittingMeasurements(session.user.id)
      if (savedMeasurements) {
        setValues(savedMeasurements)
        setServerPreview(null)
        setBaseline({ values: savedMeasurements, source: '이 브라우저 세션의 저장 치수' })
        setSource('이 브라우저 세션의 저장 치수')
      }
    }
  }, [session])
  const busy = false
  const [notice, setNotice] = useState('예시 치수로 시작합니다. 실제 사용자 데이터가 아닙니다.')
  const [source, setSource] = useState('예시 치수')
  const [serverPreview, setServerPreview] = useState(null)
  const [rotation, setRotation] = useState(15)
  const [viewRevision, setViewRevision] = useState(0)
  function selectView(angle) {
    setRotation(angle)
    setViewRevision(previous => previous + 1)
  }
  const [fit, setFit] = useState('none')
  const [fixedGarment, setFixedGarment] = useState(null)
  const [transparent, setTransparent] = useState(false)
  const [nikeShirt, setNikeShirt] = useState(false)
  const [glbShirt, setGlbShirt] = useState(false)
  const [topKind, setTopKind] = useState('short_sleeve')
  const [garmentColor, setGarmentColor] = useState('white')
  const [customTopColor, setCustomTopColor] = useState('#16181d')
  const [garmentStatus, setGarmentStatus] = useState({ state: 'idle' })
  const [pantsVisible, setPantsVisible] = useState(false)
  const [bottomKind, setBottomKind] = useState('pants')
  const [pantsStatus, setPantsStatus] = useState({ state: 'idle' })
  const [outerVisible, setOuterVisible] = useState(false)
  const [outerStatus, setOuterStatus] = useState({ state: 'idle' })
  const [capVisible, setCapVisible] = useState(false)
  const [capStatus, setCapStatus] = useState({ state: 'idle' })
  const [slotColors, setSlotColors] = useState({bottom:'default',outer:'default',headwear:'default'})
  const [customSlotColors, setCustomSlotColors] = useState({bottom:'#373b43',outer:'#16181d',headwear:'#16181d'})
  const [productFit, setProductFit] = useState(null)
  const [sizeMetrics, setSizeMetrics] = useState(null)
  const receiveSizeMetrics = useCallback(metrics => {
    setSizeMetrics(previous => JSON.stringify(previous) === JSON.stringify(metrics) ? previous : metrics)
  }, [])
  const designTexture = productFit?.design?.texture
  useEffect(() => () => { designTexture?.dispose() }, [designTexture])
  const clearProductSlot = slot => setProductFit(current => current?.plan.slot === slot ? null : current)
  function chooseSlotColor(slot,color) {
    setSlotColors(current=>({...current,[slot]:color}))
    if(color==='default')clearProductSlot(slot)
    else setProductFit(current=>current?.plan.slot===slot?{...current,plan:{...current.plan,color,colorApplied:true}}:current)
  }
  function slotColorControls(slot,label) {
    return <div className="fitting-actions fitting-color-controls" role="group" aria-label={`${label} 색상`}>
      <span className="fitting-control-label">색상</span>
      <button type="button" aria-pressed={slotColors[slot]==='default'&&productFit?.plan.slot!==slot} onClick={()=>chooseSlotColor(slot,'default')}>기본</button>
      <button type="button" aria-pressed={slotColors[slot]!=='default'} onClick={()=>chooseSlotColor(slot,customSlotColors[slot])}>사용자 지정</button>
      {slotColors[slot]!=='default'&&<label className="fitting-custom-color"><input type="color" aria-label={`${label} 사용자 지정 색상`} value={customSlotColors[slot]} onChange={event=>{const color=event.target.value;setCustomSlotColors(current=>({...current,[slot]:color}));chooseSlotColor(slot,color)}} /></label>}
    </div>
  }
  function wearControls(label, wearing, wear, remove, blocked = false) {
    return <div className="fitting-actions fitting-wear-controls" role="group" aria-label={`${label} 착용 상태`}>
      <span className="fitting-control-label">착용</span>
      <button type="button" aria-pressed={wearing} disabled={blocked} onClick={wear}>착용</button>
      <button type="button" aria-pressed={!wearing} onClick={remove}>벗기</button>
    </div>
  }
  function chooseTopColor(value) {
    setGarmentColor(value)
    const hex = GARMENT_COLORS.find(color=>color.id===value)?.hex ?? value
    // Recolor the owned material while preserving the current print and size.
    setProductFit(current=>current?.plan.slot==='top' ? {...current,plan:{...current.plan,color:hex,colorApplied:true}} : current)
  }
  const [shirtVisible, setShirtVisible] = useState(true)
  const [modelType, setModelType] = useState('test')
  const [morphTargets, setMorphTargets] = useState([])
  const [morphTarget, setMorphTarget] = useState('')
  const [morphWeight, setMorphWeight] = useState(0)
  const [genderModels, setGenderModels] = useState({ male: false, female: false })
  useEffect(() => {
    let active = true
    Promise.all(['male', 'female'].map(async gender => {
      try {
        const response = await fetch(MANNEQUIN_MODEL_URLS[gender], { method: 'HEAD' })
        const contentType = response.headers.get('content-type') ?? ''
        const contentLength = Number(response.headers.get('content-length'))
        const isGlb = response.ok && !contentType.includes('text/html') &&
          (!Number.isFinite(contentLength) || contentLength > 12)
        return [gender, isGlb]
      } catch {
        return [gender, false]
      }
    })).then(entries => {
      if (active) setGenderModels(Object.fromEntries(entries))
    })
    return () => { active = false }
  }, [])
  const receiveMorphTargets = useCallback(names => {
    setMorphTargets(names)
    setMorphTarget(current => names.includes(current) ? current : '')
  }, [])
  function selectModel(next) {
    if (next === modelType) return
    setProductFit(null)
    setModelType(next)
    if (next !== 'female') setBottomKind('pants')
    setMorphTargets([])
    setMorphTarget('')
    setMorphWeight(0)
    if (next === 'rings') { setNikeShirt(false); setGlbShirt(false) }
  }
  const valid = fields.every(([key, , , min, max]) => values[key] !== '' && Number.isFinite(Number(values[key])) && Number(values[key]) >= min && Number(values[key]) <= max)
  const parameters = serverPreview?.parameters || localParameters(valid ? values : EXAMPLE)
  const garmentParameters = fixedGarment || parameters
  const ease = valid && fit !== 'none'
    ? serverPreview?.garmentParameters && serverPreview.fit === fit
      ? { chest: serverPreview.garmentParameters.chest_ease_cm, waist: serverPreview.garmentParameters.waist_ease_cm }
      : circumferenceEase(parameters, garmentParameters, fit)
    : null

  function change(key, value) {
    const next = { ...values, [key]: value === '' ? '' : Number(value) }
    setValues(next)
    if (accountId) writeFittingMeasurements(accountId, next)
    setServerPreview(null)
    setSource('직접 조정한 미리보기')
    setNotice('입력값이 변경되었습니다. 화면은 저장되지 않은 근사 미리보기입니다.')
  }

  function wearTop(kind) {
    clearProductSlot('top')
    if (glbShirt && topKind === kind && modelType !== 'rings') { setShirtVisible(true); return }
    if (modelType === 'rings') selectModel('test')
    if (kind === 'hooded_jacket') setOuterVisible(false)
    setTopKind(kind); setGlbShirt(true); setNikeShirt(false); setShirtVisible(true)
    setGarmentStatus({ state: 'loading' }); setFit('none'); setFixedGarment(null); setServerPreview(null)
  }

  function wearBottom(kind) {
    if (kind === 'skirt' && modelType !== 'female') return
    clearProductSlot('bottom')
    if (pantsVisible && bottomKind === kind) return
    if (modelType === 'rings') selectModel('test')
    setBottomKind(kind); setPantsVisible(true); setPantsStatus({state:'loading'})
  }

  function applyBodyPreset(preset,build) {
    if (modelType === 'rings') selectModel('test')
    setValues(applyBodyPresetValues(preset,values))
    setBodyBuild(build)
    setSource(`${preset.label} 테스트용 예시 치수`)
    setFit('none'); setNikeShirt(false); setFixedGarment(null); setServerPreview(null)
    setMorphTarget(''); setMorphWeight(0)
    // Fixed product sizing deliberately suppresses body-driven garment morphs.
    // Clear that mode for this explicitly requested template comparison.
    setProductFit(current => current ? { ...current, size: undefined } : null)
    setNotice(`${preset.label} 예시를 적용했습니다. 키는 유지하며 세부 치수는 직접 조정할 수 있습니다.`)
  }

  function applyPersonalBody(preview) {
    const { values: next, bodyBuild: build } = applyInbodyBodyPreview(preview)
    setPersonalBody(preview)
    setValues(next); setBodyBuild(build)
    setBaseline({ values: next, source: '나의 인바디 체형', bodyBuild: build })
    setSource('나의 인바디 체형'); setServerPreview(null); setFixedGarment(null)
    setMorphTarget(''); setMorphWeight(0); setFit('none')
    setProductFit(current => current ? { ...current, size: undefined } : null)
    writeFittingMeasurements(accountId, next)
    setNotice('나의 인바디 체형을 적용했습니다.')
  }

  function fitProduct(product) {
    const plan = planProductFitting(product)
    if (!plan.supported) throw new Error(plan.reason)
    if (!valid) throw new Error('신체 치수를 허용 범위 안으로 입력하세요.')
    if (plan.slot === 'outer' && glbShirt && topKind === 'hooded_jacket' && shirtVisible) throw new Error('현재 후드 집업과 패딩은 동시 착용을 지원하지 않습니다.')
    if (modelType === 'rings') selectModel('test')
    if (plan.slot === 'top') wearTop(plan.category)
    if (plan.slot === 'bottom') setPantsVisible(true)
    if (plan.slot === 'outer') setOuterVisible(true)
    if (plan.slot === 'headwear') setCapVisible(true)
    setProductFit({ product, plan })
  }

  function applyProductDesign(product, design) {
    if (product.category !== 'short_sleeve') throw new Error('이번 단계는 반팔 앞판 디자인만 지원합니다.')
    fitProduct(product)
    const plan = planProductFitting(product)
    const size = productFit?.product === product ? productFit.size : undefined
    setProductFit({ product, design, size, plan: { ...plan, note: '사용자가 선택한 디자인을 반팔 앞판에 근사 적용 · 원본 3D/전체 패턴 복원 아님' } })
  }

  function placeProductDesign(product, placement) {
    setProductFit(current => current?.product === product && current.design
      ? { ...current, design: { ...current.design, placement } } : current)
  }

  function removeProductDesign(product) {
    setProductFit(current => current?.product === product ? { product, size: current.size, plan: planProductFitting(product) } : current)
  }

  function applyProductSize(product, size) {
    if (product.category !== 'short_sleeve' || size.table.productKey !== product.key) throw new Error('이 사이즈표와 반팔 상품의 연결을 확인하세요.')
    if (!valid) throw new Error('신체 치수를 허용 범위 안으로 입력하세요.')
    if (productFit?.product !== product) fitProduct(product)
    setProductFit(current => ({ ...current, size, plan: { ...current.plan, note: '입력 치수의 모델 기준점 수치 보정 · 실제 봉제선 대응·사이즈 추천 미검증' } }))
  }

  function removeProductSize(product) {
    setProductFit(current => current?.product === product ? { ...current, size: undefined, plan: { ...current.plan,
      note: current.design ? '선택 디자인을 앞판에 근사 적용 · 사이즈 변형 해제' : planProductFitting(product).note } } : current)
  }

  return <main className="fitting-page">
    <a href="#/home">← 홈으로</a>
    <p className="fitting-eyebrow">ONFIT · BODY PREVIEW</p>
    <h1>나의 체형 미리보기</h1>
    <div className="fitting-layout">
      <section className="fitting-panel" aria-label="신체 치수 입력">
        <fieldset className="fitting-fit-options">
          <legend>체형 선택</legend>
          <div className="fitting-actions">
            {Object.entries(BODY_PRESETS).map(([key,preset])=><button key={key} type="button" aria-pressed={modelType!=='rings'&&bodyBuild===key} onClick={()=>applyBodyPreset(preset,key)}>{preset.label}</button>)}
            <button type="button" disabled={!personalBody} aria-pressed={bodyBuild?.kind === 'inbody'}
              title={personalBody ? '확인한 인바디로 계산한 체형 다시 적용' : '인바디 입력 필요'}
              onClick={() => applyPersonalBody(personalBody)}>나의 인바디 체형</button>
          </div>
          {personalBody && <p>추정 체형은 실제와 다를 수 있습니다.</p>}
        </fieldset>
        {!token ? <div className="fitting-account-prompt">
          <h2>내 기록 불러오기</h2>
          <p>로그인하면 프로필·인바디 기록을 불러올 수 있습니다.</p>
          <button type="button" onClick={onRequestLogin}>로그인하고 내 기록 불러오기</button>
        </div> : null}
        {token && <InbodyUploadPanel key={token} token={token} disabled={busy} onExpired={() => { setToken(''); setAccountId(null); onSessionChange?.(null) }}
          onApplyBody={applyPersonalBody}
          />}
          <fieldset disabled={busy} className="fitting-measurements-grid">
            <legend>세부 치수 조정</legend>
            {fields.map(([key, label, unit, min, max]) => <div key={key} className="fitting-measurement">
              <label htmlFor={`measure-${key}`}>{label} ({unit})</label>
              <div className="fitting-measurement-controls">
                <input type="range" aria-label={`${label} 슬라이더`} min={min} max={max} step="0.1"
                  value={values[key] === '' ? min : Math.min(max, Math.max(min, Number(values[key])))}
                  onChange={event => change(key, event.target.value)} />
                <input id={`measure-${key}`} type="number" min={min} max={max} step="any" required value={values[key]} onChange={event => change(key, event.target.value)} />
              </div>

            </div>)}

            <div className="fitting-actions fitting-reset-actions">
              <button type="button" onClick={() => {
                setValues({ ...baseline.values }); setBodyBuild(baseline.bodyBuild??'average'); writeFittingMeasurements(accountId, baseline.values); setSource(baseline.source); setServerPreview(null)
                setNotice('수치를 초기화했습니다.')
              }}>수치 초기화</button>

            </div>

          </fieldset>
        <p role="status" aria-live="polite">{busy ? '처리 중…' : notice}</p>
      </section>
      <section className="fitting-panel" aria-label="3D 마네킹 미리보기">
        <div className="fitting-actions">
          <button type="button" onClick={() => {
            setGlbShirt(false); setNikeShirt(false); setShirtVisible(true); setTopKind('short_sleeve')
            setPantsVisible(false); setOuterVisible(false); setCapVisible(false)
            setBottomKind('pants')
            setGarmentColor('white'); setCustomTopColor('#16181d')
            setSlotColors({bottom:'default',outer:'default',headwear:'default'})
            setCustomSlotColors({bottom:'#373b43',outer:'#16181d',headwear:'#16181d'})
            setProductFit(null); setSizeMetrics(null); setFixedGarment(null)
            setFit('none'); setTransparent(false); setServerPreview(null)
            setGarmentStatus({state:'idle'}); setPantsStatus({state:'idle'})
            setOuterStatus({state:'idle'}); setCapStatus({state:'idle'})
          }}>의류·색상 초기화</button>
        </div>
        <div className="fitting-wardrobe-grid">
        <fieldset className="fitting-fit-options">
          <legend>상의</legend>
          <div className="fitting-actions">

            <button type="button" aria-pressed={glbShirt && topKind === 'short_sleeve'} onClick={() => wearTop('short_sleeve')}>반팔티셔츠</button>
            <button type="button" aria-pressed={glbShirt && topKind === 'long_sleeve'} onClick={() => wearTop('long_sleeve')}>긴팔티셔츠</button>
            <button type="button" aria-pressed={glbShirt && topKind === 'hooded_jacket'} onClick={() => wearTop('hooded_jacket')}>후드집업</button>
          </div>
          {wearControls('상의', (nikeShirt || glbShirt) && shirtVisible,
            () => wearTop(topKind), () => { setShirtVisible(false); clearProductSlot('top') })}
            <div className="fitting-actions fitting-color-controls" role="group" aria-label="상의 색상">
              <span className="fitting-control-label">색상</span>
              {GARMENT_COLORS.map(color => <button type="button" key={color.id}
                aria-pressed={(productFit?.plan.slot==='top' ? productFit.plan.color===color.hex : garmentColor===color.id)} onClick={() => chooseTopColor(color.id)}>
                <span aria-hidden="true" style={{ display: 'inline-block', width: 14, height: 14, borderRadius: '50%',
                  border: '1px solid #999', marginRight: 6, verticalAlign: 'middle', background: color.hex }} />{color.label}
              </button>)}
              <button type="button" aria-pressed={garmentColor.startsWith('#')} onClick={()=>chooseTopColor(customTopColor)}>사용자 지정</button>
              {garmentColor.startsWith('#')&&<label className="fitting-custom-color"><input aria-label="사용자 지정 색상" type="color" value={customTopColor} onChange={event=>{setCustomTopColor(event.target.value);chooseTopColor(event.target.value)}} /></label>}
            </div>
            {glbShirt && shirtVisible && ['missing','error'].includes(garmentStatus.state) && <p role="alert">{garmentStatus.message || '상의를 불러오지 못했습니다.'}</p>}

        </fieldset>
        <fieldset className="fitting-fit-options">
          <legend>하의</legend>
          <div className="fitting-actions">
            <button type="button" aria-pressed={bottomKind === 'pants'} onClick={() => wearBottom('pants')}>바지</button>
            {modelType === 'female' && <button type="button" aria-pressed={bottomKind === 'skirt'} onClick={() => wearBottom('skirt')}>치마</button>}
          </div>
          {wearControls('하의', pantsVisible, () => wearBottom(bottomKind), () => { setPantsVisible(false); clearProductSlot('bottom') })}
          {slotColorControls('bottom','하의')}
          {pantsVisible && ['missing','error'].includes(pantsStatus.state) && <p role="alert">{pantsStatus.message || '하의를 불러오지 못했습니다.'}</p>}

        </fieldset>
        <fieldset className="fitting-fit-options">
          <legend>아우터</legend>
          {wearControls('아우터', outerVisible && modelType !== 'rings', () => {
            clearProductSlot('outer')
            if (modelType === 'rings') selectModel('test')
            setOuterVisible(true)
          }, () => { setOuterVisible(false); clearProductSlot('outer') }, glbShirt && topKind === 'hooded_jacket' && shirtVisible)}
          {slotColorControls('outer','아우터')}
          {outerVisible && ['missing','error'].includes(outerStatus.state) && <p role="alert">{outerStatus.message || '아우터를 불러오지 못했습니다.'}</p>}

        </fieldset>
        <fieldset className="fitting-fit-options">
          <legend>모자</legend>
          {wearControls('모자', capVisible && modelType !== 'rings', () => {
            clearProductSlot('headwear')
            if (modelType === 'rings') selectModel('test')
            setCapVisible(true)
          }, () => { setCapVisible(false); clearProductSlot('headwear') })}
          {capVisible && ['missing','error'].includes(capStatus.state) && <p role="alert">{capStatus.message || '모자를 불러오지 못했습니다.'}</p>}
          {slotColorControls('headwear','모자')}

        </fieldset>
        </div>
        <fieldset className="fitting-fit-options">
          <legend>마네킹 모델</legend>
          <div className="fitting-actions">
            <button type="button" aria-pressed={modelType === 'test'} onClick={() => selectModel('test')}>기본 마네킹</button>
            <button type="button" aria-pressed={modelType === 'male'} disabled={!genderModels.male}
              onClick={() => selectModel('male')}>남성형 마네킹</button>
            <button type="button" aria-pressed={modelType === 'female'} disabled={!genderModels.female}
              onClick={() => selectModel('female')}>여성형 마네킹</button>
          </div>
          {modelType === 'female' && <small>여성형 보정 의류 · 극단 체형에서 관통이 남을 수 있습니다.</small>}

          {modelType !== 'rings' && <details className="fitting-diagnostics"><summary>고급 모델 진단</summary>

            {morphTargets.length > 0 ? <>
              <label>GLB Shape Key
                <select value={morphTarget} onChange={event => { setMorphTarget(event.target.value); setMorphWeight(0) }}>
                  <option value="">파일 기본 Shape Key 유지</option>
                  {morphTargets.map(name => <option key={name} value={name}>{name}</option>)}
                </select>
              </label>
              <label>Shape Key 가중치 ({morphWeight.toFixed(2)})
                <input type="range" min={['shoulder_width','chest_volume','waist_width','pelvis_width','hip_volume','thigh_girth'].includes(morphTarget) ? -1 : 0} max="1" step="0.01" value={morphWeight} disabled={!morphTarget}
                  onChange={event => setMorphWeight(Number(event.target.value))} />
              </label>

            </> : <p>GLB Morph Target을 읽는 중입니다.</p>}
          </details>}
        </fieldset>
        {fit !== 'none' && <>
          <label className="fitting-toggle"><input type="checkbox" checked={transparent} onChange={e => setTransparent(e.target.checked)} />반투명으로 체형 비교</label>
          <label className="fitting-toggle"><input type="checkbox" disabled={!valid || busy}
            checked={fixedGarment !== null} onChange={e => { setFixedGarment(e.target.checked ? { ...parameters } : null); setServerPreview(null) }} />현재 의류 크기 고정</label>
          {ease && <p aria-live="polite">예시 단면 둘레 차이 — 가슴 {ease.chest.toFixed(1)}cm / 허리 {ease.waist.toFixed(1)}cm.
            {ease.chest < 0 || ease.waist < 0 ? ' 음수인 부위는 몸 둘레가 의류보다 큽니다.' : ' 양수는 의류 둘레가 더 크다는 뜻입니다.'}</p>}
        </>}
        {productFit && <p className="fitting-storage-note">상품: {productFit.product.name} · {productFit.product.verification}</p>}
        {productFit?.size && <p className="fitting-storage-note">선택 사이즈: {productFit.size.name} · {productFit.size.table.source.label}<br />
          입력 실측: 어깨 {productFit.size.row.shoulder} / 가슴 단면 {productFit.size.row.chestFlat} / 총장 {productFit.size.row.length} / 소매 {productFit.size.row.sleeve??'미제공'} (cm)<br />
          모델 기준점 수치 보정 · 체형 자동 확대 없음 · 실제 봉제선 대응 미검증 · 관통/착용 가능 여부 판정 아님</p>}
        <div className="fitting-view-guide" aria-label="3D 화면 사용법">
          <strong>3D 화면 사용법</strong>
          <span>마우스 드래그: 회전</span>
          <span>마우스 휠: 확대·축소</span>
          <span>오른쪽 버튼 드래그: 위치 이동</span>
          <span>아래 정면·측면·뒷면 버튼으로 방향 선택</span>
        </div>
        {valid ? <div className="fitting-canvas"><MannequinCanvas parameters={parameters} garmentParameters={garmentParameters}
          calculatedGarment={fit !== 'none' && serverPreview?.fit === fit ? serverPreview.garmentParameters : null}
          rotation={rotation} viewRevision={viewRevision} fit={fit} transparent={transparent} modelType={modelType} morphTarget={morphTarget} bodyBuild={bodyBuild}
          morphWeight={morphWeight} onMorphTargets={receiveMorphTargets} nikeShirt={nikeShirt}
          shirtVisible={shirtVisible} fixedSize={fixedGarment !== null}
          garmentGlb={glbShirt && modelType !== 'rings' ? productFit?.plan.slot === 'top' ? productFit.plan.model : getTopGarment(topKind, modelType) : null} onGarmentStatus={setGarmentStatus} garmentColor={productFit?.plan.slot === 'top' ? productFit.plan.color : garmentColor}
          bottomGarment={pantsVisible && modelType !== 'rings' ? productFit?.plan.slot === 'bottom' ? productFit.plan.model : getBottomGarment(modelType,bottomKind) : null} onBottomStatus={setPantsStatus}
          outerGarment={outerVisible && modelType !== 'rings' && !(glbShirt && topKind === 'hooded_jacket' && shirtVisible) ? productFit?.plan.slot === 'outer' ? productFit.plan.model : getOuterGarment(modelType) : null} onOuterStatus={setOuterStatus}
          headwear={capVisible && modelType !== 'rings' ? productFit?.plan.slot === 'headwear' ? productFit.plan.model : NEUTRAL_CAP_GLB : null} onHeadwearStatus={setCapStatus} headwearColor={productFit?.plan.slot === 'headwear' ? productFit.plan.color : slotColors.headwear}
          bottomColor={productFit?.plan.slot === 'bottom' ? productFit.plan.color : slotColors.bottom} outerColor={productFit?.plan.slot === 'outer' ? productFit.plan.color : slotColors.outer}
          productDesign={productFit?.plan.category === 'short_sleeve' ? productFit.design : null}
          productSize={productFit?.plan.category === 'short_sleeve' ? productFit.size : null} onSizeMetrics={receiveSizeMetrics} /></div>
          : <div className="fitting-canvas fitting-empty">모든 치수를 허용 범위 안으로 입력하면 마네킹이 표시됩니다.</div>}
        <label>회전 ({rotation}°)<input type="range" min="-180" max="180" value={rotation} onChange={e => selectView(Number(e.target.value))} /></label>
        <div className="fitting-actions">
          <button type="button" onClick={() => selectView(0)}>정면</button>
          <button type="button" onClick={() => selectView(90)}>옆면</button>
          <button type="button" onClick={() => selectView(180)}>뒷면</button>
        </div>

      </section>
    </div>
  </main>
}
