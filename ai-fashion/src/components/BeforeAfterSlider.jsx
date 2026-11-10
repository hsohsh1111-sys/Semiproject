import React, { useEffect, useRef, useState } from 'react'

const beforeImage = `${import.meta.env.BASE_URL}images/style-before.png`
const afterImage = `${import.meta.env.BASE_URL}images/style-after.png`

export default function BeforeAfterSlider({ beforeSrc = beforeImage, afterSrc = afterImage, actual = false }) {
  const [position, setPosition] = useState(50)
  const dragging = useRef(null)
  const [comparison, setComparison] = useState(null)
  const [sideBySide, setSideBySide] = useState(false)

  useEffect(() => {
    if (!actual) return undefined
    let cancelled = false
    setComparison(null)
    setSideBySide(false)
    const dimensions = (src) => new Promise((resolve) => {
      const image = new Image()
      image.onload = () => resolve([image.naturalWidth, image.naturalHeight])
      image.onerror = () => resolve(null)
      image.src = src
    })
    Promise.all([dimensions(beforeSrc), dimensions(afterSrc)]).then(([before, after]) => {
      if (cancelled) return
      const beforeRatio = before && before[0] / before[1]
      const afterRatio = after && after[0] / after[1]
      setComparison(beforeRatio && afterRatio && Math.abs(beforeRatio - afterRatio) / beforeRatio <= 0.03
        ? { aligned: true, ratio: beforeRatio } : { aligned: false })
    })
    return () => { cancelled = true }
  }, [actual, beforeSrc, afterSrc])

  const beforeLabel = actual ? '원본 사진' : '기존 스타일'
  const afterLabel = actual ? '가상 착용 결과' : '추천 스타일'

  function moveToPointer(event) {
    const bounds = event.currentTarget.getBoundingClientRect()
    const next = ((event.clientX - bounds.left) / bounds.width) * 100
    setPosition(Math.round(Math.max(0, Math.min(100, next)) * 10) / 10)
  }

  function handlePointerDown(event) {
    dragging.current = event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
    moveToPointer(event)
  }

  function handlePointerMove(event) {
    if (dragging.current === event.pointerId) moveToPointer(event)
  }

  function handlePointerEnd(event) {
    if (dragging.current !== event.pointerId) return
    dragging.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function handleKeyDown(event) {
    const changes = { ArrowLeft: -1, ArrowRight: 1, PageDown: -10, PageUp: 10 }
    if (event.key in changes) {
      event.preventDefault()
      setPosition((current) => Math.max(0, Math.min(100, current + changes[event.key])))
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      setPosition(event.key === 'Home' ? 0 : 100)
    }
  }

  const fallback = <div className="tryon-compare-fallback">
    <figure><img src={beforeSrc} alt="가상 착용 전 원본 사진" /><figcaption>원본 사진</figcaption></figure>
    <figure><img src={afterSrc} alt="AI 가상 착용 결과" /><figcaption>가상 착용 결과</figcaption></figure>
  </div>

  if (actual && !comparison?.aligned) return fallback

  const slider = <div className={`landing-compare${actual ? ' tryon-compare-slider' : ''}`}
    style={{ '--split': `${position}%`, ...(actual ? { aspectRatio: comparison.ratio } : {}) }}
    role="slider" tabIndex={0} aria-label={actual ? '원본 사진과 가상 착용 결과 비교' : '기존 스타일과 추천 스타일 비교'}
    aria-valuemin={0} aria-valuemax={100} aria-valuenow={position}
    aria-valuetext={`${beforeLabel} ${position}%, ${afterLabel} ${100 - position}%`}
    onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
    onPointerUp={handlePointerEnd} onPointerCancel={handlePointerEnd}
    onKeyDown={handleKeyDown}>
    <img className="landing-compare-image landing-compare-after" src={afterSrc}
      alt={actual ? 'AI 가상 착용 결과' : '초콜릿 브라운 블레이저 스타일링'} draggable="false" />
    <img className="landing-compare-image landing-compare-before" src={beforeSrc}
      alt={actual ? '가상 착용 전 원본 사진' : '베이지 니트 스타일링'} draggable="false" />
    <span className="landing-compare-label landing-compare-label-left">{beforeLabel}</span>
    <span className="landing-compare-label landing-compare-label-right">{afterLabel}</span>
    <span className="landing-compare-divider" aria-hidden="true">
      <span className="landing-compare-handle">‹ <span>›</span></span>
    </span>
  </div>

  return actual ? <div className="tryon-compare-wrap">
    <button type="button" className="secondary" onClick={() => setSideBySide((value) => !value)}>
      {sideBySide ? '슬라이더로 비교' : '나란히 비교'}
    </button>
    {sideBySide ? fallback : slider}
  </div> : slider
}
