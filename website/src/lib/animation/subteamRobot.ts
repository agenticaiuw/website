import { Box3, Matrix3, Matrix4, Vector3 } from 'three';

type Options = {
	canvas: HTMLCanvasElement;
	stage: HTMLElement;
	getActive: () => number;
	getReducedMotion: () => boolean;
	skipOpening?: boolean;
	onReady: () => void;
	onReveal?: () => void;
	onHeld: () => void;
	onAnchor: (point: { x: number; y: number }) => void;
};

// These are the first forward transitions embedded in hivemind-bot.splinecode.
// The source repeats them in reverse; seeking one forward pass preserves its
// authored states/easing while keeping its camera and looping clock disconnected.
const TIMING: Record<string, [number, number]> = {
	'Hand LEFT': [1000, 2000],
	arm: [1000, 4000],
	elbow: [2000, 3000],
	forearm: [2000, 2000],
	Hand: [5000, 1000]
};
const OPENING = 6000;
const CORRECTION = 1400;

export async function createSubteamRobot(options: Options) {
	const { canvas, stage } = options;
	const { Application } = await import('@splinetool/runtime');
	// Keep geometry processing local so exports do not depend on Spline's CDN.
	const app: any = new Application(canvas, { wasmPath: '/vendor/spline' });
	try {
		const embedded = globalThis as typeof globalThis & {
			__SPLINE_SCENE_BYTES__?: ArrayBuffer;
			__SPLINE_SCENE_URL__?: string;
			__SPLINE_SCENE_DATA__?: string;
		};
		const attempts = [
			...(embedded.__SPLINE_SCENE_BYTES__ ? [() => app.start(embedded.__SPLINE_SCENE_BYTES__)] : []),
			...[embedded.__SPLINE_SCENE_URL__, embedded.__SPLINE_SCENE_DATA__, '/hivemind-bot.splinecode']
				.filter(Boolean).map(url => () => app.load(url))
		];
		for (const load of attempts) {
			try { await load(); } catch { continue; }
			if (app._scene?.getObjectByName('Bot') && app._scene?.getObjectByName('Head')) break;
		}
		const scene = app._scene;
		const bot = scene?.getObjectByName('Bot');
		const head = scene?.getObjectByName('Head');
		const camera = app._camera;
		if (!bot || !head || !camera) throw new Error('Spline scene did not expose the expected robot rig');
		// start() queues its renderer on the next task. Stop after that task so
		// the runtime cannot restart a second render loop behind our controller.
		await new Promise<void>(resolve => setTimeout(resolve, 0));
		app.stop();
		const commit = (node: any) => { node.updateMatrix(); node.updateMatrixWorld(true); };
		const nodes: any[] = [];
		bot.traverse((node: any) => nodes.push(node));
		const joints = nodes.filter(node => TIMING[node.name] && node.data?.states?.length);
		const proxies = joints.map(node => app.findObjectById(node.uuid));
		proxies.forEach(proxy => { proxy.state = undefined; });
		const motions = joints.map((node, index) => {
			const [delay, duration] = TIMING[node.name];
			const transition = proxies[index].transition({ from: null, to: 'State', delay: 0, duration, easing: 4, autoPlay: false });
			return { transition, seek: (ms: number) => transition.seek(Math.max(0, Math.min(duration, ms - delay))) };
		});
		if (motions.length < 5) throw new Error('Spline arm transitions are unavailable');
		motions.forEach(motion => motion.seek(0));
		const hands = nodes.filter(node => node.name === 'Hand' && node.parent?.name === 'forearm');
		const restHead = head.rotation.clone();
		const vector = new Vector3();
		const project = (point: Vector3) => {
			const v = point.clone().project(camera);
			return { x: (v.x + 1) * stage.clientWidth / 2, y: (1 - v.y) * stage.clientHeight / 2 };
		};
		const position = (node: any) => node.getWorldPosition(vector).clone();
		const bounds = new Box3();
		bot.updateMatrixWorld(true);
		bot.traverse((node: any) => {
			if (node.isMesh && node.visible && node.geometry) {
				node.geometry.computeBoundingBox();
				if (node.geometry.boundingBox) bounds.union(node.geometry.boundingBox.clone().applyMatrix4(node.matrixWorld));
			}
		});
		const center = bounds.getCenter(new Vector3());
		camera.position.x = center.x;
		camera.position.y = center.y;
		camera.rotation.set(0, 0, 0);
		camera.zoom = 1;
		commit(camera);
		camera.updateProjectionMatrix();
		const corners: Vector3[] = [];
		for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) {
			for (const z of [bounds.min.z, bounds.max.z]) corners.push(new Vector3(x, y, z));
		}
		const ys = corners.map(v => v.clone().project(camera).y);
		const fittedZoom = 1.5 / (Math.max(...ys) - Math.min(...ys));
		let fittedHeight = stage.clientHeight;
		// The HTML card stays 258px wide. Keep the robot's pixel scale stable over
		// the 702–760px desktop stage range so its hands can reach both corners.
		camera.zoom = fittedZoom * 760 / fittedHeight;
		camera.updateProjectionMatrix();
		commit(camera);

		// Area-weighted center and outward normal of the source hand's palm faces.
		const palmLocal = new Vector3(-1.239745, 18.150757, .736891);
		const palmNormal = (hand: any) => new Vector3(.017144, .098892, -.994950)
			.applyNormalMatrix(new Matrix3().getNormalMatrix(hand.matrixWorld));
		const palmPoint = (hand: any) => palmLocal.clone().applyMatrix4(hand.matrixWorld);
		const levelPalm = (hand: any) => {
			// Derive the effective parent from the actual world matrix: this includes
			// Spline's hidden pivot matrix and the mirrored instance's negative scale.
			const parent = new Matrix4().copy(hand.matrixWorld).multiply(new Matrix4().copy(hand.matrix).invert());
			const sourceNormal = new Vector3(.017144, .098892, -.994950).divide(hand.scale).normalize();
			const sourceForward = new Vector3(0, 1, 0).multiply(hand.scale);
			sourceForward.addScaledVector(sourceNormal, -sourceForward.dot(sourceNormal)).normalize();
			const targetNormal = new Vector3(0, 1, 0).applyMatrix3(new Matrix3().setFromMatrix4(parent).transpose()).normalize();
			const targetForward = new Vector3(0, 0, 1).transformDirection(parent.clone().invert());
			targetForward.addScaledVector(targetNormal, -targetForward.dot(targetNormal)).normalize();
			const sourceBasis = new Matrix4().makeBasis(sourceForward, sourceNormal, sourceForward.clone().cross(sourceNormal));
			const targetBasis = new Matrix4().makeBasis(targetForward, targetNormal, targetForward.clone().cross(targetNormal));
			hand.quaternion.setFromRotationMatrix(targetBasis.multiply(sourceBasis.transpose()));
			commit(hand);
		};
		let cardBottom = 0;
		let solvedSize = '';
		let targetPose: { node: any; from: any; to: any }[] = [];
		const solveSupportPose = () => {
			const box = stage.querySelector('.bubble')!.getBoundingClientRect();
			solvedSize = `${stage.clientWidth}:${stage.clientHeight}:${box.width}:${box.height}`;
			for (const pose of targetPose) { pose.node.quaternion.copy(pose.from); commit(pose.node); }
			cardBottom = project(position(head)).y + box.height + 14;
			const hand = hands.find(h => position(h).x > center.x)!;
			const forearm = hand.parent;
			const elbow = forearm.parent;
			const arm = elbow.parent;
			const shoulder = arm.parent;
			const adjustable = [shoulder, arm, elbow, forearm, hand];
			const original = adjustable.map(node => node.rotation.clone());
			const parameters = [
				{ node: shoulder, axis: 'z', min: -.25, max: .65 },
				{ node: arm, axis: 'x', min: -.8, max: .9 },
				{ node: elbow, axis: 'y', min: -.8, max: 1.2 },
				{ node: forearm, axis: 'x', min: -1.5, max: .25 }
			];
			const update = () => { adjustable.forEach(commit); levelPalm(hand); };
			update();
			const objective = () => {
				const p = project(palmPoint(hand));
				let cost = ((p.x - (stage.clientWidth / 2 + box.width / 2 - 10)) ** 2 + (p.y - cardBottom - 3) ** 2) / 12;
				// Prefer the nearest anatomically continuous solution to the authored pose.
				for (let i = 0; i < 4; i++) cost += .3 * adjustable[i].quaternion.angleTo(new adjustable[i].quaternion.constructor().setFromEuler(original[i])) ** 2;
				return cost;
			};
			for (const step of [.25, .12, .06, .025, .01, .004]) {
				for (let pass = 0; pass < 90; pass++) {
					let changed = false;
					for (const param of parameters) {
						const initial = param.node.rotation[param.axis];
						let best = initial;
						let score = objective();
						for (const direction of [-1, 1]) {
							const candidate = Math.max(param.min, Math.min(param.max, initial + direction * step));
							param.node.rotation[param.axis] = candidate;
							update();
							const next = objective();
							if (next < score) { score = next; best = candidate; }
						}
						param.node.rotation[param.axis] = best;
						update();
						changed ||= best !== initial;
					}
					if (!changed) break;
				}
			}
			const solved = adjustable.map(node => node.quaternion.clone());
			// Both arms are instances of the same rig, mirrored by their parent.
			targetPose = hands.flatMap(h => {
				const chain = [h.parent.parent.parent.parent, h.parent.parent.parent, h.parent.parent, h.parent, h];
				return chain.map((node, i) => {
					node.rotation.copy(original[i]); commit(node);
					return { node, from: node.quaternion.clone(), to: solved[i] };
				});
			});
		};

		let visible = false;
		let disposed = false;
		let raf = 0;
		let elapsed = options.skipOpening ? OPENING + CORRECTION : 0;
		let lastTime = 0;
		let held = false;
		let revealed = false;
		let yaw = 0;
		let pitch = 0;
		let debugAt = 0;
		const draw = (now: number) => {
			raf = 0;
			if (disposed) return;
			const dt = lastTime ? Math.min(now - lastTime, 100) : 0;
			lastTime = now;
			const moving = visible && !document.hidden;
			const reduced = options.getReducedMotion();
			if (fittedHeight !== stage.clientHeight) {
				fittedHeight = stage.clientHeight;
				camera.zoom = fittedZoom * 760 / fittedHeight;
				camera.updateProjectionMatrix(); commit(camera);
			}
			if (moving && !held) {
				elapsed = reduced ? OPENING + CORRECTION : Math.min(OPENING + CORRECTION, elapsed + dt);
				if (elapsed <= OPENING || !targetPose.length) motions.forEach(motion => motion.seek(Math.min(OPENING, elapsed)));
				if (elapsed >= OPENING) {
					if (!targetPose.length) solveSupportPose();
					const fraction = Math.min(1, (elapsed - OPENING) / CORRECTION);
					const ease = fraction * fraction * (3 - 2 * fraction);
					for (const pose of targetPose) { pose.node.quaternion.copy(pose.from).slerp(pose.to, ease); commit(pose.node); }
				}
				if (elapsed >= OPENING + CORRECTION) {
					held = true;
					options.onHeld();
				}
			}
			if (!revealed && elapsed >= OPENING + CORRECTION - 450) { revealed = true; options.onReveal?.(); }
			if (targetPose.length) {
				const box = stage.querySelector('.bubble')!.getBoundingClientRect();
				if (`${stage.clientWidth}:${stage.clientHeight}:${box.width}:${box.height}` !== solvedSize) {
					solveSupportPose();
					const fraction = held ? 1 : Math.min(1, (elapsed - OPENING) / CORRECTION);
					for (const pose of targetPose) { pose.node.quaternion.copy(pose.from).slerp(pose.to, fraction * fraction * (3 - 2 * fraction)); commit(pose.node); }
				}
			}
			const a = options.getActive() / 7 * Math.PI * 2 - Math.PI / 2;
			const idle = held && !reduced ? elapsed / 1000 : 0;
			const radius = stage.clientWidth / 2 - 44;
			const headPoint = project(position(head));
			const dx = stage.clientWidth / 2 + Math.cos(a) * radius - headPoint.x;
			const dy = stage.clientHeight / 2 + Math.sin(a) * radius - headPoint.y;
			const targetYaw = Math.atan2(dx, stage.clientWidth * .6) * .78 + Math.sin(idle * 1.1) * .025;
			const targetPitch = Math.max(-.22, Math.min(.3, Math.atan2(dy, stage.clientHeight * .65) * .65)) + Math.sin(idle * .8) * .018;
			const ease = reduced ? 1 : 1 - Math.exp(-dt / 220);
			yaw += (targetYaw - yaw) * ease;
			pitch += (targetPitch - pitch) * ease;
			head.rotation.set(restHead.x + pitch, restHead.y + yaw, restHead.z);
			commit(head);
			if (held && moving) elapsed += dt;
			app._lastTime = now;
			app.render(now);
			const hp = hands.map(hand => project(position(hand)));
			options.onAnchor({ x: stage.clientWidth / 2, y: cardBottom || stage.clientHeight * .51 });
			stage.dataset.robotPhase = held ? 'holding' : elapsed >= OPENING ? 'settling' : elapsed ? 'opening' : 'waiting';
			if (import.meta.env.DEV && now - debugAt > 500) {
				debugAt = now;
				stage.dataset.robotDebug = JSON.stringify({
					elapsed, zoom: camera.zoom, bounds: corners.map(project),
					hands: hp, palms: hands.map(h=>({point:project(palmPoint(h)),normal:palmNormal(h).toArray()})), head: project(position(head)), joints: joints.map(node => ({
						name: node.name, uuid: node.uuid, pos: position(node).toArray(), rot: node.rotation.toArray(),
						box: new Box3().setFromObject(node).getSize(new Vector3()).toArray()
					})), headRotation: head.rotation.toArray()
				});
			}
			if (moving && (!held || !reduced)) raf = requestAnimationFrame(draw);
		};
		const refresh = () => { if (!disposed && !raf) { lastTime = 0; raf = requestAnimationFrame(draw); } };
		const observer = new ResizeObserver(refresh);
		observer.observe(stage);
		const visibility = () => { lastTime = 0; refresh(); };
		document.addEventListener('visibilitychange', visibility);
		options.onReady();
		refresh();
		return {
			setVisible(value: boolean) { visible = value; lastTime = 0; refresh(); },
			refresh,
			dispose() {
				disposed = true;
				cancelAnimationFrame(raf);
				observer.disconnect();
				document.removeEventListener('visibilitychange', visibility);
				motions.forEach(motion => motion.transition.pause());
				app.dispose();
			}
		};
	} catch (error) {
		app.dispose();
		throw error;
	}
}
