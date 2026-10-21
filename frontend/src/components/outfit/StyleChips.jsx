const options = ['미니멀', '클래식', '시티 캐주얼', '로맨틱', '스트리트']
export default function StyleChips({ selected, onSelect }) {
  return <div className="style-chips">{options.map((item) => <button key={item} className={selected === item ? 'selected' : ''} onClick={() => onSelect?.(item)}>{item}</button>)}</div>
}
