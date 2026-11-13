import { useEffect, useState } from 'react'
import { loadMyAccount, withdrawAccount } from '../services/account.js'
import './MyPage.css'

export default function MyPage({session,onSessionChange,onRequestLogin}) {
  const [account,setAccount]=useState(null)
  const [error,setError]=useState('')
  const [open,setOpen]=useState(false)
  const [busy,setBusy]=useState(false)
  const [retry,setRetry]=useState(0)
  useEffect(()=>{
    if (!session) return
    const controller=new AbortController()
    setError('');setAccount(null)
    loadMyAccount(session.access_token,controller.signal).then(setAccount).catch(e=>{
      if(e.name!=='AbortError') setError(e.message)
    })
    return ()=>controller.abort()
  },[session?.access_token,retry])
  async function withdraw(event) {
    event.preventDefault()
    if(busy)return
    const form=event.currentTarget
    const password=new FormData(form).get('password')
    setBusy(true);setError('')
    try {
      await withdrawAccount(session.access_token,password)
      form.reset()
      onSessionChange(null)
      window.location.hash='#/home'
      window.alert('회원탈퇴가 완료되었습니다.')
    } catch(e) {setError(e.message)}
    finally {setBusy(false)}
  }
  if(!session) return <main className="inner-page my-page"><section className="section-wrap"><h1>마이페이지</h1><p>로그인 후 내 정보를 확인할 수 있습니다.</p><button className="button button-dark" onClick={onRequestLogin}>로그인</button></section></main>
  return <main className="inner-page my-page"><section className="section-wrap">
    <span className="eyebrow">MY ONFIT</span><h1>마이페이지</h1><p className="my-greeting">{session.user.name}님, 반갑습니다.</p>
    {error && <div className="my-error" role="alert">{error}{!account && <button type="button" onClick={()=>setRetry(v=>v+1)}>다시 불러오기</button>}</div>}
    {!account ? (!error && <p role="status">내 정보를 불러오는 중입니다…</p>) : <>
      <article className="my-card"><h2>내 정보</h2><dl>
        <dt>아이디</dt><dd>{account.username || '기존 이메일 가입 계정'}</dd>
        <dt>닉네임</dt><dd>{account.name}</dd>
        <dt>휴대폰 번호</dt><dd>{account.phone_number || '미등록'}</dd>
        {account.email && <><dt>이메일</dt><dd>{account.email}</dd></>}
        <dt>이벤트 문자</dt><dd>{account.sms_marketing_consent?'수신 동의':'미동의'}</dd>
        <dt>가입일</dt><dd>{new Date(account.created_at).toLocaleDateString('ko-KR')}</dd>
      </dl></article>
      <div className="my-shortcuts"><a href="#/fitting">내 체형 확인하기 →</a><a href="#/wardrobe">나의 옷장 보기 →</a></div>
      <section className="my-account-management"><h2>계정 관리</h2><button className="my-withdraw-link" type="button" onClick={()=>{setOpen(!open);setError('')}} aria-expanded={open}>회원탈퇴</button>
        {open && <form className="my-withdraw-form" onSubmit={withdraw}><h3>회원탈퇴 전 확인해 주세요</h3><p>계정과 연결된 프로필·인바디·저장 코디·찜 정보가 삭제되며 복구할 수 없습니다.</p><label>현재 비밀번호<input name="password" type="password" required maxLength={128} autoComplete="current-password" disabled={busy}/></label><label className="my-withdraw-consent"><input type="checkbox" required disabled={busy}/><span>삭제 내용을 확인했으며 회원탈퇴에 동의합니다.</span></label><div><button type="button" disabled={busy} onClick={()=>setOpen(false)}>취소</button><button className="my-withdraw-confirm" disabled={busy}>{busy?'처리 중…':'회원탈퇴 확정'}</button></div></form>}
      </section>
    </>}
  </section></main>
}
