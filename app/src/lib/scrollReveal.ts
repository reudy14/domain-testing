/**
 * Scroll reveal Svelte action — applies a CSS class when the element enters the viewport.
 * Usage: <div use:scrollReveal class="reveal">...</div>
 * The `reveal` class is hidden initially; `reveal-visible` is added on intersection.
 */

export function scrollReveal(node: HTMLElement, delay: number = 0) {
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