<script lang="ts">
  import { os } from '$lib/os/os.svelte';

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
</script>

<div class="end">
  <div class="box">
    <div class="kp-label">
      Dossier {k.bundle.title} · clos
    </div>
    <h1 class="mono">{ending?.title ?? 'DOSSIER CLOS'}</h1>
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
    <div class="actions">
      <button class="kp-btn" onclick={() => (os.phase = 'desktop')}>Revenir sur la machine</button>
      <button class="kp-btn primary" onclick={() => os.quitToMenu()}>Menu principal</button>
    </div>
  </div>
</div>

<style>
  .end { position: fixed; inset: 0; display: grid; place-items: center; padding: 24px; background: radial-gradient(800px 500px at 50% 30%, rgba(90, 242, 160, 0.08), transparent 70%), var(--kp-bg-0); }
  .box { width: min(640px, 100%); }
  h1 { margin: 10px 0 18px; font-size: clamp(34px, 6vw, 56px); color: var(--kp-green); letter-spacing: 0.06em; text-shadow: 0 0 40px rgba(90, 242, 160, 0.35); }
  .text { color: var(--kp-text-1); font-size: 15.5px; line-height: 1.7; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 28px 0; }
  .stats div { padding: 14px; border-radius: var(--kp-radius-m); background: var(--kp-bg-2); border: 1px solid var(--kp-line); display: flex; flex-direction: column; gap: 6px; }
  .stats b { font-size: 22px; font-family: var(--kp-font-mono); }
  .actions { display: flex; gap: 8px; }
  .endings { display: flex; align-items: center; gap: 6px; margin-top: 18px; flex-wrap: wrap; }
  .dot { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; font-family: var(--kp-font-mono); font-size: 11px; border: 1px solid var(--kp-line-strong); color: var(--kp-text-2); }
  .dot.got { border-color: rgba(157, 123, 255, 0.6); color: var(--kp-violet); background: var(--kp-violet-dim); }
  .dot.now { border-color: var(--kp-green); color: var(--kp-green); background: var(--kp-green-dim); box-shadow: 0 0 16px rgba(90, 242, 160, 0.35); }
  .dim { color: var(--kp-text-2); font-size: 11.5px; margin-left: 6px; }
  @media (max-width: 560px) { .stats { grid-template-columns: repeat(2, 1fr); } }
</style>
