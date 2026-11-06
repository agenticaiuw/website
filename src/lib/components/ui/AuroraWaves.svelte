<script lang="ts">
	import { onMount } from 'svelte';

	let { class: className = '', strength = 1, speed = 0.4, glow = 15 }: { class?: string; strength?: number; speed?: number; glow?: number } = $props();
	let root: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let ready = $state(false);
	let redraw: (() => void) | undefined;

	const vertexSource = `
		attribute vec2 aPosition;
		void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
	`;
	const fragmentSource = `
		precision mediump float;
		uniform vec2 uResolution;
		uniform float uTime;
		uniform float uGlow;
		uniform float uStrength;
		uniform vec3 uColor;
		vec3 palette(float t) {
			float variation = 0.5 + 0.5 * sin(t);
			return mix(uColor * vec3(0.78, 0.52, 0.52), uColor, variation);
		}
		float wave(vec2 uv, float frequency, float phase) {
			return 0.4 * sin(uv.x * frequency + uTime + phase);
		}
		float glowAt(float distanceToWave, float amount) {
			return exp(-distanceToWave * distanceToWave * amount);
		}
		void main() {
			vec2 screen = gl_FragCoord.xy / uResolution;
			vec2 uv = screen * 2.0 - 1.0;
			uv.x *= uResolution.x / uResolution.y;
			float w1 = wave(uv, 3.0, 0.0);
			float w2 = wave(uv, 5.0, 1.0);
			float w3 = wave(uv, 7.0, 2.5);
			float waveLine = w1 + w2 * 0.6 + w3 * 0.4;
			float distanceToWave = abs(uv.y - waveLine);
			float g = glowAt(distanceToWave, uGlow);
			vec3 color = palette(waveLine + uv.y);
			float peripheral = mix(0.42, 1.0, smoothstep(0.06, 0.47, abs(screen.x - 0.5)));
			float edgeFade = smoothstep(0.0, 0.07, screen.y) * smoothstep(0.0, 0.07, 1.0 - screen.y);
			float alpha = min(g * 1.5, 1.0) * 0.68 * peripheral * edgeFade * uStrength;
			gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.9));
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
		let raf = 0;
		let lastFrame = 0;
		let phase = 0;

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
				const vertex = createShader(gl!.VERTEX_SHADER, vertexSource);
				const fragment = createShader(gl!.FRAGMENT_SHADER, fragmentSource);
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
				for (const name of ['uResolution', 'uTime', 'uGlow', 'uStrength', 'uColor']) uniforms[name] = gl!.getUniformLocation(program, name);
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
			gl!.uniform1f(uniforms.uTime, phase);
			gl!.uniform1f(uniforms.uGlow, Math.max(1, Math.min(glow, 100)));
			gl!.uniform1f(uniforms.uStrength, Math.max(0, Math.min(strength, 2)));
			gl!.uniform3f(uniforms.uColor, color[0], color[1], color[2]);
			gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
		}
		function resize() {
			const bounds = root.getBoundingClientRect();
			mobile = bounds.width < 640;
			const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1 : 1.25);
			const targetWidth = Math.max(1, Math.round(bounds.width * dpr));
			const targetHeight = Math.max(1, Math.round(bounds.height * dpr));
			if (canvas.width !== targetWidth) canvas.width = targetWidth;
			if (canvas.height !== targetHeight) canvas.height = targetHeight;
			if (!lost) gl!.viewport(0, 0, canvas.width, canvas.height);
			paint();
		}
		function readTheme() {
			const value = getComputedStyle(root).getPropertyValue('--glow').trim().split(/\s+/).map(Number);
			if (value.length === 3 && value.every(Number.isFinite)) color = value.map(channel => Math.max(0, Math.min(channel / 255, 1)));
			paint();
		}
		const allowed = () => !disposed && !lost && !!program && visible && speed > 0 && strength > 0 && !document.hidden && !motion.matches;
		function frame(now: number) {
			raf = 0;
			if (!allowed()) return;
			if (!lastFrame || now - lastFrame >= 1000 / (mobile ? 20 : 30)) {
				const delta = lastFrame ? Math.min((now - lastFrame) / 1000, 0.1) : 0;
				// All three waves share this phase, so wrapping is seamless and prevents
				// mediump shader time from losing precision during long visits.
				phase = (phase + delta * Math.max(0, Math.min(speed, 3))) % (Math.PI * 2);
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
		redraw = sync;
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

	$effect(() => { strength; speed; glow; redraw?.(); });
</script>

<div class="aurora-waves {className}" class:ready bind:this={root} aria-hidden="true" data-renderer={ready ? 'webgl' : 'static'} style:--aurora-strength={Math.max(0, Math.min(strength, 2))}>
	<div class="fallback"></div>
	<canvas bind:this={canvas}></canvas>
</div>

<style>
	.aurora-waves { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
	canvas, .fallback { position: absolute; inset: 0; width: 100%; height: 100%; }
	canvas { display: block; opacity: 0; }
	.ready canvas { opacity: 1; }
	.ready .fallback { opacity: 0; }
	.fallback {
		opacity: var(--aurora-strength);
		background: radial-gradient(ellipse at 12% 60%, rgb(var(--glow) / 0.34), transparent 40%),
			radial-gradient(ellipse at 86% 38%, rgb(var(--glow) / 0.31), transparent 39%);
	}
</style>
