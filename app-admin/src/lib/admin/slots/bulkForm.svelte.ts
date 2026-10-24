import { applyAction } from '$app/forms';
import type { SubmitFunction } from '@sveltejs/kit';
import type { BulkResult } from '$lib/slots';

/**
 * State for a /slots bulk form (generate, copy, clear), which is always
 * submitted twice: first `intent=preview` (the server says what it would
 * do), then `intent=create` to do it. The preview only counts while the
 * inputs are unchanged — `inputsKey` is a snapshot of them — so the admin
 * can't confirm numbers for a form they have since edited.
 *
 * Previews and errors stay inside the modal; a finished run closes it and
 * reloads the page, whose `form.bulk` then shows the outcome.
 */
export function bulkForm(inputsKey: () => string, close: () => void) {
	let preview = $state<BulkResult | null>(null);
	let previewKey = $state('');
	let error = $state('');
	let busy = $state(false);

	const submit: SubmitFunction = () => {
		const key = inputsKey();
		busy = true;
		error = '';
		return async ({ result, update }) => {
			busy = false;
			if (result.type === 'success' && result.data?.bulk?.intent === 'preview') {
				preview = result.data.bulk as BulkResult;
				previewKey = key;
			} else if (result.type === 'failure') {
				error = String(result.data?.message || 'Something went wrong.');
			} else if (result.type === 'success') {
				preview = null;
				close();
				await update({ reset: false });
			} else {
				await applyAction(result);
			}
		};
	};

	return {
		get preview() {
			return preview && previewKey === inputsKey() ? preview : null;
		},
		get error() {
			return error;
		},
		get busy() {
			return busy;
		},
		reset() {
			preview = null;
			error = '';
		},
		submit
	};
}

export type BulkForm = ReturnType<typeof bulkForm>;
