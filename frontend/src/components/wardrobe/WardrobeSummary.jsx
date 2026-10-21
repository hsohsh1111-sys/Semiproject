import Icon from '../common/Icon.jsx'
export default function WardrobeSummary({ onExplore }) {
  return <section className="wardrobe-summary"><div className="wardrobe-symbol"><Icon name="ShoppingBag" size={25} /></div><div><span className="eyebrow">YOUR DIGITAL CLOSET</span><h3>나의 옷장을 채워 보세요</h3><p>자주 입는 옷을 담으면 더 잘 맞는 코디를 추천해 드려요.</p></div><button className="button button-outline" onClick={onExplore}>아이템 둘러보기 <Icon name="ArrowRight" size={15} /></button></section>
}
