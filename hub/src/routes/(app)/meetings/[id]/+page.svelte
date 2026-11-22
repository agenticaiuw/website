<script lang="ts">
	import { onMount } from 'svelte';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { addRow, allPresent, attendanceAutosave, backdropClose, opensDialog } from '$lib/actions.js';
	import AttendanceHistory from '$lib/components/AttendanceHistory.svelte';
	import Choice from '$lib/components/Choice.svelte';
	import Empty from '$lib/components/Empty.svelte';
	import Field from '$lib/components/Field.svelte';
	import FormSection from '$lib/components/FormSection.svelte';
	import MeetingAgenda from '$lib/components/MeetingAgenda.svelte';
	import MeetingFiles from '$lib/components/MeetingFiles.svelte';
	import MeetingSummary from '$lib/components/MeetingSummary.svelte';
	import Markdown from '$lib/components/Markdown.svelte';
	import MemberSelect from '$lib/components/MemberSelect.svelte';
	import PageHead from '$lib/components/PageHead.svelte';
	import PersonName from '$lib/components/PersonName.svelte';
	import PostButton from '$lib/components/PostButton.svelte';
	import TaskList from '$lib/components/TaskList.svelte';
	import { formatDate, formatTimeRange, formatTimestamp } from '$lib/dates';
	import { meetingTeams, teamNames } from '$lib/meeting-teams';
	import { attendanceLabel, STATUSES } from '$lib/meetings';
	import { netIds } from '$lib/ui';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const v = $derived(data.viewer);
	const m = $derived(data.m);
	const today = $derived(data.today);
	const roster = $derived(data.roster);
	const marked = $derived(roster.filter((r) => r.status));
	const present = $derived(marked.filter((r) => r.status === 'present' || r.status === 'late').length);
	const joint = $derived(m.kind === 'meeting' && meetingTeams(m).length > 1);
	const netId = $derived(netIds(roster));
	const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;
	// Everyone who came should leave with a task from the meeting.
	const here = $derived(roster.filter((r) => (r.status === 'present' || r.status === 'late') && !data.actions.some((t) => t.assignee_id === r.id)).map((r) => r.name));

	// The five stages are tabs. Picking one updates the address (so a reload stays on it) without a
	// round trip; a link to something inside a tab (#files, #actions) opens that tab.
	const TABS = [
		['preparation', 'preparation-tab', 'meeting-preparation', 'Agenda'],
		['follow-up', 'follow-up-tab', 'meeting-follow-up', 'Summary'],
		['form', 'form-tab', 'meeting-form', 'Form'],
		['attendance', 'attendance-tab', 'meeting-attendance-panel', 'Attendance'],
		['library', 'library-tab', 'meeting-library-panel', 'Library']
	] as const;
	type View = (typeof TABS)[number][0];
	let view = $derived<View>(data.selectedView);
	let tabList: HTMLElement;
	function select(next: View, e?: MouseEvent) {
		if (e && (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey)) return;
		e?.preventDefault();
		view = next;
		const url = new URL(page.url);
		url.searchParams.set('view', next);
		url.hash = '';
		replaceState(url, page.state);
	}
	function key(e: KeyboardEvent, index: number) {
		const next = e.key === 'ArrowRight' ? index + 1 : e.key === 'ArrowLeft' ? index - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : null;
		if (next === null) return;
		e.preventDefault();
		const i = (next + TABS.length) % TABS.length;
		select(TABS[i][0]);
		tabList.querySelectorAll<HTMLElement>('[role="tab"]')[i]?.focus();
	}
	onMount(() => {
		const reveal = () => {
			const target = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
			const panel = target && target.closest('[role="tabpanel"]');
			const tab = panel && TABS.find((t) => t[2] === panel.id);
			if (!tab || !target) return;
			view = tab[0];
			requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
		};
		reveal();
		window.addEventListener('hashchange', reveal);
		return () => window.removeEventListener('hashchange', reveal);
	});
</script>

<PageHead
	eyebrow="{m.kind === 'event' ? 'Club event' : joint ? 'Joint meeting' : m.team_kind === 'exec' ? 'Exec meeting' : 'Project meeting'} · {teamNames(m)}"
	title={m.title}
>
	{#snippet sub()}
		{formatDate(m.date, today)}{#if m.time}{`, ${formatTimeRange(m.time, m.end_time)}`}{/if}{#if m.location}{` · ${m.location}`}{/if}{` · ${m.host_name ? `Hosted by ${m.host_name}` : 'No host yet'}`}{#if m.doc_url}{' · '}<a
				href={m.doc_url}
				target="_blank"
				rel="noopener noreferrer">Meeting doc ↗</a
			>{/if}
	{/snippet}
	{#snippet actions()}
		{#if data.editable}
			{#if m.date >= today}<PostButton
					action="/meetings/{m.id}/announce"
					label="Email everyone"
					confirm="Email everyone on it ({people(data.toRemind)}) about this meeting{data.seriesLeft ? ' and its repeats' : ''} now?"
				/>{/if}
			<a class="btn" href="/meetings/{m.id}/edit">Edit</a>
		{/if}
	{/snippet}
</PageHead>

<div data-meeting-tabs>
	<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
	<nav class="seg meeting-tabs" role="tablist" aria-label="Meeting stages" bind:this={tabList}>
		{#each TABS as [value, tabId, panel, label], i}
			<a
				id={tabId}
				role="tab"
				aria-controls={panel}
				aria-selected={view === value}
				tabindex={view === value ? 0 : -1}
				href="/meetings/{m.id}?view={value}"
				onclick={(e) => select(value, e)}
				onkeydown={(e) => key(e, i)}>{label}</a
			>
		{/each}
	</nav>
	<div id="meeting-preparation" class="meeting-tab-panel grid-2 wide-left" role="tabpanel" aria-labelledby="preparation-tab" hidden={view !== 'preparation'}>
		<section>
			<MeetingAgenda {m} viewer={v} content={data.content} zone={data.zone} ended={data.ended} />
		</section>
		<aside>
			{#if data.toRemind > 0 && (data.reminded || data.remindAhead.length > 0)}
				<p class="hint reminder-note">
					{data.remindAhead.length
						? `Reminder email${data.remindAhead.length > 1 ? 's go' : ' goes'} to ${people(data.toRemind)} on ${data.remindAhead.map((t) => formatTimestamp(new Date(t).toISOString(), data.zone)).join(' and ')}.`
						: `Reminder emailed to ${people(data.toRemind)}.`}
					<a href="/meetings/{m.id}/reminder" target="_blank">Preview</a>
				</p>
			{/if}
			<h2 class="section-title" id="updates">Written updates</h2>
			{#if data.mayUpdate}
				{@const mine = data.updates.find((u) => u.member_id === v.id)}
				<form method="post" action="/meetings/{m.id}/update" class="card stack">
					<Field label="Your update" hint="What you've actually done since last time, and your blockers.">
						<textarea name="body" rows={3} maxlength={2000} value={mine?.body ?? ''}></textarea>
					</Field>
					<div><button class="btn primary">Save update</button></div>
				</form>
			{/if}
			{#each data.updates as u (u.member_id)}
				<div class="card update">
					<p class="update-who"><a href="/people/{u.member_id}">{u.name}</a></p>
					<Markdown text={u.body} />
				</div>
			{:else}
				{#if !data.mayUpdate}<p class="hint">No updates.</p>{/if}
			{/each}
			{#if data.noUpdate.length}<p class="hint">No update yet: {data.noUpdate.join(', ')}</p>{/if}
		</aside>
	</div>
	<div id="meeting-follow-up" class="meeting-tab-panel grid-2 wide-left" role="tabpanel" aria-labelledby="follow-up-tab" hidden={view !== 'follow-up'}>
		<section>
			<MeetingSummary {m} revisions={data.summary} zone={data.zone} />
			<h2 class="section-title" id="actions">Action items</h2>
			<TaskList tasks={data.actions} {today} viewer={v} show={['assignee']} back="/meetings/{m.id}#actions" empty="No action items yet." />
			{#if data.editable}
				<form method="post" action="/meetings/{m.id}/actions" class="card action-form">
					<p class="hint">
						{joint ? `Each action item becomes a task on the person's team (${teamNames(m)})` : `Each action item becomes a ${m.team_name} task`}: the person is emailed now and reminded until it's done.
					</p>
					<div class="action-rows" data-rows>
						<div class="action-row" data-row>
							<input name="title" placeholder="What needs to happen" maxlength={200} aria-label="Action item" />
							<MemberSelect name="assignee" members={data.people} blank="Who" />
							<input type="date" name="due" value={data.defaultDue} aria-label="Due date" />
						</div>
					</div>
					<div class="form-actions">
						<button type="button" class="btn ghost" use:addRow>+ Another</button>
						<button class="btn primary">Add action items</button>
					</div>
				</form>
			{/if}
		</section>
		<aside>
			{#if data.editable && here.length}<p class="hint">Here without an action item: {here.join(', ')}</p>{/if}
		</aside>
	</div>
	<div id="meeting-attendance-panel" class="meeting-tab-panel" role="tabpanel" aria-labelledby="attendance-tab" hidden={view !== 'attendance'}>
		{#if data.canCheckIn}
			<form method="post" action="/meetings/{m.id}/check-in" class="card stack" use:attendanceAutosave>
				<strong>Your attendance</strong>
				<Choice
					name="status"
					label="Check in"
					selected={data.myStatus ?? 'present'}
					options={[
						['present', 'Here'],
						['late', 'Partial']
					]}
				/>
				<noscript><div><button class="btn small primary">Save check-in</button></div></noscript>
			</form>
		{/if}
		<h2 class="section-title attendance-heading">
			Attendance <span class="muted">{marked.length ? `${present}/${marked.length} present` : ''}</span>
			{#if data.editable && roster.length > 0}<button type="button" class="link-btn" form="meeting-attendance" use:allPresent>Mark everyone present</button>{/if}
		</h2>
		{#if data.editable}
			<form id="meeting-attendance" method="post" action="/meetings/{m.id}/attendance" class="card attendance" use:attendanceAutosave>
				{#if roster.length}
					{#each roster as r (r.id)}
						<div class="att-row" role="radiogroup" aria-label={r.name}>
							<span><PersonName p={r} {netId} /></span>
							<div class="seg">
								{#each STATUSES as [value, label]}
									<label>
										<input type="radio" name="att_{r.id}" {value} checked={r.status === value} />
										<span>{label}</span>
									</label>
								{/each}
							</div>
						</div>
					{/each}
				{:else}
					<Empty>No one is on this team yet. Add people below, or add team members on the Teams page.</Empty>
				{/if}
				<p class="hint" data-attendance-status role="status" aria-live="polite"></p>
				<noscript><button class="btn primary">Save attendance</button></noscript>
			</form>
		{:else if marked.length}
			<ul class="att-list">
				{#each marked as r (r.id)}
					<li>
						<span>{r.name}</span>
						<span class="pill att-{r.status}">{attendanceLabel(r.status!, r.self_report)}</span>
					</li>
				{/each}
			</ul>
		{:else}
			<Empty>Attendance not taken.</Empty>
		{/if}
		{#if data.editable}
			<div class="attendance-add">
				<button
					type="button"
					class="icon-btn agenda-add-button"
					aria-label="Add someone to attendance"
					title="Add someone to attendance"
					aria-haspopup="dialog"
					aria-controls="attendance-add-dialog"
					data-members-dialog="attendance-add-dialog"
					use:opensDialog={'attendance-add-dialog'}>+</button
				>
			</div>
			<dialog id="attendance-add-dialog" class="members-dialog" aria-labelledby="attendance-add-title" use:backdropClose>
				<div class="members-dialog-content stack">
					<header>
						<h2 id="attendance-add-title">Add someone</h2>
						<form method="dialog"><button class="icon-btn" aria-label="Close">×</button></form>
					</header>
					{#if data.others.length}
						<form method="post" action="/meetings/{m.id}/attendance" class="stack">
							<Field label="Person"><MemberSelect name="add" members={data.others} blank="Choose a person" required /></Field>
							<div><button class="btn primary">Add</button></div>
						</form>
					{:else}
						<p class="hint">Everyone is already listed.</p>
					{/if}
				</div>
			</dialog>
		{/if}
		<AttendanceHistory {roster} {...data.attendance} />
	</div>
	<div id="meeting-library-panel" class="meeting-tab-panel" role="tabpanel" aria-labelledby="library-tab" hidden={view !== 'library'}>
		<MeetingFiles {m} viewer={v} content={data.content} zone={data.zone} />
	</div>
	<div id="meeting-form" class="meeting-tab-panel" role="tabpanel" aria-labelledby="form-tab" hidden={view !== 'form'}>
		{#if !data.form && !data.editable}<p class="hint">No form yet.</p>{:else}<FormSection meetingId={m.id} f={data.form} editable={data.editable} appUrl={data.appUrl} />{/if}
	</div>
</div>
