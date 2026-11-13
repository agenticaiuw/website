import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canUseCollaboration, collaborationRequest } from '../src/collaboration.ts';

test('only active execs have collaboration access', () => {
  assert.equal(canUseCollaboration({role:'exec',active:1}),true);
  assert.equal(canUseCollaboration({role:'member',active:1}),false);
  assert.equal(canUseCollaboration({role:'exec',active:0}),false);
});
test('bridge keeps secret server-side and binds member identity', async () => {
  let received: { url: string; init?: RequestInit } | undefined;
  const fake = (async (url: string | URL | Request, init?: RequestInit) => {
    received={url:String(url),init}; return Response.json({ok:true});
  }) as typeof fetch;
  const token='local-fixture-token-0123456789abcdef';
  await collaborationRequest({COLLAB_ORIGIN:'https://workspace.example.test',COLLAB_SERVICE_TOKEN:token,COLLAB_ACCESS_CLIENT_ID:'fixture-id',COLLAB_ACCESS_CLIENT_SECRET:'fixture-secret'},42,{action:'queue_task',id:'s',instruction:'hello',source_id:'source'},fake);
  assert.equal(received?.url,'https://workspace.example.test/api/action');
  const headers=new Headers(received?.init?.headers);
  assert.equal(headers.get('authorization'),`Bearer ${token}`);
  assert.equal(headers.get('x-hub-member'),'42');
  assert.equal(headers.get('cf-access-client-id'),'fixture-id');
  assert.equal(headers.get('cf-access-client-secret'),'fixture-secret');
  assert.deepEqual(JSON.parse(String(received?.init?.body)),{action:'queue_task',id:'s',instruction:'hello',source_id:'source'});
  assert.equal(received?.init?.redirect,'error');
});
test('bridge refuses insecure or unconfigured upstreams', async () => {
  const token='local-fixture-token-0123456789abcdef';
  for (const origin of ['http://workspace.example.test','https://user:pass@workspace.example.test','https://workspace.example.test/path','https://workspace.example.test/?redirect=1']) {
    await assert.rejects(collaborationRequest({COLLAB_ORIGIN:origin,COLLAB_SERVICE_TOKEN:token,COLLAB_ACCESS_CLIENT_ID:'fixture-id',COLLAB_ACCESS_CLIENT_SECRET:'fixture-secret'},42),/Invalid collaboration/);
  }
  await assert.rejects(collaborationRequest({},42),/not configured/);
  await assert.rejects(collaborationRequest({COLLAB_ORIGIN:'https://workspace.example.test',COLLAB_SERVICE_TOKEN:token,COLLAB_ACCESS_CLIENT_ID:'fixture-id',COLLAB_ACCESS_CLIENT_SECRET:'fixture-secret'},0),/Invalid member/);
});
