import type { Env, Viewer } from '../types.ts';

export type CollaborationAction =
  | { action: 'create'; id: string; title: string }
  | { action: 'bind_codex'; id: string; thread_id: string }
  | { action: 'queue_task'; id: string; instruction: string; source_id: string }
  | { action: 'dispatch_task' | 'cancel_task'; task_id: number }
  | { action: 'queue_control'; id: string; enabled: boolean }
  | { action: 'halt_queue'; id: string }
  | { action: 'halt_all' | 'resume_workspace' };

/** Hub is the identity boundary. Only active execs can access the shared VM. */
export function canUseCollaboration(viewer: Pick<Viewer, 'role' | 'active'>) {
  return viewer.active === 1 && viewer.role === 'exec';
}

/** The service credential stays on the Worker; callers cannot select the upstream URL. */
export async function collaborationRequest(
  env: Pick<Env, 'COLLAB_ORIGIN' | 'COLLAB_SERVICE_TOKEN' | 'COLLAB_ACCESS_CLIENT_ID' | 'COLLAB_ACCESS_CLIENT_SECRET'>,
  memberId: number,
  action?: CollaborationAction,
  fetcher: typeof fetch = fetch,
  outputRunId?: string,
): Promise<Response> {
  if (!env.COLLAB_ORIGIN || !env.COLLAB_SERVICE_TOKEN || env.COLLAB_SERVICE_TOKEN.length < 32 || !env.COLLAB_ACCESS_CLIENT_ID || !env.COLLAB_ACCESS_CLIENT_SECRET) throw new Error('Collaboration service is not configured');
  let origin: URL;
  try { origin = new URL(env.COLLAB_ORIGIN); } catch { throw new Error('Invalid collaboration service configuration'); }
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Invalid collaboration service configuration');
  if (!Number.isSafeInteger(memberId) || memberId <= 0) throw new Error('Invalid member');
  if (outputRunId && (!/^[a-f0-9]{32}$/i.test(outputRunId) || action)) throw new Error('Invalid run ID');
  const headers = new Headers({ Authorization: `Bearer ${env.COLLAB_SERVICE_TOKEN}`, 'X-Hub-Member': String(memberId), 'CF-Access-Client-Id': env.COLLAB_ACCESS_CLIENT_ID, 'CF-Access-Client-Secret': env.COLLAB_ACCESS_CLIENT_SECRET });
  if (action) headers.set('Content-Type', 'application/json');
  return fetcher(new URL(action ? '/api/action' : outputRunId ? `/api/output/${outputRunId}` : '/api/state', origin), {
    method: action ? 'POST' : 'GET', headers, body: action ? JSON.stringify(action) : undefined,
    redirect: 'error', signal: AbortSignal.timeout(10_000),
  });
}
