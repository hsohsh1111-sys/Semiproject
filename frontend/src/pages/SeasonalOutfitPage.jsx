import { useEffect, useMemo, useState } from 'react'
import Icon from '../components/common/Icon.jsx'
import { getMockProducts } from '../services/api.js'
import { AUTH_CHANGE_EVENT, getAccessToken } from '../services/auth.js'
import { getSeasonalFavoriteId, getSeasonalFavorites, toggleSeasonalFavorite } from '../services/seasonalFavorites.js'

const ageGroups = ['전체', '10대', '20대', '30대', '40대', '50대', '60대']
const genders = ['전체', '여성', '남성']

const seasonDetails = {
  겨울: {
    description: '울 코트와 포근한 니트, 겨울 소품을 조합해 추운 날씨에 따뜻하게 입어요.',
  },
}

const demographicLooks = [
  { id: '10w', age: '10대', gender: '여성', title: '포근한 컬러 데일리', style: '캐주얼', description: '따뜻한 니트와 겨울 아우터를 겹쳐 입은 활동적인 등교 룩.' },
  { id: '10m', age: '10대', gender: '남성', title: '윈터 스트릿 레이어드', style: '스트릿', description: '도톰한 아우터와 니트 레이어링으로 추운 날에도 편안한 룩.' },
  { id: '20w', age: '20대', gender: '여성', title: '윈터 시티 룩', style: '미니멀', description: '롱 코트와 포근한 니트로 완성하는 도시적인 겨울 코디.' },
  { id: '20m', age: '20대', gender: '남성', title: '모던 윈터 위켄드', style: '캐주얼', description: '울 소재 아우터와 니트를 매치한 주말 외출 코디.' },
  { id: '30w', age: '30대', gender: '여성', title: '클래식 코트 스타일', style: '클래식', description: '차분한 코트와 따뜻한 니트로 단정하게 입는 겨울 룩.' },
  { id: '30m', age: '30대', gender: '남성', title: '윈터 스마트 테일러링', style: '클래식', description: '울 레이어와 구조적인 아우터를 조합한 겨울 세미 포멀 룩.' },
  { id: '40w', age: '40대', gender: '여성', title: '에센셜 겨울 레이어', style: '미니멀', description: '보온성 있는 니트와 코트로 오래 입기 좋은 겨울 코디.' },
  { id: '40m', age: '40대', gender: '남성', title: '컨템포러리 윈터', style: '캐주얼', description: '도톰한 니트와 겨울 아우터를 활용한 편안한 데일리 룩.' },
  { id: '50w', age: '50대', gender: '여성', title: '타임리스 울 코트', style: '클래식', description: '부드러운 니트와 차분한 코트로 완성하는 겨울 스타일.' },
  { id: '50m', age: '50대', gender: '남성', title: '이지 클래식 윈터', style: '클래식', description: '울 니트와 따뜻한 겉옷을 겹쳐 입은 스마트 캐주얼 코디.' },
  { id: '60w', age: '60대', gender: '여성', title: '컴포트 니트 산책 룩', style: '캐주얼', description: '포근한 니트와 겨울 아우터로 따뜻함을 챙긴 산책 코디.' },
  { id: '60m', age: '60대', gender: '남성', title: '클래식 겨울 주말 룩', style: '클래식', description: '보온성 있는 레이어와 편안한 핏을 살린 겨울 주말 코디.' },
]

const additionalLookTitles = [
  ['캠퍼스 패딩 레이어', '울 코트 시티 룩', '포근한 오피스 룩', '에센셜 니트 레이어', '이지 코트 클래식', '컴포트 윈터 산책'],
  ['주말 헤비 레이어', '윈터 포인트 룩', '모던 울 레이어', '릴랙스드 겨울 룩', '세련된 코트 데일리', '타임리스 니트 룩'],
]

const additionalLookDescriptions = [
  '두꺼운 겨울 아우터와 따뜻한 니트를 겹쳐 입어 보온성을 높였어요.',
  '울 소재와 포근한 겨울 소품을 더해 추운 날에도 편안하게 입어요.',
]

const outfitLooks = demographicLooks.flatMap((look) => {
  const ageIndex = ageGroups.indexOf(look.age) - 1

  return [
    { ...look, id: `${look.id}-1`, variant: 0, ageIndex },
    ...additionalLookTitles.map((titles, index) => ({
      ...look,
      id: `${look.id}-${index + 2}`,
      variant: index + 1,
      ageIndex,
      title: titles[ageIndex],
      style: index === 0 ? '캐주얼' : '클래식',
      description: additionalLookDescriptions[index],
    })),
  ]
})

const productSlotsByGender = {
  여성: [
    { type: '겨울 아우터', catalogs: ['vesna', 'apparel', 'snowwear', 'highticket', 'intl', 'boutique', 'streetwearPod', 'apparelStreetwear'], matches: /\b(coats?|overcoats?|parkas?|puffers?|jackets?|sherpa)\b/i, exclude: /\b(bags?|totes?|backpacks?|pants?|hoodies?|beanies?|hats?|linen|lightweight|fishing|angling)\b/i },
    { type: '따뜻한 니트', catalogs: ['apparel', 'intl', 'menswear', 'vesna', 'apparelCore', 'streetwear', 'streetwearPod', 'apparelStreetwear'], matches: /\b(wool|cashmere|knit|sweater|cardigan|pullover|hoodie|sweatshirt)\b/i, exclude: /\b(lightweight|linen|scarf|beanie|hat|cap|glove|mittens?|blazer|coats?|overcoats?|jackets?|parka|puffer|overshirt|bundle)\b/i },
    { type: '겨울 소품', catalogs: ['accessories', 'apparel', 'snowwear', 'intl', 'boutique', 'retail', 'outdoor', 'autoaccessories', 'vesna'], matches: /\b(beanie|knit cap|winter gloves|gloves|mittens?|scarf|shawl|hat|hiking socks?|hiking boots?)\b/i, exclude: /\b(restoration|maintenance|fedora|trilby|candle|driving|golf|silk|linen|marsh|cycling|soccer|football|baseball|keytag|fingerless|mesh)\b/i },
  ],
  남성: [
    { type: '겨울 아우터', catalogs: ['vesna', 'apparel', 'snowwear', 'menswear', 'intl', 'streetwearPod', 'apparelStreetwear'], matches: /\b(coats?|overcoats?|parkas?|puffers?|jackets?|sherpa|overshirt)\b/i, exclude: /\b(bags?|totes?|backpacks?|pants?|hoodies?|beanies?|hats?|linen|lightweight|fishing|angling)\b/i },
    { type: '따뜻한 니트', catalogs: ['menswear', 'intl', 'apparel', 'vesna', 'apparelCore', 'streetwear', 'streetwearPod', 'apparelStreetwear'], matches: /\b(wool|cashmere|knit|sweater|pullover|cardigan|hoodie|sweatshirt)\b/i, exclude: /\b(lightweight|linen|scarf|beanie|hat|cap|glove|mittens?|blazer|coats?|overcoats?|jackets?|parka|puffer|overshirt|bundle)\b/i },
    { type: '겨울 소품', catalogs: ['accessories', 'menswear', 'apparel', 'snowwear', 'intl', 'retail', 'outdoor', 'autoaccessories', 'vesna'], matches: /\b(beanie|knit cap|winter gloves|gloves|mittens?|scarf|shawl|hat|hiking socks?|hiking boots?)\b/i, exclude: /\b(restoration|maintenance|fedora|trilby|candle|driving|golf|silk|linen|marsh|cycling|soccer|football|baseball|keytag|fingerless|mesh)\b/i },
  ],
}

const catalogIds = ['apparel', 'intl', 'menswear', 'highticket', 'accessories', 'snowwear', 'vesna', 'apparelCore', 'boutique', 'streetwear', 'retail', 'streetwearPod', 'apparelStreetwear', 'outdoor', 'autoaccessories']

const ageStylePreferences = {
  '10대': { prefer: /\b(teen|youth|children|girls?|boys?|hoodie|sweatshirt|graphic|streetwear|sport|athletic|bomber|fan|football|logo|knit)\b/i, avoid: /\b(toddler|cashmere|tailored|silk|designer|architectural|overcoat|blazer|merino)\b/i },
  '20대': { prefer: /\b(oversized|cropped|modern|streetwear|graphic|urban|utility|contemporary|minimalist|statement|bomber|fan|football)\b/i, avoid: /\b(toddler|children)\b/i },
  '30대': { prefer: /\b(wool|cashmere|classic|tailored|minimalist|structured|chore|field|merino)\b/i, avoid: /\b(toddler|children|graphic|acid-lime|fingerless)\b/i },
  '40대': { prefer: /\b(wool|cashmere|classic|minimalist|structured|practical|field|overcoat|merino)\b/i, avoid: /\b(toddler|children|graphic|acid-lime|fingerless)\b/i },
  '50대': { prefer: /\b(wool|cashmere|soft|warm|classic|comfort|cardigan|shawl|merino)\b/i, avoid: /\b(toddler|children|graphic|acid-lime|fingerless)\b/i },
  '60대': { prefer: /\b(soft|warm|comfort|classic|wool|cashmere|easy|shawl|cardigan|merino|insulated|practical|overcoat|scarf|gloves|beanie)\b/i, avoid: /\b(toddler|children|graphic|acid-lime|fingerless)\b/i },
}

const genderedWomen = /\b(women(?:'s)?|woman|female|lad(?:y|ies)|girls?)\b/i
const genderedMen = /\b(men(?:'s)?|man|male|boys?)\b/i

function isProductForGender(product, catalogId, gender) {
  if (gender === '여성' && genderedMen.test(product.title)) return false
  if (gender === '남성' && genderedWomen.test(product.title)) return false
  if (gender === '여성' && catalogId === 'menswear' && !/\bunisex\b/i.test(product.title)) return false
  if (gender === '남성' && catalogId === 'boutique' && !/\b(men(?:'s)?|unisex)\b/i.test(product.title)) return false
  return true
}

function getAgeRelevance(product, look, catalogId, gender) {
  const preferences = ageStylePreferences[look.age]
  const searchableText = `${product.title} ${product.productType ?? ''}`
  let score = preferences.prefer.test(searchableText) ? 10 : 0
  if (preferences.avoid.test(searchableText)) score -= 20
  if (/\btoddler\b/i.test(searchableText)) score -= 100
  if (gender === '남성' && catalogId === 'menswear') score += 2
  if (gender === '여성' && catalogId === 'boutique') score += 2
  return score
}

function getProductAssignments(productCatalog) {
  const assignments = Object.fromEntries(outfitLooks.map((look) => [look.id, []]))
  for (let slotIndex = 0; slotIndex < 3; slotIndex += 1) {
    const genderProducts = { 여성: new Map(), 남성: new Map() }
    const lookCandidates = outfitLooks.map((look) => {
      const slot = productSlotsByGender[look.gender][slotIndex]
      const uniqueProducts = new Map()
      for (const catalogId of slot.catalogs) {
        for (const product of productCatalog[catalogId]?.items ?? []) {
          if (!slot.matches.test(product.title)
            || slot.exclude.test(product.title)
            || !isProductForGender(product, catalogId, look.gender)) continue
          const key = product.title.toLocaleLowerCase().replace(/[^a-z0-9]/g, '')
          if (!uniqueProducts.has(key)) uniqueProducts.set(key, { ...product, catalogId, key })
        }
      }
      const products = [...uniqueProducts.values()]
      for (const product of products) genderProducts[look.gender].set(product.key, product)
      return { look, products }
    })
    const genderOwners = new Map()
    for (const [gender, products] of Object.entries(genderProducts)) {
      for (const key of products.keys()) {
        genderOwners.set(key, [...(genderOwners.get(key) ?? []), gender])
      }
    }

    const usedProducts = new Set()
    const productLookPairs = lookCandidates.flatMap(({ look, products }) => (
      products.map((product) => ({
        look,
        product,
        score: getAgeRelevance(product, look, product.catalogId, look.gender)
          + (genderOwners.get(product.key)?.length === 1 ? 8 : 0),
      }))
    )).sort((a, b) => b.score - a.score)
    for (const { look, product } of productLookPairs) {
      if (assignments[look.id][slotIndex] || usedProducts.has(product.key)) continue
      assignments[look.id][slotIndex] = product
      usedProducts.add(product.key)
    }

    for (const { look, products } of lookCandidates) {
      if (assignments[look.id][slotIndex]) continue
      const product = products.find((candidate) => !usedProducts.has(candidate.key))
      if (product) {
        assignments[look.id][slotIndex] = product
        usedProducts.add(product.key)
      }
    }
  }
  return assignments
}

const formatSamplePrice = (product) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: product.currencyCode,
}).format(product.price)
const getMockProductUrl = (product) => `${product.storefrontUrl}/products/${encodeURIComponent(product.handle)}`

function LookProductBoard({ look, productAssignments, productCatalog, large = false }) {
  return (
    <div className={`seasonal-look-board${large ? ' seasonal-look-board-large' : ''}`} role="img" aria-label={`${look.title} 추천 아이템 구성`}>
      {productSlotsByGender[look.gender].map((slot, slotIndex) => {
        const catalogStates = slot.catalogs.map((catalogId) => productCatalog[catalogId]).filter(Boolean)
        const product = productAssignments[look.id]?.[slotIndex]
        const catalogsLoaded = catalogStates.length === slot.catalogs.length
        return (
          <div className="seasonal-look-board-item" key={slot.type}>
            {product ? (
              <>
                <img src={product.imageUrl} alt="" loading="lazy" />
                {large && (
                  <span className="seasonal-look-board-caption">
                    <small>{slot.type}</small>
                    <strong>{product.title}</strong>
                    <b>{formatSamplePrice(product)}</b>
                  </span>
                )}
              </>
            ) : (
              <span className="seasonal-look-board-placeholder">
                {catalogsLoaded ? `${slot.type} 샘플 없음` : '상품 불러오는 중'}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function SeasonalOutfitPage() {
  const [hasStarted, setHasStarted] = useState(false)
  const [selectedAge, setSelectedAge] = useState('전체')
  const [selectedGender, setSelectedGender] = useState('전체')
  const [viewingLook, setViewingLook] = useState(null)
  const [productCatalog, setProductCatalog] = useState({})
  const [favorites, setFavorites] = useState([])
  const [favoriteError, setFavoriteError] = useState('')
  const [savingFavoriteIds, setSavingFavoriteIds] = useState(() => new Set())
  const productAssignments = useMemo(() => getProductAssignments(productCatalog), [productCatalog])
  const season = '겨울'
  const seasonInfo = seasonDetails[season]
  const looks = outfitLooks.filter((look) => (
    (selectedAge === '전체' || look.age === selectedAge)
    && (selectedGender === '전체' || look.gender === selectedGender)
  ))
  const ageSections = selectedAge === '전체'
    ? ageGroups.slice(1)
      .map((age) => ({ age, looks: looks.filter((look) => look.age === age) }))
      .filter((section) => section.looks.length > 0)
    : []
  useEffect(() => {
    let active = true
    const loadFavorites = async () => {
      if (getAccessToken()) setFavorites([])
      try {
        const loadedFavorites = await getSeasonalFavorites()
        if (active) {
          setFavorites(loadedFavorites)
          setFavoriteError('')
        }
      } catch (error) {
        if (active) setFavoriteError(error instanceof Error ? error.message : '찜 목록을 불러오지 못했습니다.')
      }
    }
    loadFavorites()
    window.addEventListener(AUTH_CHANGE_EVENT, loadFavorites)
    return () => {
      active = false
      window.removeEventListener(AUTH_CHANGE_EVENT, loadFavorites)
    }
  }, [])

  const handleFavorite = async (look, slot, product, isSaved) => {
    const favoriteId = getSeasonalFavoriteId(look, product, slot.type)
    setSavingFavoriteIds((current) => new Set(current).add(favoriteId))
    try {
      setFavorites(await toggleSeasonalFavorite(look, season, slot.type, product, isSaved))
      setFavoriteError('')
    } catch (error) {
      setFavoriteError(error instanceof Error ? error.message : '찜 목록을 저장하지 못했습니다.')
    } finally {
      setSavingFavoriteIds((current) => {
        const next = new Set(current)
        next.delete(favoriteId)
        return next
      })
    }
  }

  const renderLookCards = (groupLooks) => groupLooks.map((look, index) => {
    return (
    <article className="seasonal-look-card" key={look.id}>
      <div className="seasonal-look-image">
        <button
          type="button"
          className="seasonal-look-image-button"
          onClick={() => setViewingLook(look)}
          aria-label={`${look.title} 추천 아이템 전체 보기`}
        >
          <LookProductBoard look={look} productAssignments={productAssignments} productCatalog={productCatalog} />
          <span className="seasonal-look-view"><Icon name="Search" size={14} /> 추천 아이템 보기</span>
        </button>
        <span className="seasonal-look-number">{String(index + 1).padStart(2, '0')}</span>
        <span className="seasonal-look-style">{look.style}</span>
      </div>
      <div className="seasonal-look-body">
        <div className="seasonal-look-meta"><span>{look.age}</span><i />{look.gender}<i />{season}</div>
        <h3>{look.title}</h3>
        <p className="seasonal-look-description">{look.description}</p>
        <div className="seasonal-products">
          <div className="seasonal-products-heading">
            <span>THIS LOOK · MOCK.SHOP SAMPLES</span>
            <Icon name="ShoppingBag" size={15} />
          </div>
          {productSlotsByGender[look.gender].map((slot, slotIndex) => {
            const catalogStates = slot.catalogs.map((catalogId) => productCatalog[catalogId]).filter(Boolean)
            const product = productAssignments[look.id]?.[slotIndex]
            const catalogsLoaded = catalogStates.length === slot.catalogs.length
            const isFavorite = product && favorites.some((favorite) => favorite.id === getSeasonalFavoriteId(look, product, slot.type))
            return <div className="seasonal-product-row" key={slot.type}>
              {product ? (
                <>
                  <a className="seasonal-catalog-product" href={getMockProductUrl(product)} target="_blank" rel="noopener noreferrer">
                    <img src={product.imageUrl} alt="" loading="lazy" />
                    <span className="seasonal-catalog-copy">
                      <small>{slot.type} · {product.vendor}</small>
                      <strong>{product.title}</strong>
                      <b>{formatSamplePrice(product)}</b>
                    </span>
                    <span className="seasonal-catalog-link">바로가기 <Icon name="ArrowUpRight" size={11} /></span>
                  </a>
                  <button
                    type="button"
                    className={`seasonal-favorite-button${isFavorite ? ' is-saved' : ''}`}
                    aria-label={isFavorite ? `${product.title} 찜 취소` : `${product.title} 찜하기`}
                    aria-pressed={Boolean(isFavorite)}
                    disabled={savingFavoriteIds.has(getSeasonalFavoriteId(look, product, slot.type))}
                    onClick={() => handleFavorite(look, slot, product, Boolean(isFavorite))}
                  >
                    <Icon name="Heart" size={17} />
                  </button>
                </>
              ) : catalogsLoaded ? (
                <p className="seasonal-search-error" role="status">{`겨울용 ${slot.type} 샘플 상품을 찾지 못했습니다.`}</p>
              ) : (
                <p className="seasonal-catalog-loading">Mock.shop 카탈로그 불러오는 중…</p>
              )}
            </div>
          })}
        </div>
      </div>
    </article>
    )
  })

  useEffect(() => {
    if (!hasStarted) return undefined

    let active = true
    async function loadCatalog() {
      const entries = await Promise.all(catalogIds.map(async (catalogId) => {
        try {
          const items = await getMockProducts(catalogId)
          return [catalogId, {
            items,
            error: items.length ? '' : '이 카테고리에 표시할 샘플 상품이 없습니다.',
          }]
        } catch (error) {
          const message = error instanceof Error ? error.message : '샘플 상품을 불러오지 못했습니다.'
          return [catalogId, { items: [], error: message }]
        }
      }))
      if (active) setProductCatalog(Object.fromEntries(entries))
    }
    loadCatalog()
    return () => { active = false }
  }, [hasStarted])

  useEffect(() => {
    if (!viewingLook) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setViewingLook(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [viewingLook])

  if (!hasStarted) {
    return <main className="inner-page">
      <section className="seasonal-guide section-wrap">
        <div className="seasonal-guide-visual">
          <img
            src="https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1050&q=85"
            alt="겨울 패션을 살펴보는 여성"
            fetchPriority="high"
          />
          <span className="seasonal-guide-image-note">
            <small>ONFIT · WINTER EDIT</small>
            <strong>Find your<br />winter mood.</strong>
          </span>
        </div>
        <div className="seasonal-guide-content">
          <span className="eyebrow">05 / SEASONAL LOOKBOOK</span>
          <h1>나에게 맞는<br /><em>겨울 코디를 찾아요.</em></h1>
          <p className="seasonal-guide-intro">연령대와 성별에 어울리는 겨울 스타일을 살펴보고, 마음에 드는 코디 아이템까지 한 번에 확인해 보세요.</p>
          <button className="button button-dark seasonal-guide-button" type="button" onClick={() => setHasStarted(true)}>
            겨울 코디 둘러보기 <Icon name="ArrowRight" size={16} />
          </button>
          <small className="seasonal-guide-note">상품 링크는 시연용 테스트 스토어로 연결됩니다.</small>
          <ol className="seasonal-guide-steps">
            <li>
              <span>01</span>
              <div><strong>나에게 맞는 조건 선택</strong><p>연령대와 성별을 골라 취향에 가까운 코디를 찾아요.</p></div>
            </li>
            <li>
              <span>02</span>
              <div><strong>코디와 아이템 둘러보기</strong><p>겨울 코디의 분위기와 아우터, 니트, 소품을 확인해요.</p></div>
            </li>
            <li>
              <span>03</span>
              <div><strong>마음에 드는 상품 바로가기</strong><p>각 아이템의 상품 링크에서 자세한 정보를 살펴봐요.</p></div>
            </li>
          </ol>
        </div>
      </section>
    </main>
  }

  return <main className="inner-page">
    <div className="page-hero page-hero-clay compare-hero">
      <span className="eyebrow">05 / SEASONAL LOOKBOOK</span>
      <h1>겨울에 어울리는<br /><em>오늘의 코디.</em></h1>
      <p>연령과 성별, 지금 계절에 맞는 스타일과 아이템을 찾아보세요.</p>
      <span className="page-hero-mark"><Icon name="Sparkles" size={76} /></span>
    </div>

    <section className="seasonal-content section-wrap">
      <div className="seasonal-heading">
        <div>
          <span className="eyebrow">ONFIT SEASONAL EDIT</span>
          <h2>{season} 코디 큐레이션</h2>
          <p>{seasonInfo.description}</p>
        </div>
        <span className="season-badge"><i /> 겨울 큐레이션</span>
      </div>

      <div className="seasonal-filters">
        <label>
          <span>연령대</span>
          <select value={selectedAge} onChange={(event) => setSelectedAge(event.target.value)}>
            {ageGroups.map((age) => <option key={age} value={age}>{age}</option>)}
          </select>
        </label>
        <label>
          <span>성별</span>
          <select value={selectedGender} onChange={(event) => setSelectedGender(event.target.value)}>
            {genders.map((gender) => <option key={gender} value={gender}>{gender}</option>)}
          </select>
        </label>
        <p>선택한 조건에 맞는 코디 {looks.length}가지를 추천해요.</p>
      </div>
      {favoriteError && <p className="seasonal-favorite-error" role="alert">{favoriteError}</p>}

      {looks.length > 0 ? (
        selectedAge === '전체' ? (
          <div className="seasonal-age-sections">
            {ageSections.map(({ age, looks: sectionLooks }, sectionIndex) => (
              <section className="seasonal-age-section" key={age} aria-labelledby={`seasonal-age-${age}`}>
                <div className="seasonal-age-heading">
                  <span>{String(sectionIndex + 1).padStart(2, '0')}</span>
                  <h3 id={`seasonal-age-${age}`}>{age}</h3>
                  <p>코디 {sectionLooks.length}가지</p>
                </div>
                <div className="seasonal-look-grid">
                  {renderLookCards(sectionLooks)}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="seasonal-look-grid">
            {renderLookCards(looks)}
          </div>
        )
      ) : (
        <p className="seasonal-empty">선택한 조건에 맞는 코디가 없습니다. 다른 조건을 선택해 주세요.</p>
      )}

      <p className="data-note">연령대별 스타일 키워드와 상품명에 표시된 성별을 기준으로 상품을 큐레이션하며, 같은 아이템은 연령·성별 코디 전체에서 한 번만 사용합니다. Mock.shop 샘플에는 실제 착용 연령·사이즈 정보가 없어 연령은 스타일 기준입니다. 상품과 USD 가격은 시연용 샘플이며, 링크는 구매처가 아닌 테스트 스토어를 엽니다.</p>
    </section>
    {viewingLook && (
      <div className="seasonal-image-viewer" onMouseDown={(event) => event.target === event.currentTarget && setViewingLook(null)}>
        <section className="seasonal-image-dialog" role="dialog" aria-modal="true" aria-label={`${viewingLook.title} 추천 아이템 전체 구성`}>
          <button type="button" className="seasonal-image-close" onClick={() => setViewingLook(null)} aria-label="미리보기 닫기">
            <Icon name="X" size={22} />
          </button>
          <LookProductBoard look={viewingLook} productAssignments={productAssignments} productCatalog={productCatalog} large />
          <p>{viewingLook.title}<span>{viewingLook.age} · {viewingLook.gender} · {season}</span></p>
        </section>
      </div>
    )}
  </main>
}
