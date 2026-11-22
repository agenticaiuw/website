<script lang="ts">
	import { backdropClose, opensDialog, peopleList } from '$lib/actions.js';
	import { isExec } from '$lib/perm';
	import type { Viewer } from '$lib/types';
	import { netIds } from '$lib/ui';
	import type { TeamPageData } from '$lib/server/team-page';
	import BoardTaskForm from './BoardTaskForm.svelte';
	import Contacts from './Contacts.svelte';
	import Field from './Field.svelte';
	import Kanban from './Kanban.svelte';
	import Markdown from './Markdown.svelte';
	import MeetingList from './MeetingList.svelte';
	import PageHead from './PageHead.svelte';
	import PersonName from './PersonName.svelte';
	import RosterPanel from './RosterPanel.svelte';
	import SubteamAddMember from './SubteamAddMember.svelte';
	import SubteamCards from './SubteamCards.svelte';
	import TeamLibrary from './TeamLibrary.svelte';

	/** A team's page, or one subteam's view of it (`data.selected`). */
	let { data }: { data: TeamPageData & { viewer: Viewer } } = $props();
	const v = $derived(data.viewer);
	const team = $derived(data.team);
	const selected = $derived(data.selected);
	const execs = $derived(data.members.filter((member) => member.role === 'exec'));
	const netId = $derived(netIds(data.members));
	const onSubteam = (subteamId: number) => data.members.filter((m) => data.subRoster.some((r) => r.subteam_id === subteamId && r.member_id === m.id));
	const inSubteam = (subteamId: number, memberId: number) => data.subRoster.some((r) => r.subteam_id === subteamId && r.member_id === memberId);
	const pencil = 'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z';
</script>

{#snippet heading()}
	<span class="team-title"
		>{selected?.name ?? team.name}
		{#if !selected && data.editable}<button
				type="button"
				class="icon-btn team-settings-button"
				aria-label="Edit team page"
				title="Edit team page"
				aria-haspopup="dialog"
				aria-controls="team-settings"
				data-members-dialog="team-settings"
				use:opensDialog={'team-settings'}
				><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={pencil} /></svg></button
			>{/if}</span
	>
{/snippet}

<PageHead eyebrow={selected ? team.name : 'Teams'} title={heading} sub={team.archived || selected?.archived ? 'Archived' : undefined}>
	{#snippet actions()}
		{#if !selected && data.manager && !team.archived}<a class="btn" href="/meetings/new">New meeting</a>{/if}
		{#if data.canCreate}<button type="button" class="btn primary" aria-haspopup="dialog" aria-controls="new-team-task" data-members-dialog="new-team-task" use:opensDialog={'new-team-task'}>New task</button>{/if}
	{/snippet}
</PageHead>
{#if data.canCreate}
	<dialog id="new-team-task" class="members-dialog" aria-labelledby="new-team-task-title" use:backdropClose>
		<div class="members-dialog-content stack">
			<header>
				<h2 id="new-team-task-title">New team task</h2>
				<form method="dialog"><button class="btn small">Close</button></form>
			</header>
			<BoardTaskForm
				action="{data.root}/board"
				due={data.due}
				members={data.manager ? data.members : undefined}
				returnToBoard
				returnPath={data.back}
				subteams={data.manager ? data.subteams.filter((s) => !s.archived) : undefined}
				assignedPeople={data.assignedPeople}
				assignedSubteams={data.assignedSubteams}
			/>
		</div>
	</dialog>
{/if}
<div class="stack">
	{#if selected}<p><a href={data.root}>← {team.name}</a></p>{/if}
	{#if !selected}
		<div class="team-overview">
			<Markdown text={team.description} empty="No team description yet." />
			<RosterPanel id="team-{team.id}-members" name={team.name} members={data.members} grantPath={isExec(v) ? `${data.root}/page-admins` : undefined} team={isExec(v) ? team : undefined} />
		</div>
		{#if data.resources.length > 0}
			<nav class="team-resource-links" aria-label="Team links">
				{#each data.resources as [label, url]}
					<a href={url} target="_blank" rel="noopener noreferrer" aria-label="{label} (opens in a new tab)" title={label}>
						{#if label === 'Discord'}
							<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"
								><path
									d="M19.7 5.3A18 18 0 0 0 15.3 4l-.5 1a16.5 16.5 0 0 0-5.6 0l-.5-1a18 18 0 0 0-4.4 1.3C1.5 9.5.8 13.6 1.2 17.6a18 18 0 0 0 5.4 2.7l1.2-1.9-1.8-.9.4-.3a12.8 12.8 0 0 0 11.2 0l.4.3-1.8.9 1.2 1.9a18 18 0 0 0 5.4-2.7c.5-4.6-.8-8.7-3.1-12.3ZM8.5 15.2c-1.1 0-2-1-2-2.2s.9-2.2 2-2.2 2 1 2 2.2-.9 2.2-2 2.2Zm7 0c-1.1 0-2-1-2-2.2s.9-2.2 2-2.2 2 1 2 2.2-.9 2.2-2 2.2Z"
								/></svg
							>
						{:else if label === 'Drive'}
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"
								><path d="M8.5 3h7l7 12-3.5 6h-14L1.5 15 8.5 3Z" /><path d="m8.5 3 7 12m-11 6 7-12m-10 6h21" /></svg
							>
						{:else}
							<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"
								><path
									d="M12 .8a11.2 11.2 0 0 0-3.54 21.83c.56.1.77-.24.77-.54v-2.15c-3.14.68-3.8-1.33-3.8-1.33-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 1.71 2.62 1.22 3.26.93.1-.72.39-1.22.7-1.5-2.51-.29-5.15-1.26-5.15-5.58 0-1.23.44-2.24 1.15-3.03-.12-.28-.5-1.43.11-2.98 0 0 .94-.3 3.08 1.16a10.7 10.7 0 0 1 5.6 0c2.14-1.46 3.08-1.16 3.08-1.16.61 1.55.23 2.7.11 2.98.71.79 1.15 1.8 1.15 3.03 0 4.33-2.65 5.29-5.17 5.57.4.35.76 1.03.76 2.08v3.16c0 .3.2.65.77.54A11.2 11.2 0 0 0 12 .8Z"
								/></svg
							>
						{/if}
					</a>
				{/each}
			</nav>
		{/if}
		<p class="team-exec">
			{#if execs.length}{execs.length === 1 ? 'Exec' : 'Execs'} · {#each execs as member, index}{#if index > 0}{', '}{/if}<a href="/people/{member.id}">{member.name}</a>{/each}{#if team.cal_url}{' · '}<a
						href={team.cal_url}
						target="_blank"
						rel="noopener noreferrer">Book on Cal.com ↗</a
					>{/if}{:else}No exec assigned{/if}
		</p>
		{#if data.editable}
			<dialog id="team-settings" class="members-dialog" aria-labelledby="team-settings-title" use:backdropClose>
				<div class="members-dialog-content stack">
					<header>
						<h2 id="team-settings-title">Team settings</h2>
						<form method="dialog"><button class="btn small">Close</button></form>
					</header>
					<form class="form-grid" method="post" action="{data.root}/profile">
						<Field label="What the team is working on" wide><textarea name="description" rows={3} maxlength={5000} value={team.description}></textarea></Field>
						<Field label="Discord"><input type="url" name="discord" value={team.discord_url} maxlength={2048} /></Field>
						<Field label="Drive"><input type="url" name="drive" value={team.drive_url} maxlength={2048} /></Field>
						<Field label="GitHub"><input type="url" name="github" value={team.github_url} maxlength={2048} /></Field>
						<Field label="Exec Cal.com link"><input type="url" name="cal" value={team.cal_url} maxlength={2048} placeholder="https://cal.com/…" /></Field>
						<div class="wide"><button class="btn small primary">Save team page</button></div>
					</form>
				</div>
			</dialog>
		{/if}
		<SubteamCards root={data.root} subteams={data.subteams} members={data.members} subRoster={data.subRoster} editable={data.editable} />
	{/if}
	<div class="task-board-heading"><h2 class="section-title">Task board</h2></div>
	{#if selected}
		<section class="stack">
			<div class="subteam-heading">
				<div>
					<h2 class="section-title">
						{selected.name}{#if data.editable}<button
								type="button"
								class="icon-btn team-settings-button"
								aria-label="Edit subteam"
								title="Edit subteam"
								aria-haspopup="dialog"
								aria-controls="subteam-settings-{selected.id}"
								data-members-dialog="subteam-settings-{selected.id}"
								use:opensDialog={`subteam-settings-${selected.id}`}
								><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={pencil} /></svg></button
							>{/if}
					</h2>
					{#if selected.description}<Markdown text={selected.description} />{/if}
				</div>
				<div class="subteam-member-actions">
					<RosterPanel id="subteam-{selected.id}-members" name={selected.name} members={onSubteam(selected.id)} />
					{#if data.editable && !selected.archived}<SubteamAddMember root={data.root} subteam={selected} members={data.members} subRoster={data.subRoster} origin="subteam" />{/if}
				</div>
			</div>
			{#if data.editable}
				<dialog id="subteam-settings-{selected.id}" class="members-dialog" aria-labelledby="subteam-settings-title-{selected.id}" use:backdropClose>
					<div class="members-dialog-content stack">
						<header>
							<h2 id="subteam-settings-title-{selected.id}">Edit subteam</h2>
							<form method="dialog"><button class="btn small">Close</button></form>
						</header>
						<form method="post" action="{data.root}/subteams/{selected.id}" class="stack">
							<Field label="Name"><input name="name" required maxlength={100} value={selected.name} /></Field>
							<Field label="What the subteam is working on"><textarea name="description" maxlength={5000} rows={3} value={selected.description}></textarea></Field>
							<label class="check"><input type="checkbox" name="archived" value="1" checked={!!selected.archived} /> Archived</label>
							<fieldset>
								<legend>Subteam members</legend>
								<div class="selection-grid" data-pick-people use:peopleList>
									{#each data.members as m}
										<label class="check"><input type="checkbox" name="member" value={m.id} checked={inSubteam(selected.id, m.id)} /> <PersonName p={m} {netId} /></label>
									{/each}
								</div>
							</fieldset>
							<div><button class="btn small primary">Save subteam</button></div>
						</form>
					</div>
				</dialog>
			{/if}
		</section>
	{/if}
	<Kanban tasks={data.tasks} legacy={data.legacy} viewer={v} today={data.today} back={data.back} canCreate={data.canCreate} />
	{#if data.contacts}<Contacts data={data.contacts} root={data.root} />{/if}
	{#if !selected}
		<div class="grid-2">
			<section>
				<h2 class="section-title">Upcoming meetings</h2>
				<MeetingList meetings={data.upcoming} today={data.today} />
			</section>
			{#if data.recent.length > 0}
				<section>
					<h2 class="section-title">Recent meetings</h2>
					<MeetingList meetings={data.recent} today={data.today} />
				</section>
			{/if}
		</div>
		<TeamLibrary items={data.library} root={data.root} subteams={data.selectedIds} filters={data.libraryFilters} />
	{/if}
</div>
