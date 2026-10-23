<script lang="ts">
  import { os } from '$lib/os/os.svelte';
  import type { AppProps } from '$lib/os/apps';
  import type { ObjectiveView } from '@kp/kernel';
  import Icon from '$lib/desktop/Icon.svelte';

  let { win }: AppProps = $props();
  void win;
  const k = os.kernel!;

  let drafts = $state<Record<string, string>>({});
  let wrong = $state<Record<string, number>>({});

  const objectives = $derived.by(() => {
    void os.version;
    return k.runtime.objectives();
  });
  const main = $derived(objectives.filter((o) => !o.optional));
  const bonus = $derived(objectives.filter((o) => o.optional));
  const progress = $derived.by(() => {
    void os.version;
    return k.runtime.progress();
  });
  const elapsed = $derived.by(() => {
    void os.tick;
    const ms = k.runtime.playtime();
    return `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
  });
  const hintsUsed = $derived(objectives.reduce((a, o) => a + o.hintsShown, 0));

  function submit(o: ObjectiveView) {
    const v = drafts[o.id] ?? '';
    if (!v.trim()) return;
    if (k.runtime.submit(o.id, v)) {
      drafts[o.id] = '';
    } else {
      wrong[o.id] = (wrong[o.id] ?? 0) + 1;
    }
  }
</script>

{#snippet objective(o: ObjectiveView, i: number)}
  <li class="obj {o.status}">
    <span class="mark">
      {#if o.status === 'done'}<Icon name="check-circle" size={18} />{:else if o.status === 'locked'}<Icon name="lock-circle" size={18} />{:else}<span class="idx mono">{String(i + 1).padStart(2, '0')}</span>{/if}
    </span>
    <div class="txt">
      <div class="title">{o.status === 'locked' ? 'Objectif verrouillé' : o.title}</div>
      {#if o.status === 'locked'}
        <div class="desc dim">Terminez les étapes précédentes pour le révéler.</div>
      {:else}
        {#if o.description}<div class="desc">{o.description}</div>{/if}
        {#if o.status === 'available' && o.answer}
          {#key wrong[o.id]}
            <form class="answer" class:shake={wrong[o.id]} onsubmit={(e) => { e.preventDefault(); submit(o); }}>
              <label class="kp-label" for="ans-{o.id}">{o.answer.label}</label>
              <div class="row">
                <input id="ans-{o.id}" class="kp-input mono" placeholder={o.answer.placeholder} bind:value={drafts[o.id]} autocomplete="off" spellcheck="false" />
                <button class="kp-btn primary" type="submit">Valider</button>
              </div>
              {#if wrong[o.id]}<div class="err mono">✗ Ce n'est pas ça. ({wrong[o.id]})</div>{/if}
            </form>
          {/key}
        {:else if o.status === 'available'}
          <div class="auto dim"><Icon name="clock" size={12} /> Se valide automatiquement quand vous trouvez.</div>
        {/if}
        {#if o.hints?.length && o.status === 'available'}
          <div class="hints">
            {#each o.hints.slice(0, o.hintsShown) as h, hi (hi)}
              <div class="hint"><Icon name="lightbulb" size={13} /> <span>{h}</span></div>
            {/each}
            {#if o.hintsShown < o.hints.length}
              <button class="kp-btn ghost hint-btn" onclick={() => k.runtime.revealHint(o.id)}>
                <Icon name="lightbulb" size={13} /> Indice {o.hintsShown + 1}/{o.hints.length} <span class="cost mono">−40</span>
              </button>
            {/if}
          </div>
        {/if}
      {/if}
    </div>
  </li>
{/snippet}

<div class="case">
  <header class="head">
    <div class="kp-label">Dossier · INC-2026-0417</div>
    <h1>{k.bundle.title}</h1>
    <div class="bar"><div class="fill" style="width:{(progress.done / progress.total) * 100}%"></div></div>
    <div class="stats mono">
      <span><b>{progress.done}</b>/{progress.total} objectifs</span>
      <span><Icon name="clock" size={12} /> {elapsed}</span>
      <span><Icon name="lightbulb" size={12} /> {hintsUsed} indice{hintsUsed > 1 ? 's' : ''}</span>
    </div>
  </header>
  <div class="scroll">
    <ol class="list">
      {#each main as o, i (o.id)}{@render objective(o, i)}{/each}
    </ol>
    {#if bonus.length}
      <div class="kp-label bonus-h">Bonus</div>
      <ol class="list">
        {#each bonus as o, i (o.id)}{@render objective(o, main.length + i)}{/each}
      </ol>
    {/if}
    {#if k.runtime.ended}
      <button class="kp-btn primary end" onclick={() => (os.phase = 'ended')}>Voir le rapport de clôture</button>
    {/if}
  </div>
</div>

<style>
  .case { display: flex; flex-direction: column; flex: 1; min-height: 0; background: var(--kp-bg-1); }
  .head { padding: 18px 20px 14px; border-bottom: 1px solid var(--kp-line); background: linear-gradient(180deg, rgba(157, 123, 255, 0.07), transparent); }
  h1 { margin: 4px 0 12px; font-size: 22px; letter-spacing: -0.02em; }
  .bar { height: 4px; border-radius: 4px; background: var(--kp-bg-4); overflow: hidden; }
  .fill { height: 100%; background: linear-gradient(90deg, var(--kp-violet), var(--kp-cyan)); box-shadow: 0 0 12px rgba(62, 230, 245, 0.6); transition: width var(--kp-dur-slow) var(--kp-ease); }
  .stats { display: flex; gap: 16px; margin-top: 10px; color: var(--kp-text-2); font-size: 11.5px; }
  .stats span { display: inline-flex; align-items: center; gap: 5px; }
  .stats b { color: var(--kp-text-0); }
  .scroll { flex: 1; overflow: auto; padding: 8px 12px 20px; }
  .list { list-style: none; margin: 0; padding: 0; }
  .obj { display: flex; gap: 12px; padding: 14px 10px; border-bottom: 1px solid var(--kp-line); }
  .mark { width: 26px; flex-shrink: 0; display: flex; justify-content: center; align-items: flex-start; padding-top: 1px; }
  .idx { font-size: 11px; color: var(--kp-violet); border: 1px solid rgba(157, 123, 255, 0.35); border-radius: 6px; padding: 1px 4px; }
  .done .mark { color: var(--kp-green); }
  .locked .mark { color: var(--kp-text-2); }
  .txt { flex: 1; min-width: 0; }
  .title { font-weight: 600; }
  .done .title { color: var(--kp-text-1); text-decoration: line-through; text-decoration-color: rgba(90, 242, 160, 0.5); }
  .locked .title { color: var(--kp-text-2); }
  .desc { margin-top: 3px; color: var(--kp-text-1); font-size: 12.5px; line-height: 1.55; }
  .dim { color: var(--kp-text-2); }
  .done .desc { color: var(--kp-text-2); }
  .answer { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
  .answer .row { display: flex; gap: 6px; }
  .answer input { flex: 1; }
  .shake { animation: shake 320ms var(--kp-ease); }
  @keyframes shake { 20%, 60% { transform: translateX(-5px); } 40%, 80% { transform: translateX(5px); } }
  .err { color: var(--kp-red); font-size: 11.5px; }
  .auto { display: flex; align-items: center; gap: 6px; margin-top: 8px; font-size: 11.5px; }
  .hints { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
  .hint { display: flex; gap: 8px; padding: 8px 10px; border-radius: var(--kp-radius-s); background: var(--kp-amber-dim); color: #ffd79a; font-size: 12.5px; line-height: 1.5; user-select: text; }
  .hint :global(svg) { flex-shrink: 0; margin-top: 2px; color: var(--kp-amber); }
  .hint-btn { align-self: flex-start; height: 26px; color: var(--kp-amber); }
  .cost { font-size: 10.5px; color: var(--kp-text-2); }
  .bonus-h { margin: 20px 10px 4px; color: var(--kp-violet); }
  .end { margin: 18px 10px 0; height: 36px; }
</style>
