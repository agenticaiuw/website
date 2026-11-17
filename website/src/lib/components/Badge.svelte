<script lang="ts">
	/* badge, the club mascot: a plush badger in a game-day scarf. The same
	   drawing as the game's character, with a cream die-cut outline so the ink
	   lines stay visible on the dark site. */
	type Prop = 'hardware' | 'cloud' | 'os' | 'browser' | 'architecture' | 'ux' | 'business';
	interface Props {
		size?: number | string;
		mood?: 'rest' | 'happy';
		wave?: boolean;
		prop?: Prop | string;
		sticker?: boolean;
		label?: string;
		class?: string;
	}
	let { size = 160, mood = 'rest', wave = false, prop: given, sticker = true, label, class: cls = '' }: Props = $props();
	/* Teams renamed since the artwork was drawn keep their old prop. */
	const SAME: Record<string, Prop> = { automation: 'os', research: 'architecture', design: 'ux' };
	const prop = $derived(given && SAME[given] ? SAME[given] : given);

	const uid = $props.id();
	const INK = '#1d1b19';
	const line = { stroke: INK, 'stroke-width': 6, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' } as const;
	const BODY = 'M100 48 C146 48 166 82 166 122 C166 162 140 184 100 184 C60 184 34 162 34 122 C34 82 54 48 100 48 Z';
	/* Props held up in the right hand raise that arm. */
	const raised = $derived(wave || prop === 'browser' || prop === 'business');
	const right = $derived(raised ? 'M156 136 L182 104' : 'M156 136 L178 158');
	const eyes = [76, 124];
	const w = $derived(typeof size === 'number' ? `${size}px` : size);
</script>

<svg
	class="badge {cls}"
	class:waving={wave}
	viewBox="-16 2 232 212"
	style:width={w}
	style:height="auto"
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
	focusable="false"
>
	<defs>
		<clipPath id="body-{uid}"><path d={BODY} /></clipPath>
	{#if sticker}
			<filter id="cut-{uid}" x="-12%" y="-12%" width="124%" height="128%" color-interpolation-filters="sRGB">
				<feMorphology in="SourceAlpha" operator="dilate" radius="7" result="grow" />
				<feFlood flood-color="#f6f1e6" />
				<feComposite in2="grow" operator="in" result="edge" />
				<feDropShadow in="edge" dx="0" dy="6" stdDeviation="6" flood-color="#000" flood-opacity=".45" result="lifted" />
				<feMerge><feMergeNode in="lifted" /><feMergeNode in="SourceGraphic" /></feMerge>
			</filter>
	{/if}
	</defs>
	<g filter={sticker ? `url(#cut-${uid})` : undefined}>
		<!-- feet -->
		<rect x="65" y="170" width="26" height="20" rx="9" fill="#aaa49c" {...line} />
		<rect x="109" y="170" width="26" height="20" rx="9" fill="#aaa49c" {...line} />
		<!-- arms -->
		<path d="M44 136 L22 158" stroke={INK} stroke-width="24" stroke-linecap="round" />
		<path d="M44 136 L22 158" stroke="#aaa49c" stroke-width="12" stroke-linecap="round" />
		<g class="arm-r">
			<path d={right} stroke={INK} stroke-width="24" stroke-linecap="round" />
			<path d={right} stroke="#aaa49c" stroke-width="12" stroke-linecap="round" />
		</g>
		<!-- ears -->
		<circle cx="56" cy="64" r="17" fill="#8e8880" {...line} />
		<circle cx="144" cy="64" r="17" fill="#8e8880" {...line} />
		<!-- body, stripe, outline -->
		<path d={BODY} fill="#aaa49c" />
		<path d="M86 40 Q100 36 114 40 L109 90 Q100 99 91 90 Z" fill="#f6f1e6" clip-path="url(#body-{uid})" />
		<path d={BODY} fill="none" {...line} />
		<!-- scarf -->
		<path d="M118 160 L126 192 L142 188 L134 156 Z" fill="#c5050c" {...line} />
		<path d="M42 150 Q100 176 158 150" fill="none" stroke={INK} stroke-width="28" stroke-linecap="round" />
		<path d="M42 150 Q100 176 158 150" fill="none" stroke="#c5050c" stroke-width="16" stroke-linecap="round" />
		<!-- cheeks -->
		<ellipse cx="62" cy="121" rx="9" ry="5.5" fill="#f2a19b" opacity=".85" />
		<ellipse cx="138" cy="121" rx="9" ry="5.5" fill="#f2a19b" opacity=".85" />
		<!-- face -->
		{#if mood === 'happy'}
			{#each eyes as x (x)}
				<path d="M{x - 7} 110 Q{x} 99 {x + 7} 110" fill="none" stroke={INK} stroke-width="5" stroke-linecap="round" />
			{/each}
			<path d="M90 128 Q100 144 110 128 Z" fill={INK} stroke={INK} stroke-width="4" stroke-linejoin="round" />
			<ellipse cx="100" cy="133.5" rx="4.5" ry="2.5" fill="#ef7f86" />
		{:else}
			{#each eyes as x (x)}
				<ellipse cx={x} cy="108" rx="5.5" ry="7" fill={INK} />
				<circle cx={x + 1.8} cy="105.4" r="1.8" fill="#fff" />
			{/each}
			<path d="M94 130 Q100 136 106 130" fill="none" stroke={INK} stroke-width="4.5" stroke-linecap="round" />
		{/if}
		<ellipse cx="100" cy="121" rx="7.5" ry="5.5" fill={INK} />

		<!-- team props -->
		{#if prop === 'hardware'}
			<path d="M64 62 Q64 26 100 24 Q136 26 136 62 Z" fill="#f0b43a" {...line} />
			<path d="M100 25 V46" stroke={INK} stroke-width="5" stroke-linecap="round" />
			<rect x="48" y="58" width="104" height="13" rx="6.5" fill="#f0b43a" {...line} />
		{:else if prop === 'architecture'}
			<path d="M180 152 L192 130" stroke={INK} stroke-width="11" stroke-linecap="round" />
			<path d="M180 152 L192 130" stroke="#8e6a4a" stroke-width="5" stroke-linecap="round" />
			<circle cx="198" cy="114" r="17" fill="#cfe3f7" fill-opacity=".9" {...line} />
			<path d="M190 108 Q194 102 200 102" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" />
		{:else if prop === 'cloud'}
			<path d="M150 46 Q148 30 164 28 Q170 14 186 20 Q202 18 202 34 Q214 38 208 50 Q206 56 196 56 L160 56 Q148 56 150 46 Z" fill="#cfe3f7" {...line} />
		{:else if prop === 'os'}
			<path d="M156 182 L212 182 L204 172 L164 172 Z" fill="#8e8880" {...line} />
			<rect x="164" y="136" width="40" height="36" rx="6" fill="#5f97d6" {...line} />
			<path d="M174 150 L180 155 L174 160 M184 161 H193" fill="none" stroke="#f6f1e6" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
		{:else if prop === 'browser'}
			<rect x="164" y="64" width="50" height="42" rx="8" fill="#f6f1e6" {...line} />
			<path d="M164 78 H214" stroke={INK} stroke-width="5" />
			<circle cx="173" cy="71" r="2.4" fill="#c5050c" /><circle cx="181" cy="71" r="2.4" fill="#f0b43a" /><circle cx="189" cy="71" r="2.4" fill="#6fbf7b" />
			<path d="M173 88 H204 M173 96 H195" stroke="#aaa49c" stroke-width="4" stroke-linecap="round" />
		{:else if prop === 'ux'}
			<g transform="rotate(32 186 128)">
				<rect x="179" y="92" width="14" height="58" rx="3" fill="#f0b43a" {...line} />
				<path d="M179 150 L186 166 L193 150 Z" fill="#f2d6b0" {...line} />
				<rect x="179" y="86" width="14" height="10" rx="3" fill="#ef7f86" {...line} />
			</g>
		{:else if prop === 'business'}
			<rect x="162" y="62" width="50" height="44" rx="8" fill="#f6f1e6" {...line} />
			<path d="M174 96 V86 M186 96 V78 M198 96 V70" stroke="#6fbf7b" stroke-width="7" stroke-linecap="round" />
		{/if}
	</g>
</svg>

<style>
	.badge { display: block; overflow: visible; flex-shrink: 0; }
	.arm-r { transform-box: view-box; transform-origin: 156px 136px; }
	.waving .arm-r { animation: wave 2.6s ease-in-out infinite; }
	@keyframes wave {
		0%, 55%, 100% { transform: rotate(0); }
		62% { transform: rotate(-14deg); }
		70% { transform: rotate(8deg); }
		78% { transform: rotate(-12deg); }
		86% { transform: rotate(4deg); }
	}
	@media (prefers-reduced-motion: reduce) {
		.waving .arm-r { animation: none; }
	}
</style>
