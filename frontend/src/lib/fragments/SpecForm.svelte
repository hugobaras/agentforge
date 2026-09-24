<script lang="ts">
	import { selectedTenantId, setTenant, submitLot, tenants } from '$lib/stores';

	let title = $state('Lot ping');
	let specTitle = $state('Spec ping HTTP');
	let specBody = $state(
		'GET /ping doit répondre 200 avec le corps {"pong":true}. JSON, sans authentification.',
	);
	let repoUrl = $state('');
	let baseBranch = $state('main');
	let submitting = $state(false);
	let error = $state('');
	let notice = $state('');

	async function onSubmit(event: SubmitEvent) {
		event.preventDefault();
		error = '';
		notice = '';
		submitting = true;
		try {
			const lot = await submitLot({
				title: title.trim(),
				specTitle: specTitle.trim(),
				specBody: specBody.trim(),
				repoUrl: repoUrl.trim(),
				baseBranch: baseBranch.trim() || 'main',
			});
			notice = `Lot soumis — ${lot.title}`;
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			submitting = false;
		}
	}
</script>

<section class="panel">
	<header class="panel-head">
		<h2>Nouvelle spec</h2>
		<p>Crée un lot en <code>SUBMITTED</code> et lance la chaîne Kafka.</p>
	</header>

	<form onsubmit={onSubmit}>
		<label>
			Tenant
			<select
				value={$selectedTenantId ?? ''}
				required
				disabled={$tenants.length === 0}
				onchange={(event) => void setTenant((event.currentTarget as HTMLSelectElement).value)}
			>
				{#if $tenants.length === 0}
					<option value="">Aucun tenant</option>
				{:else}
					{#each $tenants as tenant (tenant.id)}
						<option value={tenant.id}>{tenant.name}</option>
					{/each}
				{/if}
			</select>
		</label>

		<label>
			Titre du lot
			<input bind:value={title} required minlength="1" placeholder="Lot ping" />
		</label>

		<label>
			Titre de la spec
			<input bind:value={specTitle} required placeholder="Spec ping HTTP" />
		</label>

		<label>
			Corps de la spec
			<textarea bind:value={specBody} required rows="6" placeholder="Décrire le livrable attendu"></textarea>
		</label>

		<label>
			Dépôt GitHub (optionnel)
			<input
				bind:value={repoUrl}
				placeholder="owner/repo ou https://github.com/owner/repo"
			/>
		</label>

		<label>
			Branche de base
			<input bind:value={baseBranch} placeholder="main" />
		</label>

		<button type="submit" disabled={submitting || !$selectedTenantId}>
			{submitting ? 'Soumission…' : 'Soumettre le lot'}
		</button>

		{#if error}
			<p class="feedback error" role="alert">{error}</p>
		{/if}
		{#if notice}
			<p class="feedback ok">{notice}</p>
		{/if}
	</form>
</section>
