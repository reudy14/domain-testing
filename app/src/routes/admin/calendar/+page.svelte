<script lang="ts">
	import { addMonths, createCalendarMonth, eventOverlapsDay, formatEventDateRange, sortEvents, toDateInput, toDatetimeInput } from '$lib/calendar';
	import type { CalendarEventRecord } from '$lib/types';

	let { data, form } = $props();
	let events = $derived(sortEvents(data.events || []));
	let viewDate = $state(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
	let showEditor = $state(false);
	let draft = $state<CalendarEventRecord>({
		id: '',
		name: '',
		start: toDateInput(new Date().toISOString()),
		end: '',
		description: '',
		color: '#8a9a7b',
		link: '',
		categories: [],
		published: false,
		allDay: true
	});
	let categoryText = $state('');

	const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	let month = $derived(createCalendarMonth(viewDate));
	let action = $derived(draft.id ? '?/update' : '?/create');
	let dateInputType = $derived(draft.allDay ? 'date' : 'datetime-local');
	let startValue = $derived(draft.allDay ? toDateInput(draft.start) : toDatetimeInput(draft.start));
	let endValue = $derived(draft.allDay ? toDateInput(draft.end) : toDatetimeInput(draft.end));
	let allCategories = $derived([...new Set(events.flatMap((event) => event.categories || []))].sort((a, b) => a.localeCompare(b)));

	function eventsForDay(date: Date) {
		return events.filter((event) => eventOverlapsDay(event, date));
	}

	function emptyDraft(start = toDateInput(new Date().toISOString())): CalendarEventRecord {
		return {
			id: '',
			name: '',
			start,
			end: '',
			description: '',
			color: '#8a9a7b',
			link: '',
			categories: [],
			published: false,
			allDay: true
		};
	}

	function createEvent(start?: string) {
		draft = emptyDraft(start);
		categoryText = '';
		showEditor = true;
	}

	function editEvent(event: CalendarEventRecord) {
		draft = structuredClone(event);
		categoryText = event.categories.join(', ');
		showEditor = true;
	}

	function previousMonth() {
		viewDate = addMonths(viewDate, -1);
	}

	function nextMonth() {
		viewDate = addMonths(viewDate, 1);
	}

	function addCategory(category: string) {
		if (!category || draft.categories.includes(category)) return;
		draft = { ...draft, categories: [...draft.categories, category] };
		categoryText = draft.categories.join(', ');
	}

	function removeCategory(category: string) {
		draft = { ...draft, categories: draft.categories.filter((item) => item !== category) };
		categoryText = draft.categories.join(', ');
	}

	function syncCategoryText(value: string) {
		categoryText = value;
		draft = { ...draft, categories: value.split(',').map((item) => item.trim()).filter(Boolean) };
	}
</script>

<svelte:head><title>Calendar | CMS</title></svelte:head>

<div class="space-y-6">
	<div class="flex flex-col justify-between gap-4 md:flex-row md:items-end">
		<div>
			<h1 class="text-3xl font-bold">Calendar</h1>
			<p class="text-base-content/60">Create and manage events used by Upcoming Calendar blocks.</p>
		</div>
		<button class="btn btn-primary" type="button" onclick={() => createEvent()}>Create event</button>
	</div>

	{#if form?.message}<div class="alert alert-error">{form.message}</div>{/if}

	<div class="rounded-box bg-base-100 p-5 shadow">
		<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
			<button class="btn btn-outline btn-sm" type="button" onclick={previousMonth}>← Previous</button>
			<h2 class="text-2xl font-bold">{month.label}</h2>
			<button class="btn btn-outline btn-sm" type="button" onclick={nextMonth}>Next →</button>
		</div>

		<div class="grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase text-base-content/50">
			{#each weekdays as weekday}<div>{weekday}</div>{/each}
		</div>
		<div class="mt-2 grid grid-cols-7 gap-2">
			{#each month.days as day}
				<div class="min-h-32 rounded-box border border-base-300 bg-base-200/60 p-2" class:opacity-40={!day.inMonth}>
					<button class="btn btn-ghost btn-xs mb-1" class:btn-primary={day.isToday} type="button" onclick={() => createEvent(day.dateKey)}>{day.dayNumber}</button>
					<div class="space-y-1">
						{#each eventsForDay(day.date) as event}
							<button class="w-full rounded-lg px-2 py-1 text-left text-xs font-semibold text-white shadow" style={`background:${event.color || '#8a9a7b'}`} type="button" onclick={() => editEvent(event)}>
								<span class="block truncate">{event.name}</span>
								<span class="block truncate text-[0.65rem] opacity-80">{formatEventDateRange(event)}</span>
							</button>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	</div>

	<div class="rounded-box bg-base-100 p-5 shadow">
		<h2 class="mb-4 text-xl font-bold">All events</h2>
		<div class="overflow-x-auto">
			<table class="table">
				<thead><tr><th>Name</th><th>Date</th><th>Categories</th><th>Status</th><th></th></tr></thead>
				<tbody>
					{#each events as event}
						<tr>
							<td><span class="mr-2 inline-block h-3 w-3 rounded-full" style={`background:${event.color}`}></span>{event.name}</td>
							<td>{formatEventDateRange(event)}</td>
							<td>{event.categories.join(', ')}</td>
							<td><span class="badge" class:badge-success={event.published}>{event.published ? 'Published' : 'Draft'}</span></td>
							<td class="text-right"><button class="btn btn-sm" type="button" onclick={() => editEvent(event)}>Edit</button></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</div>

{#if showEditor}
	<div class="fixed inset-0 z-50 bg-black/50 p-4">
		<div class="mx-auto max-h-full max-w-2xl overflow-auto rounded-box bg-base-100 p-6 shadow-xl">
			<div class="mb-4 flex items-center justify-between gap-3">
				<h2 class="text-2xl font-bold">{draft.id ? 'Edit event' : 'Create event'}</h2>
				<button class="btn btn-ghost btn-sm" type="button" onclick={() => (showEditor = false)}>Close</button>
			</div>

			<form method="POST" action={action} class="space-y-4">
				<input type="hidden" name="id" value={draft.id} />
				<input type="hidden" name="allDay" value={draft.allDay ? 'true' : 'false'} />
				<input type="hidden" name="published" value={draft.published ? 'true' : 'false'} />
				<input type="hidden" name="categories" value={categoryText} />

				<label class="form-control w-full">
					<div class="label"><span class="label-text">Name</span></div>
					<input class="input input-bordered w-full" name="name" required bind:value={draft.name} />
				</label>

				<div class="grid gap-4 md:grid-cols-2">
					<label class="form-control w-full">
						<div class="label"><span class="label-text">Start</span></div>
						<input class="input input-bordered w-full" type={dateInputType} name="start" required value={startValue} oninput={(e) => (draft = { ...draft, start: e.currentTarget.value })} />
					</label>
					<label class="form-control w-full">
						<div class="label"><span class="label-text">End optional</span></div>
						<input class="input input-bordered w-full" type={dateInputType} name="end" value={endValue} oninput={(e) => (draft = { ...draft, end: e.currentTarget.value })} />
					</label>
				</div>

				<div class="flex flex-wrap gap-4">
					<label class="label cursor-pointer justify-start gap-3">
						<input class="toggle toggle-primary" type="checkbox" bind:checked={draft.allDay} />
						<span class="label-text">All-day event</span>
					</label>
					<label class="label cursor-pointer justify-start gap-3">
						<input class="toggle toggle-success" type="checkbox" bind:checked={draft.published} />
						<span class="label-text">Published</span>
					</label>
				</div>

				<label class="form-control w-full">
					<div class="label"><span class="label-text">Description</span></div>
					<textarea class="textarea textarea-bordered min-h-28" name="description" bind:value={draft.description}></textarea>
				</label>

				<div class="grid gap-4 md:grid-cols-2">
					<label class="form-control w-full">
						<div class="label"><span class="label-text">Color</span></div>
						<div class="flex gap-2">
							<input class="input input-bordered h-12 w-14 p-1" type="color" bind:value={draft.color} />
							<input class="input input-bordered flex-1" name="color" bind:value={draft.color} />
						</div>
					</label>
					<label class="form-control w-full">
						<div class="label"><span class="label-text">Link optional</span></div>
						<input class="input input-bordered w-full" name="link" placeholder="/page or https://..." bind:value={draft.link} />
					</label>
				</div>

				<div class="rounded-box border border-base-300 p-4">
					<label class="form-control w-full">
						<div class="label"><span class="label-text">Categories comma-separated</span></div>
						<input class="input input-bordered w-full" value={categoryText} oninput={(e) => syncCategoryText(e.currentTarget.value)} />
					</label>
					{#if allCategories.length}
						<div class="mt-3 flex flex-wrap gap-2">
							{#each allCategories as category}
								<button class="btn btn-xs" class:btn-primary={draft.categories.includes(category)} type="button" onclick={() => draft.categories.includes(category) ? removeCategory(category) : addCategory(category)}>{category}</button>
							{/each}
						</div>
					{/if}
				</div>

				<div class="flex justify-between gap-2 pt-2">
					{#if draft.id}
						<button class="btn btn-error" type="submit" formaction="?/delete">Delete</button>
					{:else}
						<span></span>
					{/if}
					<div class="flex gap-2">
						<button class="btn" type="button" onclick={() => (showEditor = false)}>Cancel</button>
						<button class="btn btn-primary" type="submit">Save event</button>
					</div>
				</div>
			</form>
		</div>
	</div>
{/if}
