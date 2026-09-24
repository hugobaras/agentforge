<script lang="ts">
	import { eventTypeLabel, LOT_STATUS_LABELS } from '$lib/lot-events';
	import { lastEvent, lots, refreshSelectedLot, selectLot, selectedLot } from '$lib/stores';

	let refreshing = $state(false);

	async function onRefresh() {
		refreshing = true;
		try {
			await refreshSelectedLot();
		} finally {
			refreshing = false;
		}
	}
</script>

<section class="panel">
	<header class="panel-head">
		<div>
			<h2>Lots</h2>
			<p>Statut mis à jour en temps réel via WebSocket.</p>
		</div>
		<button type="button" class="ghost" onclick={onRefresh} disabled={refreshing}>
			{refreshing ? 'Actualisation…' : 'Actualiser'}
		</button>
	</header>

	{#if $lastEvent}
		<p class="event-line">
			Dernier événement : <strong>{eventTypeLabel($lastEvent.eventType)}</strong>
			— {$lastEvent.status}
		</p>
	{/if}

	{#if $lots.length === 0}
		<p class="empty">Aucun lot pour ce tenant.</p>
	{:else}
		<ul class="lot-list">
			{#each $lots as lot (lot.id)}
				<li>
					<button
						type="button"
						class="lot-row"
						class:selected={$selectedLot?.id === lot.id}
						onclick={() => void selectLot(lot.id)}
					>
						<span class="lot-title">{lot.title}</span>
						<span class="badge status-{lot.status}">{LOT_STATUS_LABELS[lot.status]}</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</section>
