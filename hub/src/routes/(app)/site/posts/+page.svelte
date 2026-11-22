<script lang="ts">
	import { backdropClose, opensDialog } from '$lib/actions.js';
	import Empty from '$lib/components/Empty.svelte';
	import PageHead from '$lib/components/PageHead.svelte';
	import PostButton from '$lib/components/PostButton.svelte';
	import SocialPostFields from '$lib/components/SocialPostFields.svelte';
	import Tabs from '$lib/components/Tabs.svelte';
	import { formatDate, formatTime } from '$lib/dates';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	type Post = PageData['posts'][number];
	const planned = $derived(data.posts.filter((p) => p.status === 'planned'));
	const posted = $derived(data.posts.filter((p) => p.status === 'posted').reverse());
	/** Posts grouped by day, in order. */
	const byDay = (posts: Post[]) => {
		const days: [string, Post[]][] = [];
		for (const p of posts) {
			const last = days.at(-1);
			if (last?.[0] === p.post_date) last[1].push(p);
			else days.push([p.post_date, [p]]);
		}
		return days;
	};
</script>

<PageHead title="Social posts" sub="When each post goes out, where, and who posts it.">
	{#snippet actions()}
		<button type="button" class="btn primary" aria-haspopup="dialog" aria-controls="new-post" use:opensDialog={'new-post'}>New post</button>
	{/snippet}
</PageHead>
<Tabs label="Website or social posts" options={[['site', 'Website'], ['posts', 'Social posts']]} current="posts" href={(v) => (v === 'site' ? '/site' : '/site/posts')} />
<dialog id="new-post" class="members-dialog" aria-labelledby="new-post-title" use:backdropClose>
	<div class="members-dialog-content stack">
		<header>
			<h2 id="new-post-title">New post</h2>
			<form method="dialog"><button class="btn small">Close</button></form>
		</header>
		<form method="post" action="?/add" class="stack">
			<SocialPostFields platforms={data.platforms} members={data.members} today={data.today} />
			<div><button class="btn primary">Add</button></div>
		</form>
	</div>
</dialog>

{#snippet timeline(posts: Post[])}
	<ol class="post-days">
		{#each byDay(posts) as [day, list] (day)}
			<li>
				<h3 class="post-day" class:bad={list[0].status === 'planned' && day < data.today}>{formatDate(day, data.today)}</h3>
				<ul class="post-list">
					{#each list as p (p.id)}
						<li class="card post">
							<div class="post-meta">
								<b>{p.platform}</b>{p.post_time ? ` · ${formatTime(p.post_time)}` : ''}{p.owner ? ` · ${p.owner}` : ''}
								{#if p.link}{' · '}<a href={p.link} target="_blank" rel="noopener noreferrer">View ↗</a>{/if}
							</div>
							<p class="post-body">{p.body}</p>
							<div class="post-actions">
								<PostButton action="?/status" name="id" value={p.id} cls="btn small{p.status === 'planned' ? ' primary' : ''}" label={p.status === 'planned' ? 'Mark posted' : 'Mark planned'} />
								<button type="button" class="btn small" aria-haspopup="dialog" aria-controls="post-{p.id}" use:opensDialog={`post-${p.id}`}>Edit</button>
								<PostButton action="?/delete" name="id" value={p.id} cls="btn small danger" label="Delete" confirm="Delete this post? This can't be undone." />
							</div>
							<dialog id="post-{p.id}" class="members-dialog" aria-labelledby="post-{p.id}-title" use:backdropClose>
								<div class="members-dialog-content stack">
									<header>
										<h2 id="post-{p.id}-title">Edit post</h2>
										<form method="dialog"><button class="btn small">Close</button></form>
									</header>
									<form method="post" action="?/save" class="stack">
										<input type="hidden" name="id" value={p.id} />
										<SocialPostFields platforms={data.platforms} members={data.members} today={data.today} post={p} />
										<div><button class="btn primary">Save</button></div>
									</form>
								</div>
							</dialog>
						</li>
					{/each}
				</ul>
			</li>
		{/each}
	</ol>
{/snippet}

<div class="stack">
	{#if planned.length}{@render timeline(planned)}{:else}<Empty>Nothing yet.</Empty>{/if}
	{#if posted.length}
		<details class="card disclose">
			<summary>Posted ({posted.length})</summary>
			{@render timeline(posted)}
		</details>
	{/if}
</div>
