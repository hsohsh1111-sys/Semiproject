import test from 'node:test'
import assert from 'node:assert/strict'
import {authenticateAccount} from './auth.js'

test('team signup UI uses the canonical signup -> login -> me contract',async()=>{
  const calls=[]
  const replies=[{id:7,name:'Member'}, {access_token:'test-token',token_type:'bearer'}, {id:7,name:'Member'}]
  const fetcher=async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>replies.shift()}}
  const session=await authenticateAccount({email:'member@example.com',password:'test-only-password',name:'Member'},true,fetcher)
  assert.deepEqual(calls.map(c=>c.url.split('/').pop()),['signup','login','me'])
  assert.equal(calls[2].options.headers.Authorization,'Bearer test-token')
  assert.equal(session.user.id,7)
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
