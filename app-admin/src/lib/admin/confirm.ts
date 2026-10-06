/**
 * `onsubmit` / `onclick` handler that asks for confirmation and cancels the
 * submit if declined. (Returning `false` from a handler does NOT cancel the
 * event — it has to call preventDefault.)
 *
 *   <form onsubmit={confirmSubmit('Delete this page?')}>
 *   <button formaction="?/delete" onclick={confirmSubmit('Delete this event?')}>
 */
export function confirmSubmit(message: string) {
	return (event: Event) => {
		if (!confirm(message)) event.preventDefault();
	};
}
