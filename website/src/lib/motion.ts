import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * Scroll choreography. Everything here is progressive enhancement:
 * content is fully visible and readable with JS disabled or motion reduced.
 */
export function initMotion(): () => void {
	if (typeof window === 'undefined') return () => {};

	gsap.registerPlugin(ScrollTrigger);

	/* If anything below throws, the caller drops the `js` class and CSS reveals
	   everything — content must never be permanently invisible. */
	const ctx = gsap.context(() => {
		const mm = gsap.matchMedia();

		/* Reduced motion: snap everything to its final readable state, no triggers. */
		mm.add('(prefers-reduced-motion: reduce)', () => {
			gsap.set('[data-reveal], [data-word], [data-hero-after], [data-pop]', { opacity: 1, y: 0, clearProps: 'all' });
		});

		mm.add('(prefers-reduced-motion: no-preference)', () => {
			/* Generic reveal — small y offset so it reads as a fade, not a slide.
			   Anything already on screen at load animates in immediately: on a
			   multi-page site there is no scroll to wait for, and a heading that
			   sits invisible until the user scrolls is a broken page. */
			const fold = window.innerHeight * 0.92;
			let entranceIndex = 0;

			gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((el) => {
				const aboveFold = el.getBoundingClientRect().top < fold;

				if (aboveFold) {
					gsap.to(el, {
						opacity: 1,
						y: 0,
						duration: 0.62,
						ease: 'power2.out',
						delay: 0.05 + entranceIndex++ * 0.06
					});
					return;
				}

				gsap.to(el, {
					opacity: 1,
					y: 0,
					duration: 0.62,
					ease: 'power2.out',
					scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none none' }
				});
			});

			/* Staggered groups — children cascade instead of arriving together.
			   data-stagger="x" brings them in from the right (a sideways gallery). */
			gsap.utils.toArray<HTMLElement>('[data-stagger]').forEach((group) => {
				const kids = gsap.utils.toArray<HTMLElement>('[data-reveal]', group);
				if (!kids.length) return;
				kids.forEach((k) => gsap.getTweensOf(k).forEach((tw: gsap.core.Tween) => tw.kill()));
				const sideways = group.dataset.stagger === 'x';
				gsap.set(kids, sideways ? { opacity: 0, x: 70, y: 0 } : { opacity: 0, y: 14 });

				const groupAboveFold = group.getBoundingClientRect().top < window.innerHeight * 0.92;
				gsap.to(kids, {
					opacity: 1,
					x: 0,
					y: 0,
					duration: 0.55,
					ease: 'power2.out',
					stagger: 0.075,
					...(groupAboveFold
						? { delay: 0.25 }
						: {
								scrollTrigger: {
									trigger: group,
									start: 'top 85%',
									toggleActions: 'play none none none'
								}
							})
				});
			});

			/* Hero headline: word-level rise. Short copy only — never paragraphs. */
			gsap.utils.toArray<HTMLElement>('[data-rise] .word-inner').forEach((w, i) => {
				gsap.from(w, {
					yPercent: 108,
					duration: 0.9,
					ease: 'expo.out',
					delay: 0.12 + i * 0.045
				});
			});

			/* ---- Home slides ---- */

			/* Hero: the headline's words come up out of a blur one after another,
			   the statement follows, and the whole block sinks back as you scroll on. */
			const hero = document.querySelector<HTMLElement>('[data-hero]');
			if (hero) {
				const words = gsap.utils.toArray<HTMLElement>('[data-word]', hero);
				gsap.fromTo(
					words,
					{ opacity: 0, yPercent: 45, filter: 'blur(12px)' },
					{ opacity: 1, yPercent: 0, filter: 'blur(0px)', duration: 1.1, ease: 'expo.out', stagger: 0.08, delay: 0.1, clearProps: 'filter' }
				);
				gsap.fromTo(
					'[data-hero-after]',
					{ opacity: 0, y: 18 },
					{ opacity: 1, y: 0, duration: 0.9, ease: 'power2.out', delay: 0.35 + words.length * 0.08 }
				);
				const slide = hero.closest('section');
				gsap.to(hero, {
					scale: 0.9,
					opacity: 0,
					y: () => -window.innerHeight * 0.06,
					ease: 'none',
					scrollTrigger: { trigger: slide, start: 'top top', end: 'bottom 20%', scrub: true, invalidateOnRefresh: true }
				});
				gsap.to('[data-cue]', { opacity: 0, ease: 'none', scrollTrigger: { trigger: slide, start: 'top top', end: '+=160', scrub: true } });
			}

			/* Numbers count up from zero when they come into view. */
			gsap.utils.toArray<HTMLElement>('[data-count]').forEach((el) => {
				const end = Number(el.dataset.count);
				if (!Number.isFinite(end) || end <= 0) return;
				const box = { v: 0 };
				el.textContent = '0';
				gsap.to(box, {
					v: end,
					duration: 1.8,
					ease: 'power3.out',
					onUpdate: () => {
						el.textContent = String(Math.round(box.v));
					},
					scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none none' }
				});
			});

			/* The mascot springs up when its slide arrives. */
			gsap.utils.toArray<HTMLElement>('[data-pop]').forEach((el) => {
				gsap.fromTo(
					el,
					{ opacity: 0, scale: 0.55, rotate: -12, y: 40 },
					{
						opacity: 1,
						scale: 1,
						rotate: 0,
						y: 0,
						duration: 1.2,
						ease: 'elastic.out(1, 0.55)',
						scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none none' }
					}
				);
			});

			/* Zoom: the block grows into place, tied to the scroll, as its slide comes up. */
			gsap.utils.toArray<HTMLElement>('[data-zoom]').forEach((el) => {
				gsap.fromTo(
					el,
					{ scale: 0.82, rotate: -5, y: 80, opacity: 0.15 },
					{ scale: 1, rotate: 0, y: 0, opacity: 1, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'top 40%', scrub: 0.5 } }
				);
			});

			/* Section index numerals scrub with the scroll — quiet spatial anchor. */
			gsap.utils.toArray<HTMLElement>('[data-spine]').forEach((el) => {
				gsap.fromTo(
					el,
					{ opacity: 0.25 },
					{
						opacity: 1,
						ease: 'none',
						scrollTrigger: { trigger: el.closest('section'), start: 'top 70%', end: 'top 22%', scrub: 0.6 }
					}
				);
			});
		});
	});

	/* Recalculate once fonts land, and again once the page's own entrance
	   (the <main> fly-in) has settled, or triggers fire at the wrong offsets. */
	if ('fonts' in document) document.fonts.ready.then(() => ScrollTrigger.refresh());
	const settle = window.setTimeout(() => ScrollTrigger.refresh(), 600);

	return () => {
		window.clearTimeout(settle);
		ctx.revert();
	};
}
