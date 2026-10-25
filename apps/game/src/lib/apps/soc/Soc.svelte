<script lang="ts">
  import { os } from '$lib/os/os.svelte';
  import { wm } from '$lib/os/wm.svelte';
  import type { AppProps } from '$lib/os/apps';
  import Icon from '$lib/desktop/Icon.svelte';

  let { win }: AppProps = $props();
  const k = os.kernel!;
  const soc = k.bundle.soc!;
  const SEV: Record<string, string> = { low: 'faible', medium: 'moyenne', high: 'haute', critical: 'critique' };
  const STATE: Record<string, string> = { ok: 'sain', infected: soc.faultLabel ?? 'compromis', isolated: 'isolé' };

  // The runtime mutates in place: derive fresh copies on each change.
  const alerts = $derived.by(() => {
    void os.version;
    return k.runtime.socAlerts();
  });
  const states = $derived.by(() => {
    void os.version;
    return Object.fromEntries(soc.assets.map((a) => [a.id, k.runtime.assetState(a.id)]));
  });
  const blocked = $derived.by(() => {
    void os.version;
    return k.runtime.blocked();
  });
  const ended = $derived.by(() => {
    void os.version;
    return k.runtime.ended;
  });
  const clock = $derived.by(() => {
    void os.tick;
    return k.time.hms(k.now());
  });

  const zones = soc.zones ?? [...new Set(soc.assets.map((a) => a.zone ?? 'Réseau'))];
  let selected = $state<string | null>(null);
  let confirming = $state(false);
  let filter = $state<'open' | 'all'>('open');
  let ip = $state('');
  let ipError = $state('');
  let expanded = $state<string | null>(null);

  const asset = $derived(soc.assets.find((a) => a.id === selected));
  const shown = $derived(filter === 'open' ? alerts.filter((a) => !a.verdict) : alerts);
  const counts = $derived({
    open: alerts.filter((a) => !a.verdict).length,
    infected: Object.values(states).filter((s) => s === 'infected').length,
    isolated: Object.values(states).filter((s) => s === 'isolated').length,
  });

  // Looking at the console acknowledges new alerts.
  $effect(() => {
    void alerts.length;
    if (wm.focused?.id === win.id && !win.minimized) queueMicrotask(() => k.runtime.markAlertsSeen());
  });

  $effect(() => {
    win.title = counts.open ? `Console SOC — ${counts.open} alerte${counts.open > 1 ? 's' : ''} ouverte${counts.open > 1 ? 's' : ''}` : 'Console SOC';
  });

  function pick(id: string) {
    selected = selected === id ? null : id;
    confirming = false;
  }

  function isolate() {
    if (!asset) return;
    if (!confirming) {
      confirming = true;
      return;
    }
    k.runtime.isolate(asset.id);
    confirming = false;
  }

  function block(e: SubmitEvent) {
    e.preventDefault();
    ipError = '';
    if (blocked.includes(ip.trim())) ipError = 'Déjà bloquée.';
    else if (!k.runtime.block(ip)) ipError = 'Adresse IPv4 invalide.';
    else ip = '';
  }

  const assetName = (id?: string) => soc.assets.find((a) => a.id === id)?.name ?? '';
</script>

<div class="soc">
  <header>
    <div class="title"><Icon name="shield" size={16} /> {soc.name ?? 'Console SOC'}</div>
    <div class="stats mono">
      <span class:hot={counts.open}><b>{counts.open}</b> alertes ouvertes</span>
      <span class:hot={counts.infected}><b>{counts.infected}</b> {STATE.infected}</span>
      <span><b>{counts.isolated}</b> isolés</span>
      <span><b>{blocked.length}</b> règles pare-feu</span>
      <span class="clock">{clock}</span>
    </div>
  </header>

  <div class="body">
    <section class="map" aria-label="Carte du réseau">
      <div class="zones" style="--n:{zones.length}">
        {#each zones as z (z)}
          <div class="zone">
            <div class="kp-label">{z}</div>
            {#each soc.assets.filter((a) => (a.zone ?? 'Réseau') === z) as a (a.id)}
              <button class="asset s-{states[a.id]}" class:sel={selected === a.id} onclick={() => pick(a.id)} title="{a.name} — {STATE[states[a.id]!]}">
                <span class="dot"></span>
                <span class="an">{a.name}</span>
                <span class="ai mono">{a.ip}</span>
                {#if states[a.id] === 'isolated'}<Icon name="lock" size={12} />{/if}
              </button>
            {/each}
          </div>
        {/each}
      </div>

      {#if asset}
        <div class="detail">
          <div class="dh">
            <span class="dot s-{states[asset.id]}"></span>
            <b>{asset.name}</b>
            <span class="mono dim">{asset.ip}</span>
            <span class="kp-badge {states[asset.id] === 'infected' ? 'red' : states[asset.id] === 'isolated' ? '' : 'green'}">{STATE[states[asset.id]!]}</span>
          </div>
          <p class="role">{asset.role}</p>
          {#if asset.host}<p class="dim mono small">Accessible en ssh depuis le terminal{states[asset.id] === 'isolated' ? ' — plus maintenant' : ''}.</p>{/if}
          {#if states[asset.id] !== 'isolated' && !ended}
            {#if confirming}
              <div class="confirm">
                <p><Icon name="alert" size={13} /> L'isolement est définitif pour cette nuit.{asset.impact ? ` Conséquence : ${asset.impact}` : ''}</p>
                <div class="row">
                  <button class="kp-btn danger" onclick={isolate}>Confirmer l'isolement</button>
                  <button class="kp-btn ghost" onclick={() => (confirming = false)}>Annuler</button>
                </div>
              </div>
            {:else}
              <button class="kp-btn" onclick={isolate}><Icon name="lock" size={13} /> Isoler du réseau</button>
            {/if}
          {/if}
        </div>
      {:else}
        <p class="hint dim">Sélectionnez une machine pour voir son état et agir.</p>
      {/if}

      <form class="fw" onsubmit={block}>
        <div class="kp-label">Pare-feu périmétrique — bloquer une adresse</div>
        <div class="row">
          <input class="mono" bind:value={ip} placeholder="ex. 203.0.113.10" spellcheck="false" aria-label="Adresse IP à bloquer" disabled={ended} />
          <button class="kp-btn" type="submit" disabled={!ip.trim() || ended}>Bloquer</button>
        </div>
        {#if ipError}<p class="err">{ipError}</p>{/if}
        {#if blocked.length}
          <ul class="rules mono">
            {#each blocked as b (b)}<li><Icon name="x" size={11} /> deny {b}</li>{/each}
          </ul>
        {/if}
      </form>
    </section>

    <section class="feed" aria-label="Alertes">
      <div class="fh">
        <div class="kp-label">Alertes</div>
        <div class="tabs">
          <button class:on={filter === 'open'} onclick={() => (filter = 'open')}>Ouvertes</button>
          <button class:on={filter === 'all'} onclick={() => (filter = 'all')}>Toutes ({alerts.length})</button>
        </div>
      </div>
      <ol>
        {#each shown as a (a.id)}
          <li class="alert sev-{a.severity}" class:new={!a.seen}>
            <button class="ah" onclick={() => (expanded = expanded === a.id ? null : a.id)} aria-expanded={expanded === a.id}>
              <span class="sev mono">{SEV[a.severity]}</span>
              <span class="at mono">{k.time.hm(a.at)}</span>
              <span class="at-title">{a.title}</span>
              {#if a.verdict}<span class="kp-badge {a.verdict === 'real' ? 'red' : ''}">{a.verdict === 'real' ? 'incident' : 'faux positif'}</span>{/if}
            </button>
            {#if expanded === a.id}
              <div class="ab">
                {#if a.asset}<button class="link mono" onclick={() => pick(a.asset!)}>{assetName(a.asset)}</button>{/if}
                <p>{a.detail}</p>
                {#if !a.verdict && !ended}
                  <div class="row">
                    <button class="kp-btn danger" onclick={() => k.runtime.triage(a.id, 'real')}>Incident</button>
                    <button class="kp-btn ghost" onclick={() => k.runtime.triage(a.id, 'false')}>Faux positif</button>
                  </div>
                {/if}
              </div>
            {/if}
          </li>
        {:else}
          <li class="empty dim">{filter === 'open' ? 'Aucune alerte ouverte.' : 'Aucune alerte pour l’instant. La nuit est calme… pour l’instant.'}</li>
        {/each}
      </ol>
    </section>
  </div>
</div>

<style>
  .soc { display: flex; flex-direction: column; flex: 1; min-height: 0; background: var(--kp-bg-1); }
  header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 10px 16px; border-bottom: 1px solid var(--kp-line); background: var(--kp-bg-2); }
  .title { display: flex; align-items: center; gap: 8px; font-weight: 600; color: var(--kp-text-0); }
  .stats { display: flex; gap: 14px; font-size: 11.5px; color: var(--kp-text-2); flex-wrap: wrap; }
  .stats b { color: var(--kp-text-0); }
  .stats .hot b { color: var(--kp-red); }
  .clock { color: var(--kp-cyan); }
  .body { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 380px; }
  .map { min-height: 0; overflow: auto; padding: 14px 16px; display: flex; flex-direction: column; gap: 14px; border-right: 1px solid var(--kp-line); }
  .zones { display: grid; grid-template-columns: repeat(var(--n), minmax(150px, 1fr)); gap: 10px; }
  .zone { display: flex; flex-direction: column; gap: 6px; padding: 10px; border: 1px dashed var(--kp-line-strong); border-radius: var(--kp-radius-m); }
  .asset { display: grid; grid-template-columns: 10px 1fr auto; grid-template-rows: auto auto; column-gap: 8px; align-items: center; padding: 8px 10px; border: 1px solid var(--kp-line); border-radius: var(--kp-radius-m); background: var(--kp-bg-2); color: var(--kp-text-0); text-align: left; }
  .asset:hover { border-color: var(--kp-line-strong); }
  .asset.sel { border-color: var(--kp-cyan); box-shadow: 0 0 0 2px var(--kp-cyan-dim); }
  .asset .dot { grid-row: 1 / 3; }
  .an { font-size: 12.5px; font-weight: 600; }
  .ai { grid-column: 2; font-size: 10.5px; color: var(--kp-text-2); }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--kp-green); box-shadow: 0 0 6px var(--kp-green); }
  .s-infected .dot, .dot.s-infected { background: var(--kp-red); box-shadow: 0 0 8px var(--kp-red); animation: beat 1.2s ease-in-out infinite; }
  .s-isolated .dot, .dot.s-isolated { background: var(--kp-text-2); box-shadow: none; }
  .asset.s-infected { border-color: rgba(255, 79, 109, 0.45); }
  .asset.s-isolated { opacity: 0.7; }
  @keyframes beat { 50% { opacity: 0.45; } }
  @media (prefers-reduced-motion: reduce) { .dot { animation: none !important; } }
  .detail { padding: 12px 14px; border: 1px solid var(--kp-line); border-radius: var(--kp-radius-m); background: var(--kp-bg-2); display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
  .dh { display: flex; align-items: center; gap: 8px; }
  .role { margin: 0; color: var(--kp-text-1); font-size: 13px; }
  .small { margin: 0; font-size: 11.5px; }
  .confirm { padding: 10px; border: 1px solid rgba(255, 79, 109, 0.4); border-radius: var(--kp-radius-m); background: var(--kp-red-dim); }
  .confirm p { margin: 0 0 8px; font-size: 12.5px; color: var(--kp-text-0); }
  .row { display: flex; gap: 8px; align-items: center; }
  .hint { margin: 0; font-size: 12.5px; }
  .fw { margin-top: auto; display: flex; flex-direction: column; gap: 6px; }
  .fw input { flex: 1; height: 32px; padding: 0 10px; border-radius: var(--kp-radius-m); border: 1px solid var(--kp-line-strong); background: var(--kp-bg-0); color: var(--kp-text-0); font-size: 12.5px; user-select: text; }
  .err { margin: 0; color: var(--kp-red); font-size: 12px; }
  .rules { list-style: none; margin: 0; padding: 0; font-size: 12px; color: var(--kp-amber); display: flex; flex-direction: column; gap: 2px; }
  .rules li { display: flex; align-items: center; gap: 6px; }
  .feed { min-height: 0; display: flex; flex-direction: column; background: var(--kp-bg-2); }
  .fh { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; border-bottom: 1px solid var(--kp-line); }
  .tabs { display: flex; gap: 2px; }
  .tabs button { border: 0; background: transparent; color: var(--kp-text-2); font-size: 12px; padding: 4px 8px; border-radius: 6px; }
  .tabs button.on { background: var(--kp-bg-4); color: var(--kp-text-0); }
  ol { list-style: none; margin: 0; padding: 8px; overflow: auto; flex: 1; display: flex; flex-direction: column; gap: 6px; }
  .alert { border: 1px solid var(--kp-line); border-left: 3px solid var(--kp-text-2); border-radius: var(--kp-radius-m); background: var(--kp-bg-1); animation: in 220ms var(--kp-ease); }
  @keyframes in { from { opacity: 0; transform: translateY(-4px); } }
  .alert.new { box-shadow: 0 0 0 1px rgba(62, 230, 245, 0.25); }
  .sev-medium { border-left-color: var(--kp-amber); }
  .sev-high { border-left-color: #ff8a5b; }
  .sev-critical { border-left-color: var(--kp-red); }
  .ah { display: grid; grid-template-columns: auto auto 1fr auto; gap: 8px; align-items: center; width: 100%; padding: 8px 10px; border: 0; background: transparent; color: var(--kp-text-0); text-align: left; font-size: 12.5px; }
  .sev { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--kp-text-2); }
  .sev-critical .sev { color: var(--kp-red); }
  .sev-high .sev { color: #ff8a5b; }
  .sev-medium .sev { color: var(--kp-amber); }
  .at { font-size: 11px; color: var(--kp-text-2); }
  .ab { padding: 0 10px 10px; display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
  .ab p { margin: 0; font-size: 12.5px; color: var(--kp-text-1); line-height: 1.5; white-space: pre-wrap; user-select: text; }
  .link { border: 0; background: transparent; color: var(--kp-cyan); padding: 0; font-size: 11.5px; }
  .empty { padding: 16px; font-size: 12.5px; text-align: center; }
  .dim { color: var(--kp-text-2); }
  @media (max-width: 900px) { .body { grid-template-columns: 1fr; } .map { border-right: 0; } }
</style>
