<script lang="ts">
  import { os } from '$lib/os/os.svelte';
  import { notify } from '$lib/os/notify.svelte';
  import Icon from './Icon.svelte';

  let { panel, close }: { panel: 'calendar' | 'notifications' | 'network'; close: () => void } = $props();

  const k = os.kernel!;
  const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const DAYS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
  const ICON = { system: 'info', objective: 'diamond', evidence: 'key', mail: 'mail', error: 'alert', success: 'check-circle' } as const;

  // Game date (the machine's own clock), not the player's.
  const now = $derived.by(() => {
    void os.tick;
    const [y, m, d] = k.time.iso(k.now()).slice(0, 10).split('-').map(Number) as [number, number, number];
    return { y, m, d, time: k.time.hms(k.now()) };
  });
  let offset = $state(0);
  const view = $derived.by(() => {
    const first = new Date(Date.UTC(now.y, now.m - 1 + offset, 1));
    const y = first.getUTCFullYear();
    const m = first.getUTCMonth();
    const lead = (first.getUTCDay() + 6) % 7;
    const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const cells: Array<number | null> = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
    return { y, m, cells };
  });
  const isToday = (d: number | null) => d === now.d && view.m === now.m - 1 && view.y === now.y;

  const ago = (t?: number) => {
    if (!t) return '';
    const s = Math.round((Date.now() - t) / 1000);
    return s < 60 ? 'à l’instant' : s < 3600 ? `il y a ${Math.floor(s / 60)} min` : `il y a ${Math.floor(s / 3600)} h`;
  };

  const net = k.bundle.network;
</script>

<div class="tb-panel tray-panel {panel}" role="dialog">
  {#if panel === 'calendar'}
    <div class="big num">{now.time}</div>
    <div class="dim">{now.d} {MONTHS[now.m - 1]} {now.y} · heure de {k.machine.hostname}</div>
    <div class="cal-head">
      <button aria-label="Mois précédent" onclick={() => offset--}><Icon name="chevron-left" size={14} /></button>
      <span>{MONTHS[view.m]} {view.y}</span>
      <button aria-label="Mois suivant" onclick={() => offset++}><Icon name="chevron-right" size={14} /></button>
    </div>
    <div class="cal">
      {#each DAYS as d (d)}<span class="dow">{d}</span>{/each}
      {#each view.cells as c, i (i)}<span class="day" class:today={isToday(c)}>{c ?? ''}</span>{/each}
    </div>
  {:else if panel === 'notifications'}
    <div class="nhead">
      <span class="kp-label">Notifications</span>
      <div class="nact">
        <button class="link" onclick={() => (notify.quiet = !notify.quiet)}>{notify.quiet ? 'Ne pas déranger : activé' : 'Ne pas déranger'}</button>
        <button class="link" disabled={!notify.history.length} onclick={() => notify.clear()}>Tout effacer</button>
      </div>
    </div>
    <div class="nlist">
      {#each notify.history as n (n.id)}
        <div class="note {n.kind}">
          <span class="ni"><Icon name={ICON[n.kind]} size={14} /></span>
          <div class="nt">
            <div class="ntitle">{n.title}</div>
            {#if n.body}<div class="nbody">{n.body}</div>{/if}
            <div class="nago">{ago(n.at)}</div>
          </div>
          {#if n.action}<button class="kp-btn" onclick={() => { n.action!.run(); close(); }}>{n.action.label}</button>{/if}
        </div>
      {:else}
        <p class="none">Aucune notification.</p>
      {/each}
    </div>
  {:else}
    <div class="nethead"><Icon name="wifi" size={18} /><div><b>Connecté</b><div class="dim">Ethernet · réseau filtré (session forensique)</div></div></div>
    <dl class="netdl mono">
      <dt>Hôte</dt><dd>{k.machine.hostname}{k.machine.domain ? `.${k.machine.domain}` : ''}</dd>
      {#each net.interfaces ?? [{ name: 'eth0', ip: k.machine.ip }] as i (i.name)}
        <dt>{i.name}</dt><dd>{i.ip}{'mac' in i && i.mac ? ` · ${i.mac}` : ''}</dd>
      {/each}
      <dt>Passerelle</dt><dd>{k.machine.ip.replace(/\.\d+$/, '.1')}</dd>
    </dl>
    <p class="dim small">Détails au terminal : <span class="mono">ip a</span>, <span class="mono">netstat</span>, <span class="mono">ping</span>.</p>
  {/if}
</div>

<style>
  .tray-panel {
    position: absolute;
    right: 8px;
    bottom: 56px;
    width: 330px;
    max-height: calc(100vh - 72px);
    overflow: auto;
    padding: 16px;
    background: rgba(12, 16, 22, 0.94);
    backdrop-filter: blur(22px) saturate(150%);
    border: 1px solid var(--kp-line-strong);
    border-radius: var(--kp-radius-l);
    box-shadow: var(--kp-shadow-2);
    z-index: 10003;
    animation: rise var(--kp-dur) var(--kp-ease);
  }
  .notifications { width: 360px; }
  @keyframes rise { from { opacity: 0; transform: translateY(10px); } }
  button { border: 0; background: transparent; color: var(--kp-text-1); }
  .big { font-size: 34px; font-weight: 300; letter-spacing: -0.02em; font-family: var(--kp-font-mono); }
  .dim { color: var(--kp-text-2); font-size: 12px; }
  .small { font-size: 11.5px; margin: 12px 0 0; }
  .cal-head { display: flex; align-items: center; justify-content: space-between; margin: 16px 0 8px; font-weight: 600; text-transform: capitalize; }
  .cal-head button { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 6px; }
  .cal-head button:hover { background: var(--kp-bg-4); color: var(--kp-text-0); }
  .cal { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; text-align: center; }
  .dow { color: var(--kp-text-2); font-size: 10.5px; padding: 4px 0; }
  .day { padding: 6px 0; border-radius: 6px; font-size: 12px; font-variant-numeric: tabular-nums; }
  .day.today { background: var(--kp-cyan); color: var(--kp-bg-0); font-weight: 700; }
  .nhead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .nact { display: flex; gap: 10px; }
  .link { font-size: 11.5px; color: var(--kp-cyan); padding: 0; }
  .link:disabled { color: var(--kp-text-2); }
  .nlist { display: flex; flex-direction: column; gap: 6px; }
  .note { display: flex; gap: 10px; align-items: flex-start; padding: 10px; border-radius: var(--kp-radius-m); background: var(--kp-bg-2); border: 1px solid var(--kp-line); }
  .note.objective, .note.evidence { border-left: 2px solid var(--kp-violet); }
  .ni { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 7px; background: var(--kp-cyan-dim); color: var(--kp-cyan); flex-shrink: 0; }
  .objective .ni, .evidence .ni { background: var(--kp-violet-dim); color: var(--kp-violet); }
  .error .ni { background: var(--kp-red-dim); color: var(--kp-red); }
  .nt { flex: 1; min-width: 0; }
  .ntitle { font-weight: 600; font-size: 12.5px; }
  .nbody { color: var(--kp-text-1); font-size: 12px; }
  .nago { color: var(--kp-text-2); font-size: 10.5px; margin-top: 2px; }
  .none { color: var(--kp-text-2); text-align: center; margin: 24px 0; }
  .nethead { display: flex; gap: 12px; align-items: center; color: var(--kp-green); }
  .nethead b { color: var(--kp-text-0); }
  .netdl { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; margin: 16px 0 0; font-size: 11.5px; }
  dt { color: var(--kp-text-2); }
  dd { margin: 0; color: var(--kp-text-0); word-break: break-all; }
</style>
