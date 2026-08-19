<script lang="ts">
	import type { ContentBlock, CheckoutBlockData } from '$lib/types';

	let {
		block,
		onChange = (b: ContentBlock) => {}
	} = $props<{
		block: ContentBlock;
		onChange?: (b: ContentBlock) => void;
	}>();

	function updateData(patch: Partial<CheckoutBlockData>) {
		onChange({ ...block, data: { ...block.data, ...patch } });
	}
</script>

<div class="space-y-4">
	<label class="form-control w-full">
		<div class="label"><span class="label-text">Title</span></div>
		<input class="input input-bordered w-full" value={block.data.title || ''} oninput={(e) => updateData({ title: e.currentTarget.value })} />
	</label>
	<label class="form-control w-full">
		<div class="label"><span class="label-text">Heading</span></div>
		<input class="input input-bordered w-full" value={block.data.heading || ''} oninput={(e) => updateData({ heading: e.currentTarget.value })} />
	</label>
	<label class="form-control w-full">
		<div class="label"><span class="label-text">Notes label</span></div>
		<input class="input input-bordered w-full" placeholder="Notes or special requests" value={block.data.notesLabel || ''} oninput={(e) => updateData({ notesLabel: e.currentTarget.value })} />
	</label>
	<p class="text-sm text-base-content/60">Customer fields (name, email, phone, notes) and the payment flow are fixed and cannot be changed here.</p>
</div>
