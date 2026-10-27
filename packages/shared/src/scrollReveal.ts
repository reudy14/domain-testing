/**
 * Scroll reveal Svelte action — applies a CSS class when the element enters the viewport.
 * Usage: <div use:scrollReveal class="reveal">...</div>
 * The `reveal` class is hidden initially; `reveal-visible` is added on intersection.
 *
 * On a device that can't keep up, the animations are switched off for the rest
 * of the visit (`plain-motion` on <html>, see app.css): one with very few cores
 * or little memory straight away, any other once scrolling is seen to stutter.
 */

const PLAIN = 'plain-motion';
const STORAGE_KEY = 'plain-motion';
/** Scrolled frames to look at before deciding, and how many may run late. */
const SAMPLE_FRAMES = 120;
const LATE_SHARE = 0.1;
/** A frame this long missed at least one refresh of a 60 Hz screen. */
const LATE_MS = 25;

let watching = false;

function usePlainMotion() {
	document.documentElement.classList.add(PLAIN);
	try {
		sessionStorage.setItem(STORAGE_KEY, '1');
	} catch {
		// Storage blocked: decided again on the next page.
	}
}

function weakHardware() {
	const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
	return (navigator.hardwareConcurrency || 8) <= 2 || (memory !== undefined && memory <= 2);
}

/** Times frames while the page scrolls; too many late ones switch the animations off. */
function watchScrolling() {
	if (watching || typeof window === 'undefined') return;
	watching = true;

	let stored = false;
	try {
		stored = sessionStorage.getItem(STORAGE_KEY) === '1';
	} catch {
		// Storage blocked: measure instead.
	}
	if (stored || weakHardware()) {
		usePlainMotion();
		return;
	}

	let frames = 0;
	let late = 0;
	let last = 0;
	let lastScroll = 0;
	let running = false;

	function tick(now: number) {
		if (last) {
			frames++;
			if (now - last > LATE_MS) late++;
		}
		last = now;
		if (frames >= SAMPLE_FRAMES) {
			window.removeEventListener('scroll', onScroll);
			if (late / frames > LATE_SHARE) usePlainMotion();
			return;
		}
		// Only frames while scrolling count; stop shortly after it ends.
		if (now - lastScroll < 300) requestAnimationFrame(tick);
		else running = false;
	}

	function onScroll() {
		lastScroll = performance.now();
		if (running) return;
		running = true;
		last = 0;
		requestAnimationFrame(tick);
	}

	window.addEventListener('scroll', onScroll, { passive: true });
}

export function scrollReveal(node: HTMLElement, delay: number = 0) {
	watchScrolling();

	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting) {
					if (delay > 0) {
						node.style.transitionDelay = `${delay}s`;
					}
					node.classList.add('reveal-visible');
					observer.unobserve(node);
				}
			}
		},
		{ threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
	);

	observer.observe(node);

	return {
		destroy() {
			observer.disconnect();
		}
	};
}
