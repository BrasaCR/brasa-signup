import assert from 'node:assert/strict';
import test from 'node:test';
import { accessConfigured, verifyOperatorAccess } from '../src/cloudflare-access.js';

const env={OPERATOR_ACCESS_REQUIRED:'true',OPERATOR_ACCESS_ASSURANCE:'phishing-resistant',OPERATOR_ACCESS_TEAM_DOMAIN:'https://brasa.cloudflareaccess.com',OPERATOR_ACCESS_AUD:'a'.repeat(64)};
test('fails closed when Access is required but missing',async()=>{await assert.rejects(()=>verifyOperatorAccess(new Request('https://identity/exchange'),env),/operator_access_required/)});
test('requires a complete, explicitly attested Access configuration',()=>{assert.equal(accessConfigured(env),true);assert.equal(accessConfigured({...env,OPERATOR_ACCESS_AUD:''}),false);assert.equal(accessConfigured({...env,OPERATOR_ACCESS_ASSURANCE:'mfa'}),false)});
test('validates issuer and audience and returns only stable subject',async()=>{let options;const result=await verifyOperatorAccess(new Request('https://identity/exchange',{headers:{'cf-access-jwt-assertion':'aaa.bbb.ccc'}}),env,{createRemoteJWKSet:url=>({url:String(url)}),jwtVerify:async(token,keys,input)=>{options={token,keys,input};return{payload:{sub:'stable-access-subject'}}}});assert.equal(result.assurance,'cloudflare-access-phishing-resistant');assert.equal(result.subject,'stable-access-subject');assert.equal(options.input.issuer,env.OPERATOR_ACCESS_TEAM_DOMAIN);assert.equal(options.input.audience,env.OPERATOR_ACCESS_AUD);assert.deepEqual(options.input.algorithms,['RS256'])});
