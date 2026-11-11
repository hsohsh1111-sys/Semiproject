import React, { useEffect, useRef, useState } from 'react'
import CameraView, { prepareUploadedImage } from './components/CameraView.jsx'
import MobileCamera from './components/MobileCamera.jsx'
import CircleSelector from './components/CircleSelector.jsx'
import SelectionPreview from './components/SelectionPreview.jsx'
import SearchDiagnostics from './components/SearchDiagnostics.jsx'
import { downloadTryOnImage } from './components/PcTryOnPanel.jsx'
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
  const [pcTryOnHistory, setPcTryOnHistory] = useState([])
  const [activePcTryOnId, setActivePcTryOnId] = useState(null)
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
  const [pcStep, setPcStep] = useState(1)
  const [viewerTab, setViewerTab] = useState('original')
  const [showDrawingGuide, setShowDrawingGuide] = useState(true)
  const [photoChanging, setPhotoChanging] = useState(false)
  const [photoChangeError, setPhotoChangeError] = useState('')
  const photoPickerRef = useRef(null)
  const photoRequestRef = useRef(0)
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
  const pcTryOnSequence = useRef(0)
  const pcHistoryUrls = useRef(new Set())
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

  useEffect(() => {
    const currentUrls = new Set(pcTryOnHistory.filter((entry) => entry.person.alternate)
      .map((entry) => entry.person.url))
    pcHistoryUrls.current.forEach((url) => {
      if (!currentUrls.has(url)) URL.revokeObjectURL(url)
    })
    pcHistoryUrls.current = currentUrls
  }, [pcTryOnHistory])

  useEffect(() => () => {
    pcHistoryUrls.current.forEach((url) => URL.revokeObjectURL(url))
  }, [])

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
    setPcTryOnHistory([])
    setActivePcTryOnId(null)
    pcTryOnSequence.current = 0
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
    photoRequestRef.current += 1
    setPhotoChanging(false)
    setPhotoChangeError('')
    setPcStep(1)
    setViewerTab('original')
    setShowDrawingGuide(true)
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
    setSending(false)
  }

  function resetImage() {
    photoRequestRef.current += 1
    setPhotoChanging(false)
    setPhotoChangeError('')
    setPcStep(1)
    setViewerTab('original')
    setShowDrawingGuide(true)
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
    setSending(false)
  }

  async function changePhoto(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const request = ++photoRequestRef.current
    setPhotoChanging(true)
    setPhotoChangeError('')
    try {
      const data = await prepareUploadedImage(file)
      if (request === photoRequestRef.current) acceptImage(data)
    } catch {
      if (request === photoRequestRef.current) setPhotoChangeError('사진을 읽지 못했어요. 다른 사진을 선택해 주세요.')
    } finally {
      if (request === photoRequestRef.current) setPhotoChanging(false)
    }
  }

  function changeSelection(next) {
    setPcStep(2)
    if (next) setViewerTab('selection')
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

  function restartDrawing() {
    photoRequestRef.current += 1
    setPhotoChanging(false)
    setPhotoChangeError('')
    setSelectorReset((value) => value + 1)
    changeSelection(null)
    setTryOnPerson(null)
    setTryOnPhotoError('')
    setTryOnPhotoLoading(false)
    setViewerTab('original')
    setShowDrawingGuide(true)
    setSending(false)
  }

  function searchSimilar() {
    return searchSimilarWithAnalysis(result, selectionVersion.current)
  }

  async function searchSimilarWithAnalysis(analysis, submittedVersion) {
    if (submittedVersion !== selectionVersion.current || searchInFlight.current === submittedVersion ||
        analysis?.status !== 'success' || !analysis.search_image_crop?.file) return
    searchInFlight.current = submittedVersion
    resetTryOn()
    setSearchAttempt((attempt) => attempt + 1)
    setSearching(true)
    setSearchError('')
    setSearchDiagnostics(null)
    try {
      const next = await sendRecommendations(analysis.search_image_crop.file, analysis)
      if (submittedVersion === selectionVersion.current) {
        if (next && typeof next === 'object' && !Array.isArray(next)) setRecommendations(next)
        if (next && typeof next === 'object' && !Array.isArray(next)) {
          setPcStep(3)
          if (!isMobile && Array.isArray(next.recommendations) && next.recommendations.some(
            (product) => product && typeof product === 'object' && !Array.isArray(product))) {
            setViewerTab('original')
          }
        }
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
    if (!isMobile) {
      setPcStep(3)
      if (viewerTab === 'tryon') setViewerTab('original')
    }
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
      if (isMobile) clearTryOnOutcome()
      setTryOnPerson({ file: normalized, url: URL.createObjectURL(normalized) })
      if (!isMobile) setViewerTab('uploaded')
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
    const selectedResult = pcTryOnHistory.find((entry) => entry.id === activePcTryOnId) || pcTryOnHistory.at(-1)
    const person = isMobile ? tryOnPerson || image
      : viewerTab === 'uploaded' ? tryOnPerson || image
        : viewerTab === 'tryon' ? selectedResult?.person || image : image
    const product = tryOnProduct
    const usesAlternatePerson = person && person !== image && person.alternate !== false
    if (!product || !person?.file || !result || tryOnInFlight.current || tryOnPhotoLoading) return
    const currentVersion = tryOnVersion.current
    const controller = new AbortController()
    tryOnInFlight.current = true
    tryOnAbortRef.current = controller
    if (!isMobile) setPcStep(4)
    setTryOnLoading(true)
    setTryOnError('')
    if (isMobile) setTryOnResult(null)
    try {
      const box = usesAlternatePerson ? null : result.geometry?.bounding_box || selection?.box
      const analysis = usesAlternatePerson
        ? { ...result, selected_object: { ...result.selected_object, description: '' } }
        : result
      const next = await sendTryOn(person.file, product, analysis, box, controller.signal)
      if (currentVersion === tryOnVersion.current) {
        if (!isMobile && !next?.image_data_url) {
          setTryOnError('가상 착용 결과를 받지 못했어요. 다시 시도해 주세요.')
        } else {
          setTryOnResult(next)
          if (!isMobile) {
            const completedPerson = usesAlternatePerson
              ? { file: person.file, url: URL.createObjectURL(person.file), alternate: true }
              : { file: image.file, url: image.url, alternate: false }
            const id = ++pcTryOnSequence.current
            setPcTryOnHistory((history) => [...history, { id, result: next, person: completedPerson, product }].slice(-5))
            setActivePcTryOnId(id)
            setPcStep(4)
            setViewerTab('tryon')
          }
        }
        if (isMobile && typeof next?.image_data_url === 'string' && next.image_data_url) {
          setLastMobileTryOn({
            product,
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
    const activeResult = pcTryOnHistory.find((entry) => entry.id === activePcTryOnId) || pcTryOnHistory.at(-1)
    if (downloading || !activeResult?.result.image_data_url) return
    setDownloadError('')
    setDownloading(true)
    try {
      await downloadTryOnImage(activeResult.result.image_data_url)
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
    if (!image || !selection || (result?.status === 'success' && result.search_image_crop?.file) ||
        inFlight.current === selectionVersion.current) return
    const submittedVersion = selectionVersion.current
    inFlight.current = submittedVersion
    setSending(true)
    setError('')
    setResult(null)
    try {
      const next = await sendSelection(image, selection)
      let searchImageCrop = null
      let cropError = ''
      if (next.status === 'success') {
        try {
          searchImageCrop = await createSearchImageCrop(image, next.geometry?.bounding_box || selection.box)
          if (!searchImageCrop?.file) throw new Error('검색용 이미지 crop이 비어 있습니다.')
        } catch {
          cropError = '검색용 이미지 crop을 만들지 못했습니다. 사진을 다시 선택해 주세요.'
        }
      }
      if (submittedVersion === selectionVersion.current) {
        const analysis = { ...next, search_image_crop: searchImageCrop }
        setResult(analysis)
        if (cropError) setError(cropError)
        if (!isMobile && analysis.status === 'success' && searchImageCrop?.file) {
          await searchSimilarWithAnalysis(analysis, submittedVersion)
        }
      }
    } catch (caught) {
      if (submittedVersion === selectionVersion.current) setError(caught.message)
    } finally {
      if (inFlight.current === submittedVersion) {
        inFlight.current = false
        setSending(false)
      }
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

  if (!image) return <main className="app-shell landing-shell">
    <CameraView onImage={acceptImage} onCaptureConfirm={(data) => {
      acceptImage(data)
      setPcStep(2)
    }} landing />
  </main>

  const hasRecommendationList = Array.isArray(recommendations?.recommendations)
  const showDebug = import.meta.env.DEV && new URLSearchParams(window.location.search).get('debug') === '1'
  const analysisFailed = !!result && result.status !== 'success'
  const progressMessage = searching ? '비슷한 패션 상품을 찾고 있어요.'
    : sending ? 'AI가 선택한 패션 아이템을 분석하고 있어요.'
      : hasRecommendationList ? '비슷한 상품을 찾았어요.'
        : analysisFailed ? '상품을 분석하지 못했어요. 다시 시도해 주세요.'
          : '선택한 아이템과 비슷한 상품을 찾아보세요.'
  const recommendedProducts = hasRecommendationList
    ? recommendations.recommendations.filter((product) => product && typeof product === 'object' && !Array.isArray(product))
    : []
  const analyzedProduct = result?.selected_object
  const analysisFeatures = [analyzedProduct?.dominant_color,
    ...(Array.isArray(analyzedProduct?.secondary_colors) ? analyzedProduct.secondary_colors : []),
    analyzedProduct?.pattern, analyzedProduct?.visible_text_or_logo, analyzedProduct?.material_appearance,
    analyzedProduct?.fit_or_shape].filter(Boolean).join(' · ')
  const activePcTryOn = pcTryOnHistory.find((entry) => entry.id === activePcTryOnId) || pcTryOnHistory.at(-1)
  const hasTryOnResult = !!activePcTryOn?.result.image_data_url
  const stepLabels = ['사진 촬영/업로드', '패션 용품 영역 그리기', '상품 선택', '가상 착용']
  const completedSteps = [!!image, !!selection, !!tryOnProduct, hasTryOnResult]
  const availableSteps = [true, !!image, hasRecommendationList, !!tryOnProduct || hasTryOnResult]
  const hideSelectionTab = hasRecommendationList && recommendedProducts.length > 0 && pcStep !== 2
  const visibleTab = viewerTab === 'selection' && hideSelectionTab ? 'original'
    : viewerTab === 'uploaded' && !tryOnPerson ? 'original'
    : viewerTab === 'tryon' && !hasTryOnResult ? (hideSelectionTab ? 'original' : 'selection')
    : viewerTab === 'selection' && !selection && pcStep !== 2 ? 'original' : viewerTab

  return (
    <main className="studio-shell">
      <header className="studio-header">
        <a className="studio-home-link" href="/#/home">← ONFIT 쇼핑몰</a>
        <div className="studio-title"><span>ONFIT AI FASHION SEARCH</span>
          <h1>{image ? '나만의 가상 피팅 스튜디오' : 'AI 패션 검색 스튜디오'}</h1></div>
        <span className="studio-header-note">사진에서 찾고, 나에게 입혀보세요</span>
      </header>
      <nav className="studio-stepper" aria-label="진행 단계">
        {stepLabels.map((label, index) => <button key={label} type="button"
          className={pcStep === index + 1 ? 'is-current' : completedSteps[index] ? 'is-complete' : ''}
          aria-current={pcStep === index + 1 ? 'step' : undefined}
          disabled={index === 0 ? !image : !availableSteps[index] || pcStep === index + 1}
          onClick={() => {
            if (index === 0) {
              resetImage()
              return
            }
            if (index === 1) {
              restartDrawing()
              return
            }
            setPcStep(index + 1)
            if (index === 3 && hasTryOnResult) setViewerTab('tryon')
            else setViewerTab('original')
          }}>
          <span className="studio-step-number">{completedSteps[index] ? '✓' : index + 1}</span>{label}
        </button>)}
      </nav>
      <div className={'studio-grid' + (!image ? ' is-start' : pcStep === 2 && result?.status !== 'success' ? ' is-drawing-start' : '')}>
        <section className="studio-viewer" aria-label="사진 및 가상 착용 결과">
          {image && <div className="studio-viewer-head studio-viewer-tabs" role="tablist" aria-label="사진 보기">
            {[['original', '원본 사진'], ...(!hideSelectionTab ? [['selection', '선택 영역']] : []),
              ...(tryOnPerson ? [['uploaded', '업로드한 사진']] : []), ['tryon', '가상 착용 결과']].map(([tab, label]) =>
              <button key={tab} type="button" role="tab" aria-selected={visibleTab === tab}
                className={visibleTab === tab ? 'is-active' : ''}
                disabled={tab === 'selection' ? !selection : tab === 'tryon' ? !hasTryOnResult : false}
                onClick={() => {
                  setViewerTab(tab)
                  if (tab === 'tryon') setPcStep(4)
                  else if (pcStep >= 3 && !tryOnLoading) setPcStep(3)
                }}>{label}</button>)}
          </div>}
          <div ref={viewerFrameRef} className="studio-viewer-frame"
            onPointerDownCapture={(event) => {
              if (pcStep === 2 && event.button === 0 && event.target?.classList?.contains('drawing-canvas')) {
                setShowDrawingGuide(false)
              }
            }}>
            {!image ? <CameraView onImage={acceptImage} onCaptureConfirm={(data) => {
              acceptImage(data)
              setPcStep(2)
            }} studioStart /> : visibleTab === 'tryon' && hasTryOnResult
              ? <BeforeAfterSlider key={activePcTryOn.id} beforeSrc={activePcTryOn.person.url}
                  afterSrc={activePcTryOn.result.image_data_url} actual />
              : visibleTab === 'uploaded' && tryOnPerson
                ? <img className="studio-original-photo" src={tryOnPerson.url} alt="추가 업로드한 사진" />
              : visibleTab === 'original' && (pcStep !== 2 || selection)
                ? <img className="studio-original-photo" src={image.url} alt="선택한 원본 사진" />
              : <CircleSelector key={image.url + '-' + selectorReset} image={image} selection={selection}
                  onSelectionChange={changeSelection} visionGeometry={result?.geometry} embedded
                  locked={pcStep !== 2 || sending || searching}
                  stageStyle={viewerSize?.imageUrl === image.url ? { width: viewerSize.width, height: viewerSize.height } : undefined} />}
            {image && pcStep === 2 && !selection && showDrawingGuide && !sending && !searching &&
              <div className="studio-drawing-guide" aria-live="polite">
                <strong>원하는 아이템에 동그라미를 그려 주세요.</strong>
              </div>}
            {image && pcStep === 2 && selection && !result && !sending && !searching &&
              <div className="studio-drawing-guide" aria-live="polite">
                <strong>선택 영역을 확인하세요.</strong>
              </div>}
            {image && pcStep === 2 && (sending || searching) &&
              <div className="studio-drawing-guide is-searching" role="status">
                <span className="studio-search-spinner" aria-hidden="true" />
                <strong>{searching ? '유사 상품 검색중...' : '선택 아이템 분석중...'}</strong>
              </div>}
            {image && pcStep >= 3 && tryOnProduct && <div className="studio-viewer-product" aria-live="polite">
              {typeof tryOnProduct.image_url === 'string' &&
                <img src={tryOnProduct.image_url} alt="" />}
              <span><small>이 사진에 착용할 상품</small><strong>{tryOnProduct.product_name}</strong></span>
            </div>}
            {tryOnLoading && <div className="studio-viewer-loading" role="status">
              <span className="studio-search-spinner" aria-hidden="true" />
              <strong>AI가 가상 착용 이미지를 만들고 있어요.</strong>
            </div>}
          </div>
          {visibleTab === 'tryon' && pcTryOnHistory.length > 1 &&
            <div className="studio-result-history" role="group" aria-label="가상 착용 결과 기록">
              {pcTryOnHistory.map((entry) => <button key={entry.id} type="button"
                className={entry.id === activePcTryOn.id ? 'is-active' : ''}
                aria-pressed={entry.id === activePcTryOn.id}
                aria-label={`결과 ${entry.id}: ${entry.product.product_name}`}
                title={`${entry.person.alternate ? '업로드한 사진' : '원본 사진'} · ${entry.product.product_name}`}
                onClick={() => { setActivePcTryOnId(entry.id); setPcStep(4) }}>
                <img src={entry.result.image_data_url} alt="" />
                <span>결과 {entry.id}</span>
              </button>)}
            </div>}
          {image && <div className={'studio-viewer-actions' + (pcStep === 2 ? ' is-drawing' : '')}>
            {pcStep === 1 && <button type="button" className="studio-primary-action"
              onClick={() => { setPcStep(2); setViewerTab('original') }}>이 사진 사용하기</button>}
            {pcStep === 2 && <>
              <button type="button" className="secondary" onClick={() => {
                setSelectorReset((value) => value + 1)
                changeSelection(null)
                setViewerTab('original')
                setShowDrawingGuide(true)
              }} disabled={!selection || sending || searching}>다시 그리기</button>
              <button type="button" className="studio-primary-action"
                onClick={hasRecommendationList ? () => { setPcStep(3); setViewerTab('original') }
                  : result?.status === 'success' && result.search_image_crop?.file ? searchSimilar : submit}
                disabled={!selection || sending || searching}>
                {searching ? '상품 검색 중…' : sending ? '분석 중…' : searchError ? '다시 검색' :
                  analysisFailed ? '다시 분석하기' : '유사 상품 검색'}
              </button>
            </>}
            {pcStep === 1 && <button type="button" className="secondary" onClick={() => photoPickerRef.current?.click()}
              disabled={photoChanging}>{photoChanging ? '사진 준비 중…' : '사진 변경'}</button>}
            {visibleTab === 'tryon' && hasTryOnResult ?
              <button type="button" className="studio-primary-action studio-result-save"
                onClick={saveTryOnResult} disabled={downloading}>
                {downloading ? '저장 준비 중…' : '결과 저장'}
              </button> : pcStep >= 3 && tryOnProduct && <div className="studio-tryon-action-row">
              <button type="button" className="secondary" onClick={() => tryOnPickerRef.current?.click()}
                disabled={tryOnLoading || tryOnPhotoLoading}>
                {tryOnPhotoLoading ? '사진 준비 중…' : '다른 사진 업로드'}
              </button>
              <button type="button" className="studio-primary-action" onClick={createTryOn}
                disabled={tryOnLoading || tryOnPhotoLoading}>
                {tryOnLoading ? '가상 착용 생성 중…' : '가상 착용하기'}
              </button>
            </div>}
            {photoChangeError && <p className="error" role="alert">{photoChangeError}</p>}
            {pcStep === 2 && error && <p className="error" role="alert">{error}</p>}
            {pcStep === 2 && analysisFailed && !error && <p className="error" role="alert">{progressMessage}</p>}
            {pcStep >= 3 && tryOnPhotoError && <p className="error" role="alert">{tryOnPhotoError}</p>}
            {pcStep >= 3 && tryOnError && <p className="error" role="alert">{tryOnError} 다시 시도할 수 있어요.</p>}
            {pcStep >= 3 && visibleTab !== 'tryon' && tryOnProduct &&
              selectedTryOnRegion(result?.selected_object) === 'watch' &&
              <p className="studio-inline-status">손목이 보이는 사진이 시계 착용에 적합합니다.</p>}
            {downloadError && <p className="error" role="alert">{downloadError}</p>}
          </div>}
        </section>
        {image && (pcStep !== 2 || result?.status === 'success') && <aside className="studio-side" aria-label="아이템 분석과 추천 상품">
          <div className="studio-side-scroll">
            {pcStep === 1 ? <div className="studio-intro">
              <span className="eyebrow">PHOTO READY</span>
              <h2>사진을 확인해 주세요.</h2>
              <p>다른 사진을 원한다면 왼쪽의 사진 변경을 누르세요.</p>
            </div> : <>
              <div className="studio-analysis">
                <span className="eyebrow">{hasRecommendationList ? 'YOUR STYLE MATCH' : 'SELECT YOUR ITEM'}</span>
                <h2>{result?.status === 'success' ? '상품 분석 정보' : '선택한 영역을 확인하세요'}</h2>
                {result?.status === 'success' ? <div className="studio-analysis-details">
                  <p><strong>상품 종류</strong><span>{[analyzedProduct?.category, analyzedProduct?.product_type].filter(Boolean).join(' / ') || '확인 불가'}</span></p>
                  {analyzedProduct?.description && <p><strong>상품 설명</strong><span>{analyzedProduct.description}</span></p>}
                  {analysisFeatures && <p><strong>색상·디자인</strong><span>{analysisFeatures}</span></p>}
                  {result?.search_keywords?.primary && <p><strong>핵심 검색어</strong><span>{result.search_keywords.primary}</span></p>}
                  <small>무신사에서만 상품을 검색합니다.</small>
                </div> : <p>선택한 영역을 확인하고 유사 상품을 검색해 주세요.</p>}
                {(selection || sending || searching) && <span className="studio-progress" role="status">{progressMessage}</span>}
              </div>
              {pcStep >= 3 && recommendations && <section className="studio-products" aria-label="추천 상품">
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
                      {tryOnProduct?.product_id === product.product_id &&
                        <span className="studio-product-check" aria-hidden="true">✓ 선택됨</span>}
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
          {pcStep >= 3 && (!hasRecommendationList || recommendedProducts.length === 0) && <div className="studio-side-actions">
            {!hasRecommendationList ? <>
              <button type="button" className="secondary" onClick={() => {
                setSelectorReset((value) => value + 1)
                changeSelection(null)
              }} disabled={!selection || sending || searching}>다시 그리기</button>
              <button type="button" onClick={result?.status === 'success' ? searchSimilar : submit}
                disabled={!selection || sending || searching || (result?.status === 'success' && !result.search_image_crop?.file)}>
                {sending ? '분석 중…' : searching ? '상품 검색 중…' : searchError ? '다시 검색' :
                  analysisFailed ? '다시 분석하기' : '유사 상품 검색'}
              </button>
            </> : <div className="studio-empty-actions">
              <button type="button" onClick={searchSimilar} disabled={searching}>다시 검색</button>
              <button type="button" className="secondary" onClick={() => {
                setSelectorReset((value) => value + 1)
                changeSelection(null)
              }}>다른 아이템 선택</button>
            </div>}
          </div>}
        </aside>}
      </div>
      {image && <input ref={photoPickerRef} type="file" className="visually-hidden"
        accept="image/*" aria-label="새 사진 선택" onChange={changePhoto} />}
      {image && hasRecommendationList && <input ref={tryOnPickerRef} type="file" className="visually-hidden"
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        aria-label="가상 착용용 인물 사진 선택" onChange={uploadTryOnPerson} />}
    </main>
  )
}
