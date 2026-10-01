<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { t } from '#lib/i18n/index.svelte.js';

	let {
		collapsed = false,
		mobileOpen = false,
		inert: isInert = false
	}: { collapsed?: boolean; mobileOpen?: boolean; inert?: boolean } = $props();

	const navItems = [
		{ href: '/board', labelKey: 'nav.kanban', icon: 'kanban' },
		{ href: '/analytics', labelKey: 'nav.analytics', icon: 'chart' },
		{ href: '/backup', labelKey: 'nav.backup', icon: 'backup' },
		{ href: '/settings', labelKey: 'nav.settings', icon: 'settings' }
	] as const;

	// Every nav target is now a real sub-path, so the exact-match special case
	// for '/' is gone - that entry became the landing page, which is reached
	// through the logo rather than the navigation.
	function isActive(href: string): boolean {
		return page.url.pathname.startsWith(href);
	}

	// The 72px icon-rail ("collapsed") is a desktop-only concept. When the
	// mobile drawer is open it must always show full labels regardless of
	// that desktop toggle's current value - collapsed and mobileOpen are
	// flipped by the same button, so without this a mobile drawer opened
	// right after a desktop collapse would render icon-only.
	let showLabels = $derived(!collapsed || mobileOpen);
</script>

<aside
	class="sidebar"
	class:collapsed
	class:mobile-open={mobileOpen}
	id="mobile-sidebar"
	inert={isInert}
	aria-label={t('a11y.mainNavigation')}
>
	<div class="sidebar-header">
		<a href={resolve('/')} class="logo-link" aria-label={t('app.name')}>
			<div class="logo-mark" aria-hidden="true">
				<!-- Simplified vector reinterpretation of the app icon (see issue #22) -
				     the real icon is a multi-gradient raster illustration unsuited for a
				     hand-authored vector trace, so this captures the same folder+ring
				     motif rather than reproducing it pixel-for-pixel. -->
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
					<rect width="24" height="24" rx="6" fill="#0c0f2b" />
					<path
						d="M6.5 7.2c0-.66.54-1.2 1.2-1.2h3.4l1.4 1.4h4.8c.66 0 1.2.54 1.2 1.2v6.6a3.6 3.6 0 01-3.6 3.6h-5.2a3.2 3.2 0 01-3.2-3.2V7.2z"
						fill="url(#logo-mark-fold)"
					/>
					<circle cx="13.2" cy="13" r="3.5" fill="#0c0f2b" />
					<circle cx="13.2" cy="13" r="2.15" fill="url(#logo-mark-ring)" />
					<circle cx="13.2" cy="13" r="0.85" fill="#0c0f2b" />
					<defs>
						<linearGradient
							id="logo-mark-fold"
							x1="6.5"
							y1="6"
							x2="18.5"
							y2="19"
							gradientUnits="userSpaceOnUse"
						>
							<stop stop-color="#60a5fa" />
							<stop offset="1" stop-color="#1d4ed8" />
						</linearGradient>
						<linearGradient
							id="logo-mark-ring"
							x1="11"
							y1="10.85"
							x2="15.4"
							y2="15.15"
							gradientUnits="userSpaceOnUse"
						>
							<stop stop-color="#93c5fd" />
							<stop offset="1" stop-color="#3b82f6" />
						</linearGradient>
					</defs>
				</svg>
			</div>
			{#if showLabels}
				<span class="logo-text">bewerby</span>
			{/if}
		</a>
	</div>

	<nav class="sidebar-nav">
		<ul role="list">
			{#each navItems as item (item.href)}
				{@const active = isActive(item.href)}
				<li>
					<a
						href={resolve(item.href)}
						class="nav-item"
						class:active
						aria-current={active ? 'page' : undefined}
						title={showLabels ? undefined : t(item.labelKey)}
					>
						<span class="nav-icon" aria-hidden="true">
							{#if item.icon === 'kanban'}
								<svg width="20" height="20" viewBox="0 0 24 24" fill="none">
									<rect
										x="3"
										y="3"
										width="5"
										height="18"
										rx="1.5"
										stroke="currentColor"
										stroke-width="1.5"
									/>
									<rect
										x="10"
										y="3"
										width="5"
										height="12"
										rx="1.5"
										stroke="currentColor"
										stroke-width="1.5"
									/>
									<rect
										x="17"
										y="3"
										width="5"
										height="15"
										rx="1.5"
										stroke="currentColor"
										stroke-width="1.5"
									/>
								</svg>
							{:else if item.icon === 'chart'}
								<svg width="20" height="20" viewBox="0 0 24 24" fill="none">
									<path
										d="M3 3v18h18"
										stroke="currentColor"
										stroke-width="1.5"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
									<path
										d="M7 17l4-5 4 3 5-7"
										stroke="currentColor"
										stroke-width="1.5"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
							{:else if item.icon === 'backup'}
								<svg width="20" height="20" viewBox="0 0 24 24" fill="none">
									<path
										d="M12 16V4m0 0l-4 4m4-4l4 4"
										stroke="currentColor"
										stroke-width="1.5"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
									<path
										d="M20 16v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2"
										stroke="currentColor"
										stroke-width="1.5"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
							{:else if item.icon === 'settings'}
								<svg width="20" height="20" viewBox="0 0 24 24" fill="none">
									<circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5" />
									<path
										d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
										stroke="currentColor"
										stroke-width="1.5"
									/>
								</svg>
							{/if}
						</span>
						{#if showLabels}
							<span class="nav-label">{t(item.labelKey)}</span>
						{/if}
					</a>
				</li>
			{/each}
		</ul>
	</nav>

	<div class="sidebar-footer">
		{#if showLabels}
			<nav class="legal-links" aria-label={t('legal.impressum.title')}>
				<a href={resolve('/impressum')}>{t('nav.impressum')}</a>
				<a href={resolve('/datenschutz')}>{t('nav.datenschutz')}</a>
				<a href={resolve('/nutzungsbedingungen')}>{t('nav.nutzungsbedingungen')}</a>
				<a href={resolve('/kontakt')}>{t('nav.kontakt')}</a>
			</nav>
			<span class="version-tag">v{__APP_VERSION__}</span>
		{/if}
	</div>
</aside>

<style>
	.sidebar {
		display: flex;
		flex-direction: column;
		height: 100dvh;
		position: sticky;
		top: 0;
		background-color: var(--sidebar-bg);
		border-right: 1px solid var(--sidebar-border);
		overflow-y: auto;
		overflow-x: hidden;
		transition: width var(--duration-normal) var(--ease-out-expo);
	}

	.sidebar-header {
		display: flex;
		align-items: center;
		height: 56px;
		padding: 0 16px;
		border-bottom: 1px solid var(--sidebar-border);
		flex-shrink: 0;
	}

	.logo-link {
		display: flex;
		align-items: center;
		gap: 10px;
		text-decoration: none;
		color: var(--text-primary);
	}

	.logo-mark {
		flex-shrink: 0;
		display: flex;
		align-items: center;
	}

	.logo-text {
		font-size: 16px;
		font-weight: 700;
		letter-spacing: -0.02em;
		white-space: nowrap;
	}

	.sidebar-nav {
		flex: 1;
		padding: 12px 8px;
	}

	.sidebar-nav ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.nav-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 12px;
		border-radius: var(--radius-md);
		color: var(--sidebar-text);
		text-decoration: none;
		font-size: 14px;
		font-weight: 500;
		transition:
			background-color var(--duration-fast) ease,
			color var(--duration-fast) ease;
		white-space: nowrap;
	}

	.nav-item:hover {
		background-color: var(--sidebar-item-hover);
		color: var(--text-primary);
	}

	.nav-item.active {
		background-color: var(--sidebar-item-active);
		color: var(--sidebar-text-active);
	}

	.nav-icon {
		flex-shrink: 0;
		display: flex;
		align-items: center;
	}

	.nav-label {
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.sidebar-footer {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 12px 16px;
		border-top: 1px solid var(--sidebar-border);
		flex-shrink: 0;
	}

	.legal-links {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 10px;
	}

	.legal-links a {
		font-size: 11px;
		color: var(--text-tertiary);
		text-decoration: none;
	}

	.legal-links a:hover {
		color: var(--sidebar-text-active);
		text-decoration: underline;
	}

	.version-tag {
		font-size: 11px;
		color: var(--text-tertiary);
		font-weight: 400;
	}

	/* Collapsed (72px icon rail) is a desktop-only concept - on mobile the
	   drawer is always full-width with labels, either open or off-canvas. */
	@media (min-width: 769px) {
		.collapsed .sidebar-header {
			justify-content: center;
			padding: 0;
		}

		.collapsed .nav-item {
			justify-content: center;
			padding: 10px;
		}

		.collapsed .sidebar-footer {
			display: flex;
			justify-content: center;
		}
	}

	@media (max-width: 768px) {
		.sidebar {
			position: fixed;
			inset: 0 auto 0 0;
			width: 260px;
			z-index: 300;
			transform: translateX(-100%);
			transition: transform var(--duration-normal) var(--ease-out-expo);
			box-shadow: var(--shadow-lg);
		}

		.sidebar.mobile-open {
			transform: translateX(0);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.sidebar {
			transition: none;
		}
	}
</style>
