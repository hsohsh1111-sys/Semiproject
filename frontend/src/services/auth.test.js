import test from 'node:test'
import assert from 'node:assert/strict'
import {authenticateAccount, verifySignupEmail} from './auth.js'

test('administrator sign-in uses a separate endpoint and validates its identity',async()=>{
  const calls=[]
  const result=await authenticateAccount({email:'onfit-admin',password:'test-only'},false,async(url,options)=>{
    calls.push({url,options})
    return {ok:true,json:async()=>url.endsWith('/login')?{access_token:'test-admin-token',expires_in:1800,auth_type:'admin'}:
      {id:'admin:onfit-admin',name:'ONFIT admin',is_admin:true}}
  })
  assert.ok(calls[0].url.endsWith('/auth/login'))
  assert.equal(result.auth_type,'admin')
  await assert.rejects(authenticateAccount({email:'x',password:'y'},false,async()=>({ok:false,json:async()=>({detail:'invalid'})})),/invalid/)
})

test('signup creates the account and restores its session in one request',async()=>{
  const calls=[]
  const replies=[{access_token:'test-token',token_type:'bearer',expires_in:1800,user:{id:7,name:'Member'}}]
  const fetcher=async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>replies.shift()}}
  const session=await authenticateAccount({email:'member@example.com',password:'test-only-password',name:'Member',verification_token:'email-proof'},true,fetcher)
  assert.equal(JSON.parse(calls[0].options.body).verification_token,'email-proof')
  assert.deepEqual(calls.map(c=>c.url.split('/').pop()),['signup-session'])
  assert.equal(session.user.id,7)
})

test('contact-phone signup omits email proof and logs in with the chosen ID',async()=>{
  const calls=[]
  await authenticateAccount({username:'phone.user',name:'Nickname',phone_number:'010-1234-5678',
    phone_collection_consent:true,sms_marketing_consent:false,terms_agreed:true,privacy_agreed:true,age_14_or_over:true,password:'test-password-123'},true,async(url,options)=>{
    calls.push({url,options})
    return {ok:true,json:async()=>({access_token:'test-token',expires_in:1800,user:{id:7,name:'Nickname',email:null}})}
  })
  const signup=JSON.parse(calls[0].options.body)
  assert.equal(signup.phone_number,'010-1234-5678')
  assert.equal(signup.sms_marketing_consent,false)
  assert.equal(signup.terms_agreed,true)
  assert.equal(signup.privacy_agreed,true)
  assert.equal(signup.age_14_or_over,true)
  assert.ok(!('email' in signup) && !('verification_token' in signup))
  assert.equal(calls.length,1)
  assert.ok(calls[0].url.endsWith('/signup-session'))
})

test('email verification sends only email/code data and surfaces unavailable delivery',async()=>{
  const sent=[]
  const result=await verifySignupEmail('request',{email:'member@example.com'},async(url,options)=>{
    sent.push({url,options});return {ok:true,json:async()=>({challenge_id:'test-challenge'})}
  })
  assert.equal(result.challenge_id,'test-challenge')
  assert.equal(JSON.parse(sent[0].options.body).email,'member@example.com')
  await assert.rejects(verifySignupEmail('confirm',{},async()=>({ok:false,json:async()=>({detail:'unavailable'})})),/unavailable/)
})
test('login does not register again or require a combined backend response',async()=>{
  const calls=[]
  const fetcher=async(url)=>{calls.push(url);return {ok:true,json:async()=>url.endsWith('/login')?{access_token:'test-token'}:{id:9,name:'Existing'}}}
  const session=await authenticateAccount({email:'member@example.com',password:'test-only-password'},false,fetcher)
  assert.equal(calls.length,2);assert.equal(session.user.name,'Existing')
})
test('canonical validation errors stop the flow before login',async()=>{
  let count=0
  await assert.rejects(authenticateAccount({email:'invalid',password:'short'},true,async()=>{
    count++;return {ok:false,json:async()=>({detail:[{msg:'Invalid email'}]})}
  }),/Invalid email/)
  assert.equal(count,1)
})
