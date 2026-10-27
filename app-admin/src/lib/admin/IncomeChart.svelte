<script lang="ts">
	// Income per month as bars, one series (so no legend: the section title names
	// it). The month-by-month table below it on the dashboard is its table view.
	// Drawn at the box's real pixel width so labels stay readable on a phone.

	/** `label` goes under the bar; `name` (e.g. "October 2026") heads the tooltip. */
	type Month = { month: string; label: string; name: string; income: number; orders: number };
	let {
		months,
		format,
		tickFormat = format,
		current = ''
	}: { months: Month[]; format: (amount: number) => string; tickFormat?: (amount: number) => string; current?: string } = $props();

	let width = $state(600);
	const height = 220;
	const pad = { top: 12, right: 8, bottom: 28, left: 64 };
	let plotWidth = $derived(Math.max(width - pad.left - pad.right, 100));
	const plotHeight = height - pad.top - pad.bottom;

	// A 1-2-5 step giving about four gridlines.
	let ticks = $derived.by(() => {
		const max = Math.max(...months.map((m) => m.income), 0);
		if (max <= 0) return [0];
		const rough = max / 4;
		const magnitude = 10 ** Math.floor(Math.log10(rough));
		const step = [1, 2, 5, 10].map((n) => n * magnitude).find((n) => n >= rough)!;
		return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step);
	});
	let top = $derived(ticks.at(-1) || 1);
	let slot = $derived(plotWidth / Math.max(months.length, 1));
	// Thin bars: at most 28px, with the gap between them clearly wider than 2px.
	let barWidth = $derived(Math.min(28, slot * 0.6));
	const y = (value: number) => pad.top + plotHeight - (value / top) * plotHeight;

	/** A bar with 4px rounded top corners, square on the baseline. */
	function barPath(x: number, value: number) {
		const h = (value / top) * plotHeight;
		if (h <= 0) return '';
		const r = Math.min(4, h, barWidth / 2);
		const yTop = pad.top + plotHeight - h;
		const base = pad.top + plotHeight;
		return `M${x},${base}V${yTop + r}Q${x},${yTop} ${x + r},${yTop}H${x + barWidth - r}Q${x + barWidth},${yTop} ${x + barWidth},${yTop + r}V${base}Z`;
	}

	let hovered = $state<number | null>(null);
	// Every month labelled when there's room, else every other one (current month always).
	let labelEvery = $derived(slot < 40 ? 2 : 1);
</script>

<div class="relative" bind:clientWidth={width}>
	<svg {width} {height} role="img" aria-label="Income per month, last {months.length} months. The table below lists the figures.">
		{#each ticks as tick (tick)}
			<line x1={pad.left} x2={pad.left + plotWidth} y1={y(tick)} y2={y(tick)} class="stroke-base-content/10" stroke-width="1" />
			<text x={pad.left - 8} y={y(tick)} dy="0.32em" text-anchor="end" class="fill-base-content/60 text-[11px] tabular-nums">{tickFormat(tick)}</text>
		{/each}
		{#each months as m, i (m.month)}
			{@const x = pad.left + i * slot + (slot - barWidth) / 2}
			<path d={barPath(x, m.income)} class={hovered === null || hovered === i ? 'fill-primary' : 'fill-primary/40'} />
			{#if i % labelEvery === (months.length - 1) % labelEvery || m.month === current}
				<text x={x + barWidth / 2} y={height - 8} text-anchor="middle" class="text-[11px] {m.month === current ? 'fill-base-content font-semibold' : 'fill-base-content/60'}">{m.label}</text>
			{/if}
			<!-- Hit target: the whole column, much bigger than the bar. -->
			<rect
				x={pad.left + i * slot}
				y={pad.top}
				width={slot}
				height={plotHeight}
				fill="transparent"
				role="presentation"
				onpointerenter={() => (hovered = i)}
				onpointerleave={() => (hovered = null)}
			/>
		{/each}
	</svg>
	{#if hovered !== null}
		{@const m = months[hovered]}
		{@const left = Math.min(Math.max(pad.left + hovered * slot + slot / 2, 70), width - 70)}
		<div class="pointer-events-none absolute -translate-x-1/2 whitespace-nowrap rounded-box bg-base-100 px-3 py-2 text-sm shadow-lg ring-1 ring-base-300" style="left: {left}px; top: {Math.max(y(m.income) - 64, 0)}px">
			<p class="font-semibold">{m.name}</p>
			<p class="tabular-nums">{format(m.income)} · {m.orders} {m.orders === 1 ? 'order' : 'orders'}</p>
		</div>
	{/if}
</div>
