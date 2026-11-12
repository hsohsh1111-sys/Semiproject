// Existing destinations only. Search input never becomes a URL or an API request.
const features = [
  { id: 'fitting', title: '3D 피팅', description: '마네킹 체형 조절과 의류 착용', href: '#/fitting', keywords: ['피팅', '가상피팅', '3d', '마네킹', '인바디', '체형', '키', '치수', '상의', '하의', '티셔츠', '반팔', '긴팔', '후드', '바지', '치마', '모자', '아우터', '색상'] },
  { id: 'ai', title: 'AI 패션 검색', description: '이미지로 패션 상품 찾기', href: '/ai-fashion/', keywords: ['ai', '패션검색', '사진', '이미지', '상품', '옷찾기', '이미지검색'] },
  { id: 'outfits', title: '스타일 추천', description: '나에게 어울리는 코디 찾기', href: '#/outfits', keywords: ['스타일', '추천', '코디', '옷추천'] },
  { id: 'style', title: '스타일 진단', description: '취향에 맞는 스타일 알아보기', href: '#/style', keywords: ['스타일', '취향', '진단', '테스트'] },
  { id: 'seasonal', title: '시즌 코디', description: '계절에 맞는 스타일 둘러보기', href: '#/seasonal', keywords: ['시즌', '계절', '봄', '여름', '가을', '겨울', '코디'] },
  { id: 'wardrobe', title: '나의 옷장', description: '찜한 아이템과 저장한 코디', href: '#/wardrobe', keywords: ['옷장', '찜', '즐겨찾기', '저장', '내옷'] },
  { id: 'price', title: '가격 인사이트', description: '가격 이력과 구매 시점 확인', href: '#/price', keywords: ['가격', '가격이력', '인사이트', '구매', '타이밍', '할인'] },
  { id: 'compare', title: '가격 비교', description: '상품의 판매처별 가격 비교', href: '#/compare', keywords: ['가격', '비교', '판매처', '최저가'] },
  { id: 'mypage', title: '마이페이지', description: '내 정보 확인과 계정 관리 · 로그인 필요', href: '#/mypage', keywords: ['마이페이지', '내정보', '계정', '닉네임', '휴대폰', '회원탈퇴', '탈퇴'] },
  { id: 'admin', title: '관리자', description: '가입 통계와 회원 현황', href: '#/admin', adminOnly: true, keywords: ['관리자', '회원현황', '가입통계'] },
]

const normalize = value => String(value ?? '').toLowerCase().replace(/\s+/g, '')
export function searchFeatures(query, isAdmin = false) {
  const term = normalize(query)
  return features.filter(feature => !feature.adminOnly || isAdmin).map(feature => {
    const title = normalize(feature.title)
    const matches = feature.keywords.map(normalize)
    const score = !term ? 1 : title === term ? 100 : title.includes(term) ? 80
      : matches.includes(term) ? 60 : matches.some(word => word.includes(term)) ? 40 : 0
    return { ...feature, score }
  }).filter(feature => feature.score > 0).sort((a, b) => b.score - a.score).slice(0, 6)
}
