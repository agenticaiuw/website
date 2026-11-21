<script lang="ts">
	import { backdropClose, opensDialog } from '$lib/actions.js';
	import type { Team, TeamMemberRow } from '$lib/types';
	import Choice from './Choice.svelte';
	import Empty from './Empty.svelte';
	import Field from './Field.svelte';
	import MemberOptions from './MemberOptions.svelte';
	import MemberSelect from './MemberSelect.svelte';
	import MembersDialog from './MembersDialog.svelte';
	import MemberTags from './MemberTags.svelte';
	import Menu from './Menu.svelte';
	import NewPersonForm from './NewPersonForm.svelte';

	type TeamInfo = Pick<Team, 'id' | 'name' | 'kind' | 'archived'>;
	/** A team on the Teams page: who runs it, its people (in a dialog), and for execs its settings and adding people. */
	let {
		team: t,
		links,
		people,
		teamList,
		editable,
		open = undefined
	}: { team: TeamInfo; links: TeamMemberRow[]; people: { id: number; name: string; email: string }[]; teamList: TeamInfo[]; editable: boolean; open?: number } = $props();
	const members = $derived(links.filter((l) => l.team_id === t.id));
	const execs = $derived(members.filter((m) => m.role === 'exec'));
	const leads = $derived(members.filter((m) => m.is_lead && m.role !== 'exec'));
	const others = $derived(people.filter((p) => !members.some((m) => m.member_id === p.id)));
	const targets = $derived(teamList.filter((x) => x.id !== t.id && !x.archived && x.kind === t.kind));
</script>

{#snippet names(list: TeamMemberRow[])}{#each list as m, i}{#if i > 0}{', '}{/if}<a href="/people/{m.member_id}">{m.name}</a>{/each}{/snippet}

<section class="card team{t.archived ? ' inactive' : ''}" id="team-{t.id}">
	<header class="team-head">
		<div>
			<h2><a class="team-card-link" href="/teams/{t.id}">{t.name}</a></h2>
			<p>
				{#if execs.length}{execs.length === 1 ? 'Exec' : 'Execs'} · {@render names(execs)}{:else}No exec assigned{/if}
				{#if leads.length > 0}{' · '}{leads.length === 1 ? 'Lead' : 'Leads'} · {@render names(leads)}{/if}
			</p>
			<p>
				{members.length} {members.length === 1 ? 'person' : 'people'}{#if open !== undefined}{` · ${open} open ${open === 1 ? 'task' : 'tasks'}`}{/if}{#if t.kind === 'exec'}{' · Execs only'}{/if}
			</p>
		</div>
	</header>
	<div class="team-actions">
		<MembersDialog id="team-{t.id}-members" name={t.name} count={members.length}>
			{#if members.length}
				<ul class="team-members">
					{#each members as m}
						<li>
							<a href="/people/{m.member_id}">{m.name}</a>
							<MemberTags {m} />
							{#if editable}<MemberOptions team={t} {m} />{/if}
						</li>
					{/each}
				</ul>
			{:else}
				<Empty>No members yet.</Empty>
			{/if}
			{#if editable}
				<Menu label="{t.name} settings" form>
					<form method="post" action="/teams/{t.id}" class="stack">
						<Field label="Name"><input name="name" value={t.name} required maxlength={100} /></Field>
						<Choice
							name="kind"
							label="Who sees its meetings and tasks"
							selected={t.kind}
							options={[
								['project', 'Its members'],
								['exec', 'Execs only']
							]}
						/>
						<label class="check"><input type="checkbox" name="archived" value="1" checked={!!t.archived} /> Archived</label>
						<div><button class="btn primary small">Save</button></div>
					</form>
					{#if targets.length > 0}
						<form
							method="post"
							action="/teams/{t.id}/merge"
							class="stack"
							data-confirm="Combine {t.name} into the team you picked? Its people, open tasks and upcoming meetings move over, and {t.name} is archived."
						>
							<Field label="Combine into" hint="Moves its people, open tasks and upcoming meetings, then archives it.">
								<select name="into" required>
									<option value="">Pick a team…</option>
									{#each targets as x}<option value={String(x.id)}>{x.name}</option>{/each}
								</select>
							</Field>
							<div><button class="btn small">Combine</button></div>
						</form>
					{/if}
				</Menu>
			{/if}
		</MembersDialog>
		{#if editable}
			<button
				type="button"
				class="icon-btn team-add-button"
				aria-label="Add someone to {t.name}"
				title="Add someone to {t.name}"
				aria-haspopup="dialog"
				aria-controls="team-{t.id}-add"
				data-members-dialog="team-{t.id}-add"
				use:opensDialog={`team-${t.id}-add`}><span aria-hidden="true">+</span></button
			>
		{/if}
	</div>
	{#if editable}
		<dialog id="team-{t.id}-add" class="members-dialog" aria-labelledby="team-{t.id}-add-title" use:backdropClose>
			<div class="members-dialog-content stack">
				<header>
					<h2 id="team-{t.id}-add-title">Add someone to {t.name}</h2>
					<form method="dialog"><button class="btn small">Close</button></form>
				</header>
				{#if others.length > 0}
					<form method="post" action="/teams/{t.id}/members" class="team-add">
						<MemberSelect name="member" members={others} blank="Type a name" required label="Add someone to {t.name}" />
						<button class="btn small primary">Add</button>
					</form>
				{:else}
					<Empty>Everyone on the roster is already on this team.</Empty>
				{/if}
				<NewPersonForm action="/teams/{t.id}/members" heading="Not on the roster yet" />
			</div>
		</dialog>
	{/if}
</section>
