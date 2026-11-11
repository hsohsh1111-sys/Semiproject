import { useEffect, useRef, useState } from 'react'
import { extractInbody, listInbodyRecords, saveConfirmedInbody, getInbodyBodyPreview } from '../../services/inbodyUpload.js'

export default function InbodyUploadPanel({ token, disabled, onApplyBody, onExpired }) {
  const [file, setFile] = useState(null)
  const [fileInputKey, setFileInputKey] = useState(0)
  const [result, setResult] = useState(null)
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')
  const [muscle, setMuscle] = useState('')
  const [fat, setFat] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [applyMessage, setApplyMessage] = useState('')
  const [records, setRecords] = useState(null)
  const [suggestion, setSuggestion] = useState(null)
  const controller = useRef(null)
  useEffect(() => () => controller.current?.abort(), [])
  useEffect(() => { setSuggestion(null); setApplyMessage('') }, [height, weight, muscle, fat, file])
  const twoDecimals = value => value !== '' && Number.isFinite(Number(value))
    && Math.abs(Number(value) * 100 - Math.round(Number(value) * 100)) < 1e-7
  const valid = twoDecimals(height) && twoDecimals(weight)
    && Number(height) >= 100 && Number(height) <= 230 && Number(weight) >= 20 && Number(weight) <= 300
  const muscleValid = twoDecimals(muscle) && Number(muscle) > 0 && Number(muscle) <= Number(weight)
  const fatValid = twoDecimals(fat) && Number(fat) >= 0 && Number(fat) <= 100

  async function upload(event) {
    event.preventDefault()
    controller.current?.abort()
    const request = new AbortController()
    controller.current = request
    setLoading(true); setResult(null); setSuggestion(null); setApplyMessage(''); setMessage('')
    try {
      const preview = await extractInbody(token, file, request.signal)
      if (request.signal.aborted) return
      setResult(preview)
      setHeight(preview.values.height_cm ?? '')
      setWeight(preview.values.weight_kg ?? '')
      setMuscle(preview.values.skeletal_muscle_kg ?? '')
      setFat(preview.values.body_fat_pct ?? '')
      setMessage('')
    } catch (error) {
      if (request.signal.aborted) return
      setMessage(error instanceof TypeError ? '백엔드에 연결할 수 없습니다. 실행 상태와 연결 설정을 확인해 주세요.' : error.message)
      if (error.status === 401) onExpired()
    } finally {
      if (!request.signal.aborted) setLoading(false)
    }
  }

  async function calculateBody() {
    if (disabled || loading || !valid || !muscleValid || !fatValid) return

          setLoading(true); setSuggestion(null); setApplyMessage(''); setMessage('')
          const request = new AbortController(); controller.current = request
          try {
            const preview = await getInbodyBodyPreview(token, {
              height_cm: Number(height), weight_kg: Number(weight),
              skeletal_muscle_kg: Number(muscle), body_fat_pct: Number(fat),
            }, request.signal)
            if (request.signal.aborted) return
            setSuggestion(preview)
            setMessage('체형 계산 완료')
          } catch (error) {
            if (!request.signal.aborted) { setMessage(error.message); if (error.status === 401) onExpired() }
          } finally { if (!request.signal.aborted) setLoading(false) }

  }

  async function loadRecords() {
    setLoading(true)
    try { setRecords(await listInbodyRecords(token)) }
    catch (error) {
      setMessage(error.message)
      if (error.status === 401) onExpired()
    } finally { setLoading(false) }
  }

  function selectRecord(record) {
    setFile(null); setFileInputKey(key => key + 1)
    setHeight(record.height_cm ?? ''); setWeight(record.weight_kg ?? '')
    setMuscle(record.skeletal_muscle_kg ?? ''); setFat(record.body_fat_pct ?? '')
    setResult({ values: record, warnings: [], fromRecord: true })
    setSuggestion(null); setApplyMessage('')
    setMessage('저장된 인바디 수치를 불러왔습니다. 나의 체형 계산을 눌러 주세요.')
  }

  async function loadLatestRecord() {
    if (disabled || loading) return
    controller.current?.abort()
    const request = new AbortController(); controller.current = request
    setLoading(true); setMessage(''); setSuggestion(null); setApplyMessage('')
    try {
      const saved = await listInbodyRecords(token, request.signal)
      if (request.signal.aborted) return
      if (saved.length) selectRecord(saved[0])
      else setMessage('저장된 인바디 기록이 없습니다. 인바디 파일을 분석한 뒤 기록을 저장해 주세요.')
    } catch (error) {
      if (!request.signal.aborted) {
        setMessage(error.message)
        if (error.status === 401) onExpired()
      }
    } finally { if (!request.signal.aborted) setLoading(false) }
  }

  return <section aria-label="인바디 파일에서 치수 불러오기">
    <div className="fitting-inbody-analysis">
      <button type="button" disabled={disabled || loading} onClick={loadLatestRecord} aria-describedby="inbody-load-guide">내 인바디 불러오기</button>
      <p id="inbody-load-guide">저장된 최신 인바디 수치를 불러옵니다.</p>
    </div>
    <h2>인바디 파일 불러오기</h2>
    <form onSubmit={upload}>
      <fieldset disabled={disabled || loading}>
        <label>인바디 파일<input key={fileInputKey} type="file" accept=".pdf,.png,.jpg,.jpeg" required onChange={event => {
          setFile(event.target.files?.[0] ?? null); setResult(null); setMessage('')
        }} /></label>
        <div className="fitting-inbody-analysis">
          <button type="submit" disabled={!file} aria-describedby="inbody-analysis-guide">나의 인바디 분석</button>
          <p id="inbody-analysis-guide">인바디를 분석하고 수치를 확인하면 나만의 추정 체형을 만들 수 있어요. 실제 체형과 다를 수 있습니다.</p>
        </div>
      </fieldset>
    </form>
    {(loading || message) && <p role="status">{loading ? '처리 중…' : message}</p>}
    {result && <>
      <fieldset disabled={disabled || loading}>
        <legend>{result.fromRecord ? '불러온 인바디 수치' : '추출 결과 확인'}</legend>
        <div className="fitting-inbody-fields">
        <label>키 (cm)<input type="number" min="100" max="230" step="any" value={height} required
          onChange={e => { setHeight(e.target.value) }} /></label>
        <label>체중 (kg)<input type="number" min="20" max="300" step="any" value={weight} required
          onChange={e => { setWeight(e.target.value) }} /></label>
        <label>골격근량 (kg)<input type="number" min="0.01" max="300" step="0.01" value={muscle}
          onChange={e => { setMuscle(e.target.value) }} /></label>
        <label>체지방률 (%)<input type="number" min="0" max="100" step="0.01" value={fat}
          onChange={e => { setFat(e.target.value) }} /></label>
        </div>
        {(!valid || !muscleValid || !fatValid) && <p role="alert">미추출 수치와 입력 범위를 확인해 주세요.</p>}
        <button type="button" disabled={disabled || loading || !valid || !muscleValid || !fatValid}
          onClick={calculateBody}>나의 체형 계산</button>
      </fieldset>
      <div className="fitting-inbody-apply">
        <button type="button" disabled={disabled || loading || !suggestion || !onApplyBody} onClick={() => {
          if (!suggestion) return
          try {
            onApplyBody(suggestion)
            setMessage('')
            setApplyMessage('마네킹에 적용했습니다.')
          } catch (error) { setApplyMessage(error.message) }
        }}>나의 인바디 체형 적용</button>
        {applyMessage && <p role="status">{applyMessage}</p>}
      </div>
    <form onSubmit={async event => {
      event.preventDefault()
      if (!valid || !muscleValid || !fatValid) return
      setLoading(true)
      try {
        // Legacy API requires measured_at. Without an entered measurement date,
        // use submission time as a record ordering timestamp, NOT an asserted
        // historical measurement date. The button explicitly states this basis.
        const recordedAt = new Date().toISOString()
        const saved = await saveConfirmedInbody(token, {
          height_cm: Number(height), weight_kg: Number(weight),
          skeletal_muscle_kg: Number(muscle), body_fat_pct: Number(fat), measured_at: recordedAt,
        })
        setMessage('기록을 저장했습니다.')
        setResult(null); setFile(null)
        setFileInputKey(key => key + 1)
        try { setRecords(await listInbodyRecords(token)) }
        catch { setMessage(`인바디 기록 ${saved.id}번을 저장했습니다. 최근 목록을 갱신하지 못해 다시 불러와야 합니다.`) }
      } catch (error) {
        setMessage(error instanceof TypeError ? '백엔드에 연결할 수 없습니다.' : error.message)
        if (error.status === 401) onExpired()
      } finally { setLoading(false) }
    }}>
      <fieldset disabled={disabled || loading}>
        <legend>인바디 기록 저장 (선택)</legend>
        <button type="submit" disabled={!valid || !muscleValid || !fatValid}>기록 저장 (저장 시각 기준)</button>
      </fieldset>
    </form>
    </>}
    <div className="fitting-actions">
      <button type="button" disabled={disabled || loading} onClick={loadRecords}>내 최근 인바디 기록 보기</button>
    </div>
    {records && <div aria-live="polite">
      <h3>최근 인바디 기록</h3>
      {records.length === 0 ? <p>저장된 인바디 기록이 없습니다.</p> : <ul className="fitting-records">
        {records.map(record => <li key={record.id}>
          <div><strong>{new Date(record.created_at ?? record.measured_at).toLocaleString()}</strong>
            <span>키 {record.height_cm}cm · 체중 {record.weight_kg}kg · 골격근량 {record.skeletal_muscle_kg}kg · 체지방률 {record.body_fat_pct}%</span></div>
          <button type="button" disabled={disabled || loading} onClick={() => selectRecord(record)}>불러오기</button>
        </li>)}
      </ul>}
    </div>}
  </section>
}
