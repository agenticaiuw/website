<script lang="ts">
	import { onMount } from 'svelte';

	let canvas: HTMLCanvasElement;
	let wrap: HTMLDivElement;

	onMount(() => {
		const ctx = canvas.getContext('2d', { alpha: true });
		if (!ctx) return;

		const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
		const readAccent = () =>
			getComputedStyle(document.documentElement).getPropertyValue('--glow').trim() || '255 74 61';
		let accent = readAccent();

		let W = 0, H = 0, dpr = 1;
		let nodes: Node[] = [];
		let edges: Edge[] = [];
		let packets: Packet[] = [];
		let raf = 0;
		let running = false;
		let t = 0;
		const pointer = { x: -9999, y: -9999, active: false };

		type Node = {
			x: number; y: number; bx: number; by: number;
			r: number; phase: number; drift: number; heat: number;
		};
		type Edge = { a: number; b: number; d: number };
		type Packet = { e: number; p: number; sp: number; dir: 1 | -1 };

		/* Device-aware budget: a mid-tier phone gets far fewer nodes than a laptop. */
		function budget() {
			const area = W * H;
			const cores = navigator.hardwareConcurrency ?? 4;
			let n = Math.round(area / 26000);
			if (W < 640) n = Math.min(n, 16);
			else if (W < 1024) n = Math.min(n, 26);
			else n = Math.min(n, 40);
			if (cores <= 4) n = Math.round(n * 0.65);
			return Math.max(9, n);
		}

		function build() {
			const n = budget();
			nodes = [];
			/* Poisson-ish scatter: reject points that land too close to an existing node. */
			let guard = 0;
			while (nodes.length < n && guard++ < n * 60) {
				const x = Math.random() * W;
				const y = Math.random() * H;
				const min = Math.min(W, H) * 0.11;
				if (nodes.some((p) => Math.hypot(p.bx - x, p.by - y) < min)) continue;
				nodes.push({
					x, y, bx: x, by: y,
					r: 1.4 + Math.random() * 1.9,
					phase: Math.random() * Math.PI * 2,
					drift: 0.35 + Math.random() * 0.5,
					heat: 0
				});
			}

			edges = [];
			const reach = Math.min(W, H) * 0.30;
			for (let i = 0; i < nodes.length; i++) {
				const near: { j: number; d: number }[] = [];
				for (let j = 0; j < nodes.length; j++) {
					if (i === j) continue;
					const d = Math.hypot(nodes[i].bx - nodes[j].bx, nodes[i].by - nodes[j].by);
					if (d < reach) near.push({ j, d });
				}
				near.sort((p, q) => p.d - q.d);
				for (const { j, d } of near.slice(0, 3)) {
					if (!edges.some((e) => (e.a === i && e.b === j) || (e.a === j && e.b === i))) {
						edges.push({ a: i, b: j, d });
					}
				}
			}
			packets = [];
		}

		function resize() {
			const rect = wrap.getBoundingClientRect();
			dpr = Math.min(window.devicePixelRatio || 1, 2);
			W = rect.width;
			H = rect.height;
			canvas.width = Math.round(W * dpr);
			canvas.height = Math.round(H * dpr);
			canvas.style.width = W + 'px';
			canvas.style.height = H + 'px';
			ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
			build();
			if (reduced.matches) draw(true);
		}

		function spawnPacket() {
			if (!edges.length || packets.length > 14) return;
			const e = (Math.random() * edges.length) | 0;
			packets.push({ e, p: 0, sp: 0.0035 + Math.random() * 0.0055, dir: Math.random() < 0.5 ? 1 : -1 });
		}

		function draw(still = false) {
			ctx!.clearRect(0, 0, W, H);
			const [ar, ag, ab] = accent.split(/\s+/).map(Number);

			/* edges */
			for (const e of edges) {
				const a = nodes[e.a], b = nodes[e.b];
				const fade = 1 - e.d / (Math.min(W, H) * 0.30);
				const heat = Math.max(a.heat, b.heat);
				ctx!.beginPath();
				ctx!.moveTo(a.x, a.y);
				ctx!.lineTo(b.x, b.y);
				ctx!.strokeStyle = `rgba(${ar},${ag},${ab},${(0.045 + fade * 0.05 + heat * 0.30).toFixed(3)})`;
				ctx!.lineWidth = 1;
				ctx!.stroke();
			}

			/* packets — the "tool call in flight" */
			if (!still) {
				for (const pk of packets) {
					const e = edges[pk.e];
					if (!e) continue;
					const a = nodes[e.a], b = nodes[e.b];
					const p = pk.dir === 1 ? pk.p : 1 - pk.p;
					const x = a.x + (b.x - a.x) * p;
					const y = a.y + (b.y - a.y) * p;
					const tail = 0.11;
					const px = a.x + (b.x - a.x) * (p - tail * pk.dir);
					const py = a.y + (b.y - a.y) * (p - tail * pk.dir);
					const g = ctx!.createLinearGradient(px, py, x, y);
					g.addColorStop(0, `rgba(${ar},${ag},${ab},0)`);
					g.addColorStop(1, `rgba(${ar},${ag},${ab},0.85)`);
					ctx!.beginPath();
					ctx!.moveTo(px, py);
					ctx!.lineTo(x, y);
					ctx!.strokeStyle = g;
					ctx!.lineWidth = 1.6;
					ctx!.stroke();
					ctx!.beginPath();
					ctx!.arc(x, y, 1.7, 0, Math.PI * 2);
					ctx!.fillStyle = `rgba(${ar},${ag},${ab},0.95)`;
					ctx!.fill();
				}
			}

			/* nodes */
			for (const n of nodes) {
				const pulse = still ? 0.5 : 0.5 + Math.sin(t * 0.0011 * n.drift + n.phase) * 0.5;
				const r = n.r * (0.85 + pulse * 0.3);
				if (n.heat > 0.01) {
					ctx!.beginPath();
					ctx!.arc(n.x, n.y, r + 7 * n.heat, 0, Math.PI * 2);
					ctx!.fillStyle = `rgba(${ar},${ag},${ab},${(n.heat * 0.12).toFixed(3)})`;
					ctx!.fill();
				}
				ctx!.beginPath();
				ctx!.arc(n.x, n.y, r, 0, Math.PI * 2);
				ctx!.fillStyle = `rgba(${ar},${ag},${ab},${(0.28 + pulse * 0.22 + n.heat * 0.5).toFixed(3)})`;
				ctx!.fill();
			}
		}

		function frame(now: number) {
			if (!running) return;
			t = now;

			for (const n of nodes) {
				/* slow organic drift around the anchor point */
				n.x = n.bx + Math.sin(now * 0.00016 * n.drift + n.phase) * 9;
				n.y = n.by + Math.cos(now * 0.00013 * n.drift + n.phase * 1.3) * 9;

				/* cursor nudges nearby agents and warms them */
				if (pointer.active) {
					const dx = n.x - pointer.x, dy = n.y - pointer.y;
					const d = Math.hypot(dx, dy);
					const R = 165;
					if (d < R && d > 0.01) {
						const f = (1 - d / R) ** 2;
						n.x += (dx / d) * f * 22;
						n.y += (dy / d) * f * 22;
						n.heat = Math.min(1, n.heat + f * 0.06);
					}
				}
				n.heat *= 0.94;
			}

			if (Math.random() < 0.055) spawnPacket();
			for (let i = packets.length - 1; i >= 0; i--) {
				packets[i].p += packets[i].sp;
				if (packets[i].p >= 1) {
					const e = edges[packets[i].e];
					if (e) nodes[packets[i].dir === 1 ? e.b : e.a].heat = 1;
					packets.splice(i, 1);
				}
			}

			draw();
			raf = requestAnimationFrame(frame);
		}

		function start() {
			if (running || reduced.matches) return;
			running = true;
			raf = requestAnimationFrame(frame);
		}
		function stop() {
			running = false;
			cancelAnimationFrame(raf);
		}

		/* pause offscreen — never burn a phone battery on an invisible canvas */
		const io = new IntersectionObserver(
			([e]) => (e.isIntersecting ? start() : stop()),
			{ threshold: 0.01 }
		);
		io.observe(wrap);

		const onVis = () => {
			if (document.hidden) stop();
			else start();
		};
		const onMove = (e: PointerEvent) => {
			if (e.pointerType === 'touch') return;
			const r = wrap.getBoundingClientRect();
			pointer.x = e.clientX - r.left;
			pointer.y = e.clientY - r.top;
			pointer.active = true;
		};
		const onLeave = () => (pointer.active = false);
		const onReduced = () => (reduced.matches ? (stop(), draw(true)) : start());
		const onTheme = () => { accent = readAccent(); if (reduced.matches) draw(true); };

		let rt: ReturnType<typeof setTimeout>;
		const onResize = () => { clearTimeout(rt); rt = setTimeout(resize, 140); };

		resize();
		/* Watch the CONTAINER, not just the window: this graph sits behind
		   sections whose height changes as content mounts and reveals fire,
		   and none of that produces a window resize event. */
		const ro = new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(resize, 90); });
		ro.observe(wrap);
		window.addEventListener('resize', onResize);
		document.addEventListener('visibilitychange', onVis);
		wrap.addEventListener('pointermove', onMove);
		wrap.addEventListener('pointerleave', onLeave);
		reduced.addEventListener('change', onReduced);
		const mo = new MutationObserver(onTheme);
		mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

		return () => {
			stop();
			io.disconnect();
			mo.disconnect();
			ro.disconnect();
			clearTimeout(rt);
			window.removeEventListener('resize', onResize);
			document.removeEventListener('visibilitychange', onVis);
			wrap.removeEventListener('pointermove', onMove);
			wrap.removeEventListener('pointerleave', onLeave);
			reduced.removeEventListener('change', onReduced);
		};
	});
</script>

<div bind:this={wrap} class="absolute inset-0 overflow-hidden" aria-hidden="true">
	<canvas bind:this={canvas} class="block h-full w-full"></canvas>
</div>
