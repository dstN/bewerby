<script lang="ts">
	import { untrack } from 'svelte';
	import { t } from '#lib/i18n/index.svelte.js';
	import { ARCHIVE_REASONS, type ArchiveReason } from '#lib/db/index.js';
	import VaultDialog from '#lib/components/vault/VaultDialog.svelte';

	/**
	 * Asks why an application ends before the board puts it into the archive
	 * (#60), whether it was dropped there or chosen in the card's status
	 * select. The edit dialog asks in its own form.
	 */
	let {
		company,
		reason: suggested,
		onarchive,
		onclose
	}: {
		company: string;
		/** Preselected: "never sent" for a draft, "no response" otherwise. */
		reason: ArchiveReason;
		onarchive: (reason: ArchiveReason) => void;
		onclose: () => void;
	} = $props();

	let reason = $state(untrack(() => suggested));

	function submit(event: SubmitEvent) {
		event.preventDefault();
		onarchive(reason);
	}
</script>

<VaultDialog title={t('kanban.archive.dialogTitle')} closeLabel={t('backup.vault.close')} {onclose}>
	<form onsubmit={submit}>
		<fieldset>
			<legend>{t('kanban.archive.reasonQuestion').replace('{company}', company)}</legend>
			{#each ARCHIVE_REASONS as option (option)}
				<label class="choice">
					<input type="radio" name="archive-reason" value={option} bind:group={reason} />
					{t(`kanban.archive.reasons.${option}`)}
				</label>
			{/each}
		</fieldset>

		<div class="actions">
			<button type="button" class="btn-flat" onclick={onclose}>{t('actions.cancel')}</button>
			<button type="submit" class="btn-primary">{t('kanban.archive.submit')}</button>
		</div>
	</form>
</VaultDialog>
