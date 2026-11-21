<script lang="ts">
	import { page } from '$app/state';
</script>

<p>{page.status === 404 ? 'Not found' : page.error?.message}</p>
