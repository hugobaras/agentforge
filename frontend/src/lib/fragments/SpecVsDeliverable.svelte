<script lang="ts">
	import {
		CHECK_LABELS,
		DECISION_LABELS,
		implementerAttemptCount,
		latestImplementerDeliverable,
		latestVerifierResult,
	} from '$lib/lot-events';
	import { createDecision, selectedLot } from '$lib/stores';
	import type { DecisionType } from '$lib/types';

	const spec = $derived($selectedLot?.spec ?? null);
	const deliverable = $derived(
		$selectedLot ? latestImplementerDeliverable($selectedLot.agentRuns) : null,
	);
	const evaluations = $derived($selectedLot?.evaluations ?? []);
	const attempt = $derived(
		$selectedLot ? implementerAttemptCount($selectedLot.agentRuns) : 0,
	);
	const verification = $derived(
		$selectedLot ? latestVerifierResult($selectedLot.agentRuns) : null,
	);
	const checkEntries = $derived(
		verification
			? (['standards', 'lint', 'analysis', 'tests', 'fidelity'] as const).filter(
					(name) => verification.checks[name] !== undefined,
				)
			: [],
	);

	let comment = $state('');
	let submitting = $state<DecisionType | null>(null);
	let error = $state('');
	let notice = $state('');

	const needsComment = (type: DecisionType) => type === 'REJECT' || type === 'ARBITRATE';

	async function decide(type: DecisionType) {
		error = '';
		notice = '';
		if (needsComment(type) && !comment.trim()) {
			error = 'Un commentaire est requis pour un rejet ou un arbitrage.';
			return;
		}
		submitting = type;
		try {
			await createDecision({
				type,
				comment: comment.trim() || undefined,
			});
			notice = `Décision enregistrée : ${DECISION_LABELS[type]}`;
			comment = '';
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			submitting = null;
		}
	}
</script>

<section class="panel">
	<header class="panel-head">
		<h2>Spec vs livrable</h2>
		<p>
			{#if $selectedLot}
				{$selectedLot.title}
			{:else}
				Sélectionnez un lot dans le dashboard.
			{/if}
		</p>
	</header>

	{#if !$selectedLot}
		<p class="empty">Aucun lot sélectionné.</p>
	{:else}
		{#if $selectedLot.pullRequest}
			<p class="pr-banner">
				Pull request
				<a href={$selectedLot.pullRequest.url} target="_blank" rel="noreferrer">
					#{$selectedLot.pullRequest.number}
				</a>
				<span class="muted">{$selectedLot.pullRequest.branch}</span>
			</p>
		{:else if $selectedLot.repoUrl}
			<p class="muted pr-banner">
				Dépôt lié : <code>{$selectedLot.repoUrl}</code>
				({$selectedLot.baseBranch}) — PR à l’approbation.
			</p>
		{/if}

		{#if evaluations.length > 0}
			<ol class="eval-history">
				{#each evaluations as evaluation, index (evaluation.id)}
					<li class:latest={index === evaluations.length - 1}>
						<div class="eval-head">
							<span class="badge">Tentative {index + 1}</span>
							<span class="score">{evaluation.score}<small>/100</small></span>
						</div>
						<p>{evaluation.feedback}</p>
					</li>
				{/each}
			</ol>
		{/if}

		{#if verification}
			<div class="verify-panel" class:ok={verification.approved} class:ko={!verification.approved}>
				<div class="verify-head">
					<strong>{verification.approved ? 'Vérification OK' : 'Vérification échouée'}</strong>
					<span class="muted">{verification.provider}</span>
				</div>
				<p>{verification.reason}</p>
				<ul class="check-pills">
					{#each checkEntries as name (name)}
						<li
							class:ok={verification.checks[name]}
							class:ko={!verification.checks[name]}
						>
							{CHECK_LABELS[name] ?? name}
						</li>
					{/each}
				</ul>
				{#if verification.reports}
					<details>
						<summary>Rapports (stdout / code de sortie)</summary>
						{#each checkEntries as name (name)}
							{@const report = verification.reports?.[name]}
							{#if report}
								<article class="report">
									<h4>
										{CHECK_LABELS[name] ?? name}
										{#if report.command}
											<code>{report.command}</code>
										{/if}
										{#if report.exitCode != null}
											<span class="muted">exit {report.exitCode}</span>
										{/if}
									</h4>
									{#if report.stdout}
										<pre>{report.stdout}</pre>
									{/if}
									{#if report.stderr}
										<pre class="stderr">{report.stderr}</pre>
									{/if}
								</article>
							{/if}
						{/each}
					</details>
				{/if}
			</div>
		{/if}

		<div class="compare">
			<article>
				<h3>Spec</h3>
				{#if spec}
					<p class="muted">{spec.title}</p>
					<pre>{spec.body}</pre>
				{:else}
					<p class="empty">Pas de spec.</p>
				{/if}
			</article>
			<article>
				<h3>
					Livrable
					{#if attempt > 0}
						<span class="badge">Tentative {attempt}</span>
					{/if}
				</h3>
				{#if deliverable}
					<pre>{deliverable}</pre>
				{:else}
					<p class="empty">En attente de l’implémenteur…</p>
				{/if}
			</article>
		</div>

		<div class="decision-box">
			<label>
				Commentaire
				<textarea
					bind:value={comment}
					rows="3"
					placeholder="Obligatoire pour rejeter ou demander un arbitrage"
				></textarea>
			</label>
			<div class="decision-actions">
				<button
					type="button"
					class="approve"
					disabled={submitting !== null}
					onclick={() => void decide('APPROVE')}
				>
					{submitting === 'APPROVE' ? 'Enregistrement…' : DECISION_LABELS.APPROVE}
				</button>
				<button
					type="button"
					class="reject"
					disabled={submitting !== null}
					onclick={() => void decide('REJECT')}
				>
					{submitting === 'REJECT' ? 'Enregistrement…' : DECISION_LABELS.REJECT}
				</button>
				<button
					type="button"
					class="arbitrate"
					disabled={submitting !== null}
					onclick={() => void decide('ARBITRATE')}
				>
					{submitting === 'ARBITRATE' ? 'Enregistrement…' : DECISION_LABELS.ARBITRATE}
				</button>
			</div>
			{#if error}
				<p class="feedback error" role="alert">{error}</p>
			{/if}
			{#if notice}
				<p class="feedback ok">{notice}</p>
			{/if}
		</div>
	{/if}
</section>
