<script lang="ts">
	import Field from './Field.svelte';
	import MemberSelect from './MemberSelect.svelte';

	type Post = { platform: string; post_date: string; post_time: string; body: string; owner_id: number | null; link: string };
	/** The social post form's fields, empty for a new post. */
	let { platforms, members, post = undefined, today }: { platforms: string[]; members: { id: number; name: string; email: string }[]; post?: Post; today: string } = $props();
</script>

<div class="form-grid">
	<Field label="Platform"><input name="platform" required maxlength={60} list="social-platforms" value={post?.platform ?? ''} /></Field>
	<Field label="Who posts it"><MemberSelect name="owner_id" {members} selected={post?.owner_id ?? null} blank="" /></Field>
	<Field label="Date"><input type="date" name="post_date" required value={post?.post_date ?? today} /></Field>
	<Field label="Time" hint="Optional."><input type="time" name="post_time" value={post?.post_time ?? ''} /></Field>
	<Field label="Post" wide><textarea name="body" required maxlength={4000} rows={4} value={post?.body ?? ''}></textarea></Field>
	{#if post}<Field label="Link to the post" wide><input type="url" name="link" maxlength={2048} value={post.link} placeholder="https://…" /></Field>{/if}
</div>
<datalist id="social-platforms">
	{#each platforms as p (p)}<option value={p}></option>{/each}
</datalist>
