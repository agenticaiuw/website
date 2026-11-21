<script lang="ts">
	import PageHead from '$lib/components/PageHead.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

{#if !data.state}
	<PageHead title="Collaboration" sub="The workspace is unavailable or has not been connected." />
	<p>Ask a workspace administrator to check the connection.</p>
{:else}
	{@const state = data.state}
	<PageHead title="Collaboration" sub="Queue instructions for shared agent sessions and inspect their progress." />
	<form method="post" action="/collaboration/action"><input type="hidden" name="action" value="halt_all" /><button class="btn">Pause all queues and stop active runs</button></form>
	<form method="post" action="/collaboration/action"><input type="hidden" name="action" value="resume_workspace" /><button>Allow new runs</button></form>
	<p>{state.workspace_halted ? 'Workspace halted; new runs are blocked.' : 'Workspace accepts new runs.'}</p>
	<p>Stopping pauses future automatic work and asks each supervisor to stop. An unreachable supervisor means its process may still be running.</p>
	<section class="card">
		<h2>Create a session</h2>
		<form method="post" action="/collaboration/action">
			<input type="hidden" name="action" value="create" /><label>Session ID <input name="id" required maxlength={80} /></label><label>Title <input name="title" required maxlength={160} /></label><button class="btn"
				>Create session</button
			>
		</form>
	</section>
	<section class="card">
		<h2>Bind a Codex thread</h2>
		<p>Enter an existing thread UUID accessible to the workspace machine. The binding is permanent; it does not itself verify access.</p>
		<form method="post" action="/collaboration/action">
			<input type="hidden" name="action" value="bind_codex" /><label>Session ID <input name="id" required /></label><label>Thread UUID <input name="thread_id" required /></label><button class="btn">Bind thread</button>
		</form>
	</section>
	<section class="card">
		<h2>Sessions</h2>
		{#if state.sessions.length}
			<ul>
				{#each state.sessions as s}
					<li>
						<strong>{s.title}</strong> · {s.id} · {s.status}
						<form method="post" action="/collaboration/action">
							<input type="hidden" name="id" value={s.id} /><input type="hidden" name="action" value="queue_control" /><button name="enabled" value="true">Enable automatic dispatch</button><button name="enabled" value="false"
								>Pause dispatch</button
							>
						</form>
						<form method="post" action="/collaboration/action"><input type="hidden" name="id" value={s.id} /><input type="hidden" name="action" value="halt_queue" /><button>Pause and stop active run</button></form>
					</li>
				{/each}
			</ul>
		{:else}
			<p>No sessions yet.</p>
		{/if}
	</section>
	<section class="card">
		<h2>Queue an instruction</h2>
		<form method="post" action="/collaboration/action">
			<input type="hidden" name="action" value="queue_task" /><input type="hidden" name="source_id" value={data.sourceId} />
			<label
				>Session <select name="id" required>
					{#each state.sessions.filter((s) => s.status === 'active') as s}<option value={s.id}>{s.title} · {s.id}</option>{/each}
				</select></label
			>
			<label>Instruction <textarea name="instruction" required maxlength={4096}></textarea></label><button class="btn">Queue instruction</button>
		</form>
	</section>
	<section class="card">
		<h2>Tasks</h2>
		{#if state.tasks.length}
			<ul>
				{#each state.tasks as t}
					<li>
						<strong>#{t.id}</strong> · {t.session_id} · {t.author} · {t.status}{t.run_status ? ` / ${t.run_status}` : ''}
						<p>{t.instruction}</p>
						{#if t.status === 'queued'}
							<form method="post" action="/collaboration/action">
								<input type="hidden" name="task_id" value={String(t.id)} /><button name="action" value="dispatch_task">Dispatch now</button><button name="action" value="cancel_task">Cancel</button>
							</form>
						{/if}
					</li>
				{/each}
			</ul>
		{:else}
			<p>No tasks queued.</p>
		{/if}
	</section>
	<section class="card">
		<h2>Runs</h2>
		{#if state.runs.length}
			<ul>
				{#each state.runs as r}
					<li>{r.session_id} · {r.id} · {r.status} · supervisor {r.supervisor} · <a href="/collaboration/output/{r.id}">View output</a></li>
				{/each}
			</ul>
		{:else}
			<p>No runs yet.</p>
		{/if}
	</section>
{/if}
