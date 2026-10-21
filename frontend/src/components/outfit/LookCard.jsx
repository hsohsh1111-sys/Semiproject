import Icon from '../common/Icon.jsx'
export default function LookCard({ look, index }) {
  return <article className="look-card">
    <a className="look-image" href="#/outfits"><img src={look.image} alt={look.title} loading="lazy" /><span className="look-number">0{index + 1}</span><span className="look-open"><Icon name="ArrowUpRight" size={18} /></span></a>
    <div className="look-details"><div><span className="eyebrow">{look.label}</span><h3>{look.title}</h3></div><span className="match-score">{look.match}%<small>MATCH</small></span></div>
    <p>{look.description}</p>
  </article>
}
