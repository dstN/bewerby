<script lang="ts">
	import { resolve } from '$app/paths';
	import { t } from '#lib/i18n/index.svelte.js';

	const steps = [
		{ title: 'landing.step1Title', body: 'landing.step1Body' },
		{ title: 'landing.step2Title', body: 'landing.step2Body' },
		{ title: 'landing.step3Title', body: 'landing.step3Body' }
	] as const;

	const facts = ['landing.fact1', 'landing.fact2', 'landing.fact3', 'landing.fact4'] as const;

	const devicePoints = [
		'landing.devicesPair',
		'landing.devicesSync',
		'landing.devicesBackup',
		'landing.devicesLost'
	] as const;
</script>

<svelte:head>
	<title>{t('app.name')} — {t('landing.headline')}</title>
</svelte:head>

<div class="landing">
	<section class="hero" aria-labelledby="landing-headline">
		<h1 id="landing-headline">{t('landing.headline')}</h1>
		<p class="lead">{t('landing.lead')}</p>

		<div class="actions">
			<a class="cta" href={resolve('/board')}>{t('landing.cta')}</a>
			<a class="cta-secondary" href={resolve('/datenschutz')}>{t('landing.privacyLink')}</a>
		</div>
	</section>

	<section class="steps-section" aria-labelledby="landing-steps">
		<h2 id="landing-steps" class="sr-only">{t('landing.stepsHeading')}</h2>
		<ol class="steps">
			{#each steps as step, index (step.title)}
				<li>
					<span class="step-number" aria-hidden="true">{index + 1}</span>
					<h3>{t(step.title)}</h3>
					<p>{t(step.body)}</p>
				</li>
			{/each}
		</ol>
	</section>

	<section class="facts-section" aria-labelledby="landing-facts">
		<h2 id="landing-facts" class="sr-only">{t('landing.factsHeading')}</h2>
		<ul class="facts">
			{#each facts as fact (fact)}
				<li>{t(fact)}</li>
			{/each}
		</ul>
	</section>

	<section class="data-section" aria-labelledby="landing-devices">
		<h2 id="landing-devices">{t('landing.devicesHeading')}</h2>
		<p>{t('landing.devicesBody')}</p>
		<ul class="points">
			{#each devicePoints as point (point)}
				<li>{t(point)}</li>
			{/each}
		</ul>
		<a class="cta-secondary" href="{resolve('/backup')}#sync">{t('landing.devicesLink')}</a>
	</section>

	<section class="data-section" aria-labelledby="landing-data">
		<h2 id="landing-data">{t('landing.dataHeading')}</h2>
		<p>{t('landing.dataBody')}</p>
	</section>
</div>

<style>
	.landing {
		max-width: 760px;
		margin: 0 auto;
		padding: 8px 0 40px;
	}

	.hero h1 {
		margin: 0;
		font-size: 34px;
		line-height: 1.2;
		font-weight: 700;
		letter-spacing: -0.02em;
		color: var(--text-primary);
		text-wrap: balance;
	}

	.lead {
		margin: 14px 0 0;
		font-size: 17px;
		line-height: 1.6;
		color: var(--text-secondary);
		max-width: 56ch;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px 20px;
		margin-top: 28px;
	}

	/* Navigation, so an anchor rather than a button - it just happens to look
	   like one. --color-accent-700 on white measures 8.6:1. */
	.cta {
		display: inline-flex;
		align-items: center;
		padding: 11px 22px;
		border-radius: var(--radius-md);
		background-color: var(--color-accent-700);
		color: #fff;
		font-size: 15px;
		font-weight: 600;
		text-decoration: none;
		transition: background-color var(--duration-fast) ease;
	}

	.cta:hover {
		background-color: var(--color-accent-600);
	}

	.cta-secondary {
		color: var(--color-accent-text);
		font-size: 14px;
		font-weight: 500;
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.steps {
		list-style: none;
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 20px;
		margin: 40px 0 0;
		padding: 0;
	}

	.steps li {
		padding: 20px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background-color: var(--surface-0);
	}

	.step-number {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		border-radius: var(--radius-pill);
		background-color: var(--color-accent-700);
		color: #fff;
		font-size: 13px;
		font-weight: 700;
	}

	.steps h3 {
		margin: 12px 0 6px;
		font-size: 15px;
		font-weight: 600;
		color: var(--text-primary);
	}

	.steps p {
		margin: 0;
		font-size: 13px;
		line-height: 1.6;
		color: var(--text-secondary);
	}

	.facts {
		list-style: none;
		display: flex;
		flex-wrap: wrap;
		gap: 8px 10px;
		margin: 28px 0 0;
		padding: 0;
	}

	.facts li {
		padding: 5px 12px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-pill);
		background-color: var(--surface-2);
		font-size: 13px;
		font-weight: 500;
		color: var(--text-secondary);
	}

	.data-section {
		margin-top: 40px;
		padding-top: 24px;
		border-top: 1px solid var(--border-subtle);
	}

	.data-section h2 {
		margin: 0 0 8px;
		font-size: 15px;
		font-weight: 600;
		color: var(--text-primary);
	}

	.data-section p {
		margin: 0;
		font-size: 13px;
		line-height: 1.7;
		color: var(--text-secondary);
		max-width: 66ch;
	}

	.points {
		margin: 10px 0 12px;
		padding-left: 20px;
		font-size: 13px;
		line-height: 1.7;
		color: var(--text-secondary);
		max-width: 66ch;
	}

	@media (max-width: 768px) {
		.hero h1 {
			font-size: 26px;
		}

		.lead {
			font-size: 15px;
		}

		.steps {
			grid-template-columns: 1fr;
			gap: 12px;
			margin-top: 32px;
		}
	}
</style>
