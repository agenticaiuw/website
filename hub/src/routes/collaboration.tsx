import { Hono } from 'hono';
import { canUseCollaboration, collaborationRequest, type CollaborationAction } from '../collaboration';
import type { AppEnv } from '../types';
import { page } from '../views/layout';
import { PageHead } from '../views/ui';

export const collaborationRoutes = new Hono<AppEnv>();
type State = {
  sessions: { id: string; title: string; status: string }[];
  tasks: { id: number; session_id: string; author: string; instruction: string; status: string; run_status: string | null }[];
  runs: { id: string; session_id: string; status: string; supervisor: string }[];
  queue_controls: [string, boolean][];
  workspace_halted: boolean;
};
collaborationRoutes.use('/collaboration/*', async (c, next) => {
  if (!canUseCollaboration(c.get('viewer'))) return c.text('Exec access required.', 403);
  await next();
});
collaborationRoutes.get('/collaboration', async c => {
  if (!canUseCollaboration(c.get('viewer'))) return c.text('Exec access required.', 403);
  let state: State;
  try {
    const res = await collaborationRequest(c.env, c.get('viewer').id);
    if (!res.ok) throw new Error('Unavailable');
    state = await res.json<State>();
  } catch {
    return page(c, { title: 'Collaboration', active: 'collaboration' }, <><PageHead title="Collaboration" sub="The workspace is unavailable or has not been connected." /><p>Ask a workspace administrator to check the connection.</p></>);
  }
  const sourceId = `hub:${crypto.randomUUID()}`;
  return page(c, { title: 'Collaboration', active: 'collaboration' }, <>
    <PageHead title="Collaboration" sub="Queue instructions for shared agent sessions and inspect their progress." />
    <form method="post" action="/collaboration/action"><input type="hidden" name="action" value="halt_all" /><button class="btn">Pause all queues and stop active runs</button></form>
    <form method="post" action="/collaboration/action"><input type="hidden" name="action" value="resume_workspace" /><button>Allow new runs</button></form><p>{state.workspace_halted ? 'Workspace halted; new runs are blocked.' : 'Workspace accepts new runs.'}</p>
    <p>Stopping pauses future automatic work and asks each supervisor to stop. An unreachable supervisor means its process may still be running.</p>
    <section class="card"><h2>Create a session</h2><form method="post" action="/collaboration/action"><input type="hidden" name="action" value="create" /><label>Session ID <input name="id" required maxLength={80} /></label><label>Title <input name="title" required maxLength={160} /></label><button class="btn">Create session</button></form></section>
    <section class="card"><h2>Bind a Codex thread</h2><p>Enter an existing thread UUID accessible to the workspace machine. The binding is permanent; it does not itself verify access.</p><form method="post" action="/collaboration/action"><input type="hidden" name="action" value="bind_codex" /><label>Session ID <input name="id" required /></label><label>Thread UUID <input name="thread_id" required /></label><button class="btn">Bind thread</button></form></section>
    <section class="card"><h2>Sessions</h2>
      {state.sessions.length ? <ul>{state.sessions.map(s => <li><strong>{s.title}</strong> · {s.id} · {s.status}
        <form method="post" action="/collaboration/action"><input type="hidden" name="id" value={s.id} /><input type="hidden" name="action" value="queue_control" /><button name="enabled" value="true">Enable automatic dispatch</button><button name="enabled" value="false">Pause dispatch</button></form>
        <form method="post" action="/collaboration/action"><input type="hidden" name="id" value={s.id} /><input type="hidden" name="action" value="halt_queue" /><button>Pause and stop active run</button></form>
      </li>)}</ul> : <p>No sessions yet.</p>}
    </section>
    <section class="card"><h2>Queue an instruction</h2><form method="post" action="/collaboration/action">
      <input type="hidden" name="action" value="queue_task" /><input type="hidden" name="source_id" value={sourceId} />
      <label>Session <select name="id" required>{state.sessions.filter(s => s.status === 'active').map(s => <option value={s.id}>{s.title} · {s.id}</option>)}</select></label>
      <label>Instruction <textarea name="instruction" required maxLength={4096}></textarea></label><button class="btn">Queue instruction</button>
    </form></section>
    <section class="card"><h2>Tasks</h2>{state.tasks.length ? <ul>{state.tasks.map(t => <li><strong>#{t.id}</strong> · {t.session_id} · {t.author} · {t.status}{t.run_status ? ` / ${t.run_status}` : ''}<p>{t.instruction}</p>
      {t.status === 'queued' && <form method="post" action="/collaboration/action"><input type="hidden" name="task_id" value={String(t.id)} /><button name="action" value="dispatch_task">Dispatch now</button><button name="action" value="cancel_task">Cancel</button></form>}
    </li>)}</ul> : <p>No tasks queued.</p>}</section>
    <section class="card"><h2>Runs</h2>{state.runs.length ? <ul>{state.runs.map(r => <li>{r.session_id} · {r.id} · {r.status} · supervisor {r.supervisor} · <a href={`/collaboration/output/${r.id}`}>View output</a></li>)}</ul> : <p>No runs yet.</p>}</section>
  </>);
});
collaborationRoutes.post('/collaboration/action', async c => {
  const viewer=c.get('viewer');
  if (!canUseCollaboration(viewer)) return c.text('Exec access required.',403);
  if (c.req.header('Origin') !== new URL(c.req.url).origin) return c.text('Cross-site request refused.',403);
  const form=await c.req.parseBody();
  const text=(key:string) => typeof form[key] === 'string' ? String(form[key]).trim() : '';
  const name=text('action'), id=text('id');
  let action: CollaborationAction;
  if (name==='create' && id && text('title') && id.length<=80 && text('title').length<=160) action={action:'create',id,title:text('title')};
  else if (name==='bind_codex' && id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text('thread_id'))) action={action:'bind_codex',id,thread_id:text('thread_id')};
  else if (name==='halt_all' || name==='resume_workspace') action={action:name};
  else if (name==='halt_queue' && id) action={action:'halt_queue',id};
  else if (name==='queue_control' && id && ['true','false'].includes(text('enabled'))) action={action:'queue_control',id,enabled:text('enabled')==='true'};
  else if ((name==='dispatch_task' || name==='cancel_task') && /^\d+$/.test(text('task_id')) && Number.isSafeInteger(Number(text('task_id')))) action={action:name,task_id:Number(text('task_id'))};
  else if (name==='queue_task' && id && text('instruction') && /^hub:[0-9a-f-]{36}$/i.test(text('source_id')) && new TextEncoder().encode(text('instruction')).length<=4096) action={action:'queue_task',id,instruction:text('instruction'),source_id:text('source_id')};
  else return c.text('Invalid collaboration action.',400);
  try {
    const res=await collaborationRequest(c.env,viewer.id,action);
    if (!res.ok) return c.text('The workspace did not confirm this action. Check its status before retrying.',502);
  } catch { return c.text('The workspace could not be reached. Check its status before retrying.',502); }
  return c.redirect('/collaboration',303);
});

collaborationRoutes.get('/collaboration/output/:runId', async c => {
  const viewer=c.get('viewer');
  if (!canUseCollaboration(viewer)) return c.text('Exec access required.',403);
  const runId=c.req.param('runId');
  if (!/^[a-f0-9]{32}$/i.test(runId)) return c.text('Invalid run.',400);
  try {
    const res=await collaborationRequest(c.env,viewer.id,undefined,fetch,runId);
    if (!res.ok) return c.text('Output unavailable.',404);
    const result=await res.json<{output:string}>();
    return page(c,{title:'Run output',active:'collaboration'},<><PageHead title="Run output" sub={`Run ${runId}`} /><p><a href="/collaboration">Back to collaboration</a></p><pre>{result.output}</pre></>);
  } catch { return c.text('Output unavailable.',502); }
});
