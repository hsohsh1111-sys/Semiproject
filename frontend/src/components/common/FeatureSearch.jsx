import { useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import { searchFeatures } from '../../services/featureSearch.js'
import './FeatureSearch.css'

export default function FeatureSearch({ isAdmin = false }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const root = useRef(null)
  const input = useRef(null)
  const trigger = useRef(null)
  const results = searchFeatures(query, isAdmin)
  function close(restoreFocus = false) {
    setOpen(false)
    if (restoreFocus) trigger.current?.focus()
  }
  function navigate(result) {
    if (!result) return
    close(true)
    window.location.assign(result.href)
  }
  useEffect(() => {
    if (!open) return
    input.current?.focus()
    const outside = event => { if (!root.current?.contains(event.target)) close() }
    const escape = event => { if (event.key === 'Escape') close(true) }
    const routeChanged = () => close()
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    window.addEventListener('hashchange', routeChanged)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
      window.removeEventListener('hashchange', routeChanged)
    }
  }, [open])
  return <div className="feature-search" ref={root} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) close()
  }}>
    <button ref={trigger} type="button" className="icon-button search-action" aria-label="기능 검색" aria-expanded={open} aria-controls="feature-search-panel" onClick={() => { setOpen(!open); setQuery(''); setActive(0) }}><Icon name="Search" /></button>
    {open && <section id="feature-search-panel" className="feature-search-panel" aria-label="기능 검색">
      <form role="search" onSubmit={event => { event.preventDefault(); navigate(results[active] || results[0]) }}>
        <label htmlFor="feature-search-input">어떤 기능을 찾으세요?</label>
        <div className="feature-search-input-row"><input ref={input} id="feature-search-input" type="search" placeholder="인바디, 코디, 가격 등을 검색하세요" maxLength={80} autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="feature-search-results" aria-activedescendant={results[active] ? `feature-result-${results[active].id}` : undefined} value={query} onChange={event => { setQuery(event.target.value); setActive(0) }} onKeyDown={event => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) { if (event.key === 'Enter') event.preventDefault(); return }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            if (results.length) setActive(value => (value + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length)
          }
        }} /><button type="submit" aria-label="검색 결과로 이동" disabled={!results.length}><Icon name="Search" size={18} /></button></div>
      </form>
      <p className="feature-search-caption">{query.trim() ? '연관 기능 · 선택하면 해당 페이지로 이동합니다' : '자주 찾는 기능'}</p>
      <div id="feature-search-results" role="listbox" aria-label="연관 기능">
        {results.map((result, index) => <button type="button" role="option" id={`feature-result-${result.id}`} aria-selected={active === index} key={result.id} className="feature-search-result" onPointerMove={() => setActive(index)} onClick={() => navigate(result)}><span><strong>{result.title}</strong><small>{result.description}</small></span><Icon name="ArrowRight" size={16} /></button>)}
      </div>
      {!results.length && <p className="feature-search-empty" role="status">연관된 기능이 없습니다. 다른 단어로 검색해 주세요.</p>}
      <button className="feature-search-close" type="button" onClick={() => close(true)}>닫기</button>
    </section>}
  </div>
}
