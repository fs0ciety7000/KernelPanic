<script lang="ts">
  import { untrack } from 'svelte';
  import { os } from '$lib/os/os.svelte';
  import type { AppProps } from '$lib/os/apps';
  import { path as P, type ChoiceOption, type ObjectiveView } from '@kp/kernel';
  import Icon from '$lib/desktop/Icon.svelte';

  let { win }: AppProps = $props();
  const k = os.kernel!;
  const home = k.users.get(k.sessionUser)!.home;
  const hasEvidence = (k.bundle.evidence ?? []).length > 0;

  let tab = $state<'objectives' | 'evidence'>('objectives');
  let drafts = $state<Record<string, string>>({});
  let wrong = $state<Record<string, number>>({});
  /** Option awaiting confirmation, per choice objective (decisions are final). */
  let pending = $state<Record<string, string | null>>({});

  // Deep link: wm.open('case', { tab: 'evidence' })
  $effect(() => {
    void win.nonce;
    const t = win.args.tab;
    untrack(() => {
      if (t === 'evidence' || t === 'objectives') tab = t;
    });
  });

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
  const evidence = $derived.by(() => {
    void os.version;
    return k.runtime.evidence();
  });
  const evidenceTotal = (k.bundle.evidence ?? []).length;
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

  function missing(opt: ChoiceOption): string[] {
    void os.version;
    const all = k.bundle.evidence ?? [];
    return k.runtime.missingEvidence(opt).map((id) => all.find((e) => e.id === id)?.title ?? id);
  }

  function confirmChoice(o: ObjectiveView) {
    const opt = pending[o.id];
    if (opt && k.runtime.choose(o.id, opt)) pending[o.id] = null;
  }

  const chosenLabel = (o: ObjectiveView) => {
    const id = k.runtime.state.choices[o.id];
    return o.choice?.options.find((x) => x.id === id)?.label;
  };
</script>

{#snippet objective(o: ObjectiveView, i: number)}
  <li class="obj {o.status}" class:decision={!!o.choice}>
    <span class="mark">
      {#if o.status === 'done'}<Icon name="check-circle" size={18} />{:else if o.status === 'locked'}<Icon name="lock-circle" size={18} />{:else}<span class="idx mono">{String(i + 1).padStart(2, '0')}</span>{/if}
    </span>
    <div class="txt">
      <div class="title">
        {o.status === 'locked' ? 'Objectif verrouillé' : o.title}
        {#if o.choice && o.status !== 'locked'}<span class="kp-badge violet">décision</span>{/if}
      </div>
      {#if o.status === 'locked'}
        <div class="desc dim">Terminez les étapes précédentes pour le révéler.</div>
      {:else}
        {#if o.description}<div class="desc">{o.description}</div>{/if}
        {#if o.status === 'done' && o.choice}
          <div class="chosen"><Icon name="check" size={13} /> {chosenLabel(o)}</div>
        {/if}
        {#if o.status === 'available' && o.choice}
          <fieldset class="choice">
            <legend>{o.choice.prompt}</legend>
            {#each o.choice.options as opt (opt.id)}
              {@const miss = missing(opt)}
              <label class="opt" class:locked={miss.length > 0} class:sel={pending[o.id] === opt.id}>
                <input type="radio" name="choice-{o.id}" value={opt.id} disabled={miss.length > 0} bind:group={pending[o.id]} />
                <span class="opt-body">
                  <span class="opt-label">{opt.label}</span>
                  {#if opt.detail}<span class="opt-detail">{opt.detail}</span>{/if}
                  {#if miss.length}
                    <span class="opt-need"><Icon name="lock" size={11} /> Il vous manque : {miss.join(', ')}</span>
                  {/if}
                </span>
              </label>
            {/each}
            <div class="confirm">
              <span class="dim">Ce choix est définitif.</span>
              <button class="kp-btn primary" disabled={!pending[o.id]} onclick={() => confirmChoice(o)}>Confirmer</button>
            </div>
          </fieldset>
        {:else if o.status === 'available' && o.answer}
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
    <div class="kp-label">Dossier · {k.bundle.id}</div>
    <h1>{k.bundle.title}</h1>
    <div class="bar"><div class="fill" style="width:{(progress.done / progress.total) * 100}%"></div></div>
    <div class="stats mono">
      <span><b>{progress.done}</b>/{progress.total} objectifs</span>
      {#if hasEvidence}<span><Icon name="key" size={12} /> <b>{evidence.length}</b>/{evidenceTotal} pièces</span>{/if}
      <span><Icon name="clock" size={12} /> {elapsed}</span>
      <span><Icon name="lightbulb" size={12} /> {hintsUsed} indice{hintsUsed > 1 ? 's' : ''}</span>
    </div>
    {#if hasEvidence}
      <div class="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'objectives'} class:on={tab === 'objectives'} onclick={() => (tab = 'objectives')}>Objectifs</button>
        <button role="tab" aria-selected={tab === 'evidence'} class:on={tab === 'evidence'} onclick={() => (tab = 'evidence')}>
          Pièces <span class="count mono">{evidence.length}</span>
        </button>
      </div>
    {/if}
  </header>

  <div class="scroll">
    {#if tab === 'objectives'}
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
    {:else}
      <p class="ev-intro dim">Faits établis au cours de l'enquête. Tous ne disent pas la même chose — c'est à vous d'en juger.</p>
      <ul class="evidence">
        {#each evidence as ev, i (ev.id)}
          <li class="ev">
            <div class="ev-head">
              <span class="ev-n mono">#{String(i + 1).padStart(2, '0')}</span>
              <span class="ev-title">{ev.title}</span>
              {#if ev.tag}<span class="kp-badge cyan">{ev.tag}</span>{/if}
            </div>
            <div class="ev-sum">{ev.summary}</div>
            {#if ev.source && ev.machine}
              {@const host = os.kernel?.hosts.get(ev.machine)?.machine.hostname ?? ev.machine}
              <span class="ev-src mono" title="Sur la machine distante {host} — consultable par ssh">
                <Icon name="server" size={12} /> {host}:{ev.source}
              </span>
            {:else if ev.source}
              <button class="ev-src mono" onclick={() => os.openPath(ev.source!)} title="Ouvrir la source">
                <Icon name="file" size={12} /> {P.tildify(ev.source, home)}
              </button>
            {/if}
          </li>
        {:else}
          <li class="kp-empty">Aucune pièce pour l'instant. Explorez : mails, journaux, fichiers, photos…</li>
        {/each}
      </ul>
      {#if evidence.length < evidenceTotal}
        <p class="dim more mono">{evidenceTotal - evidence.length} pièce{evidenceTotal - evidence.length > 1 ? 's' : ''} encore à découvrir.</p>
      {/if}
    {/if}
  </div>
</div>

<style>
  .case { display: flex; flex-direction: column; flex: 1; min-height: 0; background: var(--kp-bg-1); }
  .head { padding: 18px 20px 0; border-bottom: 1px solid var(--kp-line); background: linear-gradient(180deg, rgba(157, 123, 255, 0.07), transparent); }
  h1 { margin: 4px 0 12px; font-size: 22px; letter-spacing: -0.02em; }
  .bar { height: 4px; border-radius: 4px; background: var(--kp-bg-4); overflow: hidden; }
  .fill { height: 100%; background: linear-gradient(90deg, var(--kp-violet), var(--kp-cyan)); box-shadow: 0 0 12px rgba(62, 230, 245, 0.6); transition: width var(--kp-dur-slow) var(--kp-ease); }
  .stats { display: flex; flex-wrap: wrap; gap: 6px 16px; margin: 10px 0 14px; color: var(--kp-text-2); font-size: 11.5px; }
  .stats span { display: inline-flex; align-items: center; gap: 5px; }
  .stats b { color: var(--kp-text-0); }
  .tabs { display: flex; gap: 4px; }
  .tabs button {
    display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px;
    border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--kp-text-2); font-weight: 500;
  }
  .tabs button:hover { color: var(--kp-text-0); }
  .tabs button.on { color: var(--kp-text-0); border-bottom-color: var(--kp-cyan); }
  .count { font-size: 10.5px; padding: 0 5px; border-radius: 4px; background: var(--kp-bg-4); color: var(--kp-text-1); }
  .scroll { flex: 1; overflow: auto; padding: 8px 12px 20px; }
  .list { list-style: none; margin: 0; padding: 0; }
  .obj { display: flex; gap: 12px; padding: 14px 10px; border-bottom: 1px solid var(--kp-line); }
  .mark { width: 26px; flex-shrink: 0; display: flex; justify-content: center; align-items: flex-start; padding-top: 1px; }
  .idx { font-size: 11px; color: var(--kp-violet); border: 1px solid rgba(157, 123, 255, 0.35); border-radius: 6px; padding: 1px 4px; }
  .done .mark { color: var(--kp-green); }
  .locked .mark { color: var(--kp-text-2); }
  .txt { flex: 1; min-width: 0; }
  .title { font-weight: 600; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .done .title { color: var(--kp-text-1); text-decoration: line-through; text-decoration-color: rgba(90, 242, 160, 0.5); }
  .done.decision .title { text-decoration: none; }
  .locked .title { color: var(--kp-text-2); }
  .desc { margin-top: 3px; color: var(--kp-text-1); font-size: 12.5px; line-height: 1.55; }
  .dim { color: var(--kp-text-2); }
  .done .desc { color: var(--kp-text-2); }
  .chosen { display: inline-flex; align-items: center; gap: 6px; margin-top: 8px; padding: 4px 10px; border-radius: var(--kp-radius-s); background: var(--kp-violet-dim); color: var(--kp-violet); font-size: 12.5px; }
  .answer { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
  .answer .row { display: flex; gap: 6px; }
  .answer input { flex: 1; }
  .shake { animation: shake 320ms var(--kp-ease); }
  @keyframes shake { 20%, 60% { transform: translateX(-5px); } 40%, 80% { transform: translateX(5px); } }
  .err { color: var(--kp-red); font-size: 11.5px; }
  .auto { display: flex; align-items: center; gap: 6px; margin-top: 8px; font-size: 11.5px; }

  .choice { margin: 12px 0 0; padding: 0; border: 0; display: flex; flex-direction: column; gap: 6px; }
  legend { padding: 0; margin-bottom: 8px; font-weight: 600; font-size: 12.5px; color: var(--kp-text-0); }
  .opt {
    display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; cursor: pointer;
    border: 1px solid var(--kp-line); border-radius: var(--kp-radius-m); background: var(--kp-bg-2);
    transition: border-color var(--kp-dur-fast), background var(--kp-dur-fast);
  }
  .opt:hover:not(.locked) { border-color: var(--kp-line-strong); background: var(--kp-bg-3); }
  .opt.sel { border-color: rgba(157, 123, 255, 0.55); background: var(--kp-violet-dim); }
  .opt.locked { cursor: not-allowed; opacity: 0.6; }
  .opt input { margin: 3px 0 0; accent-color: var(--kp-violet); }
  .opt-body { display: flex; flex-direction: column; gap: 3px; }
  .opt-label { font-weight: 500; }
  .opt-detail { color: var(--kp-text-1); font-size: 12px; line-height: 1.5; }
  .opt-need { display: inline-flex; align-items: center; gap: 5px; color: var(--kp-amber); font-size: 11.5px; }
  .confirm { display: flex; align-items: center; justify-content: space-between; margin-top: 4px; font-size: 11.5px; }

  .hints { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
  .hint { display: flex; gap: 8px; padding: 8px 10px; border-radius: var(--kp-radius-s); background: var(--kp-amber-dim); color: #ffd79a; font-size: 12.5px; line-height: 1.5; user-select: text; }
  .hint :global(svg) { flex-shrink: 0; margin-top: 2px; color: var(--kp-amber); }
  .hint-btn { align-self: flex-start; height: 26px; color: var(--kp-amber); }
  .cost { font-size: 10.5px; color: var(--kp-text-2); }
  .bonus-h { margin: 20px 10px 4px; color: var(--kp-violet); }
  .end { margin: 18px 10px 0; height: 36px; }

  .ev-intro { margin: 8px 10px 12px; font-size: 12px; }
  .evidence { list-style: none; margin: 0; padding: 0 4px; display: flex; flex-direction: column; gap: 8px; }
  .ev { padding: 12px 14px; border-radius: var(--kp-radius-m); background: var(--kp-bg-2); border: 1px solid var(--kp-line); border-left: 2px solid var(--kp-violet); animation: in var(--kp-dur-slow) var(--kp-ease); }
  @keyframes in { from { opacity: 0; transform: translateY(4px); } }
  .ev-head { display: flex; align-items: center; gap: 8px; }
  .ev-n { color: var(--kp-violet); font-size: 11px; }
  .ev-title { font-weight: 600; flex: 1; }
  .ev-sum { margin-top: 6px; color: var(--kp-text-1); font-size: 12.5px; line-height: 1.55; user-select: text; }
  .ev-src { display: inline-flex; align-items: center; gap: 6px; margin-top: 8px; padding: 2px 6px; border: 0; border-radius: 5px; background: transparent; color: var(--kp-cyan); font-size: 11px; }
  .ev-src:hover { background: var(--kp-cyan-dim); }
  .more { margin: 12px 10px 0; font-size: 11px; }
</style>
