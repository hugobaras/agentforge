<script lang="ts">
	import DecisionJournal from '$lib/fragments/DecisionJournal.svelte';
	import LotDashboard from '$lib/fragments/LotDashboard.svelte';
	import SpecForm from '$lib/fragments/SpecForm.svelte';
	import SpecVsDeliverable from '$lib/fragments/SpecVsDeliverable.svelte';
	import { bootstrap, loadError, selectedTenantId, setTenant, teardown, tenants, wsConnected } from '$lib/stores';
	import { onMount } from 'svelte';

	onMount(() => {
		const lotId = new URL(window.location.href).searchParams.get('lot') ?? undefined;
		void bootstrap({ lotId });
		return () => teardown();
	});
</script>

<div class="page">
	<header class="topbar">
		<div>
			<h1>AgentForge</h1>
			<p>Pilotage de lots de développement assistés par IA.</p>
		</div>
		<div class="topbar-meta">
			<label class="tenant-pick">
				Tenant
				<select
					value={$selectedTenantId ?? ''}
					onchange={(event) => void setTenant((event.currentTarget as HTMLSelectElement).value)}
					disabled={$tenants.length === 0}
				>
					{#each $tenants as tenant (tenant.id)}
						<option value={tenant.id}>{tenant.name}</option>
					{/each}
				</select>
			</label>
			<span class="ws-pill" class:on={$wsConnected} class:off={!$wsConnected}>
				{$wsConnected ? 'WebSocket connecté' : 'WebSocket hors ligne'}
			</span>
		</div>
	</header>

	{#if $loadError}
		<p class="banner-error" role="alert">
			Impossible de joindre l’API : {$loadError}. Lancez <code>npm run dev:api</code> et
			<code>npm run db:seed</code>.
		</p>
	{/if}

	<div class="layout">
		<div class="col">
			<SpecForm />
			<LotDashboard />
		</div>
		<div class="col">
			<SpecVsDeliverable />
			<DecisionJournal />
		</div>
	</div>
</div>
