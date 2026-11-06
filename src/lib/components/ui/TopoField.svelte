<script lang="ts">
	import { onMount } from 'svelte';

	let { class: className = '', strength = 1 }: { class?: string; strength?: number } = $props();
	let root: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let ready = $state(false);
	let redraw: (() => void) | undefined;

	const vertexSource = `
		attribute vec2 aPosition;
		void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
	`;
	// Adapted from the supplied MengTo/threeui (MIT) TopoField shader:
	// src/shaders/neuform-isolated/NeuformBatchEffects.tsx and sources/topo-field.html.
	// Its simplex contour field is rendered locally, in transparent theme reds.
	const fragmentSource = `
		precision highp float;
		uniform vec2 uResolution;
		uniform float uTime;
		uniform float uDpr;
		uniform float uStrength;
		uniform vec3 uColor;
		vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
		float snoise(vec2 v) {
			const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
			vec2 i = floor(v + dot(v, C.yy));
			vec2 x0 = v - i + dot(i, C.xx);
			vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
			vec4 x12 = x0.xyxy + C.xxzz;
			x12.xy -= i1;
			i = mod(i, 289.0);
			vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
			vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
			m = m * m;
			m = m * m;
			vec3 x = 2.0 * fract(p * C.www) - 1.0;
			vec3 h = abs(x) - 0.5;
			vec3 ox = floor(x + 0.5);
			vec3 a0 = x - ox;
			m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
			vec3 g;
			g.x = a0.x * x0.x + h.x * x0.y;
			g.yz = a0.yz * x12.xz + h.yz * x12.yw;
			return 130.0 * dot(m, g);
		}
		void main() {
			vec2 uv = gl_FragCoord.xy / uResolution;
			vec2 st = (gl_FragCoord.xy - uResolution * 0.5) / min(uResolution.x, uResolution.y);
			vec2 noisePos = st * 1.4 + vec2(1.7 + uTime * 0.009, 2.3 + uTime * 0.014);
			float n = snoise(noisePos) * 0.5 + 0.5;
			float bandValue = n * 12.0;
			float distanceToLine = abs(fract(bandValue) - 0.5);
			#ifdef HAS_DERIVATIVES
				float antialias = max(fwidth(bandValue) * 0.7, 0.003);
			#else
				float antialias = max(10.0 / min(uResolution.x, uResolution.y), 0.007);
			#endif
			float contour = 1.0 - smoothstep(0.009, 0.009 + antialias, distanceToLine);
			float halo = 1.0 - smoothstep(0.01, 0.115, distanceToLine);
			float major = 1.0 - step(0.5, mod(floor(bandValue), 3.0));
			float peripheral = mix(0.4, 1.0, smoothstep(0.04, 0.46, abs(uv.x - 0.5)));
			float edgeFade = smoothstep(0.0, 0.055, uv.y) * smoothstep(0.0, 0.055, 1.0 - uv.y);
			vec2 grid = fract(gl_FragCoord.xy / (64.0 * uDpr));
			float gridLine = max(step(1.0 - 0.6 / 64.0, grid.x), step(1.0 - 0.6 / 64.0, grid.y));
			float alpha = (contour * (0.55 + major * 0.18) + halo * 0.11 + gridLine * 0.035) * peripheral;
			gl_FragColor = vec4(uColor, clamp(alpha * edgeFade * uStrength, 0.0, 0.9));
		}
	`;

	onMount(() => {
		const gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, premultipliedAlpha: false, powerPreference: 'low-power' });
		if (!gl) return;
		const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
		let program: WebGLProgram | null = null;
		let buffer: WebGLBuffer | null = null;
		let shaders: WebGLShader[] = [];
		let uniforms: Record<string, WebGLUniformLocation | null> = {};
		let color = [1, 74 / 255, 61 / 255];
		let visible = false;
		let lost = false;
		let disposed = false;
		let mobile = false;
		let dpr = 1;
		let raf = 0;
		let lastFrame = 0;
		let elapsed = 0;

		function destroyGPU() {
			if (buffer) gl!.deleteBuffer(buffer);
			if (program) gl!.deleteProgram(program);
			for (const shader of shaders) gl!.deleteShader(shader);
			buffer = null;
			program = null;
			shaders = [];
			uniforms = {};
		}
		function createShader(type: number, source: string) {
			const shader = gl!.createShader(type);
			if (!shader) throw new Error('Shader unavailable');
			shaders.push(shader);
			gl!.shaderSource(shader, source);
			gl!.compileShader(shader);
			if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) throw new Error('Shader compilation failed');
			return shader;
		}
		function initialize() {
			destroyGPU();
			try {
				const derivatives = gl!.getExtension('OES_standard_derivatives');
				const header = derivatives ? '#extension GL_OES_standard_derivatives : enable\n#define HAS_DERIVATIVES\n' : '';
				const vertex = createShader(gl!.VERTEX_SHADER, vertexSource);
				const fragment = createShader(gl!.FRAGMENT_SHADER, header + fragmentSource);
				program = gl!.createProgram();
				if (!program) throw new Error('Shader program unavailable');
				gl!.attachShader(program, vertex);
				gl!.attachShader(program, fragment);
				gl!.linkProgram(program);
				if (!gl!.getProgramParameter(program, gl!.LINK_STATUS)) throw new Error('Shader linking failed');
				gl!.useProgram(program);
				buffer = gl!.createBuffer();
				if (!buffer) throw new Error('Shader buffer unavailable');
				gl!.bindBuffer(gl!.ARRAY_BUFFER, buffer);
				gl!.bufferData(gl!.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl!.STATIC_DRAW);
				const position = gl!.getAttribLocation(program, 'aPosition');
				if (position < 0) throw new Error('Shader position unavailable');
				gl!.enableVertexAttribArray(position);
				gl!.vertexAttribPointer(position, 2, gl!.FLOAT, false, 0, 0);
				for (const name of ['uResolution', 'uTime', 'uDpr', 'uStrength', 'uColor']) uniforms[name] = gl!.getUniformLocation(program, name);
				return true;
			} catch {
				destroyGPU();
				ready = false;
				return false;
			}
		}
		function paint() {
			if (disposed || lost || !program) return;
			gl!.useProgram(program);
			gl!.uniform2f(uniforms.uResolution, canvas.width, canvas.height);
			gl!.uniform1f(uniforms.uTime, elapsed);
			gl!.uniform1f(uniforms.uDpr, dpr);
			gl!.uniform1f(uniforms.uStrength, Math.max(0, Math.min(strength, 2)));
			gl!.uniform3f(uniforms.uColor, color[0], color[1], color[2]);
			gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
		}
		function resize() {
			const bounds = root.getBoundingClientRect();
			mobile = bounds.width < 640;
			dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1 : 1.25);
			canvas.width = Math.max(1, Math.round(bounds.width * dpr));
			canvas.height = Math.max(1, Math.round(bounds.height * dpr));
			if (!lost) gl!.viewport(0, 0, canvas.width, canvas.height);
			paint();
		}
		function readTheme() {
			const value = getComputedStyle(root).getPropertyValue('--glow').trim().split(/\s+/).map(Number);
			if (value.length === 3 && value.every(Number.isFinite)) color = value.map(channel => Math.max(0, Math.min(channel / 255, 1)));
			paint();
		}
		const allowed = () => !disposed && !lost && !!program && visible && !document.hidden && !motion.matches;
		function frame(now: number) {
			raf = 0;
			if (!allowed()) return;
			if (!lastFrame || now - lastFrame >= 1000 / (mobile ? 20 : 30)) {
				elapsed += lastFrame ? Math.min((now - lastFrame) / 1000, 0.1) : 0;
				lastFrame = now;
				paint();
			}
			raf = requestAnimationFrame(frame);
		}
		function sync() {
			cancelAnimationFrame(raf);
			raf = 0;
			lastFrame = 0;
			if (allowed()) raf = requestAnimationFrame(frame);
			else paint();
		}
		function onLost(event: Event) {
			event.preventDefault();
			lost = true;
			ready = false;
			sync();
		}
		function onRestored() {
			if (disposed) return;
			lost = false;
			if (!initialize()) return;
			readTheme();
			resize();
			ready = true;
			sync();
		}

		if (!initialize()) return;
		readTheme();
		resize();
		ready = true;
		redraw = paint;
		const resizeObserver = new ResizeObserver(resize);
		resizeObserver.observe(root);
		const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
		intersection.observe(root);
		const theme = new MutationObserver(readTheme);
		theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
		motion.addEventListener('change', sync);
		document.addEventListener('visibilitychange', sync);
		window.addEventListener('resize', resize);
		canvas.addEventListener('webglcontextlost', onLost);
		canvas.addEventListener('webglcontextrestored', onRestored);
		return () => {
			disposed = true;
			redraw = undefined;
			cancelAnimationFrame(raf);
			resizeObserver.disconnect();
			intersection.disconnect();
			theme.disconnect();
			motion.removeEventListener('change', sync);
			document.removeEventListener('visibilitychange', sync);
			window.removeEventListener('resize', resize);
			canvas.removeEventListener('webglcontextlost', onLost);
			canvas.removeEventListener('webglcontextrestored', onRestored);
			destroyGPU();
		};
	});

	$effect(() => { strength; redraw?.(); });
</script>

<div class="topo-field {className}" class:ready bind:this={root} aria-hidden="true" data-renderer={ready ? 'webgl' : 'static'} style:--topo-strength={Math.max(0, Math.min(strength, 2))}>
	<div class="fallback"></div>
	<canvas bind:this={canvas}></canvas>
</div>

<style>
	.topo-field { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
	canvas, .fallback { position: absolute; inset: 0; width: 100%; height: 100%; }
	canvas { display: block; opacity: 0; }
	.ready canvas { opacity: 1; }
	.ready .fallback { opacity: 0; }
	.fallback {
		opacity: var(--topo-strength);
		background: repeating-radial-gradient(ellipse at 12% 65%, transparent 0 21px, rgb(var(--glow) / 0.42) 22px, transparent 24px 39px);
		mask-image: linear-gradient(90deg, #000, #0004 45%, #0004 55%, #000);
	}
</style>
