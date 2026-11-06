<script lang="ts">
	import { hivemind } from '$lib/hivemind';
	import { social, stats } from '$lib/content';
	import TextColor from './ui/TextColor.svelte';
	import SignalWaves from './ui/SignalWaves.svelte';
	import TopoField from './ui/TopoField.svelte';
	let mode = $state(0);
	const scenario = $derived(hivemind.scenarios[mode]);
</script>

<div class="intro-grid">
	<div class="hero-atmosphere" aria-hidden="true"><SignalWaves /></div>
	<div class="intro" data-reveal>
		<p class="status"><span aria-hidden="true"></span>{hivemind.status}</p>
		<h1>Hivemind<span class="title-dot">.</span></h1>
		<h2>One assistant.<br /><span class="accent">From wrist to world.</span></h2>
		<p class="intro-copy">{hivemind.intro}</p>
		<p class="access-note">A physical wristband. A cloud architecture. A web application. Mobile is under consideration.</p>
		<div class="hero-actions">
			<a class="primary-link" href="/join/">Join the build <span aria-hidden="true">→</span></a>
			<a class="text-link" href="#subteams">Explore the teams <span aria-hidden="true">↓</span></a>
		</div>
		<p class="welcome-note">No prior AI experience required. You’ll have people to learn with.</p>
	</div>

	<figure class="journey" data-reveal>
		<figcaption class="journey-caption"><span class="eyebrow">Picture the possibility</span><span class="concept-label">Planned workflow</span></figcaption>
		<div class="mode-switch" role="group" aria-label="Explore ways to use Hivemind">
			{#each hivemind.scenarios as option, i}
				<button type="button" aria-pressed={mode === i} onclick={() => mode = i}>{option.label}</button>
			{/each}
		</div>
		<blockquote>{scenario.prompt}</blockquote>
		<div aria-live="polite" aria-atomic="true">
			<ol class="journey-steps">
				{#each [
					{ title: scenario.entry, detail: scenario.entryDetail },
					{ title: scenario.context, detail: scenario.contextDetail },
					{ title: scenario.action, detail: scenario.actionDetail },
					{ title: scenario.result, detail: scenario.resultDetail }
				] as step (step.title)}
					<li><span class="step-dot" aria-hidden="true"></span><div><h3>{step.title}</h3><p>{step.detail}</p></div></li>
				{/each}
			</ol>
		</div>
		<p class="diagram-note">Two ways into the same Hivemind. The software can also run without the wristband.</p>
	</figure>
</div>

<section class="build-pair" aria-label="Hardware and software, built together" data-reveal>
	<article>
		<svg class="system-icon" viewBox="0 0 64 72" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M23 22 25 4h14l2 18M23 50l2 18h14l2-18"/><rect x="17" y="21" width="30" height="30" rx="12"/><path d="M24 33v6m4-10v14m4-17v20m4-15v10m4-7v4"/><path d="M48 31h3v10h-3"/></svg>
		<div><p class="eyebrow accent">The hardware</p><h3>A wristband built for voice.</h3><p>Screenless, lightweight and ready for life away from a keyboard. The hardware work will cover electronics, sound, battery and enclosure alongside the intelligence it connects to.</p></div>
	</article>
	<article>
		<svg class="system-icon" viewBox="0 0 64 72" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="19" y="23" width="26" height="26" rx="7"/><circle cx="32" cy="36" r="5"/><path d="M32 10v13m0 26v13M7 36h12m26 0h12"/><circle cx="32" cy="7" r="3"/><circle cx="32" cy="65" r="3"/><circle cx="4" cy="36" r="3"/><circle cx="60" cy="36" r="3"/></svg>
		<div><p class="eyebrow accent">The software architecture</p><h3>Intelligence that connects the pieces.</h3><p>Cloud execution, a web application, shared context and connected agents. The architecture will be open source, so people can run it independently or build new nodes around it.</p></div>
	</article>
</section>

<section class="hermes-section" aria-labelledby="why-hivemind">
	<div class="comparison-atmosphere" aria-hidden="true"><TopoField strength={0.9} /></div>
	<div class="comparison-intro" data-reveal>
		<p class="eyebrow accent">Building on open source</p>
		<h2 id="why-hivemind">Why Hivemind<br /> if Hermes exists?</h2>
		<p class="why-thesis"><strong>Less briefing.<br />More follow through.</strong></p>
		<p class="why-intent">Our ambition is personal AI that carries the context of your day into the work you need done.</p>
		<div class="context-path" aria-label="Planned context process"><span>Context you allow</span><span aria-hidden="true">↓</span><span>Memory that stays relevant</span><span aria-hidden="true">↓</span><span>Help across your devices</span></div>
	</div>
	<div class="hermes-copy" data-reveal>
		<div class="comparison-base"><p class="eyebrow">Hermes · the agent foundation</p><h3>A capable engine to build on.</h3><p>Hermes already brings tools, skills, delegation and automatic memory. Our cloud proposal builds on that foundation.</p></div>
		<div class="comparison-goal"><p class="eyebrow accent">Hivemind · our design goal</p><h3>A connected personal AI system.</h3><p>Design the wristband, context architecture and connected agents together. Carry a request from your voice to the right tools, with the relevant memory and one place to follow the work.</p></div>
		<p class="why-answer">You can extend Hermes yourself. Hivemind’s ambition is to make these pieces work as one open source system, so you spend less time assembling context and managing handoffs.</p>
		<a class="source-link" href="https://github.com/NousResearch/hermes-agent" target="_blank" rel="noopener noreferrer">Explore the Hermes foundation <span aria-hidden="true">↗</span></a>
	</div>
	<div class="engineering-goals">
		<div class="engineering-heading" data-reveal><p class="eyebrow accent">Where we want to push further</p><p>Context, continuity and control. Our engineering goals.</p></div>
		<div class="engineering-grid">
			<article data-reveal><span class="goal-verb">Capture</span><h3>Context before the next prompt.</h3><p>Connect conversations, tasks and sources you allow. Background processing would organize useful details, so you have less to explain next time.</p></article>
			<article data-reveal><span class="goal-verb">Continue</span><h3>Pick up where the task stopped.</h3><p>Your laptop sleeps. The cloud finishes its part. When the laptop returns, Hivemind would check what actually completed before continuing, with a clear receipt for each result.</p><p class="goal-mechanism"><strong>Action receipts</strong> would record and verify each step, prevent duplicate actions where supported and flag uncertain outcomes.</p></article>
			<article data-reveal><span class="goal-verb">Control</span><h3>Useful context. On your terms.</h3><p>“Use these notes for this project until Friday.” Give context a purpose and expiry, then see which memories depend on it and where its removal is still pending.</p><p class="goal-mechanism"><strong>Context permissions</strong> would follow data into derived memories, device caches and waiting tasks within Hivemind.</p></article>
		</div>
		<p class="engineering-note">These are proposed system capabilities. Hermes already has durable task queues, and its memory providers offer provenance and deletion. Our aim is to connect those foundations across devices, with verified outcomes and enforceable context permissions.</p>
		<details class="research-details">
			<summary><span><strong>What would we add to Hermes?</strong><span>The technical distinction, with sources</span></span><span class="expand-icon" aria-hidden="true">+</span></summary>
			<div class="detail-grid">
				<article><h3>Recover actions, beyond saving a task.</h3><p>Hermes documents persistent queues, but a running delegated task becomes uncertain after a process restart. We propose a shared action protocol: record intent, check the external result after reconnection, then resume or ask for review. A receipt means evidence of the outcome, rather than an agent’s completion message.</p><p class="research-limit">First scope: cloud and laptop, with one supported file action. We cannot guarantee duplicate prevention on every website.</p><a class="source-link" href="https://hermes-agent.nousresearch.com/docs/user-guide/features/delegation/" target="_blank" rel="noopener noreferrer">Hermes delegation and recovery ↗</a></article>
				<article><h3>Withdraw permission across the system.</h3><p>Hindsight, a Hermes memory provider, already tracks sources and removes derived observations. We propose an additional permission layer that checks purpose and expiry before retrieval or action, cancels affected waiting work and collects removal acknowledgments from managed nodes.</p><p class="research-limit">The dashboard would show pending devices. This cannot erase information already exported or sent to another service.</p><a class="source-link" href="https://hindsight.vectorize.io/developer/api/documents" target="_blank" rel="noopener noreferrer">Hindsight sources and deletion ↗</a></article>
			</div>
			<p class="research-date">Research reviewed September 11, 2026. We found no documented, integrated Hermes flow covering these complete proposals. These are integration goals, not claims of exclusive inventions or demonstrated advantages.</p>
		</details>
	</div>
</section>

<section class="details-section" aria-labelledby="under-the-hood">
	<div class="detail-heading" data-reveal><div><p class="eyebrow">Go a little deeper</p><h2 id="under-the-hood">The idea, under the hood.</h2></div><p>Open what interests you.<br />Explore at your own pace.</p></div>
	<div class="disclosures" data-reveal>
		<details>
			<summary><span><strong>How the pieces fit</strong><span>Nodes, memory, tools and the dashboard</span></span><span class="expand-icon" aria-hidden="true">+</span></summary>
			<div class="detail-grid">{#each hivemind.architecture as item}<article><h3>{item.title}</h3><p class="detail-summary">{item.summary}</p><p>{item.body}</p></article>{/each}</div>
		</details>
		<details>
			<summary><span><strong>What each team will build</strong><span>Seven entry points into the same project</span></span><span class="expand-icon" aria-hidden="true">+</span></summary>
			<div class="detail-grid build-areas">{#each hivemind.buildAreas as item (item.name)}<article><h3>{item.name}</h3><p>{item.detail}</p></article>{/each}</div>
		</details>
		<details>
			<summary><span><strong>The hard parts we want to get right</strong><span>Useful memory, understandable actions and real value</span></span><span class="expand-icon" aria-hidden="true">+</span></summary>
			<div class="detail-grid priorities">{#each hivemind.priorities as item}<article><h3>{item.question}</h3><p>{item.answer}</p></article>{/each}</div>
		</details>
	</div>
	<p class="project-status">We’re at the planning stage. Implementation hasn’t started and there’s no public release yet. We’re building toward a physical wristband and an open source software architecture, with cloud execution and a web application. A mobile application is under consideration.</p>
</section>

<section class="beginner" aria-labelledby="beginner-hivemind" data-reveal>
	<div><p class="eyebrow accent">Your first AI project is welcome here</p><h2 id="beginner-hivemind"><TextColor /></h2><p><strong>No prior AI experience required.</strong> We’ll pair you with a subteam lead. Bring your questions, your perspective and a willingness to try.</p><a class="primary-link" href="/join/">Find your place <span aria-hidden="true">→</span></a></div>
	<div class="support-list">
		<div><h3>People to learn with</h3><p>Educational workshops, speaker events and a <a href={social[0].href} target="_blank" rel="noopener noreferrer">Discord community of nearly {stats.items[0].n}</a> where questions are welcome.</p></div>
		<div><h3>More than coding</h3><p>Design, product, outreach, marketing, operations and finance all have a place in the project.</p></div>
		<div><h3>Build thoughtfully with AI</h3><p>Vibe coding is welcome. Learn what the code does, test it and review it with your team.</p></div>
	</div>
</section>

<style>
	.intro-grid { position: relative; isolation: isolate; display: grid; grid-template-columns: 1.05fr 1fr; gap: clamp(2rem, 5vw, 4.5rem); align-items: center; margin-top: 2.5rem; }
	.hero-atmosphere { position: absolute; inset: -5rem -7vw -3.5rem; pointer-events: none; z-index: -1; opacity: .88; mask-image: linear-gradient(to bottom, transparent, #000 20%, #000 80%, transparent), linear-gradient(to right, transparent, #000 12%, #000 88%, transparent); mask-composite: intersect; }
	:global(:root[data-theme='light']) .hero-atmosphere { opacity: .65; }
	.intro { position: relative; isolation: isolate; }
	.intro::before { content: ''; position: absolute; inset: -1rem -2rem; z-index: -1; pointer-events: none; background: radial-gradient(ellipse at 30% 53%, color-mix(in srgb, var(--bg) 80%, transparent) 22%, transparent 72%); }
	.status { display: flex; align-items: center; gap: .5rem; font: 0.65rem/1.5 var(--font-mono); color: var(--muted); }
	.status > span { width: 6px; height: 6px; border: 1px solid var(--accent); border-radius: 100%; flex-shrink: 0; }
	h1 { font-size: clamp(3.75rem, 7.9vw, 6.3rem); line-height: 1; letter-spacing: -.065em; margin: 1.2rem 0 1.5rem; }
	.title-dot { color: var(--accent); }
	.intro h2 { font-size: clamp(1.7rem, 2.75vw, 2.3rem); line-height: 1.18; letter-spacing: -.035em; max-width: 28rem; }
	.intro-copy { color: var(--muted); margin-top: 1.3rem; font-size: 1.02rem; line-height: 1.75; max-width: 31rem; }
	.access-note { max-width: 28rem; margin-top: .9rem; color: var(--muted); font-size: .77rem; line-height: 1.75; }
	.hero-actions { display: flex; gap: 1.5rem; align-items: center; flex-wrap: wrap; margin-top: 1.8rem; }
	.primary-link { display: inline-flex; gap: 1.5rem; align-items: center; justify-content: space-between; padding: .8rem 1rem; background: var(--accent); color: var(--accent-ink); border-radius: 4px; font-size: .875rem; font-weight: 500; transition: transform .2s; }
	.primary-link:hover { transform: translateY(-2px); }
	.text-link { font-size: .85rem; display: flex; gap: .75rem; }
	.text-link:hover, .source-link:hover { text-decoration: underline; text-underline-offset: 4px; }
	.welcome-note { color: var(--muted); font-size: .77rem; margin-top: 1rem; max-width: 27rem; }
	.journey { background: var(--surface); border: 1px solid var(--accent-border); border-radius: 12px; padding: clamp(1.25rem, 2.8vw, 2rem); box-shadow: 0 16px 65px -24px rgb(var(--glow) / .2); min-width: 0; }
	.journey-caption { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .4rem; }
	.journey-caption .eyebrow { font-size: .59rem; letter-spacing: .12em; }
	.concept-label { font-size: .6rem; color: var(--accent); font-family: var(--font-mono); }
	.mode-switch { display: flex; padding: 4px; border: 1px solid var(--line); border-radius: 5px; margin-top: 1.4rem; gap: 4px; }
	.mode-switch button { flex: 1; padding: .45rem .3rem; border-radius: 3px; font-size: .77rem; color: var(--muted); transition: background .2s; }
	.mode-switch button[aria-pressed='true'] { background: var(--fg); color: var(--bg); }
	blockquote { font-size: 1.18rem; font-weight: 500; letter-spacing: -.02em; line-height: 1.45; margin: 1.25rem 0 1.5rem; max-width: 23rem; }
	.journey-steps { list-style: none; }
	.journey-steps li { position: relative; display: flex; gap: 1rem; padding-bottom: 1.1rem; }
	.journey-steps li:not(:last-child)::before { content: ''; position: absolute; left: 14px; top: 14px; bottom: -14px; width: 1px; background: var(--line-strong); }
	.journey-steps li:last-child { padding-bottom: 0; }
	.step-dot { position: relative; z-index: 1; display: grid; place-items: center; width: 29px; height: 29px; flex-shrink: 0; }
	.step-dot::after { content: ''; width: 9px; height: 9px; border: 1px solid var(--line-strong); border-radius: 50%; background: var(--surface); }
	.journey-steps li:last-child .step-dot::after { border-color: var(--accent); background: var(--accent); }
	.journey-steps h3 { font-size: .9rem; line-height: 1.4; margin-top: 3px; }
	.journey-steps p { font-size: .78rem; color: var(--muted); line-height: 1.55; margin-top: .2rem; min-height: 2.42em; }
	.diagram-note { border-top: 1px solid var(--line); margin-top: 1.1rem; padding-top: .8rem; color: var(--muted); font-size: .68rem; line-height: 1.6; }
	.build-pair { margin-top: 3.5rem; display: grid; grid-template-columns: 1fr 1fr; border: 1px solid var(--accent-border); border-radius: 10px; background: linear-gradient(125deg, var(--accent-surface), var(--surface) 75%); box-shadow: 0 16px 55px -40px rgb(var(--glow) / .5); }
	.build-pair article { display: flex; align-items: start; gap: 1.4rem; padding: 1.75rem; }
	.build-pair article + article { border-left: 1px solid var(--accent-border); }
	.system-icon { width: 46px; height: 58px; flex-shrink: 0; color: var(--accent); filter: drop-shadow(0 0 12px rgb(var(--glow) / .18)); }
	.build-pair .eyebrow { font-size: .6rem; letter-spacing: .12em; }
	.build-pair h3 { font-size: 1.08rem; line-height: 1.35; margin-top: .65rem; }
	.build-pair p:not(.eyebrow) { font-size: .83rem; line-height: 1.75; color: var(--muted); margin-top: .6rem; }
	.accent { color: var(--accent); }
	.hermes-section { position: relative; isolation: isolate; margin-top: 5.5rem; display: grid; grid-template-columns: 1fr 1fr; column-gap: 4rem; row-gap: 2.8rem; padding: 3.5rem 0; border-block: 1px solid var(--accent-border); }
	.comparison-atmosphere { position: absolute; inset: -1rem -8vw; z-index: -1; pointer-events: none; opacity: .8; mask-image: linear-gradient(to bottom, transparent, #000 15%, #000 85%, transparent), linear-gradient(to right, transparent, #000 12%, #000 88%, transparent); mask-composite: intersect; }
	.comparison-atmosphere::after { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse at 27% 32%, color-mix(in srgb, var(--bg) 94%, transparent) 12%, transparent 48%), radial-gradient(ellipse at 74% 61%, color-mix(in srgb, var(--bg) 86%, transparent), transparent 38%); }
	.hermes-section h2 { margin-top: 1.1rem; font-size: clamp(1.9rem, 3.6vw, 2.75rem); line-height: 1.15; }
	.comparison-intro { position: relative; isolation: isolate; }
	.comparison-intro::before { content: ''; position: absolute; inset: -.5rem -1.2rem; z-index: -1; pointer-events: none; background: var(--bg); opacity: .8; filter: blur(24px); }
	.why-thesis { margin-top: 1.5rem; max-width: 24rem; font-size: clamp(1.45rem, 2.5vw, 2rem); line-height: 1.3; letter-spacing: -.035em; }
	.why-thesis strong { color: var(--accent); font-weight: 500; }
	.why-intent { margin-top: .9rem; font-size: .95rem; line-height: 1.7; color: var(--muted); max-width: 24rem; }
	.context-path { display: flex; flex-direction: column; align-items: start; gap: .35rem; margin-top: 1.5rem; padding-left: 1rem; border-left: 2px solid var(--accent); font-size: .83rem; }
	.context-path [aria-hidden] { color: var(--accent); font-size: .8rem; }
	.hermes-copy { font-size: .95rem; color: var(--muted); line-height: 1.8; }
	.comparison-base { padding: 1.25rem; border: 1px solid var(--line); border-radius: 7px; background: var(--surface); margin-bottom: .8rem; }
	.comparison-goal { border: 1px solid var(--accent-border); background: var(--accent-surface); border-radius: 7px; padding: 1.25rem; }
	.hermes-copy .eyebrow { font-size: .61rem; letter-spacing: .1em; }
	.hermes-copy h3 { color: var(--fg); font-size: 1.1rem; margin: .55rem 0 .6rem; }
	.hermes-copy .why-answer { margin-top: 1rem; font-size: .86rem; }
	.source-link { display: inline-flex; gap: .7rem; color: var(--accent); font-size: .78rem; margin-top: 1rem; }
	.engineering-goals { grid-column: 1 / -1; }
	.engineering-heading { display: flex; justify-content: space-between; gap: 1rem; align-items: baseline; margin-bottom: 1.25rem; }
	.engineering-heading > p:last-child { font-size: .8rem; color: var(--muted); }
	.engineering-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; border: 1px solid var(--accent-border); border-radius: 8px; overflow: hidden; background: var(--accent-border); }
	.engineering-grid article { background: var(--surface); padding: 1.5rem; }
	.goal-verb { display: block; color: var(--accent); font: .65rem var(--font-mono); text-transform: uppercase; letter-spacing: .15em; }
	.engineering-grid h3 { margin-top: .9rem; font-size: 1.08rem; line-height: 1.3; max-width: 15rem; }
	.engineering-grid p { margin-top: .8rem; font-size: .85rem; line-height: 1.75; color: var(--muted); }
	.engineering-grid .goal-mechanism { border-top: 1px solid var(--line); padding-top: .8rem; font-size: .75rem; line-height: 1.65; }
	.goal-mechanism strong { color: var(--fg); font-weight: 500; }
	.engineering-note { margin-top: 1rem; max-width: 58rem; color: var(--muted); font-size: .75rem; line-height: 1.7; }
	.research-details { margin-top: 1.3rem; border-top: 1px solid var(--line); }
	.research-details summary strong { font-size: .88rem; }
	.research-details summary > span > span { font-size: .73rem; }
	.research-details .research-limit, .research-date { color: var(--muted); font-size: .75rem; line-height: 1.7; }
	.research-date { padding-bottom: 1.3rem; max-width: 57rem; }
	.details-section { margin-top: 4rem; }
	.detail-heading { display: flex; align-items: end; justify-content: space-between; gap: 1rem; }
	.detail-heading h2 { font-size: clamp(1.7rem, 3vw, 2.2rem); margin-top: .75rem; }
	.detail-heading > p { font-size: .8rem; color: var(--muted); }
	.disclosures { margin-top: 1.7rem; border-top: 1px solid var(--line-strong); }
	details { border-bottom: 1px solid var(--line); }
	summary { cursor: pointer; display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1.2rem 0; list-style: none; }
	summary::-webkit-details-marker { display: none; }
	summary strong { display: block; font-size: 1.02rem; font-weight: 500; }
	summary > span > span { display: block; margin-top: .15rem; font-size: .8rem; color: var(--muted); }
	.expand-icon { font-size: 1.5rem; color: var(--accent); font-weight: 300; transition: transform .2s; }
	details[open] .expand-icon { transform: rotate(45deg); }
	.detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem 3rem; padding: .5rem 0 2rem; }
	.detail-grid h3 { font-size: 1rem; line-height: 1.4; }
	.detail-grid p { color: var(--muted); font-size: .875rem; line-height: 1.8; margin-top: .5rem; }
	.detail-grid .detail-summary { color: var(--fg); font-weight: 500; margin-top: .3rem; }
	.build-areas h3 { margin-top: .4rem; }
	.priorities { grid-template-columns: repeat(3, 1fr); gap: 2rem; }
	.project-status { max-width: 52rem; font-size: .77rem; line-height: 1.75; color: var(--muted); margin-top: 1.3rem; }
	.beginner { margin-top: 4rem; padding: clamp(1.5rem, 4vw, 3rem); background: linear-gradient(120deg, var(--accent-surface), var(--surface) 85%); border: 1px solid var(--accent-border); border-radius: 10px; display: grid; grid-template-columns: 1.1fr 1fr; gap: 3rem; }
	.beginner h2 { font-size: clamp(2rem, 3.8vw, 3rem); margin-top: 1rem; letter-spacing: -.04em; }
	.beginner p:not(.eyebrow) { color: var(--muted); font-size: .9rem; line-height: 1.75; margin-top: 1rem; }
	.beginner strong { color: var(--fg); font-weight: 500; }
	.beginner .primary-link { margin-top: 1.4rem; }
	.support-list { display: grid; gap: 1.2rem; }
	.support-list h3 { font-size: .95rem; }
	.support-list p:not(.eyebrow) { font-size: .83rem; margin-top: .3rem; }
	.support-list a { color: var(--fg); text-decoration: underline; text-underline-offset: 3px; }
	@media (max-width: 900px) {
		.intro-grid { gap: 2rem; }
		h1 { font-size: 4rem; }
		.hero-actions { gap: 1rem; }
		.hermes-section { gap: 2rem; }
		.beginner { gap: 2rem; }
	}
	@media (max-width: 700px) {
		.intro-grid, .hermes-section, .beginner, .build-pair, .engineering-grid { grid-template-columns: 1fr; }
		.build-pair { margin-top: 2.5rem; }
		.build-pair article { padding: 1.4rem; gap: 1rem; }
		.build-pair article + article { border-left: 0; border-top: 1px solid var(--accent-border); }
		.system-icon { width: 36px; }
		.engineering-heading { flex-direction: column; gap: .5rem; }
		.engineering-grid h3 { max-width: none; }
		.intro-grid { margin-top: 2rem; gap: 2.3rem; }
		.hero-atmosphere { inset: -2rem -1.25rem 0; opacity: .7; }
		h1 { font-size: clamp(3.5rem, 14vw, 5rem); }
		.intro h2 { font-size: clamp(1.5rem, 7vw, 2rem); }
		.hermes-section { margin-top: 3rem; padding-block: 2.5rem; }
		.hermes-section h2 br { display: none; }
		.detail-heading > p { display: none; }
		.detail-grid, .priorities { grid-template-columns: 1fr; gap: 1.5rem; }
		.beginner { margin-top: 3rem; gap: 2rem; }
		.beginner h2 { font-size: clamp(1.85rem, 7.6vw, 2.6rem); }
	}
</style>
