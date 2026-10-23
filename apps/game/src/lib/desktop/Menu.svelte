<script lang="ts">
  import { os } from '$lib/os/os.svelte';

  const DIFF: Record<string, string> = { beginner: 'Débutant', intermediate: 'Intermédiaire', advanced: 'Avancé' };
  let busy = $state<string | null>(null);

  async function play(id: string, fresh: boolean) {
    busy = id;
    try {
      await os.start(id, { fresh });
    } finally {
      busy = null;
    }
  }
</script>

<div class="menu">
  <div class="bg" aria-hidden="true"></div>
  <header>
    <h1>Kernel<span class="u">_</span>Panic</h1>
    <p class="tag">Une enquête dans une machine qui ne devrait pas mentir.</p>
  </header>

  {#if os.error}
    <div class="kp-error">{os.error}</div>
  {/if}

  <section class="list" aria-label="Scénarios">
    {#each os.scenarios as s, i (s.id)}
      {@const saved = os.hasSave(s.id)}
      <article class="card">
        <div class="meta">
          <span class="kp-badge violet">Dossier {String(i + 1).padStart(2, '0')}</span>
          <span class="kp-badge cyan">{DIFF[s.difficulty] ?? s.difficulty}</span>
          {#if s.estimatedMinutes}<span class="mins mono">~{s.estimatedMinutes} min</span>{/if}
        </div>
        <h2>{s.title}</h2>
        {#if s.subtitle}<p class="sub">{s.subtitle}</p>{/if}
        {#if s.summary}<p class="sum">{s.summary}</p>{/if}
        <div class="actions">
          {#if saved}
            <button class="kp-btn primary" disabled={!!busy} onclick={() => play(s.id, false)}>Reprendre l'enquête</button>
            <button class="kp-btn ghost" disabled={!!busy} onclick={() => confirm('Effacer la sauvegarde et recommencer ?') && play(s.id, true)}>Nouvelle partie</button>
          {:else}
            <button class="kp-btn primary" disabled={!!busy} onclick={() => play(s.id, true)}>Ouvrir le dossier</button>
          {/if}
        </div>
      </article>
    {:else}
      {#if !os.error}<p class="loading mono">chargement des dossiers…</p>{/if}
    {/each}
  </section>

  <footer class="mono">kernel.fsociety.org · v0.1 · tout est simulé, aucune vraie machine n'est touchée</footer>
</div>

<style>
  .menu {
    position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 36px; padding: 24px; overflow: auto; background: var(--kp-bg-0);
  }
  .bg {
    position: absolute; inset: 0; pointer-events: none;
    background:
      radial-gradient(600px 400px at 20% 20%, rgba(62, 230, 245, 0.10), transparent 70%),
      radial-gradient(700px 500px at 85% 80%, rgba(157, 123, 255, 0.12), transparent 70%);
  }
  header { position: relative; text-align: center; }
  h1 { margin: 0; font-size: clamp(44px, 8vw, 88px); font-weight: 700; letter-spacing: -0.04em; line-height: 1; }
  .u { color: var(--kp-cyan); animation: blink 1s steps(1) infinite; text-shadow: 0 0 24px rgba(62, 230, 245, 0.6); }
  @keyframes blink { 50% { opacity: 0; } }
  .tag { margin: 14px 0 0; color: var(--kp-text-1); font-size: 15px; }
  .list { position: relative; display: grid; gap: 16px; width: min(640px, 100%); }
  .card {
    padding: 22px 24px; border-radius: var(--kp-radius-l);
    background: linear-gradient(180deg, rgba(21, 27, 37, 0.85), rgba(12, 16, 22, 0.85));
    border: 1px solid var(--kp-line-strong); box-shadow: var(--kp-shadow-2);
  }
  .meta { display: flex; align-items: center; gap: 8px; }
  .mins { color: var(--kp-text-2); font-size: 11.5px; margin-left: auto; }
  h2 { margin: 14px 0 4px; font-size: 26px; letter-spacing: -0.02em; }
  .sub { margin: 0; color: var(--kp-violet); }
  .sum { margin: 12px 0 0; color: var(--kp-text-1); line-height: 1.6; font-size: 13.5px; }
  .actions { display: flex; gap: 8px; margin-top: 18px; }
  .actions .kp-btn { height: 34px; padding: 0 16px; }
  .loading { color: var(--kp-text-2); text-align: center; }
  footer { position: relative; color: var(--kp-text-2); font-size: 11px; }
</style>
