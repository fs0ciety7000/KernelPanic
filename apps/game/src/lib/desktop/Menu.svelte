<script lang="ts">
  import { os } from '$lib/os/os.svelte';
  import { BADGES, rankOf, reputation, stars } from '$lib/os/career';
  import Icon from './Icon.svelte';

  const DIFF: Record<string, string> = { beginner: 'Débutant', intermediate: 'Intermédiaire', advanced: 'Avancé' };
  let busy = $state<string | null>(null);
  /** Timed mode, per scenario, chosen before a new game. */
  let timed = $state<Record<string, boolean>>({});
  let showBadges = $state(false);

  const rep = $derived(reputation(os.career.records));
  const rank = $derived(rankOf(rep));
  const progress = $derived(rank.next ? Math.min(1, (rep - rank.floor) / (rank.next.at - rank.floor)) : 1);
  const earned = $derived(Object.keys(os.career.badges).length);
  const euros = (n: number) => (n ? `${n.toLocaleString('fr-FR')} €` : 'formation');
  const fmt = (ms: number) => `${Math.floor(ms / 60000)} min`;

  async function play(id: string, fresh: boolean) {
    busy = id;
    try {
      await os.start(id, { fresh, timed: fresh && !!timed[id] });
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

  <p class="compact mono">Écran étroit détecté — Kernel_Panic se joue mieux à partir de 1024 px de large.</p>

  {#if os.error}
    <div class="kp-error">{os.error}</div>
  {/if}

  <section class="career" aria-label="Carrière">
    <div class="who">
      <span class="kp-label">Ironveil · réponse à incident</span>
      <b>{rank.title}</b>
    </div>
    <div class="rep">
      <div class="bar" role="progressbar" aria-valuenow={rep} aria-valuemin={rank.floor} aria-valuemax={rank.next?.at ?? rep}><span style="width:{progress * 100}%"></span></div>
      <span class="mono dim">{rep} pts de réputation{rank.next ? ` · ${rank.next.title} à ${rank.next.at}` : ' · rang maximal'}</span>
    </div>
    <button class="kp-btn ghost badges-btn" aria-expanded={showBadges} onclick={() => (showBadges = !showBadges)}>
      <Icon name="diamond" size={13} /> Badges {earned}/{BADGES.length}
    </button>
  </section>

  {#if showBadges}
    <section class="badges" aria-label="Badges">
      {#each BADGES as b (b.id)}
        {@const got = os.career.badges[b.id]}
        <div class="badge" class:got>
          <span class="bi"><Icon name={b.icon} size={15} /></span>
          <span><b>{b.title}</b><span class="dim">{b.desc}</span></span>
        </div>
      {/each}
    </section>
  {/if}

  <section class="list" aria-label="Contrats">
    {#each os.scenarios as s, i (s.id)}
      {@const saved = os.hasSave(s.id)}
      {@const rec = os.career.records[s.id]}
      <article class="card">
        {#if s.contract}
          <div class="contract mono">
            <span>Contrat {String(i).padStart(2, '0')} · {s.contract.client}</span>
            <span class="fee">{euros(s.contract.fee)}</span>
          </div>
        {/if}
        <div class="meta">
          {#if rec?.best}
            <span class="kp-badge green">Clos</span>
            <span class="stars" title="{stars(rec.best)}/3 — clos · bonne fin · sans indice">{#each [1, 2, 3] as n (n)}<span class:on={stars(rec.best) >= n}>★</span>{/each}</span>
          {:else if saved}
            <span class="kp-badge amber">En cours</span>
          {:else}
            <span class="kp-badge violet">Nouveau</span>
          {/if}
          <span class="kp-badge cyan">{DIFF[s.difficulty] ?? s.difficulty}</span>
          {#if s.endings && s.endings > 1}<span class="kp-badge green">{os.discoveredEndings(s.id).length}/{s.endings} fins</span>{/if}
          {#if s.estimatedMinutes}<span class="mins mono">~{s.estimatedMinutes} min</span>{/if}
        </div>
        <h2>{s.title}</h2>
        {#if s.subtitle}<p class="sub">{s.subtitle}</p>{/if}
        {#if s.summary}<p class="sum">{s.summary}</p>{/if}
        {#if rec?.best}
          <p class="best mono">Meilleur résultat : {rec.best.score} pts · {fmt(rec.best.playtime)} · {rec.best.hints} indice{rec.best.hints > 1 ? 's' : ''}{rec.best.evidenceTotal ? ` · ${rec.best.evidence}/${rec.best.evidenceTotal} pièces` : ''} · {rec.runs} partie{rec.runs > 1 ? 's' : ''}</p>
        {/if}
        <div class="actions">
          {#if saved}
            <button class="kp-btn primary" disabled={!!busy} onclick={() => play(s.id, false)}>Reprendre l'enquête</button>
            <button class="kp-btn ghost" disabled={!!busy} onclick={() => confirm('Effacer la sauvegarde et recommencer ?') && play(s.id, true)}>Nouvelle partie</button>
          {:else}
            <button class="kp-btn primary" disabled={!!busy} onclick={() => play(s.id, true)}>Ouvrir le dossier</button>
          {/if}
        </div>
        {#if s.timed}
          <label class="timed" title="L'horloge du jeu tourne : ce qui est prévu à une heure donnée arrivera vraiment.">
            <input type="checkbox" bind:checked={timed[s.id]} />
            <span>Mode chronométré <span class="dim">— s'applique à une nouvelle partie</span></span>
          </label>
        {/if}
      </article>
    {:else}
      {#if !os.error}<p class="loading mono">chargement des dossiers…</p>{/if}
    {/each}
  </section>

  <footer class="mono">kernel.fs0ciety.org · v0.1 · tout est simulé, aucune vraie machine n'est touchée</footer>
</div>

<style>
  .career { position: relative; display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 18px; width: min(640px, 100%); padding: 14px 18px; border: 1px solid var(--kp-line-strong); border-radius: var(--kp-radius-l); background: rgba(12, 16, 22, 0.8); }
  .who { display: flex; flex-direction: column; gap: 2px; }
  .who b { font-size: 16px; color: var(--kp-cyan); }
  .rep { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .bar { height: 6px; border-radius: 3px; background: var(--kp-bg-4); overflow: hidden; }
  .bar span { display: block; height: 100%; background: linear-gradient(90deg, var(--kp-violet), var(--kp-cyan)); }
  .dim { color: var(--kp-text-2); font-size: 11.5px; }
  .badges { position: relative; display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; width: min(640px, 100%); }
  .badge { display: flex; gap: 10px; align-items: center; padding: 10px 12px; border-radius: var(--kp-radius-m); border: 1px solid var(--kp-line); background: rgba(12, 16, 22, 0.8); opacity: 0.5; }
  .badge.got { opacity: 1; border-color: rgba(157, 123, 255, 0.4); }
  .badge > span:last-child { display: flex; flex-direction: column; gap: 2px; font-size: 12.5px; }
  .bi { display: grid; place-items: center; width: 30px; height: 30px; flex-shrink: 0; border-radius: 50%; background: var(--kp-bg-3); color: var(--kp-text-2); }
  .badge.got .bi { background: var(--kp-violet-dim); color: var(--kp-violet); }
  .contract { display: flex; justify-content: space-between; gap: 12px; margin: -4px 0 12px; padding-bottom: 10px; border-bottom: 1px dashed var(--kp-line-strong); font-size: 11px; letter-spacing: 0.04em; color: var(--kp-text-2); text-transform: uppercase; }
  .fee { color: var(--kp-green); }
  .stars { font-size: 13px; letter-spacing: 1px; color: var(--kp-bg-4); }
  .stars .on { color: var(--kp-amber); }
  .best { margin: 10px 0 0; font-size: 11.5px; color: var(--kp-text-2); }
  @media (max-width: 560px) { .career { grid-template-columns: 1fr; } .badges { grid-template-columns: 1fr; } }
  .timed { display: flex; align-items: center; gap: 8px; margin-top: 12px; font-size: 12.5px; color: var(--kp-text-1); cursor: pointer; user-select: none; }
  .timed input { accent-color: var(--kp-amber); }
  .timed .dim { color: var(--kp-text-2); }
  /* Auto margins centre the column without clipping its top once it is taller than the screen. */
  .menu {
    position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center;
    gap: 28px; padding: 32px 24px; overflow: auto; background: var(--kp-bg-0);
  }
  .menu > * { flex-shrink: 0; }
  .menu > header { margin-top: auto; }
  .menu > footer { margin-bottom: auto; }
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
  .compact { display: none; position: relative; margin: 0; padding: 8px 12px; border-radius: var(--kp-radius-s); background: var(--kp-amber-dim); color: var(--kp-amber); font-size: 11.5px; text-align: center; }
  @media (max-width: 1023px) { .compact { display: block; } }
  footer { position: relative; color: var(--kp-text-2); font-size: 11px; }
</style>
