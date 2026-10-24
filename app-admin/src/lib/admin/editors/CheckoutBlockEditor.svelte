<script lang="ts">
	import { DEFAULT_NOTES_HINT, DEFAULT_PRIVACY_NOTICE, type ContentBlock, type CheckoutBlockData } from '$lib/types';

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
	<label class="fieldset">
		<span class="fieldset-legend">Title</span>
		<input class="input w-full" value={block.data.title || ''} oninput={(e) => updateData({ title: e.currentTarget.value })} />
	</label>
	<label class="fieldset">
		<span class="fieldset-legend">Heading</span>
		<input class="input w-full" value={block.data.heading || ''} oninput={(e) => updateData({ heading: e.currentTarget.value })} />
	</label>
	<label class="fieldset">
		<span class="fieldset-legend">Notes label</span>
		<input class="input w-full" placeholder="Notes or special requests" value={block.data.notesLabel || ''} oninput={(e) => updateData({ notesLabel: e.currentTarget.value })} />
	</label>
	<label class="fieldset">
		<span class="fieldset-legend">Notes hint</span>
		<textarea class="textarea w-full" rows="2" placeholder={DEFAULT_NOTES_HINT} value={block.data.notesHint || ''} oninput={(e) => updateData({ notesHint: e.currentTarget.value })}></textarea>
		<span class="label whitespace-normal">Shown under the notes field. Health details are sensitive data under GDPR — keep asking for them in person unless you have a lawful basis to collect them online.</span>
	</label>
	<label class="fieldset">
		<span class="fieldset-legend">Privacy notice</span>
		<textarea class="textarea w-full" rows="2" placeholder={DEFAULT_PRIVACY_NOTICE} value={block.data.privacyNotice || ''} oninput={(e) => updateData({ privacyNotice: e.currentTarget.value })}></textarea>
		<span class="label whitespace-normal">Shown above the Pay button, followed by a link to the privacy policy page chosen in Site design → Footer.</span>
	</label>
	<p class="text-sm text-base-content/60">Customer fields (name, email, phone, notes) and the payment flow are fixed and cannot be changed here.</p>
</div>
