<script lang="ts">
  import { os } from '$lib/os/os.svelte';
  import type { JournalKind } from '@kp/kernel';
  import { BADGES } from '$lib/os/career';
  import Icon from './Icon.svelte';

  const k = os.kernel!;
  const endings = k.bundle.endings ?? [];
  const reached = k.runtime.ending();
  const ending = reached ?? k.bundle.outro;
  const discovered = os.discoveredEndings(k.bundle.id);
  const ev = k.runtime.evidence().length;
  const evTotal = (k.bundle.evidence ?? []).length;
  const s = k.runtime.score();
  const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
  const bonus = k.runtime.objectives().filter((o) => o.optional);

  // Career: what this run changed (null when reopening an old finished save).
  const run = os.lastRun?.result.scenario === k.bundle.id ? os.lastRun : null;
  const newBadges = run ? BADGES.filter((b) => run.newBadges.includes(b.id)) : [];

  // Replay: what the player did, in game time.
  const journal = k.runtime.journal();
  let replay = $state(false);
  const KIND: Record<JournalKind, { icon: string; label: string }> = {
    objective: { icon: 'diamond', label: 'Objectif' },
    evidence: { icon: 'key', label: 'Pièce' },
    ssh: { icon: 'server', label: 'Connexion' },
    hint: { icon: 'lightbulb', label: 'Indice' },
    wrong: { icon: 'x', label: 'Réponse refusée' },
    choice: { icon: 'check-circle', label: 'Décision' },
    timer: { icon: 'clock', label: 'Événement' },
    end: { icon: 'source', label: 'Fin' },
    alert: { icon: 'alert', label: 'Alerte' },
    action: { icon: 'shield', label: 'Action' },
  };
  const count = (kind: JournalKind) => journal.filter((j) => j.kind === kind).length;
  const summary = [
    [count('objective'), 'objectif', 'objectifs'],
    [count('evidence'), 'pièce', 'pièces'],
    [count('ssh'), 'connexion', 'connexions'],
    [count('wrong'), 'réponse refusée', 'réponses refusées'],
  ]
    .filter(([n]) => n)
    .map(([n, one, many]) => `${n} ${(n as number) > 1 ? many : one}`)
    .join(' · ');
</script>

<div class="end tone-{reached?.tone ?? 'good'}">
  <div class="box">
    <div class="kp-label">
      Dossier {k.bundle.title} · clos
    </div>
    <h1 class="mono {reached?.tone ?? 'good'}">{ending?.title ?? 'DOSSIER CLOS'}</h1>
    {#if ending}<p class="text">{ending.text}</p>{/if}
    {#if endings.length > 1}
      <div class="endings" aria-label="Fins découvertes">
        {#each endings as e, i (e.id)}
          <span class="dot" class:got={discovered.includes(e.id)} class:now={reached?.id === e.id} title={discovered.includes(e.id) ? e.title : 'Fin non découverte'}>{i + 1}</span>
        {/each}
        <span class="dim mono">{discovered.length}/{endings.length} fins découvertes{discovered.length < endings.length ? ' — d’autres choix mènent ailleurs.' : '.'}</span>
      </div>
    {/if}
    <div class="stats">
      <div><span class="kp-label">Score</span><b class="num">{s.score}</b></div>
      <div><span class="kp-label">Temps</span><b class="num">{fmt(k.runtime.playtime())}</b></div>
      <div><span class="kp-label">Indices</span><b class="num">{s.hints}</b></div>
      {#if evTotal}
        <div><span class="kp-label">Pièces</span><b class="num">{ev}/{evTotal}</b></div>
      {:else}
        <div><span class="kp-label">Bonus</span><b class="num">{bonus.filter((o) => o.status === 'done').length}/{bonus.length}</b></div>
      {/if}
    </div>
    {#if run}
      <section class="career-run" aria-label="Carrière">
        <div class="rep mono">
          <span>Réputation {run.repBefore} → <b>{run.repAfter}</b>{run.repAfter > run.repBefore ? ` (+${run.repAfter - run.repBefore})` : ' (meilleur résultat inchangé)'}</span>
          {#if run.rankAfter !== run.rankBefore}<span class="rankup">Nouveau rang : {run.rankAfter}</span>{/if}
        </div>
        {#each newBadges as b (b.id)}
          <div class="nb"><span class="nbi"><Icon name={b.icon} size={14} /></span><span><b>Badge débloqué — {b.title}</b><span class="dim">{b.desc}</span></span></div>
        {/each}
      </section>
    {/if}
    {#if journal.length}
      <section class="replay" aria-label="Déroulé de la partie">
        <button class="replay-head" aria-expanded={replay} onclick={() => (replay = !replay)}>
          <Icon name={replay ? 'chevron-up' : 'chevron-right'} size={14} />
          <span>Revoir la partie</span>
          <span class="dim mono">{summary}</span>
        </button>
        {#if replay}
          <ol class="timeline">
            {#each journal as j, i (i)}
              <li class="k-{j.kind}">
                <span class="time mono" title="{fmt(j.t)} de jeu">{k.time.hm(j.at)}</span>
                <span class="mark" title={KIND[j.kind].label}><Icon name={KIND[j.kind].icon} size={12} /></span>
                <span class="what">
                  <span class="txt"><span class="kind">{KIND[j.kind].label}</span> {j.text}</span>
                  {#if j.detail}<span class="detail mono">{j.detail}</span>{/if}
                </span>
              </li>
            {/each}
          </ol>
        {/if}
      </section>
    {/if}
    <div class="actions">
      <button class="kp-btn" onclick={() => (os.phase = 'desktop')}>Revenir sur la machine</button>
      <button class="kp-btn primary" onclick={() => os.quitToMenu()}>Menu principal</button>
    </div>
  </div>
</div>

<style>
  .end { position: fixed; inset: 0; display: flex; padding: 24px; overflow: auto; background: radial-gradient(800px 500px at 50% 30%, rgba(90, 242, 160, 0.08), transparent 70%), var(--kp-bg-0); }
  .box { width: min(640px, 100%); margin: auto; }
  h1 { margin: 10px 0 18px; font-size: clamp(34px, 6vw, 56px); color: var(--kp-green); letter-spacing: 0.06em; text-shadow: 0 0 40px rgba(90, 242, 160, 0.35); }
  h1.bad { color: var(--kp-red); text-shadow: 0 0 40px rgba(255, 79, 109, 0.35); }
  h1.mixed { color: var(--kp-amber); text-shadow: 0 0 40px rgba(255, 182, 72, 0.3); }
  .text { color: var(--kp-text-1); font-size: 15.5px; line-height: 1.7; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 28px 0; }
  .stats div { padding: 14px; border-radius: var(--kp-radius-m); background: var(--kp-bg-2); border: 1px solid var(--kp-line); display: flex; flex-direction: column; gap: 6px; }
  .stats b { font-size: 22px; font-family: var(--kp-font-mono); }
  .actions { display: flex; gap: 8px; }
  .career-run { margin: -8px 0 20px; display: flex; flex-direction: column; gap: 8px; }
  .career-run .rep { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; font-size: 12px; color: var(--kp-text-1); }
  .career-run b { color: var(--kp-cyan); }
  .rankup { color: var(--kp-violet); }
  .nb { display: flex; gap: 10px; align-items: center; padding: 10px 12px; border: 1px solid rgba(157, 123, 255, 0.4); border-radius: var(--kp-radius-m); background: var(--kp-violet-dim); animation: pop 400ms var(--kp-ease) both; }
  .nb > span:last-child { display: flex; flex-direction: column; gap: 2px; font-size: 12.5px; }
  .nb .dim { margin: 0; }
  .nbi { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: var(--kp-bg-2); color: var(--kp-violet); }
  @keyframes pop { from { opacity: 0; transform: scale(0.96); } }
  @media (prefers-reduced-motion: reduce) { .nb { animation: none; } }
  .replay { margin: -8px 0 24px; border: 1px solid var(--kp-line); border-radius: var(--kp-radius-m); background: var(--kp-bg-1); }
  .replay-head { display: flex; align-items: center; gap: 8px; width: 100%; padding: 12px 14px; border: 0; background: transparent; color: var(--kp-text-0); font-weight: 600; font-size: 13px; text-align: left; }
  .replay-head:hover { background: rgba(255, 255, 255, 0.03); }
  .replay-head .dim { margin-left: auto; font-weight: 400; }
  .timeline { list-style: none; margin: 0; padding: 4px 14px 14px; max-height: min(46vh, 420px); overflow: auto; border-top: 1px solid var(--kp-line); }
  .timeline li { position: relative; display: grid; grid-template-columns: 44px 22px 1fr; gap: 8px; align-items: start; padding: 7px 0; }
  .timeline li:not(:last-child)::after { content: ''; position: absolute; left: 62px; top: 28px; bottom: -6px; width: 1px; background: var(--kp-line); }
  .time { color: var(--kp-text-2); font-size: 11.5px; padding-top: 3px; font-variant-numeric: tabular-nums; }
  .mark { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: var(--kp-bg-3); color: var(--kp-text-1); }
  .what { display: flex; flex-direction: column; gap: 2px; min-width: 0; font-size: 13px; color: var(--kp-text-0); }
  .kind { color: var(--kp-text-2); font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; margin-right: 4px; }
  .detail { color: var(--kp-text-2); font-size: 11.5px; overflow-wrap: anywhere; }
  .k-objective .mark { color: var(--kp-violet); background: var(--kp-violet-dim); }
  .k-evidence .mark { color: var(--kp-cyan); background: var(--kp-cyan-dim); }
  .k-ssh .mark { color: var(--kp-green); background: var(--kp-green-dim); }
  .k-hint .mark { color: var(--kp-amber); background: var(--kp-amber-dim); }
  .k-wrong .mark, .k-timer .mark { color: var(--kp-red); background: var(--kp-red-dim); }
  .k-alert .mark { color: var(--kp-amber); background: var(--kp-amber-dim); }
  .k-action .mark { color: var(--kp-green); background: var(--kp-green-dim); }
  .k-choice .mark, .k-end .mark { color: var(--kp-text-0); background: var(--kp-bg-4); }
  .endings { display: flex; align-items: center; gap: 6px; margin-top: 18px; flex-wrap: wrap; }
  .dot { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; font-family: var(--kp-font-mono); font-size: 11px; border: 1px solid var(--kp-line-strong); color: var(--kp-text-2); }
  .dot.got { border-color: rgba(157, 123, 255, 0.6); color: var(--kp-violet); background: var(--kp-violet-dim); }
  .dot.now { border-color: var(--kp-green); color: var(--kp-green); background: var(--kp-green-dim); box-shadow: 0 0 16px rgba(90, 242, 160, 0.35); }
  .tone-bad .dot.now { border-color: var(--kp-red); color: var(--kp-red); background: var(--kp-red-dim); box-shadow: 0 0 16px rgba(255, 79, 109, 0.35); }
  .tone-mixed .dot.now { border-color: var(--kp-amber); color: var(--kp-amber); background: var(--kp-amber-dim); box-shadow: 0 0 16px rgba(255, 182, 72, 0.3); }
  .dim { color: var(--kp-text-2); font-size: 11.5px; margin-left: 6px; }
  @media (max-width: 560px) { .stats { grid-template-columns: repeat(2, 1fr); } }
</style>
