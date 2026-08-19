<script lang="ts">
	let { data } = $props<{ data: Record<string, any> }>();

	const testimonials = data.items || [
		{ text: 'Placeholder testimonial: the first class was wonderful.', title: 'Customer one' },
		{ text: 'Placeholder testimonial: friendly teachers and great music.', title: 'Customer two' },
		{ text: 'Placeholder testimonial: I look forward to it every week.', title: 'Customer three' },
		{ text: 'Placeholder testimonial: I never thought I could learn this.', title: 'Customer four' }
	];

	const title = data.title || 'What people say';

	// Simple state for carousel
	let currentIndex = $state(0);
	const totalSlides = testimonials.length;

	function next() {
		currentIndex = (currentIndex + 1) % totalSlides;
	}

	function prev() {
		currentIndex = (currentIndex - 1 + totalSlides) % totalSlides;
	}
</script>

<div class="relative min-h-[400px]">
	<div class="flex flex-col items-center px-4 py-12 min-h-[400px]">
		<!-- Title -->
		<h2 class="text-fg-heading text-2xl md:text-3xl font-light tracking-wide">
			{title}
		</h2>

		<!-- Testimonial carousel - fills remaining space and centers content vertically -->
		<div class="w-full max-w-3xl flex-1 flex items-center justify-center">
			<!-- Slides are stacked in a grid so the carousel keeps the height of the tallest testimonial. -->
			<div class="grid px-8 text-center w-full pt-4 md:pt-8">
				{#each testimonials as testimonial, i}
					<div class="col-start-1 row-start-1 transition-opacity duration-300 {i === currentIndex ? 'opacity-100' : 'pointer-events-none opacity-0'}" aria-hidden={i !== currentIndex}>
						<p class="text-fg-body/85 text-lg md:text-xl font-light leading-relaxed mb-8">
							"{testimonial.text}"
						</p>
						<p class="text-fg-subheading font-medium tracking-wider">
							— {testimonial.title}
						</p>
					</div>
				{/each}
			</div>
		</div>

		<!-- Navigation arrows -->
		<div class="flex justify-center items-center gap-8">
			<button
					type="button"
					onclick={prev}
					class="w-10 h-10 rounded-full flex items-center justify-center transition-colors hover:bg-[rgba(255,236,224,1)] hover:text-[#93384a] bg-[rgba(255,219,197,0.8)]"
					aria-label="Previous slide"
				>
					<svg viewBox="0 0 7.3 13" class="w-2 h-3" fill="none" stroke="currentColor" stroke-width="1.5">
						<polyline points="6.5,0.5 1.5,6.5 6.5,12.5" stroke-linecap="butt" stroke-linejoin="miter"/>
					</svg>
			</button>

				<!-- Dots/bullets -->
            <div class="flex text-fg-heading gap-3">
                {#each testimonials as _, i}
                    <button
                        type="button"
                        class="w-2.5 h-2.5 rounded-full border-2 transition-colors {i === currentIndex ? 'bg-current' : 'border-current'}"
                        aria-label="Go to slide {i + 1}"
                        onclick={() => (currentIndex = i)}
                    ></button>
                {/each}
            </div>

            <button
                type="button"
                onclick={next}
                class="w-10 h-10 rounded-full flex items-center justify-center transition-colors hover:bg-[rgba(255,236,224,1)] hover:text-[#93384a] bg-[rgba(255,219,197,0.8)]"
                aria-label="Next slide"
            >
                <svg viewBox="0 0 7.3 13" class="w-2 h-3" fill="none" stroke="currentColor" stroke-width="1.5">
					<polyline points="0.5,0.5 5.5,6.5 0.5,12.5" stroke-linecap="butt" stroke-linejoin="miter"/>
                </svg>
            </button>
        </div>
    </div>
</div>