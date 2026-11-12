import { API_BASE } from './api.js'

export async function loadMyAccount(token, signal, fetcher=fetch) {
  const response=await fetcher(`${API_BASE}/auth/account`, {headers:{Authorization:`Bearer ${token}`},signal})
  const data=await response.json()
  if (!response.ok) throw new Error(typeof data.detail==='string'?data.detail:'내 정보를 불러오지 못했습니다.')
  return data
}

export async function withdrawAccount(token,password,fetcher=fetch) {
  const response=await fetcher(`${API_BASE}/auth/account`,{method:'DELETE',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
    body:JSON.stringify({password,confirmation:'회원탈퇴'})})
  if (response.status===204) return
  const data=await response.json()
  throw new Error(typeof data.detail==='string'?data.detail:'회원탈퇴를 완료하지 못했습니다. 다시 확인해 주세요.')
}
