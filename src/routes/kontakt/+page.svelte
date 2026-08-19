<script lang="ts">
	import { t } from '$lib/i18n/index.svelte.js';
	import { announcer } from '$lib/stores/announcer.svelte.js';
	import ObfuscatedEmail from '$lib/components/common/ObfuscatedEmail.svelte';

	// Shared mail relay (see ARCHITECTURE.md) - operated by the same person as
	// bewerby itself, on separate infrastructure, not a third-party service.
	// Its own origin allowlist is what actually gates who may use it.
	const CONTACT_ENDPOINT = 'https://contact.yinside.de/phpmailer.php';

	let name = $state('');
	let email = $state('');
	let message = $state('');
	// Real users never see or fill this field; a bot that fills every input
	// trips it, and the response pretends success so it doesn't retry.
	let honeypot = $state('');
	let status = $state<'idle' | 'sending' | 'success' | 'error'>('idle');
	let errorMessage = $state('');

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();

		if (honeypot) {
			status = 'success';
			return;
		}

		status = 'sending';
		errorMessage = '';

		try {
			const response = await fetch(CONTACT_ENDPOINT, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: name.trim(), email: email.trim(), message: message.trim() })
			});
			const result = await response.json();

			if (!response.ok || !result.success) {
				throw new Error(result?.error ?? `HTTP ${response.status}`);
			}

			status = 'success';
			announcer.announce(t('legal.kontakt.success'));
			name = '';
			email = '';
			message = '';
		} catch (err) {
			console.error('Contact form submission failed:', err);
			status = 'error';
			errorMessage = t('legal.kontakt.error');
			announcer.announce(errorMessage);
		}
	}
</script>

<svelte:head>
	<title>{t('nav.kontakt')} · {t('app.name')}</title>
</svelte:head>

<div class="legal-page">
	<header class="page-header">
		<h1>{t('legal.kontakt.title')}</h1>
		<p class="intro">{t('legal.kontakt.subtitle')}</p>
	</header>

	<section class="legal-card">
		<form onsubmit={handleSubmit} class="contact-form">
			<div class="honeypot-field">
				<label for="website">Website</label>
				<input type="text" id="website" bind:value={honeypot} tabindex="-1" autocomplete="off" />
			</div>

			<div class="form-group">
				<label for="contact-name">{t('legal.kontakt.name')} *</label>
				<input
					id="contact-name"
					type="text"
					bind:value={name}
					required
					placeholder={t('legal.kontakt.namePlaceholder')}
				/>
			</div>

			<div class="form-group">
				<label for="contact-email">{t('legal.kontakt.email')} *</label>
				<input
					id="contact-email"
					type="email"
					bind:value={email}
					required
					placeholder={t('legal.kontakt.emailPlaceholder')}
				/>
			</div>

			<div class="form-group">
				<label for="contact-message">{t('legal.kontakt.message')} *</label>
				<textarea
					id="contact-message"
					bind:value={message}
					required
					rows="6"
					placeholder={t('legal.kontakt.messagePlaceholder')}></textarea>
			</div>

			{#if status === 'error'}
				<div class="form-banner error-banner" role="alert">{errorMessage}</div>
			{/if}
			{#if status === 'success'}
				<div class="form-banner success-banner" role="status">{t('legal.kontakt.success')}</div>
			{/if}

			<button type="submit" class="btn-primary" disabled={status === 'sending'}>
				{status === 'sending' ? t('legal.kontakt.sending') : t('legal.kontakt.send')}
			</button>
		</form>

		<p class="form-hint">{t('legal.kontakt.formHint')} <ObfuscatedEmail /></p>
	</section>
</div>

<style>
	.legal-page {
		display: flex;
		flex-direction: column;
		gap: 20px;
		max-width: 560px;
	}

	.page-header h1 {
		font-size: 24px;
		font-weight: 700;
		letter-spacing: -0.03em;
		color: var(--text-primary);
		margin: 0;
	}

	.intro {
		font-size: 13px;
		color: var(--text-secondary);
		margin: 6px 0 0 0;
		line-height: 1.6;
	}

	.legal-card {
		background-color: var(--surface-0);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-xl);
		padding: 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.contact-form {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	/* display: none removes this from the tab order and the accessibility
	   tree in every major browser - real users never encounter it. A simple
	   bot that fills every input on the page still finds and fills it. */
	.honeypot-field {
		display: none;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.form-group label {
		font-size: 12px;
		font-weight: 600;
		color: var(--text-secondary);
	}

	.form-group input,
	.form-group textarea {
		padding: 8px 12px;
		box-sizing: border-box;
		background-color: var(--surface-0);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		color: var(--text-primary);
		font-family: inherit;
		font-size: 14px;
		transition: border-color var(--duration-fast) ease;
	}

	.form-group input:focus,
	.form-group textarea:focus {
		border-color: var(--color-accent-500);
	}

	.form-banner {
		font-size: 13px;
		padding: 10px 12px;
		border-radius: var(--radius-md);
	}

	.error-banner {
		background-color: var(--status-danger-bg);
		border: 1px solid var(--status-danger-border);
		color: var(--color-danger);
	}

	.success-banner {
		background-color: var(--status-success-bg);
		border: 1px solid var(--status-success-border);
		color: var(--color-success);
	}

	.btn-primary {
		align-self: flex-start;
		padding: 8px 20px;
		background-color: var(--color-accent-600);
		color: white;
		border: none;
		border-radius: var(--radius-md);
		font-family: inherit;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition: background-color var(--duration-fast) ease;
	}

	.btn-primary:hover:not(:disabled) {
		background-color: var(--color-accent-700);
	}

	.btn-primary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.form-hint {
		font-size: 13px;
		color: var(--text-secondary);
		margin: 0;
		border-top: 1px solid var(--border-subtle);
		padding-top: 14px;
	}
</style>
