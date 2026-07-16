<script lang="ts">
	import '../app.css';
	import { theme } from '$lib/stores/theme.svelte.js';
	import { i18n, t } from '$lib/i18n/index.svelte.js';
	import type { Locale } from '$lib/i18n/types.js';
	import Sidebar from '$lib/components/layout/Sidebar.svelte';
	import { syncRemindersToServiceWorker, registerPeriodicReminderCheck } from '$lib/utils/reminders.js';
	import { colorStore } from '$lib/stores/colors.svelte.js';

	let { children } = $props();

	let sidebarCollapsed = $state(false);

	// Synchronize alerts with service worker and initialize locale when the page loads
	$effect(() => {
		i18n.init();
		colorStore.init();
		syncRemindersToServiceWorker();
		registerPeriodicReminderCheck();
	});
</script>

<svelte:head>
	<title>{t('app.name')}</title>
	<meta name="description" content={t('app.description')} />
</svelte:head>

<div class="app-shell" class:sidebar-collapsed={sidebarCollapsed}>
	<Sidebar
		collapsed={sidebarCollapsed}
		ontoggle={() => sidebarCollapsed = !sidebarCollapsed}
	/>

	<main id="main-content" class="main-content" tabindex="-1">
		<header class="top-bar">
			<div class="top-bar-left">
				<button
					class="sidebar-toggle"
					onclick={() => sidebarCollapsed = !sidebarCollapsed}
					aria-label={sidebarCollapsed ? t('a11y.openMenu') : t('a11y.closeMenu')}
				>
					<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
						<path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
					</svg>
				</button>
			</div>

			<div class="top-bar-right">
				<!-- Language switcher -->
				<button
					class="toolbar-btn"
					onclick={() => i18n.setLocale(i18n.locale === 'de' ? 'en' : 'de')}
					aria-label={t('a11y.switchLanguage')}
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
							<circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="1.5"/>
							<path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
						</svg>
					{:else}
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
					{/if}
				</button>
			</div>
		</header>

		<div class="page-content">
			{@render children()}
		</div>
	</main>
</div>

<style>
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
		transition: background-color var(--duration-fast) ease,
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
		transition: background-color var(--duration-fast) ease,
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
