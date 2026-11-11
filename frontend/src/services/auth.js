import { API_BASE } from './api.js'

// Preserve the canonical API: signup returns a user, login a token, me a user.
// The team UI previously expected a combined login/signup {token,user} reply.
export async function authenticateAccount({email,password,name}, signup=false, fetcher=fetch) {
  async function request(path, body, token) {
    const response=await fetcher(`${API_BASE}/auth/${path}`,{
      method:body?'POST':'GET',
      headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},
      ...(body?{body:JSON.stringify(body)}:{}),
    })
    const data=await response.json()
    if(!response.ok)throw new Error(typeof data.detail==='string'?data.detail:
      Array.isArray(data.detail)?data.detail.map(item=>item.msg).join('; '):'인증 요청을 처리하지 못했습니다.')
    return data
  }
  if(signup)await request('signup',{email,password,name})
  const token=await request('login',{email,password})
  if(!token.access_token)throw new Error('로그인 토큰을 받지 못했습니다.')
  const user=await request('me',null,token.access_token)
  return {...token,user}
}
