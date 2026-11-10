import React, { useEffect, useRef, useState } from 'react'
import CameraView from './components/CameraView.jsx'
import MobileCamera from './components/MobileCamera.jsx'
import CircleSelector from './components/CircleSelector.jsx'
import SelectionPreview from './components/SelectionPreview.jsx'
import SearchDiagnostics from './components/SearchDiagnostics.jsx'
import PcTryOnPanel, { downloadTryOnImage } from './components/PcTryOnPanel.jsx'
import BeforeAfterSlider from './components/BeforeAfterSlider.jsx'
import { sendRecommendations, sendSelection, sendTryOn } from './services/api.js'
import { createSearchImageCrop } from './services/searchCrop.js'
import './App.css'

const similarityLabels = {
  very_similar: '매우 유사',
  similar: '유사',
  somewhat_similar: '일부 유사',
}

const upperGarmentPattern = /상의|아우터|티셔츠|반팔티|긴팔티|셔츠|남방|블라우스|맨투맨|스웨트|후드|니트|가디건|자켓|재킷|점퍼|코트|패딩|블레이저|바람막이|t-?shirt|shirt|blouse|sweatshirt|hoodie|knit|cardigan|outerwear|jacket|coat|puffer|blazer|\btee\b/i
const lowerGarmentPattern = /하의|반바지|바지|팬츠|슬랙스|데님|조거|트라우저|쇼츠|스커트|치마|\b(?:pants?|trousers?|jeans?|shorts?|skirts?|denim|slacks?)\b/i
const shoePattern = /신발|스니커즈|운동화|슈즈|부츠|로퍼|구두|샌들|슬리퍼|힐|\b(?:sneakers?|shoes?|boots?|sandals?|loafers?|heels?|pumps?|slippers?)\b/i
const bagPattern = /가방|백팩|숄더|크로스|토트|핸드백|파우치|\b(?:backpacks?|handbags?|crossbody(?:\s+bags?)?|shoulder\s+bags?|tote(?:\s+bags?)?|bags?)\b/i
const hatPattern = /모자|볼캡|비니|버킷햇|버킷 햇|페도라|\b(?:hats?|caps?|beanies?|bucket\s+hats?|fedoras?)\b/i
const glassesPattern = /안경|선글라스|아이웨어|\b(?:sunglasses|eyeglasses|glasses|eyewear|spectacles)\b/i
const watchPattern = /시계|워치|\b(?:wrist\s*)?watch(?:es)?\b/i
const garmentRegion = (name) => {
  if (typeof name !== 'string') return null
  if (upperGarmentPattern.test(name)) return 'upper'
  if (lowerGarmentPattern.test(name)) return 'lower'
  if (shoePattern.test(name)) return 'shoes'
  if (bagPattern.test(name)) return 'bag'
  if (glassesPattern.test(name)) return 'glasses'
  if (hatPattern.test(name)) return 'hat'
  if (watchPattern.test(name)) return 'watch'
  return null
}
const selectedTryOnRegion = (selected) => {
  const typeRegion = garmentRegion(selected?.product_type)
  const categoryRegion = garmentRegion(selected?.category)
  return typeRegion && categoryRegion && typeRegion !== categoryRegion ? null : typeRegion || categoryRegion
}
const tryOnUnavailableReason = (product, personImage) => {
  if (!personImage?.file) return '원본 인물 사진이 필요합니다.'
  if (!/^\d{1,20}$/.test(String(product?.product_id ?? ''))
    || typeof product?.product_name !== 'string' || !product.product_name.trim()
    || typeof product?.image_url !== 'string' || !product.image_url.trim()) {
    return '상품 ID·이름·이미지 주소가 필요합니다.'
  }
  return ''
}
const canTryOnProduct = (product, personImage) => !tryOnUnavailableReason(product, personImage)

class SearchResultBoundary extends React.Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch() {
    this.props.onError()
  }

  render() {
    return this.state.failed
      ? <p className="error" role="alert">검색 결과를 표시하지 못했습니다. 유사 상품 검색을 다시 시도해 주세요.</p>
      : this.props.children
  }
}

export default function App() {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 768px)').matches)
  const [image, setImage] = useState(null)
  const [selectorReset, setSelectorReset] = useState(0)
  const [selection, setSelection] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [searching, setSearching] = useState(false)
  const [recommendations, setRecommendations] = useState(null)
  const [searchError, setSearchError] = useState('')
  const [searchDiagnostics, setSearchDiagnostics] = useState(null)
  const [searchAttempt, setSearchAttempt] = useState(0)
  const [tryOnProduct, setTryOnProduct] = useState(null)
  const [tryOnResult, setTryOnResult] = useState(null)
  const [completedTryOnProduct, setCompletedTryOnProduct] = useState(null)
  const [lastMobileTryOn, setLastMobileTryOn] = useState(null)
  const [tryOnError, setTryOnError] = useState('')
  const [tryOnLoading, setTryOnLoading] = useState(false)
  const [tryOnPerson, setTryOnPerson] = useState(null)
  const [tryOnPhotoError, setTryOnPhotoError] = useState('')
  const [tryOnPhotoLoading, setTryOnPhotoLoading] = useState(false)
  const [downloadError, setDownloadError] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [carouselEdges, setCarouselEdges] = useState({ start: true, end: true })
  const [viewerSize, setViewerSize] = useState(null)
  const tryOnPickerRef = useRef(null)
  const carouselRef = useRef(null)
  const carouselDragRef = useRef(null)
  const suppressCarouselClickRef = useRef(false)
  const viewerFrameRef = useRef(null)
  const inFlight = useRef(false)
  const searchInFlight = useRef(null)
  const tryOnInFlight = useRef(false)
  const tryOnAbortRef = useRef(null)
  const tryOnVersion = useRef(0)
  const selectionVersion = useRef(0)

  useEffect(() => {
    const query = window.matchMedia('(max-width: 768px)')
    const update = () => setIsMobile(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => () => {
    if (image?.url) URL.revokeObjectURL(image.url)
  }, [image])

  useEffect(() => () => {
    if (tryOnPerson?.url) URL.revokeObjectURL(tryOnPerson.url)
  }, [tryOnPerson])

  useEffect(() => () => {
    if (lastMobileTryOn?.personImage?.url) URL.revokeObjectURL(lastMobileTryOn.personImage.url)
  }, [lastMobileTryOn])

  useEffect(() => {
    if (isMobile || !image || !viewerFrameRef.current) return undefined
    const frame = viewerFrameRef.current
    const measure = () => {
      const width = frame.clientWidth - 20
      const height = frame.clientHeight - 20
      if (!width || !height) return
      const scale = Math.min(width / image.width, height / image.height)
      setViewerSize({ imageUrl: image.url, width: image.width * scale, height: image.height * scale })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    measure()
    return () => observer.disconnect()
  }, [isMobile, image])

  useEffect(() => {
    if (isMobile || !carouselRef.current) return undefined
    const carousel = carouselRef.current
    const update = () => setCarouselEdges({
      start: carousel.scrollLeft <= 1,
      end: carousel.scrollLeft + carousel.clientWidth >= carousel.scrollWidth - 1,
    })
    const observer = new ResizeObserver(update)
    observer.observe(carousel)
    update()
    carousel.addEventListener('scroll', update, { passive: true })
    return () => {
      observer.disconnect()
      carousel.removeEventListener('scroll', update)
    }
  }, [isMobile, recommendations])

  function clearTryOnOutcome() {
    tryOnVersion.current += 1
    setTryOnResult(null)
    setCompletedTryOnProduct(null)
    setTryOnError('')
  }

  function resetTryOn() {
    clearTryOnOutcome()
    setDownloadError('')
    tryOnAbortRef.current?.abort()
    tryOnAbortRef.current = null
    tryOnInFlight.current = false
    setTryOnProduct(null)
    setTryOnLoading(false)
  }

  function leaveMobileTryOn() {
    clearTryOnOutcome()
    tryOnAbortRef.current?.abort()
    tryOnAbortRef.current = null
    tryOnInFlight.current = false
    setTryOnLoading(false)
    setTryOnPhotoError('')
  }

  function acceptImage(data) {
    selectionVersion.current += 1
    resetTryOn()
    setLastMobileTryOn(null)
    setTryOnPerson(null)
    setTryOnPhotoError('')
    setImage({ ...data, url: URL.createObjectURL(data.file) })
    setSelection(null)
    setResult(null)
    setError('')
    setRecommendations(null)
    setSearchError('')
    setSearchDiagnostics(null)
    setSearching(false)
  }

  function resetImage() {
    selectionVersion.current += 1
    resetTryOn()
    setLastMobileTryOn(null)
    setTryOnPerson(null)
    setTryOnPhotoError('')
    setImage(null)
    setSelection(null)
    setResult(null)
    setError('')
    setRecommendations(null)
    setSearchError('')
    setSearchDiagnostics(null)
    setSearching(false)
  }

  function changeSelection(next) {
    selectionVersion.current += 1
    resetTryOn()
    setLastMobileTryOn(null)
    setSelection(next)
    setResult(null)
    setError('')
    setRecommendations(null)
    setSearchError('')
    setSearchDiagnostics(null)
    setSearching(false)
  }

  async function searchSimilar() {
    const submittedVersion = selectionVersion.current
    if (searchInFlight.current === submittedVersion || result?.status !== 'success' || !result.search_image_crop?.file) return
    searchInFlight.current = submittedVersion
    resetTryOn()
    setSearchAttempt((attempt) => attempt + 1)
    setSearching(true)
    setSearchError('')
    setSearchDiagnostics(null)
    try {
      const next = await sendRecommendations(result.search_image_crop.file, result)
      if (submittedVersion === selectionVersion.current) {
        if (next && typeof next === 'object' && !Array.isArray(next)) setRecommendations(next)
        else setSearchError('추천 응답을 읽을 수 없습니다. 다시 시도해 주세요.')
      }
    } catch (caught) {
      if (submittedVersion === selectionVersion.current) {
        setSearchError(caught.message)
        setSearchDiagnostics(caught.diagnostics || null)
      }
    } finally {
      if (searchInFlight.current === submittedVersion) {
        searchInFlight.current = null
        setSearching(false)
      }
    }
  }

  function selectTryOn(product) {
    if (tryOnInFlight.current || !canTryOnProduct(product, image)) return
    if (isMobile) clearTryOnOutcome()
    else {
      setTryOnError('')
      setTryOnPhotoError('')
    }
    setTryOnProduct(product)
  }

  async function uploadTryOnPerson(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || tryOnLoading || tryOnPhotoLoading) return
    const currentSelectionVersion = selectionVersion.current
    const currentTryOnVersion = tryOnVersion.current
    setTryOnPhotoError('')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
      setTryOnPhotoError('10 MB 이하의 JPG, PNG, WebP 사진을 선택하세요.')
      return
    }
    setTryOnPhotoLoading(true)
    const sourceUrl = URL.createObjectURL(file)
    try {
      const source = new Image()
      source.src = sourceUrl
      await source.decode()
      if (!source.naturalWidth || !source.naturalHeight ||
          source.naturalWidth > 8000 || source.naturalHeight > 8000) {
        throw new Error('이미지 크기를 확인할 수 없습니다.')
      }
      const scale = Math.min(1, 2400 / Math.max(source.naturalWidth, source.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(source.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(source.naturalHeight * scale))
      canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise((resolve, reject) => canvas.toBlob(
        (value) => value ? resolve(value) : reject(new Error('이미지를 저장하지 못했습니다.')),
        'image/jpeg', 0.88))
      if (currentSelectionVersion !== selectionVersion.current || currentTryOnVersion !== tryOnVersion.current) return
      const normalized = new File([blob], 'try-on-person.jpg', { type: 'image/jpeg' })
      clearTryOnOutcome()
      setTryOnPerson({ file: normalized, url: URL.createObjectURL(normalized) })
    } catch {
      setTryOnPhotoError('사진을 읽지 못했습니다. JPG, PNG, WebP 파일을 다시 선택하세요.')
    } finally {
      URL.revokeObjectURL(sourceUrl)
      setTryOnPhotoLoading(false)
    }
  }

  function restoreTryOnPerson() {
    if (!tryOnPerson || tryOnLoading) return
    clearTryOnOutcome()
    setTryOnPerson(null)
    setTryOnPhotoError('')
  }

  async function createTryOn() {
    const person = tryOnPerson || image
    if (!tryOnProduct || !person?.file || !result || tryOnInFlight.current) return
    const currentVersion = tryOnVersion.current
    const controller = new AbortController()
    tryOnInFlight.current = true
    tryOnAbortRef.current = controller
    setTryOnLoading(true)
    setTryOnError('')
    if (isMobile) setTryOnResult(null)
    try {
      const box = tryOnPerson ? null : result.geometry?.bounding_box || selection?.box
      const analysis = tryOnPerson
        ? { ...result, selected_object: { ...result.selected_object, description: '' } }
        : result
      const next = await sendTryOn(person.file, tryOnProduct, analysis, box, controller.signal)
      if (currentVersion === tryOnVersion.current) {
        if (!isMobile && !next?.image_data_url) {
          setTryOnError('가상 착용 결과를 받지 못했어요. 다시 시도해 주세요.')
        } else {
          setTryOnResult(next)
          if (!isMobile) setCompletedTryOnProduct(tryOnProduct)
        }
        if (isMobile && typeof next?.image_data_url === 'string' && next.image_data_url) {
          setLastMobileTryOn({
            product: tryOnProduct,
            personImage: tryOnPerson
              ? { file: person.file, url: URL.createObjectURL(person.file) }
              : null,
            result: next,
          })
        }
      }
    } catch (caught) {
      if (currentVersion === tryOnVersion.current) setTryOnError(caught.message)
    } finally {
      if (tryOnAbortRef.current === controller) {
        tryOnAbortRef.current = null
        tryOnInFlight.current = false
        if (currentVersion === tryOnVersion.current) setTryOnLoading(false)
      }
    }
  }

  async function saveTryOnResult() {
    if (downloading || !tryOnResult?.image_data_url) return
    setDownloadError('')
    setDownloading(true)
    try {
      await downloadTryOnImage(tryOnResult.image_data_url)
    } catch {
      setDownloadError('이미지 다운로드를 시작하지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setDownloading(false)
    }
  }

  function moveCarousel(direction) {
    const carousel = carouselRef.current
    const card = carousel?.querySelector('.studio-product-card')
    if (carousel && card) carousel.scrollBy({ left: direction * (card.getBoundingClientRect().width + 12), behavior: 'smooth' })
  }

  function startCarouselDrag(event) {
    if (event.pointerType !== 'mouse' || event.button !== 0) return
    const carousel = carouselRef.current
    carouselDragRef.current = { pointerId: event.pointerId, x: event.clientX, left: carousel.scrollLeft, moved: false }
  }

  function moveCarouselDrag(event) {
    const drag = carouselDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const distance = event.clientX - drag.x
    if (!drag.moved && Math.abs(distance) > 4) {
      drag.moved = true
      carouselRef.current.classList.add('is-dragging')
      carouselRef.current.setPointerCapture(event.pointerId)
    }
    if (drag.moved) {
      event.preventDefault()
      carouselRef.current.scrollLeft = drag.left - distance
    }
  }

  function endCarouselDrag(event) {
    const drag = carouselDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    carouselDragRef.current = null
    carouselRef.current?.classList.remove('is-dragging')
    if (carouselRef.current?.hasPointerCapture(event.pointerId)) carouselRef.current.releasePointerCapture(event.pointerId)
    if (drag.moved) {
      suppressCarouselClickRef.current = true
      window.setTimeout(() => { suppressCarouselClickRef.current = false }, 0)
    }
  }

  async function submit() {
    if (!image || !selection || result?.status === 'success' || inFlight.current) return
    inFlight.current = true
    const submittedVersion = selectionVersion.current
    setSending(true)
    setError('')
    setResult(null)
    try {
      const next = await sendSelection(image, selection)
      let searchImageCrop = null
      let cropError = ''
      if (next.status === 'success' && next.geometry?.bounding_box) {
        try {
          searchImageCrop = await createSearchImageCrop(image, next.geometry.bounding_box)
        } catch {
          cropError = '검색용 이미지 crop을 만들지 못했습니다. 사진을 다시 선택해 주세요.'
        }
      }
      if (submittedVersion === selectionVersion.current) {
        setResult({ ...next, search_image_crop: searchImageCrop })
        if (cropError) setError(cropError)
      }
    } catch (caught) {
      if (submittedVersion === selectionVersion.current) setError(caught.message)
    } finally {
      inFlight.current = false
      setSending(false)
    }
  }

  useEffect(() => {
    if (isMobile && result?.status === 'success' && result.search_image_crop?.file &&
        !recommendations && !searching && !searchError) searchSimilar()
  }, [isMobile, result, recommendations, searching, searchError])

  if (isMobile) return <MobileCamera image={image} selection={selection} result={result}
    analyzing={sending} analysisError={error} onImage={acceptImage} onCancel={resetImage}
    onSelectionChange={changeSelection} onAnalyze={submit} searching={searching}
    recommendations={recommendations} searchError={searchError} onRetryRecommendations={searchSimilar}
    onSelectTryOn={selectTryOn} selectedTryOnProduct={tryOnProduct}
    canTryOn={(product) => canTryOnProduct(product, image)} similarityLabels={similarityLabels}
    tryOnPerson={tryOnPerson} tryOnResult={tryOnResult} tryOnError={tryOnError}
    lastTryOn={lastMobileTryOn}
    tryOnLoading={tryOnLoading} tryOnPhotoError={tryOnPhotoError} tryOnPhotoLoading={tryOnPhotoLoading}
    onUploadTryOnPerson={uploadTryOnPerson} onRestoreTryOnPerson={restoreTryOnPerson}
    onCreateTryOn={createTryOn} onLeaveTryOn={leaveMobileTryOn} />

  const hasRecommendationList = Array.isArray(recommendations?.recommendations)
  const showDebug = import.meta.env.DEV && new URLSearchParams(window.location.search).get('debug') === '1'
  const analysisFailed = !!result && result.status !== 'success'
  const progressMessage = sending ? 'AI가 선택한 패션 아이템을 분석하고 있어요.'
    : searching ? '비슷한 패션 상품을 찾고 있어요.'
      : hasRecommendationList ? '비슷한 상품을 찾았어요.'
        : analysisFailed ? '상품을 분석하지 못했어요. 다시 시도해 주세요.'
          : '선택한 아이템과 비슷한 상품을 찾아보세요.'
  const recommendedProducts = hasRecommendationList
    ? recommendations.recommendations.filter((product) => product && typeof product === 'object' && !Array.isArray(product))
    : []
  const activeTryOnPerson = tryOnPerson || image

  return (
    <main className="studio-shell">
      <header className="studio-header">
        <a className="studio-home-link" href="/#/home">← ONFIT 쇼핑몰</a>
        <div className="studio-title"><span>ONFIT AI FASHION SEARCH</span>
          <h1>{image ? '나만의 가상 피팅 스튜디오' : 'AI 패션 검색 스튜디오'}</h1></div>
        <span className="studio-header-note">사진에서 찾고, 나에게 입혀보세요</span>
      </header>
      <div className="studio-grid">
        <section className="studio-viewer" aria-label="사진 및 가상 착용 결과">
          <div className="studio-viewer-head">
            <strong>{tryOnResult?.image_data_url ? '가상 착용 결과' : image ? '선택한 사진' : '사진 준비'}</strong>
            {tryOnResult?.image_data_url && completedTryOnProduct &&
              <span>{completedTryOnProduct.brand} · {completedTryOnProduct.product_name}</span>}
          </div>
          <div ref={viewerFrameRef} className="studio-viewer-frame">
            {!image ? <CameraView onImage={acceptImage} /> : tryOnResult?.image_data_url
              ? <BeforeAfterSlider beforeSrc={activeTryOnPerson.url} afterSrc={tryOnResult.image_data_url} actual />
              : <CircleSelector key={image.url + '-' + selectorReset} image={image} selection={selection}
                  onSelectionChange={changeSelection} visionGeometry={result?.geometry} embedded
                  stageStyle={viewerSize?.imageUrl === image.url ? { width: viewerSize.width, height: viewerSize.height } : undefined} />}
            {tryOnLoading && <div className="studio-viewer-loading" role="status">
              <strong>AI가 가상 착용 이미지를 만들고 있어요.</strong>
              <span>기존 결과는 새 이미지가 완성될 때까지 유지됩니다.</span>
            </div>}
          </div>
          {image && <div className="studio-viewer-actions">
            <button type="button" className="secondary" onClick={resetImage}>새 사진 시작</button>
            {tryOnResult?.image_data_url && <>
              <button type="button" onClick={saveTryOnResult} disabled={downloading}>
                {downloading ? '저장 준비 중…' : '결과 저장'}</button>
              <button type="button" className="secondary" onClick={createTryOn}
                disabled={!tryOnProduct || tryOnLoading}>다시 생성</button>
            </>}
            {downloadError && <p className="error" role="alert">{downloadError}</p>}
          </div>}
        </section>
        <aside className="studio-side" aria-label="아이템 분석과 추천 상품">
          <div className="studio-side-scroll">
            {!image ? <div className="studio-intro">
              <span className="eyebrow">START YOUR EDIT</span>
              <h2>사진 한 장으로<br />스타일을 찾아보세요.</h2>
              <p>왼쪽에서 사진을 업로드하거나 웹캠으로 촬영하세요. 원하는 옷이나 소품을 둘러 그리면 비슷한 상품을 찾아드립니다.</p>
              <ol><li>사진 준비</li><li>아이템 선택</li><li>상품 탐색</li><li>가상 착용</li></ol>
            </div> : <>
              <div className="studio-analysis">
                <span className="eyebrow">{hasRecommendationList ? 'YOUR STYLE MATCH' : 'SELECT YOUR ITEM'}</span>
                <h2>{result?.selected_object?.product_type || result?.selected_object?.category ||
                  (selection ? '선택한 아이템을 확인하세요' : '찾고 싶은 아이템을 선택하세요')}</h2>
                <p>{result?.selected_object?.description ||
                  (selection ? '선택한 영역을 확인하고 비슷한 상품을 찾아보세요.' : '사진 위에서 원하는 옷이나 소품을 둘러 그려주세요.')}</p>
                {result?.selected_object?.dominant_color && <span className="studio-color-note">색상 · {result.selected_object.dominant_color}</span>}
                <span className="studio-progress" role="status">{progressMessage}</span>
              </div>
              {recommendations && <section className="studio-products" aria-label="추천 상품">
                <div className="studio-products-head">
                  <div><span className="eyebrow">CURATED FOR YOU</span><h3>비슷한 상품</h3></div>
                  <div className="studio-carousel-controls">
                    <button type="button" aria-label="이전 상품" onClick={() => moveCarousel(-1)}
                      disabled={recommendedProducts.length < 2 || carouselEdges.start}>←</button>
                    <button type="button" aria-label="다음 상품" onClick={() => moveCarousel(1)}
                      disabled={recommendedProducts.length < 2 || carouselEdges.end}>→</button>
                  </div>
                </div>
                <SearchResultBoundary key={searchAttempt} onError={() => { setRecommendations(null); setSearchDiagnostics(null) }}>
                  {!hasRecommendationList && <p className="error" role="alert">추천 상품을 표시하지 못했어요. 다시 검색해 주세요.</p>}
                  {hasRecommendationList && recommendedProducts.length === 0 &&
                    <p className="studio-empty">비슷한 상품을 찾지 못했어요. 다시 검색하거나 다른 아이템을 선택해 주세요.</p>}
                  {recommendedProducts.length > 0 && <div ref={carouselRef} className="studio-carousel-track"
                    onPointerDown={startCarouselDrag} onPointerMove={moveCarouselDrag}
                    onPointerUp={endCarouselDrag} onPointerCancel={endCarouselDrag}
                    onClickCapture={(event) => {
                      if (suppressCarouselClickRef.current) {
                        event.preventDefault()
                        event.stopPropagation()
                      }
                    }}>
                    {recommendedProducts.map((product, index) => <article className={'studio-product-card' +
                      (tryOnProduct?.product_id === product.product_id ? ' is-selected' : '')} key={product.product_id ?? index}>
                      <button type="button" className="studio-product-select" onClick={() => selectTryOn(product)}
                        aria-pressed={tryOnProduct?.product_id === product.product_id}
                        disabled={tryOnLoading || !canTryOnProduct(product, image)}
                        title={tryOnUnavailableReason(product, image) || undefined}>
                        {typeof product.image_url === 'string' && <img src={product.image_url}
                          alt={product.product_name || '상품 이미지'} loading="lazy" />}
                        <span className="studio-product-brand">{product.brand || '브랜드 정보 없음'}</span>
                        <strong>{product.product_name || '상품명 정보 없음'}</strong>
                        <span className="studio-product-price">{Number.isFinite(product.price) ?
                          product.price.toLocaleString('ko-KR') + '원' : '가격 정보 없음'}</span>
                        <small>{similarityLabels[product.similarity_grade] || '추천 상품'}</small>
                      </button>
                      {typeof product.product_url === 'string' && product.product_url &&
                        <a href={product.product_url} target="_blank" rel="noopener noreferrer">상품 상세 보기 ↗</a>}
                    </article>)}
                  </div>}
                </SearchResultBoundary>
              </section>}
              {searchError && <p className="error" role="alert">{searchError}</p>}
              {showDebug && selection && <SelectionPreview image={image} selection={selection} visionGeometry={result?.geometry} />}
              {showDebug && (recommendations?.search_diagnostics || searchDiagnostics) &&
                <SearchDiagnostics data={recommendations?.search_diagnostics || searchDiagnostics} />}
            </>}
          </div>
          {image && <div className="studio-side-actions">
            {!hasRecommendationList ? <>
              <button type="button" className="secondary" onClick={() => {
                setSelectorReset((value) => value + 1)
                changeSelection(null)
              }} disabled={!selection || sending || searching}>다시 선택</button>
              <button type="button" onClick={result?.status === 'success' ? searchSimilar : submit}
                disabled={!selection || sending || searching || (result?.status === 'success' && !result.search_image_crop?.file)}>
                {sending ? '분석 중…' : searching ? '상품 검색 중…' : searchError ? '다시 검색' :
                  analysisFailed ? '다시 분석하기' : '비슷한 상품 찾기'}
              </button>
              {error && <p className="error" role="alert">{error}</p>}
            </> : recommendedProducts.length === 0 ? <div className="studio-empty-actions">
              <button type="button" onClick={searchSimilar} disabled={searching}>다시 검색</button>
              <button type="button" className="secondary" onClick={() => {
                setSelectorReset((value) => value + 1)
                changeSelection(null)
              }}>다른 아이템 선택</button>
            </div> : <PcTryOnPanel product={tryOnProduct} hasAlternatePerson={!!tryOnPerson}
              loading={tryOnLoading} error={tryOnError} photoError={tryOnPhotoError}
              photoLoading={tryOnPhotoLoading} watchWarning={selectedTryOnRegion(result?.selected_object) === 'watch'}
              showDebug={showDebug} result={tryOnResult}
              onUploadPerson={() => tryOnPickerRef.current?.click()} onRestorePerson={restoreTryOnPerson}
              onGenerate={createTryOn} />}
          </div>}
        </aside>
      </div>
      {image && hasRecommendationList && <input ref={tryOnPickerRef} type="file" className="visually-hidden"
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        aria-label="가상 착용용 인물 사진 선택" onChange={uploadTryOnPerson} />}
    </main>
  )
}
