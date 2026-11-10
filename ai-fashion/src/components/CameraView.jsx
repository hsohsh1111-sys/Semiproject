import React, { useEffect, useRef, useState } from 'react'
import LandingPage from './LandingPage.jsx'

const MAX_SIDE = 2400

function canvasToFile(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('이미지를 저장하지 못했습니다.'))
      } else {
        resolve(new File([blob], 'circle-search.jpg', { type: 'image/jpeg' }))
      }
    }, 'image/jpeg', 0.88)
  })
}

function drawImage(source, width, height) {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

export function centerZoomCrop(width, height, aspect, zoom) {
  let cropWidth = width
  let cropHeight = height
  if (width / height > aspect) cropWidth = height * aspect
  else cropHeight = width / aspect
  cropWidth /= zoom
  cropHeight /= zoom
  return [(width - cropWidth) / 2, (height - cropHeight) / 2, cropWidth, cropHeight]
}

export async function prepareUploadedImage(file) {
  if (!file.type.startsWith('image/')) throw new Error('이미지 파일을 선택하세요.')
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('이미지를 읽지 못했습니다.')
    const canvas = drawImage(image, image.naturalWidth, image.naturalHeight)
    return { file: await canvasToFile(canvas), width: canvas.width, height: canvas.height,
      sourceWidth: image.naturalWidth, sourceHeight: image.naturalHeight }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function captureCameraFrame(video, zoomOptions) {
  if (!video?.videoWidth || !video?.videoHeight) throw new Error('카메라 영상이 준비되지 않았습니다.')
  if (zoomOptions) {
    const { sourceWidth, sourceHeight, digitalZoom } = zoomOptions
    const scale = Math.min(1, MAX_SIDE / Math.max(sourceWidth, sourceHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(sourceWidth * scale)
    canvas.height = Math.round(sourceHeight * scale)
    const crop = centerZoomCrop(video.videoWidth, video.videoHeight,
      sourceWidth / sourceHeight, digitalZoom)
    canvas.getContext('2d').drawImage(video, ...crop, 0, 0, canvas.width, canvas.height)
    return { file: await canvasToFile(canvas), width: canvas.width, height: canvas.height,
      sourceWidth, sourceHeight }
  }
  const canvas = drawImage(video, video.videoWidth, video.videoHeight)
  return { file: await canvasToFile(canvas), width: canvas.width, height: canvas.height,
    sourceWidth: video.videoWidth, sourceHeight: video.videoHeight }
}

export default function CameraView({ onImage, onCaptureConfirm = onImage, landing = false, studioStart = false }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const pickerRef = useRef(null)
  const requestRef = useRef(0)
  const [active, setActive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [cameraFailed, setCameraFailed] = useState(false)
  const [showCameraView, setShowCameraView] = useState(false)
  const [devices, setDevices] = useState([])
  const [deviceId, setDeviceId] = useState('')
  const [preview, setPreview] = useState(null)

  function releaseStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }

  function stopCamera() {
    requestRef.current += 1
    releaseStream()
    setActive(false)
    setBusy(false)
  }

  useEffect(() => {
    if (showCameraView) startCamera()
    return () => {
      requestRef.current += 1
      releaseStream()
    }
  }, [showCameraView])

  useEffect(() => () => {
    if (preview?.url) URL.revokeObjectURL(preview.url)
  }, [preview])

  async function startCamera(selectedDeviceId = '') {
    const request = ++requestRef.current
    releaseStream()
    setActive(false)
    setPreview(null)
    setError('')
    setCameraFailed(false)
    setDeviceId(selectedDeviceId)
    if (window.isSecureContext === false) {
      setCameraFailed(true)
      setError('카메라를 사용하려면 localhost 또는 HTTPS 접속이 필요합니다.')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraFailed(true)
      setError('카메라를 실행할 수 없습니다. 연결 상태를 확인해 주세요.')
      return
    }
    setBusy(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true,
      })
      if (request !== requestRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      const video = videoRef.current
      if (!video) throw new Error('video unavailable')
      video.srcObject = stream
      await video.play()
      if (request !== requestRef.current) return
      setActive(true)
      setDeviceId(stream.getVideoTracks()[0]?.getSettings().deviceId || selectedDeviceId)
      try {
        const available = await navigator.mediaDevices.enumerateDevices()
        if (request === requestRef.current) setDevices(available.filter((item) => item.kind === 'videoinput' && item.deviceId))
      } catch {
        // Device labels may be unavailable even when the camera works.
      }
    } catch (caught) {
      if (request !== requestRef.current) return
      releaseStream()
      setActive(false)
      setCameraFailed(true)
      setError(caught.name === 'NotFoundError' || caught.name === 'DevicesNotFoundError' || caught.name === 'OverconstrainedError'
        ? '사용 가능한 카메라를 찾지 못했어요. 웹캠을 연결하거나 사진을 업로드해 주세요.'
        : caught.name === 'NotAllowedError' || caught.name === 'PermissionDeniedError' || caught.name === 'SecurityError'
          ? '카메라 접근이 차단됐어요. 브라우저에서 권한을 허용해 주세요.'
          : '카메라를 실행할 수 없습니다. 연결 상태를 확인해 주세요.')
    } finally {
      if (request === requestRef.current) setBusy(false)
    }
  }

  async function capture() {
    const video = videoRef.current
    if (!active || busy || !video?.videoWidth || !video?.videoHeight) {
      setCameraFailed(true)
      setError('카메라 영상이 준비되지 않았습니다. 잠시 후 다시 시도하세요.')
      return
    }
    const request = requestRef.current
    setBusy(true)
    try {
      const data = await captureCameraFrame(video)
      if (request !== requestRef.current) return
      stopCamera()
      setPreview({ ...data, url: URL.createObjectURL(data.file) })
      setError('')
    } catch (caught) {
      if (request === requestRef.current) {
        setCameraFailed(true)
        setError(caught.message)
      }
    } finally {
      if (request === requestRef.current) setBusy(false)
    }
  }

  async function upload(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    stopCamera()
    setPreview(null)
    setError('')
    setCameraFailed(false)
    if (!file.type.startsWith('image/')) {
      setError('이미지 파일을 선택하세요.')
      return
    }
    const request = requestRef.current
    setBusy(true)
    try {
      const data = await prepareUploadedImage(file)
      if (request !== requestRef.current) return
      onImage(data)
    } catch (caught) {
      if (request === requestRef.current) setError(caught.message === '이미지 파일을 선택하세요.' ? caught.message
        : '이미지를 읽지 못했습니다. 다른 파일을 선택하세요.')
    } finally {
      if (request === requestRef.current) setBusy(false)
    }
  }

  function cancel() {
    stopCamera()
    setPreview(null)
    setError('')
    setCameraFailed(false)
    setShowCameraView(false)
  }

  if (landing && !showCameraView) return <>
    <LandingPage onCamera={() => setShowCameraView(true)} onUpload={() => pickerRef.current?.click()}
      busy={busy} error={error} />
    <input ref={pickerRef} type="file" accept="image/*" onChange={upload}
      className="visually-hidden" aria-label="이미지 파일 선택" />
  </>

  if (studioStart && !showCameraView) return <div className="studio-photo-start">
    <span className="eyebrow">START WITH A PHOTO</span>
    <h2>찾고 싶은 아이템이 담긴 사진을 준비해 주세요.</h2>
    <p>사진을 촬영하거나 업로드한 뒤, 원하는 옷을 선택할 수 있어요.</p>
    <div className="studio-start-buttons">
      <button type="button" onClick={() => setShowCameraView(true)}>사진 촬영</button>
      <button type="button" className="secondary" onClick={() => pickerRef.current?.click()} disabled={busy}>사진 업로드</button>
    </div>
    <input ref={pickerRef} type="file" accept="image/*" onChange={upload}
      className="visually-hidden" aria-label="이미지 파일 선택" />
    {error && <p className="error" role="alert">{error}</p>}
  </div>

  return (
    <section className={'card camera-card pc-camera' + (preview ? ' is-preview' : '')} aria-label="사진 촬영">
      <div className="section-heading"><span className="step">01</span><h2>{preview ? '촬영한 사진 확인' : '카메라로 촬영'}</h2></div>
      <p className="hint">{preview ? '사진을 확인한 뒤 사용할지 선택하세요.' : '사진에서 찾고 싶은 패션 아이템이 보이도록 촬영하세요.'}</p>
      <video ref={videoRef} className={`camera-video ${active && !preview ? '' : 'hidden'}`} playsInline muted autoPlay aria-label="실시간 웹캠 미리보기" />
      {preview && <img className="pc-camera-photo" src={preview.url} alt="촬영한 사진 미리보기" />}
      {!preview && devices.length > 1 && <label className="pc-camera-device">카메라 선택
        <select value={deviceId} onChange={(event) => startCamera(event.target.value)} disabled={busy}>
          {devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>
            {device.label || `카메라 ${index + 1}`}
          </option>)}
        </select>
      </label>}
      <div className="button-row pc-camera-actions">
        {preview ? <>
          <button type="button" onClick={() => onCaptureConfirm(preview)} disabled={busy}>확인</button>
          <button type="button" className="secondary" onClick={() => startCamera(deviceId)} disabled={busy}>취소</button>
        </> : <>
          {active && !cameraFailed && <button type="button" onClick={capture} disabled={busy}>사진 촬영</button>}
          {cameraFailed && <button type="button" onClick={() => startCamera(deviceId)} disabled={busy}>다시 시도</button>}
          <button type="button" className="secondary" onClick={cancel}>취소</button>
        </>}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  )
}
