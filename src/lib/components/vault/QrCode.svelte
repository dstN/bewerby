<script lang="ts">
	import qrcode from 'qrcode-generator';

	/**
	 * A QR code as one SVG path - no {@html}, and no data: URL the CSP's
	 * img-src would have to allow. Dark on white in both themes: scanners
	 * expect it, and the quiet zone around it is part of the code.
	 */
	let { value, label }: { value: string; label: string } = $props();

	let qr = $derived.by(() => {
		const code = qrcode(0, 'M');
		code.addData(value);
		code.make();
		const size = code.getModuleCount();
		let path = '';
		for (let row = 0; row < size; row++) {
			for (let col = 0; col < size; col++) {
				if (code.isDark(row, col)) path += `M${col + 4} ${row + 4}h1v1h-1z`;
			}
		}
		return { path, extent: size + 8 };
	});
</script>

<svg
	class="qr"
	viewBox="0 0 {qr.extent} {qr.extent}"
	role="img"
	aria-label={label}
	shape-rendering="crispEdges"
>
	<rect width={qr.extent} height={qr.extent} fill="#ffffff" />
	<path d={qr.path} fill="#000000" />
</svg>

<style>
	.qr {
		width: min(240px, 70vw);
		height: auto;
		border-radius: var(--radius-md);
	}
</style>
