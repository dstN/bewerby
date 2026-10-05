<script lang="ts">
	import { t } from '#lib/i18n/index.svelte.js';
	import type { Application } from '#lib/db/index.js';
	import {
		PERIOD_CHOICES,
		inPeriod,
		presetPeriod,
		type Period,
		type PeriodChoice
	} from '#lib/utils/applicationExport.js';
	import DatePicker from '#lib/components/common/DatePicker.svelte';
	import VaultDialog from '#lib/components/vault/VaultDialog.svelte';

	/**
	 * Asks which period a Nachweis covers, when it is exported - not as a
	 * standing filter on the board. The choice is the board's to keep
	 * (bindable), so it is preselected next time.
	 */
	let {
		format,
		applications,
		choice = $bindable(),
		from = $bindable(),
		to = $bindable(),
		onexport,
		onclose
	}: {
		format: 'pdf' | 'csv';
		/** What the Nachweis may list: the board's filters applied, sent only. */
		applications: Application[];
		choice: PeriodChoice;
		from: string;
		to: string;
		onexport: (period: Period) => Promise<void> | void;
		onclose: () => void;
	} = $props();

	const LABELS: Record<PeriodChoice, string> = {
		all: 'kanban.export.periodAll',
		last30Days: 'kanban.export.periodLast30Days',
		last3Months: 'kanban.export.periodLast3Months',
		custom: 'kanban.export.periodCustom'
	};

	let period = $derived(choice === 'custom' ? { from, to } : presetPeriod(choice));
	let count = $derived(applications.filter((app) => inPeriod(app, period)).length);
	let busy = $state(false);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		try {
			await onexport(period);
		} finally {
			busy = false;
		}
		onclose();
	}
</script>

<VaultDialog title={t('kanban.export.dialogTitle')} closeLabel={t('backup.vault.close')} {onclose}>
	<form onsubmit={submit}>
		<fieldset>
			<legend>{t('kanban.export.periodQuestion')}</legend>
			{#each PERIOD_CHOICES as option (option)}
				<label class="choice">
					<input type="radio" name="export-period" value={option} bind:group={choice} />
					{t(LABELS[option])}
				</label>
			{/each}
		</fieldset>

		{#if choice === 'custom'}
			<div class="custom">
				<span class="custom-field">
					<span class="custom-label" aria-hidden="true">{t('kanban.periodFrom')}</span>
					<DatePicker id="export-from" label={t('kanban.periodFrom')} bind:value={from} />
				</span>
				<span class="custom-field">
					<span class="custom-label" aria-hidden="true">{t('kanban.periodTo')}</span>
					<DatePicker id="export-to" label={t('kanban.periodTo')} bind:value={to} />
				</span>
			</div>
		{/if}

		<p role="status" data-testid="export-count">
			{t('kanban.export.count').replace('{count}', String(count))}
		</p>

		<div class="actions">
			<button type="button" class="btn-flat" onclick={onclose}>{t('actions.cancel')}</button>
			<button type="submit" class="btn-primary" disabled={count === 0 || busy} aria-busy={busy}>
				{busy
					? t('kanban.export.working')
					: t(format === 'pdf' ? 'kanban.export.submitPdf' : 'kanban.export.submitCsv')}
			</button>
		</div>
	</form>
</VaultDialog>

<style>
	.custom {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.custom-field {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.custom-label {
		min-width: 2.5em;
		font-size: 13px;
		color: var(--text-secondary);
	}

	.custom-field :global(.datepicker-wrapper) {
		flex: 1;
		min-width: 0;
	}
</style>
