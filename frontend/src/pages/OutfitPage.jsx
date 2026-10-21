import LookCard from '../components/outfit/LookCard.jsx'
import StyleChips from '../components/outfit/StyleChips.jsx'
import Icon from '../components/common/Icon.jsx'
const looks = [
  { title: '소프트 시티 룩', label: 'CITY · EASY', match: 96, description: '뉴트럴 컬러에 가벼운 포인트를 더한 오늘의 산책 코디.', image: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1050&q=85' },
  { title: '모던 데일리', label: 'MODERN · DAILY', match: 92, description: '매일 입는 아이템을 새로운 비율과 색감으로 조합했어요.', image: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1050&q=85' },
  { title: '위켄드 클래식', label: 'WEEKEND · CLASSIC', match: 89, description: '편안하지만 오래 기억에 남는 주말의 클래식 룩.', image: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1050&q=85' },
]
export default function OutfitPage() {
  return <main className="inner-page"><div className="page-hero page-hero-olive"><span className="eyebrow">02 / PERSONAL OUTFIT</span><h1>오늘의 무드에<br /><em>나만의 조합.</em></h1><p>취향과 일상에 맞춰 골라 본 ONFIT의 코디 셀렉션.</p><span className="page-hero-mark">✳</span></div>
    <section className="outfit-results section-wrap"><div className="outfit-toolbar"><div><span className="eyebrow">YOUR DAILY EDIT</span><h2>이런 스타일은 어때요?</h2><p>프로필을 바꾸면 추천도 새로워져요.</p></div><div className="outfit-filters"><StyleChips selected="미니멀" /><a href="#/style" className="filter-link"><Icon name="SlidersHorizontal" size={15} /> 취향 조정</a></div></div>
      <div className="look-grid">{looks.map((look, i) => <LookCard key={look.title} look={look} index={i} />)}</div><div className="center-cta"><button className="button button-outline">다른 코디 더 보기 <Icon name="ArrowDownRight" size={16} /></button></div>
    </section>
  </main>
}
