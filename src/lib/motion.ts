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
			gsap.set('[data-reveal]', { opacity: 1, y: 0, clearProps: 'all' });
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

			/* Staggered groups — children cascade instead of arriving together. */
			gsap.utils.toArray<HTMLElement>('[data-stagger]').forEach((group) => {
				const kids = gsap.utils.toArray<HTMLElement>('[data-reveal]', group);
				if (!kids.length) return;
				kids.forEach((k) => gsap.getTweensOf(k).forEach((tw: gsap.core.Tween) => tw.kill()));
				gsap.set(kids, { opacity: 0, y: 14 });

				const groupAboveFold = group.getBoundingClientRect().top < window.innerHeight * 0.92;
				gsap.to(kids, {
					opacity: 1,
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

	/* Recalculate once fonts land, or triggers fire at the wrong offsets. */
	if ('fonts' in document) document.fonts.ready.then(() => ScrollTrigger.refresh());

	return () => ctx.revert();
}
