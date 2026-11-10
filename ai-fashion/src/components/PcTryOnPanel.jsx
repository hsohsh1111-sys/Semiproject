import React from 'react'

export async function downloadTryOnImage(source) {
      let blob
      if (source.startsWith('data:')) {
        const separator = source.indexOf(',')
        const header = source.slice(5, separator)
        if (separator < 0 || !header.endsWith(';base64')) throw new Error('이미지 데이터가 올바르지 않습니다.')
        const binary = atob(source.slice(separator + 1))
        const bytes = new Uint8Array(binary.length)
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
        blob = new Blob([bytes], { type: header.slice(0, -7) })
      } else {
        const response = await fetch(source)
        if (!response.ok) throw new Error('이미지를 읽지 못했습니다.')
        blob = await response.blob()
      }
      const extension = {
        'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
        'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif',
      }[blob.type.split(';')[0].toLowerCase()]
      if (!blob.size || !extension) throw new Error('저장 가능한 이미지 형식이 아닙니다.')
      const now = new Date()
      const stamp = [now.getFullYear(), now.getMonth() + 1, now.getDate(),
        now.getHours(), now.getMinutes(), now.getSeconds()]
        .map((part, index) => index === 0 ? String(part) : String(part).padStart(2, '0'))
      const objectUrl = URL.createObjectURL(blob)
      try {
        const link = document.createElement('a')
        link.href = objectUrl
        link.download = `onfit-tryon-${stamp.slice(0, 3).join('')}-${stamp.slice(3).join('')}.${extension}`
        document.body.appendChild(link)
        link.click()
        link.remove()
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10000)
      }
}

export default function PcTryOnPanel({ product, hasAlternatePerson, loading, error, photoError, photoLoading,
  watchWarning, showDebug, result, onUploadPerson, onRestorePerson, onGenerate }) {
  return <section className="studio-tryon-controls" aria-label="가상 착용 작업">
    <h3>선택한 상품</h3>
    {product ? <div className="studio-selected-product">
      {typeof product.image_url === 'string' && <img src={product.image_url} alt="선택한 상품" />}
      <div><small>{product.brand || '브랜드 정보 없음'}</small><strong>{product.product_name}</strong></div>
    </div> : <p className="studio-action-hint">추천 상품을 선택하면 가상 착용을 시작할 수 있어요.</p>}
    {product && <>
      <div className="studio-photo-options">
        <button type="button" className="secondary" onClick={onUploadPerson} disabled={loading || photoLoading}>다른 사진 사용</button>
        {hasAlternatePerson && <button type="button" className="secondary" onClick={onRestorePerson}
          disabled={loading || photoLoading}>원본 사진으로</button>}
      </div>
      <button type="button" className="studio-generate" onClick={onGenerate} disabled={loading || photoLoading}>
        {loading ? '가상 착용 생성 중…' : '가상 착용하기'}
      </button>
    </>}
    {loading && <p className="studio-inline-status" role="status">AI가 가상 착용 이미지를 만들고 있어요.</p>}
    {product && watchWarning && <p className="studio-inline-status">손목이 보이는 사진이 시계 착용에 적합합니다.</p>}
    {photoError && <p className="error" role="alert">{photoError}</p>}
    {error && <p className="error" role="alert">{error} 다시 시도할 수 있어요.</p>}
    {showDebug && result && <small className="tryon-metadata">모델: {result.model} · 생성 시간: {(result.elapsed_ms / 1000).toFixed(1)}초{Number.isFinite(result.usage?.total_tokens) ? ` · 토큰: ${result.usage.total_tokens}` : ''}</small>}
  </section>
}
