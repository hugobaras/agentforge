<script lang="ts">
	import { DECISION_LABELS } from '$lib/lot-events';
	import { selectedLot } from '$lib/stores';

	function formatDate(value: string): string {
		return new Date(value).toLocaleString('fr-FR');
	}
</script>

<section class="panel">
	<header class="panel-head">
		<h2>Journal de décisions</h2>
		<p>Historique des validations, rejets et arbitrages manuels.</p>
	</header>

	{#if !$selectedLot}
		<p class="empty">Sélectionnez un lot pour voir ses décisions.</p>
	{:else if $selectedLot.decisions.length === 0}
		<p class="empty">Aucune décision manuelle pour ce lot.</p>
	{:else}
		<ol class="journal">
			{#each $selectedLot.decisions as decision (decision.id)}
				<li>
					<div class="journal-head">
						<span class="badge decision-{decision.type}">{DECISION_LABELS[decision.type]}</span>
						<time datetime={decision.createdAt}>{formatDate(decision.createdAt)}</time>
					</div>
					{#if decision.comment}
						<p>{decision.comment}</p>
					{/if}
				</li>
			{/each}
		</ol>
	{/if}
</section>
