import { beforeNavigate } from '$app/navigation';

/**
 * Warn before leaving a page with unsaved edits. Call during component init.
 * Form submissions are allowed through (they are the save).
 */
export function warnOnUnsavedChanges(isDirty: () => boolean) {
	beforeNavigate(({ cancel, type }) => {
		if (!isDirty() || type === 'form') return;
		// Closing the tab/reloading: browsers only allow their own prompt,
		// which `cancel()` triggers. confirm() is ignored there.
		if (type === 'leave') return cancel();
		if (!confirm('You have unsaved changes. Leave anyway?')) cancel();
	});
}
