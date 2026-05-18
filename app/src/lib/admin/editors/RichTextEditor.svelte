<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';

	let { value = '', onChange = (html: string) => {} } = $props<{ value?: string; onChange?: (html: string) => void }>();
	let editorEl: HTMLDivElement | undefined = $state();
	let mounted = $state(false);

	onMount(() => {
		mounted = true;
		if (editorEl) {
			editorEl.innerHTML = value || '';
		}
	});

	function exec(cmd: string, val?: string) {
		if (!browser) return;
		editorEl?.focus();
		document.execCommand(cmd, false, val);
		emit();
	}

	function emit() {
		if (editorEl) onChange(editorEl.innerHTML);
	}

	function setLink() {
		const url = prompt('Link URL', 'https://');
		if (url) exec('createLink', url);
	}

	function handleInput() {
		emit();
	}
</script>

{#if mounted}
	<div class="rounded-box border border-base-300 bg-base-100">
		<div class="flex flex-wrap gap-2 border-b border-base-300 p-2">
			<button class="btn btn-xs" onclick={() => exec('bold')} type="button"><b>B</b></button>
			<button class="btn btn-xs" onclick={() => exec('italic')} type="button"><i>I</i></button>
			<button class="btn btn-xs" onclick={() => exec('formatBlock', '<h2>')} type="button">H2</button>
			<button class="btn btn-xs" onclick={() => exec('formatBlock', '<h3>')} type="button">H3</button>
			<button class="btn btn-xs" onclick={() => exec('insertUnorderedList')} type="button">List</button>
			<button class="btn btn-xs" onclick={setLink} type="button">Link</button>
		</div>
		<div
			bind:this={editorEl}
			contenteditable
			role="textbox"
			aria-multiline="true"
			class="min-h-40 p-4 outline-none"
			oninput={handleInput}
			onkeydown={(e) => { if (e.key === 'Tab') { e.preventDefault(); exec('insertHTML', '&emsp;'); } }}
		></div>
	</div>
{:else}
	<div class="rounded-box border border-base-300 bg-base-100 p-4 text-base-content/50">Loading editor…</div>
{/if}
