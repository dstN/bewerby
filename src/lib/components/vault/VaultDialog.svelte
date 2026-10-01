<script lang="ts">
	import { onMount, type Snippet } from 'svelte';

	/**
	 * The frame both vault dialogs share: native modal <dialog>, focus
	 * returned on close, and the hand-built Tab wrap from ApplicationModal -
	 * Chromium's native containment lets Tab escape to the browser chrome
	 * (see #18). Form styles live here too, so setup and unlock look the same.
	 */
	let {
		title,
		closeLabel,
		onclose,
		children
	}: { title: string; closeLabel: string; onclose: () => void; children: Snippet } = $props();

	const uid = $props.id();
	const titleId = `vault-dialog-title-${uid}`;
	let dialogEl: HTMLDialogElement;

	const FOCUSABLE_SELECTOR =
		'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

	onMount(() => {
		const previouslyFocused = document.activeElement as HTMLElement | null;
		const previousBodyOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		dialogEl.showModal();
		return () => {
			document.body.style.overflow = previousBodyOverflow;
			previouslyFocused?.focus?.();
		};
	});

	function handleKeydown(event: KeyboardEvent) {
		if (event.key !== 'Tab') return;
		const focusable = Array.from(dialogEl.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
			(el) => el.offsetParent !== null || el === document.activeElement
		);
		if (focusable.length === 0) return;
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	function close() {
		dialogEl.close();
		onclose();
	}
</script>

<dialog
	bind:this={dialogEl}
	class="vault-dialog"
	aria-labelledby={titleId}
	onkeydown={handleKeydown}
	oncancel={close}
>
	<header>
		<h2 id={titleId}>{title}</h2>
		<button type="button" class="btn-icon-close" onclick={close} aria-label={closeLabel}>
			<span aria-hidden="true">×</span>
		</button>
	</header>
	<div class="vault-body">
		{@render children()}
	</div>
</dialog>

<style>
	.vault-dialog {
		width: min(560px, calc(100vw - 32px));
		max-height: calc(100dvh - 48px);
		padding: 0;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-xl);
		background-color: var(--surface-0);
		color: var(--text-primary);
		box-shadow: var(--shadow-lg);
	}

	.vault-dialog::backdrop {
		background-color: rgba(15, 23, 42, 0.45);
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 16px 20px;
		border-bottom: 1px solid var(--border-default);
	}

	header h2 {
		margin: 0;
		font-size: 16px;
		font-weight: 700;
	}

	.btn-icon-close {
		width: 32px;
		height: 32px;
		border: none;
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--text-secondary);
		font-size: 20px;
		line-height: 1;
		cursor: pointer;
	}

	.btn-icon-close:hover {
		background-color: var(--surface-2);
		color: var(--text-primary);
	}

	.vault-body {
		padding: 16px 20px 20px;
		overflow-y: auto;
		max-height: calc(100dvh - 120px);
	}

	.vault-body :global(form) {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.vault-body :global(p) {
		margin: 0;
		font-size: 13px;
		line-height: 1.6;
		color: var(--text-secondary);
	}

	.vault-body :global(.field) {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.vault-body :global(.field > label),
	.vault-body :global(legend) {
		font-size: 12px;
		font-weight: 600;
		color: var(--text-secondary);
	}

	.vault-body :global(input[type='password']),
	.vault-body :global(input[type='text']) {
		height: 36px;
		padding: 8px 12px;
		box-sizing: border-box;
		background-color: var(--surface-0);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		color: var(--text-primary);
		font-family: inherit;
		font-size: 14px;
	}

	.vault-body :global(input:focus) {
		border-color: var(--color-accent-500);
	}

	.vault-body :global(fieldset) {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin: 0;
		padding: 10px 12px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
	}

	.vault-body :global(.choice) {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		font-size: 13px;
		line-height: 1.5;
		color: var(--text-primary);
		cursor: pointer;
	}

	.vault-body :global(.choice input) {
		margin-top: 3px;
	}

	.vault-body :global(.hint) {
		font-size: 12px;
		line-height: 1.5;
		color: var(--text-secondary);
	}

	.vault-body :global(.error) {
		padding: 8px 10px;
		border: 1px solid var(--status-danger-border);
		border-radius: var(--radius-md);
		background-color: var(--status-danger-bg);
		color: var(--color-danger);
		font-size: 12px;
		line-height: 1.5;
	}

	.vault-body :global(.actions) {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 8px;
	}

	.vault-body :global(.btn-primary),
	.vault-body :global(.btn-flat) {
		padding: 8px 16px;
		border-radius: var(--radius-md);
		font-family: inherit;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
	}

	.vault-body :global(.btn-primary) {
		border: none;
		background-color: var(--color-accent-600);
		color: white;
	}

	.vault-body :global(.btn-primary:hover:not(:disabled)) {
		background-color: var(--color-accent-700);
	}

	.vault-body :global(.btn-flat) {
		border: 1px solid var(--border-strong);
		background: transparent;
		color: var(--text-secondary);
		font-weight: 500;
	}

	.vault-body :global(.btn-flat:hover:not(:disabled)) {
		background-color: var(--surface-2);
		color: var(--text-primary);
	}

	.vault-body :global(button:disabled) {
		opacity: 0.6;
		cursor: default;
	}
</style>
