<script lang="ts">
	import { meetingTimes, reasonBox } from '$lib/actions.js';
	import { addDays, isTime } from '$lib/dates';
	import { meetingTeams } from '$lib/meeting-teams';
	import { MAX_REPEATS, REPEATS } from '$lib/meetings';
	import { isExec } from '$lib/perm';
	import type { MeetingKind, MeetingRow, Viewer } from '$lib/types';
	import Choice from './Choice.svelte';
	import Field from './Field.svelte';
	import MemberSelect from './MemberSelect.svelte';
	import PeoplePicker from './PeoplePicker.svelte';

	type Person = { id: number; name: string; email: string };
	let {
		v,
		teamList,
		people,
		picked,
		teamsOf,
		m = undefined,
		kind,
		action,
		today,
		later = 0,
		every = 7,
		last = undefined
	}: {
		v: Viewer;
		teamList: { id: number; name: string }[];
		people: Person[];
		picked: Set<number>;
		teamsOf: Map<number, number[]>;
		m?: MeetingRow;
		kind: MeetingKind;
		action: string;
		today: string;
		later?: number;
		every?: number;
		last?: string;
	} = $props();

	const until = $derived(last ?? addDays(m?.date ?? today, 63));
	const club = $derived((m?.kind ?? kind) === 'event');
	const pickedTeams = $derived(new Set(club ? [] : m ? meetingTeams(m).map((t) => t.id) : [teamList[0]?.id]));
</script>

<!-- A plain time box: any time, to the minute. -->
{#snippet timeBox(name: string, value: string, label: string)}
	<input type="time" {name} aria-label={label} value={isTime(value) ? value : ''} />
{/snippet}

<form method="post" {action} class="card form-grid" use:meetingTimes>
	<PeoplePicker
		label="Who’s it for"
		hint="Tick the teams it’s for. Everyone on them sees it, is on its attendance and gets the reminder, including people who join the team later. Untick anyone who doesn’t need to come. Pick more than one team for a joint meeting. Whole club makes it a club event open to everyone."
		teams={teamList}
		{club}
		{pickedTeams}
		{people}
		{picked}
		{teamsOf}
		personName="person"
	/>
	<Field label="Title" wide>
		<input name="title" required maxlength={200} value={m?.title ?? ''} placeholder={kind === 'event' ? 'e.g. General meeting' : 'e.g. Weekly standup'} />
	</Field>
	<div class="field">
		<span class="label">Hosts</span>
		<MemberSelect name="host" members={people} selected={m ? m.host_id : v.id} blank="No host yet" label="Host" />
		<MemberSelect name="cohost" members={people} selected={m?.cohost_id ?? null} blank="No second host" label="Second host" />
		<span class="hint">Who’s responsible for running it. They’re emailed when they’re set.</span>
	</div>
	<Field label="Date">
		<input type="date" name="date" required value={m?.date ?? today} />
	</Field>
	<div class="field">
		<span class="label">Time</span>
		<div class="time-range">
			{@render timeBox('time', m?.time ?? '', 'Starts')}
			<span>to</span>
			{@render timeBox('end_time', m?.end_time ?? '', 'Ends')}
		</div>
		<span class="hint">Optional</span>
	</div>
	{#if later > 0}
		<Choice
			name="series"
			label="Change"
			selected="1"
			options={[
				['1', `This and the ${later} later ${later === 1 ? 'one' : 'ones'}`],
				['0', 'Only this one']
			]}
			hint="Later ones move with this one and take its time, place, title and people. Their agendas and notes stay."
		/>
	{/if}
	<Choice name="repeat" label="Repeats" selected={later > 0 ? String(every) : '0'} options={later > 0 ? REPEATS.slice(1) : REPEATS} />
	<label class="field until">
		<span class="label">Until</span>
		<input type="date" name="until" value={until} />
		<input type="hidden" name="until_was" value={until} />
		<span class="hint">Up to {MAX_REPEATS} dates. Each one gets its own page for notes and attendance.</span>
	</label>
	<Field label="Location" hint="Room, Discord channel or Zoom link">
		<input name="location" maxlength={200} value={m?.location ?? ''} />
	</Field>
	<Field label="Meeting doc" hint="Optional link to the Google Doc">
		<input type="url" name="doc_url" maxlength={500} value={m?.doc_url ?? ''} placeholder="https://docs.google.com/…" />
	</Field>
	<Field label="Agenda" hint="Markdown works: - bullets, **bold**, links." wide>
		<textarea name="agenda" rows={6} value={m?.agenda ?? ''}></textarea>
	</Field>
	<Field label="Notes: what was discussed and decided" hint="Add action items on the meeting page so they become tracked tasks." wide>
		<textarea name="notes" rows={m ? 12 : 4} value={m?.notes ?? ''}></textarea>
	</Field>
	<div class="field wide">
		<label class="check">
			<input type="checkbox" name="notify" value="1" checked />
			{m ? 'Email people about the change' : 'Email everyone about it now'}
		</label>
		<span class="hint">
			{m
				? 'Everyone on it hears about a new date, time, place or series; otherwise just anyone you added. Nothing is sent for agenda or notes edits.'
				: 'One email to everyone ticked above (the whole club for a club event). The usual reminder still goes out before it.'}
		</span>
	</div>
	{#if m && m.date >= today}
		<!-- Hidden until it's needed: on Cancel or a new date or time. -->
		<label class="field wide" data-reason hidden use:reasonBox>
			<span class="label">Reason</span>
			<input name="reason" maxlength={300} placeholder="e.g. Room’s booked, so we’re meeting Monday instead" />
			<span class="hint">It goes in the email to everyone.</span>
		</label>
	{/if}
	<div class="form-actions wide">
		<button class="btn primary">{m ? 'Save' : 'Create'}</button>
		<a class="btn ghost" href={m ? `/meetings/${m.id}` : '/meetings'}>Back</a>
		{#if m && (isExec(v) || m.created_by === v.id)}
			<span class="spacer"></span>
			{#if later > 0}
				<button
					class="btn danger"
					formaction="/meetings/{m.id}/delete?following=1"
					formnovalidate
					data-needs="reason"
					data-confirm="Cancel this and the {later} after it? Everyone on them is emailed, and their pages and attendance are deleted. Action items stay as tasks.">Cancel this and later</button
				>
			{/if}
			{#if m.date >= today}
				<button
					class="btn danger"
					formaction="/meetings/{m.id}/delete"
					formnovalidate
					data-needs="reason"
					data-confirm="Cancel this meeting? Everyone on it is emailed, and its page and attendance are deleted. Action items stay as tasks.">Cancel meeting</button
				>
			{:else}
				<button class="btn danger" formaction="/meetings/{m.id}/delete" formnovalidate data-confirm="Delete this past meeting and its attendance? No one is emailed. Action items stay as tasks.">Delete</button>
			{/if}
		{/if}
	</div>
</form>
