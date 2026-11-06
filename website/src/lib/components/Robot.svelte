<script lang="ts">
	import { onMount } from 'svelte';
	// type-only: the runtime import is dynamic so three stays off other pages
	import type * as T from 'three';

	/**
	 * Three.js port of the robot: sphere body, lathe neck, fresnel glass visor,
	 * blinking eyes, ears with antennae, procedural PBR texture, cursor tracking.
	 *
	 * three is imported dynamically so its ~600KB only downloads on this page.
	 * Chassis follows the theme; the visor glows Badger red.
	 */
	interface Props { height?: number }
	let { height = 420 }: Props = $props();

	let wrap: HTMLDivElement;
	let ready = $state(false);
	let failed = $state(false);

	onMount(() => {
		let dispose: (() => void) | undefined;
		let cancelled = false;

		(async () => {
			const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
			const THREE = await import('three');
			if (cancelled) return;

			const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
			const glowRGB = () => {
				const [r, g, b] = (css('--glow') || '255 74 61').split(/\s+/).map(Number);
				return new THREE.Color(r / 255, g / 255, b / 255);
			};
			const isDark = () => (document.documentElement.dataset.theme ?? 'dark') === 'dark';

			const W0 = wrap.clientWidth || 600;
			const scene = new THREE.Scene();
			const camera = new THREE.PerspectiveCamera(40, W0 / height, 0.1, 100);
			camera.position.set(0, 0.15, 4.2);

			const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
			renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
			renderer.setSize(W0, height);
			wrap.appendChild(renderer.domElement);

			/* ---- procedural speckled PBR texture (from the sample) ---------- */
			function speckle() {
				const s = 512;
				const cC = document.createElement('canvas'); const cB = document.createElement('canvas');
				cC.width = cB.width = cC.height = cB.height = s;
				const xC = cC.getContext('2d')!, xB = cB.getContext('2d')!;
				xC.fillStyle = '#dcdcdc'; xC.fillRect(0, 0, s, s);
				xB.fillStyle = '#808080'; xB.fillRect(0, 0, s, s);
				for (let i = 0; i < 7000; i++) {
					const x = Math.random() * s, y = Math.random() * s, r = 0.5 + Math.random() * 1.5;
					const dark = Math.random() > 0.15;
					xC.beginPath(); xC.arc(x, y, r, 0, Math.PI * 2); xC.fillStyle = dark ? '#222' : '#ddd'; xC.fill();
					xB.beginPath(); xB.arc(x, y, r, 0, Math.PI * 2); xB.fillStyle = dark ? '#000' : '#fff'; xB.fill();
				}
				const tC = new THREE.CanvasTexture(cC), tB = new THREE.CanvasTexture(cB);
				tC.wrapS = tB.wrapS = tC.wrapT = tB.wrapT = THREE.RepeatWrapping;
				tC.repeat.set(6, 3); tB.repeat.set(6, 3);
				return { map: tC, bump: tB };
			}
			const tex = speckle();

			const chassisMat = new THREE.MeshStandardMaterial({
				map: tex.map, bumpMap: tex.bump, bumpScale: 0.005, roughness: 1, metalness: 0
			});
			const headMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 1, metalness: 0 });
			const eyeMat = new THREE.MeshBasicMaterial({ toneMapped: false });

			function applyTheme() {
				const dark = isDark();
				chassisMat.color.set(dark ? 0x2a2c31 : 0xd6d3cf);
				headMat.color.set(dark ? 0x0d0e11 : 0x2a2c31);
				eyeMat.color.copy(glowRGB()).multiplyScalar(1.6);
				visorU.color.value.copy(glowRGB());
				antennaTip.color.copy(glowRGB()).multiplyScalar(1.4);
			}

			const body = new THREE.Group();
			body.position.y = -0.28;
			scene.add(body);

			body.add(new THREE.Mesh(
				new THREE.SphereGeometry(0.43, 48, 48, 0, Math.PI * 2, Math.PI * 0.15, Math.PI * 0.85), chassisMat));
			const bevel = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.025, 20, 48), chassisMat);
			bevel.position.y = 0.34; bevel.rotation.x = Math.PI / 2; body.add(bevel);

			const neckPts = [[0.1,-0.05],[0.215,-0.05],[0.28,0.02],[0.295,0.045],[0.27,0.055],[0.1,0.055]]
				.map(([x, y]) => new THREE.Vector2(x, y));
			const neck = new THREE.Mesh(new THREE.LatheGeometry(neckPts, 48), chassisMat);
			neck.position.y = 0.38; body.add(neck);

			/* ---- head ------------------------------------------------------- */
			const head = new THREE.Group();
			head.position.y = 0.6;
			body.add(head);
			head.add(new THREE.Mesh(new THREE.SphereGeometry(0.28, 48, 48, 0, Math.PI * 2, 0, Math.PI), headMat));

			const visorU = {
				color: { value: new THREE.Color(1, 1, 1) },
				power: { value: 3.8 },
				intensity: { value: 1.15 }
			};
			head.add(new THREE.Mesh(
				new THREE.SphereGeometry(0.3, 48, 48, 0, Math.PI * 2, 0, Math.PI),
				new THREE.ShaderMaterial({
					uniforms: visorU,
					vertexShader: `varying vec3 vN; varying vec3 vV;
						void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vV=-mv.xyz;
						vN=normalize(normalMatrix*normal); gl_Position=projectionMatrix*mv; }`,
					fragmentShader: `uniform vec3 color; uniform float power; uniform float intensity;
						varying vec3 vN; varying vec3 vV;
						void main(){ float f = pow(1.0 - max(dot(normalize(vV),normalize(vN)),0.0), power);
						gl_FragColor = vec4(color, f*intensity); }`,
					transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
				})));

			/* eyes — rounded bracket tubes, scaled on Y to blink */
			function bracket(up: boolean) {
				const w = 0.025, h = 0.035, r = 0.02, g = 0.005, s = up ? 1 : -1;
				const p = new THREE.CurvePath<T.Vector3>();
				const V = (x: number, y: number) => new THREE.Vector3(x, y * s, 0);
				p.add(new THREE.LineCurve3(V(-w, g), V(-w, h - r)));
				p.add(new THREE.QuadraticBezierCurve3(V(-w, h - r), V(-w, h), V(-w + r, h)));
				p.add(new THREE.LineCurve3(V(-w + r, h), V(w - r, h)));
				p.add(new THREE.QuadraticBezierCurve3(V(w - r, h), V(w, h), V(w, h - r)));
				p.add(new THREE.LineCurve3(V(w, h - r), V(w, g)));
				return new THREE.Mesh(new THREE.TubeGeometry(p, 18, 0.0035, 6, false), eyeMat);
			}
			const eyes: T.Group[] = [];
			for (const sx of [-0.07, 0.07]) {
				const g = new THREE.Group();
				g.position.set(sx, -0.02, 0.29);
				g.rotation.y = sx < 0 ? -0.2 : 0.2;
				g.add(bracket(true), bracket(false));
				head.add(g); eyes.push(g);
			}

			/* ears + antennae */
			const earMat = new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.45, metalness: 0.3 });
			const antennaTip = new THREE.MeshBasicMaterial({ toneMapped: false });
			for (const sx of [-0.29, 0.29]) {
				const e = new THREE.Group(); e.position.set(sx, 0, 0); e.scale.setScalar(1.3);
				const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.025, 24), earMat);
				disc.rotation.z = Math.PI / 2; e.add(disc);
				const ring = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.008, 12, 24), earMat);
				ring.rotation.y = Math.PI / 2; ring.position.x = Math.sign(sx) * 0.012; e.add(ring);
				const a = new THREE.Group(); a.position.set(Math.sign(sx) * 0.015, 0.035, 0); a.rotation.x = -0.4;
				const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.1, 6), earMat);
				stick.position.y = 0.06; a.add(stick);
				const tip = new THREE.Mesh(new THREE.SphereGeometry(0.007, 12, 12), antennaTip);
				tip.position.y = 0.11; a.add(tip);
				e.add(a); head.add(e);
			}

			scene.add(new THREE.AmbientLight(0xffffff, 1.5));
			const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(2, 4, 3); scene.add(key);
			const fill = new THREE.DirectionalLight(0xffffff, 0.35); fill.position.set(-3, 1, -2); scene.add(fill);

			applyTheme();
			ready = true;

			/* ---- interaction ------------------------------------------------ */
			const pointer = { x: 0, y: 0 };
			const onMove = (e: PointerEvent) => {
				const r = wrap.getBoundingClientRect();
				pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
				pointer.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
			};
			window.addEventListener('pointermove', onMove);

			let raf = 0, running = false, t0 = performance.now();
			const lerp = (a: number, b: number, n: number) => a + (b - a) * n;

			function frame(now: number) {
				if (!running) return;
				const dt = Math.min((now - t0) / 1000, 0.1); t0 = now;
				const px = pointer.x, py = pointer.y;

				body.rotation.y = lerp(body.rotation.y, -px * 0.55, 6 * dt);
				body.rotation.x = lerp(body.rotation.x, -py * 0.18, 6 * dt);
				body.rotation.z = lerp(body.rotation.z, -px * 0.10, 6 * dt);
				body.position.x = lerp(body.position.x, px * 0.28, 3 * dt);
				head.rotation.y = lerp(head.rotation.y, px * 0.85, 10 * dt);
				head.rotation.x = lerp(head.rotation.x, -py * 0.30, 10 * dt);

				const cyc = (now / 1000) % 3.4;
				const blink = cyc < 0.16 ? Math.max(0.06, 1 - Math.sin((cyc / 0.16) * Math.PI)) : 1;
				for (const e of eyes) e.scale.set(1.1, 1.1 * blink, 1.1);

				renderer.render(scene, camera);
				raf = requestAnimationFrame(frame);
			}
			const start = () => { if (!running) { running = true; t0 = performance.now(); raf = requestAnimationFrame(frame); } };
			const stop = () => { running = false; cancelAnimationFrame(raf); };

			if (reduced.matches) renderer.render(scene, camera);
			else start();

			const io = new IntersectionObserver(([e]) => {
				if (reduced.matches) return;
				e.isIntersecting ? start() : stop();
			}, { threshold: 0.05 });
			io.observe(wrap);

			const onVis = () => { if (reduced.matches) return; document.hidden ? stop() : start(); };
			document.addEventListener('visibilitychange', onVis);

			const ro = new ResizeObserver(() => {
				const w = wrap.clientWidth || 600;
				camera.aspect = w / height; camera.updateProjectionMatrix();
				renderer.setSize(w, height);
				if (!running) renderer.render(scene, camera);
			});
			ro.observe(wrap);

			const mo = new MutationObserver(() => { applyTheme(); if (!running) renderer.render(scene, camera); });
			mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

			dispose = () => {
				stop(); io.disconnect(); ro.disconnect(); mo.disconnect();
				window.removeEventListener('pointermove', onMove);
				document.removeEventListener('visibilitychange', onVis);
				scene.traverse((o) => {
					const m = o as T.Mesh;
					m.geometry?.dispose?.();
					const mat = m.material as T.Material | T.Material[] | undefined;
					if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
					else mat?.dispose?.();
				});
				tex.map.dispose(); tex.bump.dispose();
				renderer.dispose();
				renderer.domElement.remove();
			};
		})().catch((err) => {
			console.error('[robot] failed to load', err);
			failed = true;
		});

		return () => { cancelled = true; dispose?.(); };
	});
</script>

<div class="relative w-full" style:height="{height}px">
	<div bind:this={wrap} class="h-full w-full" aria-hidden="true"></div>
	{#if !ready && !failed}
		<div class="absolute inset-0 grid place-items-center font-mono text-xs" style:color="var(--muted)">
			loading…
		</div>
	{/if}
</div>
