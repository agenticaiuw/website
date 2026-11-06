<script lang="ts">
	import { onMount } from 'svelte';

	let { class: className = '', strength = 0.8 }: { class?: string; strength?: number } = $props();
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
		uniform float uLineCount;
		uniform float uStrength;
		uniform vec3 uColor;
		float randomWave(float t) {
			return (cos(t) + cos(t * 1.3 + 1.3) + cos(t * 1.4 + 1.4)) / 3.0;
		}
		float plasmaY(float x, float fade, float offset) {
			return randomWave(x * 0.2 + uTime * 0.2) * fade + offset;
		}
		void main() {
			vec2 uv = gl_FragCoord.xy / uResolution;
			vec2 space = (gl_FragCoord.xy - uResolution / 2.0) / uResolution.x * 10.0;
			float horizontalFade = 1.0 - (cos(uv.x * 6.283185) * 0.5 + 0.5);
			float verticalFade = 1.0 - (cos(uv.y * 6.283185) * 0.5 + 0.5);
			space.y += randomWave(space.x * 0.5 + uTime * 0.04) * (0.5 + horizontalFade);
			space.x += randomWave(space.y * 0.5 + uTime * 0.04 + 2.0) * horizontalFade;
			float signals = 0.0;
			for (int i = 0; i < 16; i++) {
				if (float(i) >= uLineCount) continue;
				float l = float(i);
				float normalized = l / uLineCount;
				float offsetTime = uTime * 0.266;
				float offsetPosition = l + space.x * 0.5;
				float variation = randomWave(offsetPosition + offsetTime) * 0.5 + 0.5;
				float halfWidth = mix(0.01, 0.2, variation * horizontalFade) / 2.0;
				float offset = randomWave(offsetPosition + offsetTime * (1.0 + normalized))
					* mix(0.6, 2.0, horizontalFade);
				float distanceToLine = abs(plasmaY(space.x, horizontalFade, offset) - space.y);
				float line = (1.0 - smoothstep(0.0, halfWidth, distanceToLine)) * 0.5;
				line += 1.0 - smoothstep(halfWidth * 0.15, halfWidth * 0.15 + 0.015, distanceToLine);
				float circleX = mod(l + uTime * 0.2, 25.0) - 12.0;
				float circleDistance = length(space - vec2(circleX, plasmaY(circleX, horizontalFade, offset)));
				float circle = (1.0 - smoothstep(0.01, 0.025, circleDistance)) * 4.0;
				signals += (line + circle) * variation;
			}
			float edgeFade = smoothstep(0.0, 0.1, uv.y) * smoothstep(0.0, 0.1, 1.0 - uv.y);
			float alpha = min(0.64, 1.0 - exp(-signals * 0.24)) * uStrength;
			alpha *= edgeFade * (0.3 + 0.7 * verticalFade);
			gl_FragColor = vec4(uColor, alpha);
		}
	`;

	onMount(() => {
		const gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: false, powerPreference: 'low-power' });
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
				gl!.enableVertexAttribArray(position);
				gl!.vertexAttribPointer(position, 2, gl!.FLOAT, false, 0, 0);
				for (const name of ['uResolution', 'uTime', 'uLineCount', 'uStrength', 'uColor']) {
					uniforms[name] = gl!.getUniformLocation(program, name);
				}
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
			// Preserve the source flow's shape, with a slower decorative clock.
			gl!.uniform1f(uniforms.uTime, elapsed * 0.65);
			gl!.uniform1f(uniforms.uLineCount, mobile ? 8 : 16);
			gl!.uniform1f(uniforms.uStrength, Math.max(0, Math.min(strength, 1)));
			gl!.uniform3f(uniforms.uColor, color[0], color[1], color[2]);
			gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
		}

		function resize() {
			const bounds = root.getBoundingClientRect();
			mobile = bounds.width < 640;
			const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1 : 1.25);
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
			const frameInterval = 1000 / (mobile ? 20 : 30);
			if (!lastFrame || now - lastFrame >= frameInterval) {
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
			canvas.removeEventListener('webglcontextlost', onLost);
			canvas.removeEventListener('webglcontextrestored', onRestored);
			destroyGPU();
		};
	});

	$effect(() => { strength; redraw?.(); });
</script>

<div class="signal-waves {className}" class:ready bind:this={root} aria-hidden="true" data-renderer={ready ? 'webgl' : 'static'} style:--signal-strength={Math.max(0, Math.min(strength, 1))}>
	<div class="fallback"></div>
	<canvas bind:this={canvas}></canvas>
</div>

<style>
	.signal-waves { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
	canvas, .fallback { position: absolute; inset: 0; width: 100%; height: 100%; }
	canvas { display: block; opacity: 0; }
	.ready canvas { opacity: 1; }
	.ready .fallback { opacity: 0; }
	.fallback {
		background: radial-gradient(ellipse at 30% 65%, rgb(var(--glow) / calc(0.11 * var(--signal-strength))), transparent 48%),
			radial-gradient(ellipse at 76% 35%, rgb(var(--glow) / calc(0.08 * var(--signal-strength))), transparent 42%);
	}
</style>
