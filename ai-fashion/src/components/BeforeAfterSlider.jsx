import React, { useRef, useState } from 'react'

const beforeImage = `${import.meta.env.BASE_URL}images/style-before.png`
const afterImage = `${import.meta.env.BASE_URL}images/style-after.png`

export default function BeforeAfterSlider() {
  const [position, setPosition] = useState(50)
  const dragging = useRef(null)

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

  return <div className="landing-compare" style={{ '--split': `${position}%` }}
    role="slider" tabIndex={0} aria-label="기존 스타일과 추천 스타일 비교"
    aria-valuemin={0} aria-valuemax={100} aria-valuenow={position}
    aria-valuetext={`기존 스타일 ${position}%, 추천 스타일 ${100 - position}%`}
    onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
    onPointerUp={handlePointerEnd} onPointerCancel={handlePointerEnd}
    onKeyDown={handleKeyDown}>
    <img className="landing-compare-image landing-compare-after" src={afterImage}
      alt="초콜릿 브라운 블레이저 스타일링" draggable="false" />
    <img className="landing-compare-image landing-compare-before" src={beforeImage}
      alt="베이지 니트 스타일링" draggable="false" />
    <span className="landing-compare-label landing-compare-label-left">기존 스타일</span>
    <span className="landing-compare-label landing-compare-label-right">추천 스타일</span>
    <span className="landing-compare-divider" aria-hidden="true">
      <span className="landing-compare-handle">‹ <span>›</span></span>
    </span>
  </div>
}
