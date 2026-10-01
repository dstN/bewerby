<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { theme } from '$lib/stores/theme.svelte.js';
	import { i18n, t } from '$lib/i18n/index.svelte.js';
	import { resolve } from '$app/paths';
	import { afterNavigate } from '$app/navigation';
	import { browser } from '$app/environment';
	import Sidebar from '$lib/components/layout/Sidebar.svelte';
	import { startReminderEngine, registerBackgroundSyncBestEffort } from '$lib/utils/reminders.js';
	import { colorStore } from '$lib/stores/colors.svelte.js';
	import { db } from '$lib/db/index.js';
	import { cleanupOrphanedPdfs } from '$lib/utils/opfs.js';
	import { activeSync } from '$lib/crdt/session.js';
	import { syncRunner } from '$lib/sync/runner.svelte.js';
	import { requestPersistentStorage } from '$lib/utils/storage.js';
	import { announcer } from '$lib/stores/announcer.svelte.js';
	import { profileStore } from '$lib/stores/profile.svelte.js';

	let { children } = $props();

	let sidebarCollapsed = $state(false);
	let mobileNavOpen = $state(false);
	let isMobileViewport = $state(false);
	let dbOpenError = $state(false);

	// What the hamburger button's ARIA state describes depends on which
	// concept the current viewport actually controls (see toggleNav below).
	let navToggleExpanded = $derived(isMobileViewport ? mobileNavOpen : !sidebarCollapsed);

	// collapsed (desktop icon-rail) and mobileNavOpen (mobile drawer) are
	// deliberately never toggled together - the current viewport decides
	// which single concept this button controls, so a mobile drawer opened
	// after switching from desktop never accidentally inherits a collapsed,
	// icon-only sidebar.
	function toggleNav() {
		if (isMobileViewport) {
			mobileNavOpen = !mobileNavOpen;
		} else {
			sidebarCollapsed = !sidebarCollapsed;
		}
	}

	function closeMobileNav() {
		mobileNavOpen = false;
	}

	function handleShellKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && mobileNavOpen) {
			closeMobileNav();
		}
	}

	// Close the mobile drawer whenever a route actually changes (e.g. a nav
	// link was activated), so it doesn't stay open over the next page.
	afterNavigate(() => {
		mobileNavOpen = false;
	});

	if (browser) {
		const mql = window.matchMedia('(max-width: 768px)');
		isMobileViewport = mql.matches;
		mql.addEventListener('change', (e) => {
			isMobileViewport = e.matches;
		});
	}

	// Every OPFS file that is still referenced by something. cleanupOrphanedPdfs
	// deletes whatever is not in this set, so a ref that is missed here is data
	// loss on the next boot - which is why the profile's global CV and the
	// per-application CV have to be listed alongside the job ad, and why
	// profileStore.init() runs before this does.
	async function cleanupOrphanedPdfsOnStartup() {
		const applications = await db.applications.toArray();
		const validRefs = new Set(
			[...applications.flatMap((app) => [app.pdfRef, app.cvRef]), profileStore.cvRef].filter(
				(ref): ref is string => !!ref
			)
		);
		await cleanupOrphanedPdfs(validRefs);
	}

	// One-time app boot: none of this should ever re-run reactively. It
	// previously lived in a bare $effect, which meant every language switch
	// re-ran the entire pipeline below (including tearing down and
	// restarting the reminder engine) - i18n.init() writes i18n.locale and
	// then reads it right back via document.documentElement.lang, and that
	// read was enough to make the effect depend on locale.
	onMount(() => {
		i18n.init();
		colorStore.init();
		// Before the orphan sweep: it reads profileStore.cvRef.
		profileStore.init();
		// Starts the sync layer on a device with a vault, so rows written while
		// it was off are adopted before anyone edits; a no-op without one.
		void activeSync();
		// Syncs with a connected folder or Dropbox while bewerby is open (#53).
		void syncRunner.start();
		cleanupOrphanedPdfsOnStartup();
		requestPersistentStorage();
		registerBackgroundSyncBestEffort();

		// Dexie opens lazily on first use; surface a failure (blocked upgrade,
		// private-browsing restrictions, quota denial) instead of leaving every
		// liveQuery-backed view silently empty with no explanation.
		db.open().catch((err) => {
			console.error('Failed to open database:', err);
			dbOpenError = true;
		});

		const stopReminderEngine = startReminderEngine();
		return () => stopReminderEngine();
	});
</script>

<svelte:head>
	<title>{t('app.name')}</title>
	<meta name="description" content={t('app.description')} />
</svelte:head>

<svelte:window onkeydown={handleShellKeydown} />

{#if dbOpenError}
	<div class="db-error-banner" role="alert">
		{t('errors.dbUnavailable')}
	</div>
{/if}

<!-- App-wide live region for status-change announcements (see $lib/stores/announcer.svelte.ts) -->
<div class="sr-only" aria-live="polite" aria-atomic="true">{announcer.message}</div>

{#if mobileNavOpen}
	<div class="mobile-nav-backdrop" onclick={closeMobileNav} role="presentation"></div>
{/if}

<div class="app-shell" class:sidebar-collapsed={sidebarCollapsed}>
	<Sidebar
		collapsed={sidebarCollapsed}
		mobileOpen={mobileNavOpen}
		inert={isMobileViewport && !mobileNavOpen}
	/>

	<main id="main-content" class="main-content" tabindex="-1">
		<header class="top-bar">
			<div class="top-bar-left">
				<button
					class="sidebar-toggle"
					onclick={toggleNav}
					aria-expanded={navToggleExpanded}
					aria-controls="mobile-sidebar"
					aria-label={navToggleExpanded ? t('a11y.closeMenu') : t('a11y.openMenu')}
				>
					<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
						<path
							d="M3 5h14M3 10h14M3 15h14"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
						/>
					</svg>
				</button>
			</div>

			<div class="top-bar-right">
				<!-- Language switcher -->
				<button
					class="toolbar-btn"
					onclick={() => i18n.setLocale(i18n.locale === 'de' ? 'en' : 'de')}
					aria-label={`${i18n.locale.toUpperCase()} – ${t('a11y.switchLanguage')}`}
					title={t('a11y.switchLanguage')}
				>
					<span class="locale-label">{i18n.locale.toUpperCase()}</span>
				</button>

				<!-- Theme toggle -->
				<button
					class="toolbar-btn"
					onclick={() => theme.toggle()}
					aria-label={t('a11y.toggleTheme')}
					title={t('theme.toggle')}
				>
					{#if theme.isDark}
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="1.5" />
							<path
								d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
							/>
						</svg>
					{:else}
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path
								d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					{/if}
				</button>
			</div>
		</header>

		<div class="page-content">
			<svelte:boundary onerror={(error) => console.error('Unhandled render error:', error)}>
				{@render children()}

				{#snippet failed(error, reset)}
					<div class="render-error">
						<h2>{t('errorPage.title')}</h2>
						<p class="message">{t('errorPage.message')}</p>
						{#if error instanceof Error && error.message}
							<p class="detail">{error.message}</p>
						{/if}
						<div class="actions">
							<button class="btn-primary" onclick={reset}>{t('errorPage.reload')}</button>
							<a class="btn-flat" href={resolve('/backup')}>{t('nav.backup')}</a>
						</div>
					</div>
				{/snippet}
			</svelte:boundary>
		</div>
	</main>
</div>

<style>
	.mobile-nav-backdrop {
		display: none;
	}

	@media (max-width: 768px) {
		.mobile-nav-backdrop {
			display: block;
			position: fixed;
			inset: 0;
			background-color: rgba(15, 23, 42, 0.4);
			z-index: 250;
		}
	}

	.db-error-banner {
		position: sticky;
		top: 0;
		z-index: 200;
		padding: 10px 20px;
		background-color: var(--color-danger-solid);
		color: white;
		font-size: 13px;
		font-weight: 600;
		text-align: center;
	}

	.app-shell {
		display: grid;
		grid-template-columns: 260px 1fr;
		min-height: 100dvh;
		transition: grid-template-columns var(--duration-normal) var(--ease-out-expo);
	}

	.app-shell.sidebar-collapsed {
		grid-template-columns: 72px 1fr;
	}

	.main-content {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
		overflow-x: hidden;
		background-color: var(--surface-1);
	}

	.top-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 56px;
		padding: 0 20px;
		background-color: var(--surface-0);
		border-bottom: 1px solid var(--border-default);
		flex-shrink: 0;
	}

	.top-bar-left {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.top-bar-right {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.sidebar-toggle {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border: none;
		background: transparent;
		color: var(--text-secondary);
		border-radius: var(--radius-md);
		cursor: pointer;
		transition:
			background-color var(--duration-fast) ease,
			color var(--duration-fast) ease;
	}

	.sidebar-toggle:hover {
		background-color: var(--surface-2);
		color: var(--text-primary);
	}

	.toolbar-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border: none;
		background: transparent;
		color: var(--text-secondary);
		border-radius: var(--radius-md);
		cursor: pointer;
		font-family: inherit;
		font-size: 12px;
		font-weight: 600;
		transition:
			background-color var(--duration-fast) ease,
			color var(--duration-fast) ease;
	}

	.toolbar-btn:hover {
		background-color: var(--surface-2);
		color: var(--text-primary);
	}

	.locale-label {
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.04em;
	}

	.page-content {
		flex: 1;
		padding: 24px;
		overflow-y: auto;
	}

	.render-error {
		max-width: 420px;
		margin: 48px auto;
		background-color: var(--surface-0);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-xl);
		box-shadow: var(--shadow-lg);
		padding: 32px;
		text-align: center;
	}

	.render-error h2 {
		font-size: 18px;
		font-weight: 700;
		color: var(--text-primary);
		margin: 0 0 12px 0;
	}

	.render-error .message {
		font-size: 14px;
		line-height: 1.6;
		color: var(--text-secondary);
		margin: 0;
	}

	.render-error .detail {
		font-size: 12px;
		font-family: var(--font-mono);
		color: var(--text-tertiary);
		background-color: var(--surface-2);
		border-radius: var(--radius-md);
		padding: 8px 12px;
		margin: 12px 0 0 0;
		word-break: break-word;
	}

	.render-error .actions {
		display: flex;
		justify-content: center;
		gap: 12px;
		margin-top: 24px;
	}

	.render-error .btn-primary {
		padding: 8px 16px;
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

	.render-error .btn-primary:hover {
		background-color: var(--color-accent-700);
	}

	.render-error .btn-flat {
		display: inline-flex;
		align-items: center;
		padding: 8px 16px;
		background: transparent;
		color: var(--text-secondary);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		font-size: 14px;
		font-weight: 500;
		text-decoration: none;
		transition:
			background-color var(--duration-fast) ease,
			color var(--duration-fast) ease;
	}

	.render-error .btn-flat:hover {
		background-color: var(--surface-2);
		color: var(--text-primary);
	}

	@media (max-width: 768px) {
		.app-shell {
			grid-template-columns: 1fr;
		}

		.app-shell.sidebar-collapsed {
			grid-template-columns: 1fr;
		}

		.page-content {
			padding: 16px;
		}
	}
</style>
