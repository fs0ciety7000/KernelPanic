<script lang="ts">
  import { untrack } from 'svelte';
  import { os } from '$lib/os/os.svelte';
  import type { AppProps } from '$lib/os/apps';
  import { path as P, type Stat } from '@kp/kernel';
  import Icon from '$lib/desktop/Icon.svelte';
  import { fsErrorText } from '../fs-helpers';
  import { parseLog } from './parse';

  let { win }: AppProps = $props();
  const k = os.kernel!;
  const PRESETS = [
    { id: 'all', label: 'Tout', re: null },
    { id: 'fail', label: 'Échecs', re: /fail|invalid|denied|error|refused/i },
    { id: 'auth', label: 'Connexions', re: /accepted|session (opened|closed)|disconnect/i },
    { id: 'sudo', label: 'sudo', re: /sudo/i },
    { id: 'cron', label: 'CRON', re: /cron/i },
  ];

  let path = $state('/var/log/auth.log');
  let query = $state('');
  let preset = $state('all');
  let wrap = $state(false);

  $effect(() => {
    void win.nonce;
    const target = win.args.path;
    untrack(() => {
      if (typeof target === 'string') path = target;
    });
  });

  const files = $derived.by(() => {
    void os.version;
    const out: Array<Stat & { readable: boolean }> = [];
    const walk = (dir: string) => {
      let entries: Stat[];
      try {
        entries = k.vfs.readdir(dir, os.cred, { silent: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (e.type === 'dir') walk(e.path);
        else {
          let readable = true;
          try {
            k.vfs.readFile(e.path, os.cred, { silent: true });
          } catch {
            readable = false;
          }
          out.push({ ...e, readable });
        }
      }
    };
    walk('/var/log');
    return out;
  });

  const doc = $derived.by(() => {
    void os.version;
    try {
      return { lines: parseLog(k.vfs.readFile(path, os.cred, { silent: true })), error: null };
    } catch (e) {
      return { lines: [], error: fsErrorText(e, path) };
    }
  });

  // One fs.read per opened file, not per re-render.
  $effect(() => {
    const p = path;
    untrack(() => {
      try {
        k.vfs.readFile(p, os.cred);
      } catch {
        /* shown in doc.error */
      }
    });
  });

  const matcher = $derived.by((): RegExp | null => {
    if (!query) return null;
    const m = query.match(/^\/(.+)\/([i]*)$/);
    try {
      return m ? new RegExp(m[1]!, m[2] || 'i') : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    } catch {
      return null;
    }
  });

  const shown = $derived.by(() => {
    const re = PRESETS.find((p) => p.id === preset)?.re;
    return doc.lines.filter((l) => (!re || re.test(l.raw)) && (!matcher || matcher.test(l.raw)));
  });

  function parts(text: string) {
    if (!matcher) return [{ t: text, hit: false }];
    const re = new RegExp(matcher.source, matcher.flags.includes('g') ? matcher.flags : matcher.flags + 'g');
    const out: Array<{ t: string; hit: boolean }> = [];
    let last = 0;
    for (const m of text.matchAll(re)) {
      if (!m[0]) break;
      if (m.index! > last) out.push({ t: text.slice(last, m.index), hit: false });
      out.push({ t: m[0], hit: true });
      last = m.index! + m[0].length;
    }
    out.push({ t: text.slice(last), hit: false });
    return out;
  }

  $effect(() => {
    win.title = `Logs — ${P.basename(path)}`;
  });
</script>

<div class="logs">
  <aside class="kp-sidebar">
    <div class="kp-label sec">/var/log</div>
    {#each files as f (f.path)}
      <button class="kp-side-item mono" class:active={path === f.path} class:locked={!f.readable} onclick={() => (path = f.path)} title={f.readable ? f.path : `${f.path} — accès refusé`}>
        <Icon name={f.readable ? 'file-log' : 'lock'} size={14} />
        <span class="fn">{f.path.slice('/var/log/'.length)}</span>
      </button>
    {/each}
  </aside>
  <div class="main">
    <div class="kp-toolbar">
      <div class="search">
        <Icon name="search" size={14} />
        <input class="kp-input mono" placeholder="Filtrer (texte ou /regex/)" bind:value={query} />
      </div>
      <div class="chips">
        {#each PRESETS as p (p.id)}
          <button class="kp-btn" class:active={preset === p.id} onclick={() => (preset = p.id)}>{p.label}</button>
        {/each}
      </div>
      <button class="kp-btn ghost" class:active={wrap} onclick={() => (wrap = !wrap)} title="Retour à la ligne">↵</button>
    </div>
    {#if doc.error}
      <div class="kp-error"><Icon name="lock" size={13} /> {doc.error} — certains journaux exigent les droits root.</div>
    {:else}
      <div class="table mono" class:wrap>
        {#each shown.slice(0, 3000) as l (l.n)}
          <div class="line {l.level}">
            <span class="n num">{l.n}</span>
            <span class="t num">{l.time}</span>
            <span class="s">{l.source}</span>
            <span class="m">{#each parts(l.message) as p, i (i)}{#if p.hit}<mark>{p.t}</mark>{:else}{p.t}{/if}{/each}</span>
          </div>
        {:else}
          <div class="kp-empty">Aucune ligne ne correspond.</div>
        {/each}
      </div>
    {/if}
    <footer class="status mono">
      <span>{shown.length} / {doc.lines.length} lignes</span>
      <span>{path}</span>
    </footer>
  </div>
</div>

<style>
  .logs { display: flex; flex: 1; min-height: 0; }
  .kp-sidebar { width: 200px; }
  .sec { padding: 2px 8px 6px; }
  .kp-side-item { font-size: 11.5px; }
  .kp-side-item.locked { color: var(--kp-text-2); }
  .fn { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .search { position: relative; flex: 1; display: flex; align-items: center; color: var(--kp-text-2); min-width: 120px; }
  .search :global(svg) { position: absolute; left: 9px; }
  .search input { flex: 1; padding-left: 30px; font-size: 12px; }
  .chips { display: flex; gap: 4px; }
  .chips .kp-btn { height: 26px; padding: 0 9px; font-size: 12px; }
  .table { flex: 1; overflow: auto; font-size: 12px; line-height: 1.55; background: #070a0f; padding: 6px 0; user-select: text; }
  .line { display: grid; grid-template-columns: 46px 128px 150px 1fr; gap: 12px; padding: 1px 14px; white-space: pre; }
  .wrap .line { white-space: pre-wrap; word-break: break-all; }
  .line:hover { background: rgba(255, 255, 255, 0.025); }
  .n { color: #3a4454; text-align: right; user-select: none; }
  .t { color: var(--kp-cyan); opacity: 0.85; }
  .s { color: var(--kp-violet); overflow: hidden; text-overflow: ellipsis; }
  .m { color: var(--kp-text-1); overflow: hidden; }
  .wrap .m { overflow: visible; }
  .error .m { color: var(--kp-red); }
  .warn .m { color: var(--kp-amber); }
  .ok .m { color: var(--kp-green); }
  mark { background: rgba(62, 230, 245, 0.25); color: var(--kp-text-0); border-radius: 2px; box-shadow: 0 0 0 1px rgba(62, 230, 245, 0.4); }
  .status { display: flex; justify-content: space-between; height: 26px; align-items: center; padding: 0 14px; border-top: 1px solid var(--kp-line); background: var(--kp-bg-2); color: var(--kp-text-2); font-size: 11px; }
</style>
