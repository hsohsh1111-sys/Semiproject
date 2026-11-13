import test from 'node:test'
import assert from 'node:assert/strict'
import { loadMyAccount, withdrawAccount } from './account.js'

test('own account uses bearer token without arbitrary user id', async()=>{
  const account={id:1,name:'Test'}
  assert.deepEqual(await loadMyAccount('token',undefined,async(url,options)=>{
    assert.ok(url.endsWith('/auth/account'))
    assert.equal(options.headers.Authorization,'Bearer token')
    return {ok:true,json:async()=>account}
  }),account)
})
test('withdraw requires explicit confirmation and handles empty 204', async()=>{
  await withdrawAccount('token','password',async(url,options)=>{
    assert.equal(options.method,'DELETE')
    assert.equal(options.headers.Authorization,'Bearer token')
    assert.deepEqual(JSON.parse(options.body),{password:'password',confirmation:'회원탈퇴'})
    return {status:204,json:()=>{throw new Error('must not parse empty body')}}
  })
})
test('failed withdrawal is never treated as success', async()=>{
  await assert.rejects(withdrawAccount('token','wrong',async()=>({status:401,json:async()=>({detail:'Wrong password'})})),/Wrong password/)
})
