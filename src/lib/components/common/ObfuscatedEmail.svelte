<script lang="ts">
	import { onMount } from 'svelte';

	let {
		user = 'info',
		domain = 'bewerby.de',
		/** Spliced in invisibly to poison naive textContent scraping. */
		decoy = '.remove-this-to-write-us.'
	}: { user?: string; domain?: string; decoy?: string } = $props();

	// Left undefined until mount on purpose: bewerby has no SSR at all
	// (ssr = false - see +layout.ts), so there is nothing in the served HTML
	// for a non-JS scraper to find either way, but keeping the href
	// unresolved until mount avoids handing a plain mailto: string to
	// anything that scans the client bundle's data/state instead.
	let href = $state<string | undefined>(undefined);

	onMount(() => {
		href = `mailto:${user}@${domain}`;
	});
</script>

<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- mailto:, not an internal SvelteKit route; resolve() doesn't apply, and the linter can't tell that from a dynamic href -->
<a {href} class="obfuscated-email">
	<span>{user}</span><span class="decoy" aria-hidden="true">{decoy}</span><span>@{domain}</span>
</a>

<style>
	.obfuscated-email {
		color: var(--color-accent-text);
	}

	/* display: none removes this from the accessibility tree in every major
	   browser; aria-hidden is redundant belt-and-suspenders for anything that
	   only respects one of the two. Real users only ever see/hear "user@domain" -
	   this decoy exists purely to mangle a raw textContent scrape. */
	.decoy {
		display: none;
	}
</style>
