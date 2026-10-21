export default function BrandMark({ light = false, compact = false }) {
  return (
    <a className={`brand-mark ${light ? 'brand-mark-light' : ''} ${compact ? 'brand-mark-compact' : ''}`} href="#/home" aria-label="ONFIT 홈">
      <img src="/onfit-mark.svg" alt="" />
      {!compact && <span><strong>ONFIT</strong><small>FIND YOUR OWN FIT</small></span>}
    </a>
  )
}
