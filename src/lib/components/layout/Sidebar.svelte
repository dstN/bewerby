<script lang="ts">
	import { page } from '$app/state';
	import { t } from '$lib/i18n/index.svelte.js';

	let { collapsed = false, ontoggle }: { collapsed?: boolean; ontoggle?: () => void } = $props();

	const navItems = [
		{ href: '/', labelKey: 'nav.kanban', icon: 'kanban' },
		{ href: '/analytics', labelKey: 'nav.analytics', icon: 'chart' },
		{ href: '/backup', labelKey: 'nav.backup', icon: 'backup' },
		{ href: '/settings', labelKey: 'nav.settings', icon: 'settings' }
	] as const;

	function isActive(href: string): boolean {
		if (href === '/') return page.url.pathname === '/';
		return page.url.pathname.startsWith(href);
	}
</script>

<aside class="sidebar" class:collapsed aria-label="Navigation">
	<div class="sidebar-header">
		<a href="/" class="logo-link" aria-label={t('app.name')}>
			<div class="logo-mark" aria-hidden="true">
				<img src="/icons/apple-touch-icon.png" alt="" width="24" height="24" />
			</div>
			{#if !collapsed}
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
						href={item.href}
						class="nav-item"
						class:active
						aria-current={active ? 'page' : undefined}
						title={collapsed ? t(item.labelKey) : undefined}
					>
						<span class="nav-icon" aria-hidden="true">
							{#if item.icon === 'kanban'}
								<svg width="20" height="20" viewBox="0 0 24 24" fill="none">
									<rect x="3" y="3" width="5" height="18" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
									<rect x="10" y="3" width="5" height="12" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
									<rect x="17" y="3" width="5" height="15" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
								</svg>
							{:else if item.icon === 'chart'}
								<svg width="20" height="20" viewBox="0 0 24 24" fill="none">
									<path d="M3 3v18h18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
									<path d="M7 17l4-5 4 3 5-7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
								</svg>
							{:else if item.icon === 'backup'}
								<svg width="20" height="20" viewBox="0 0 24 24" fill="none">
									<path d="M12 16V4m0 0l-4 4m4-4l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
									<path d="M20 16v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
								</svg>
							{:else if item.icon === 'settings'}
								<svg width="20" height="20" viewBox="0 0 24 24" fill="none">
									<circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5"/>
									<path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" stroke-width="1.5"/>
								</svg>
							{/if}
						</span>
						{#if !collapsed}
							<span class="nav-label">{t(item.labelKey)}</span>
						{/if}
					</a>
				</li>
			{/each}
		</ul>
	</nav>

	<div class="sidebar-footer">
		{#if !collapsed}
			<span class="version-tag">v0.0.1</span>
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

	.logo-mark img {
		width: 24px;
		height: 24px;
		border-radius: 6px;
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
		transition: background-color var(--duration-fast) ease,
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
		padding: 12px 16px;
		border-top: 1px solid var(--sidebar-border);
		flex-shrink: 0;
	}

	.version-tag {
		font-size: 11px;
		color: var(--text-tertiary);
		font-weight: 400;
	}

	/* Collapsed state */
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

	@media (max-width: 768px) {
		.sidebar {
			display: none;
		}
	}
</style>
