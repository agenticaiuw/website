<script lang="ts">
	let { value, label, tone = '' }: { value: string | number; label: string; tone?: string } = $props();
</script>

<div class="stat{tone ? ' ' + tone : ''}">
	<span class="stat-value">{value}</span>
	<span class="stat-label">{label}</span>
</div>
