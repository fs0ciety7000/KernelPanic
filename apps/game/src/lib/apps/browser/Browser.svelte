<script lang="ts">
  import { untrack } from 'svelte';
  import { os } from '$lib/os/os.svelte';
  import type { AppProps } from '$lib/os/apps';
  import { parseUrl, type WebResult } from '@kp/kernel';
  import Icon from '$lib/desktop/Icon.svelte';

  let { win }: AppProps = $props();
  const k = os.kernel!;
  const home = k.users.get(k.sessionUser)!.home;
  const HISTORY = `${home}/.local/share/kp-browser/history`;
  const web = k.bundle.web;
  const startUrl = web?.home ?? 'about:blank';

  let current = $state<WebResult | null>(null);
  let back = $state<string[]>([]);
  let forward = $state<string[]>([]);
  let address = $state('');
  let editing = $state(false);
  let loading = $state(false);
  let showHistory = $state(false);
  let frame = $state<HTMLIFrameElement>();

  function appendHistory(r: WebResult) {
    if (r.status !== 'ok' && r.status !== 'notfound') return;
    try {
      k.vfs.mkdir(HISTORY.slice(0, HISTORY.lastIndexOf('/')), os.cred, { parents: true });
      k.vfs.writeFile(HISTORY, `${k.time.iso(k.now())}\t${r.url}\t${r.title.replace(/\t/g, ' ')}\n`, os.cred, { append: true });
    } catch {
      /* read-only home: browse without history */
    }
  }

  function load(url: string, push = true) {
    if (url === 'about:blank') {
      current = null;
      address = '';
      return;
    }
    loading = true;
    // A short delay makes navigation feel like a network round-trip.
    setTimeout(() => {
      const r = k.fetch(url, os.cred);
      if (push && current) {
        back = [...back, current.url];
        forward = [];
      }
      current = r;
      address = r.url;
      loading = false;
      appendHistory(r);
    }, 160);
  }

  $effect(() => {
    void win.nonce;
    const target = typeof win.args.url === 'string' ? win.args.url : typeof win.args.path === 'string' ? `file://${win.args.path}` : startUrl;
    untrack(() => load(target, !!current));
  });

  $effect(() => {
    win.title = current ? `${current.title} — Navigateur` : 'Navigateur';
  });

  function goBack() {
    const prev = back.at(-1);
    if (!prev || !current) return;
    back = back.slice(0, -1);
    forward = [current.url, ...forward];
    load(prev, false);
  }
  function goForward() {
    const next = forward[0];
    if (!next || !current) return;
    forward = forward.slice(1);
    back = [...back, current.url];
    load(next, false);
  }

  /** Resolve a link from the page against the current URL (scheme-less hosts stay inside the sim). */
  function resolveHref(href: string): string {
    const base = current?.url ?? 'https://localhost/';
    try {
      return new URL(href, base).toString();
    } catch {
      return href;
    }
  }

  // Pages run without scripts; the browser handles navigation itself.
  function onFrameLoad() {
    const doc = frame?.contentDocument;
    if (!doc) return;
    doc.addEventListener('click', (e) => {
      const a = (e.target as Element).closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a) return;
      e.preventDefault();
      const href = a.getAttribute('href')!;
      if (href.startsWith('#')) {
        doc.getElementById(href.slice(1))?.scrollIntoView();
        return;
      }
      load(resolveHref(href));
    });
    doc.addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.target as HTMLFormElement;
      const params = new URLSearchParams();
      for (const [key, value] of new FormData(form)) if (typeof value === 'string') params.append(key, value);
      const action = resolveHref(form.getAttribute('action') || current?.url || '');
      load(`${action.split('?')[0]}?${params.toString()}`);
    });
  }

  const secure = $derived(current?.url.startsWith('https://'));
  const isFile = $derived(current?.url.startsWith('file://'));

  const historyLines = $derived.by(() => {
    void os.version;
    if (!showHistory) return [];
    try {
      return k.vfs
        .readFile(HISTORY, os.cred)
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((l) => {
          const [at, url, title] = l.split('\t');
          return { at: at ?? '', url: url ?? '', title: title ?? url ?? '' };
        })
        .reverse();
    } catch {
      return [];
    }
  });

  function submitAddress(e: SubmitEvent) {
    e.preventDefault();
    editing = false;
    const value = address.trim();
    if (value) load(value);
  }

  const ERROR_ICON: Record<string, string> = { dns: 'search', timeout: 'clock', blocked: 'shield', notfound: 'alert', error: 'lock' };
</script>

<div class="browser">
  <div class="kp-toolbar bar">
    <button class="kp-btn ghost" aria-label="Précédent" disabled={!back.length} onclick={goBack}><Icon name="chevron-left" /></button>
    <button class="kp-btn ghost" aria-label="Suivant" disabled={!forward.length} onclick={goForward}><Icon name="chevron-right" /></button>
    <button class="kp-btn ghost" aria-label="Recharger" disabled={!current} onclick={() => current && load(current.url, false)}><Icon name="refresh" size={15} /></button>
    <button class="kp-btn ghost" aria-label="Accueil" onclick={() => load(startUrl)}><Icon name="home" size={15} /></button>
    <form class="address" class:focus={editing} onsubmit={submitAddress}>
      <span class="lock" class:ok={secure} title={isFile ? 'Fichier local' : secure ? 'Connexion chiffrée (TLS)' : 'Connexion non sécurisée'}>
        <Icon name={isFile ? 'file' : secure ? 'lock' : 'alert'} size={13} />
      </span>
      <input
        class="mono"
        bind:value={address}
        onfocus={(e) => { editing = true; e.currentTarget.select(); }}
        onblur={() => { editing = false; address = current?.url ?? ''; }}
        placeholder="Saisir une adresse (ex. intranet.entreprise.local)"
        spellcheck="false"
        aria-label="Adresse"
      />
      {#if loading}<span class="spin" aria-hidden="true"></span>{/if}
    </form>
    <button class="kp-btn ghost" class:active={showHistory} aria-label="Historique" title="Historique" onclick={() => (showHistory = !showHistory)}><Icon name="clock" size={15} /></button>
  </div>

  {#if web?.bookmarks?.length}
    <nav class="bookmarks">
      {#each web.bookmarks as b (b.url)}
        <button onclick={() => load(b.url)}><Icon name="diamond" size={10} />{b.label}</button>
      {/each}
    </nav>
  {/if}

  <div class="view">
    {#if !current}
      <div class="kp-empty">
        <div>
          <Icon name="search" size={30} stroke={1.2} />
          <p>Aucune page d'accueil configurée sur ce poste.</p>
        </div>
      </div>
    {:else if current.status === 'ok'}
      {#key current.url + current.title}
        <iframe
          bind:this={frame}
          title={current.title}
          sandbox="allow-same-origin"
          srcdoc={current.html}
          onload={onFrameLoad}
        ></iframe>
      {/key}
    {:else}
      <div class="error {current.status}">
        <span class="eicon"><Icon name={ERROR_ICON[current.status] ?? 'alert'} size={34} stroke={1.3} /></span>
        <h2>{current.title}</h2>
        <p>{current.message}</p>
        <p class="mono url">{current.url}</p>
        {#if current.status === 'blocked'}
          <p class="policy">Politique de sécurité de la session forensique. Pour analyser ce site, utilisez les journaux et les en-têtes, pas le navigateur.</p>
        {/if}
      </div>
    {/if}

    {#if showHistory}
      <aside class="history">
        <div class="hhead"><span class="kp-label">Historique</span><span class="mono dim">~/.local/share/kp-browser/history</span></div>
        {#each historyLines as h, i (i)}
          <button class="hrow" onclick={() => load(h.url)}>
            <span class="ht">{h.title}</span>
            <span class="hu mono">{h.url}</span>
            <span class="ha mono">{h.at}</span>
          </button>
        {:else}
          <p class="dim pad">Historique vide.</p>
        {/each}
      </aside>
    {/if}
  </div>
</div>

<style>
  .browser { display: flex; flex-direction: column; flex: 1; min-height: 0; }
  .bar { gap: 4px; }
  .address {
    flex: 1; display: flex; align-items: center; gap: 8px; height: 30px; padding: 0 10px;
    background: var(--kp-bg-1); border: 1px solid var(--kp-line); border-radius: 999px;
  }
  .address.focus { border-color: rgba(62, 230, 245, 0.45); box-shadow: 0 0 0 3px var(--kp-cyan-dim); }
  .address input { flex: 1; min-width: 0; border: 0; outline: none; background: transparent; font-size: 12px; user-select: text; }
  .lock { display: grid; color: var(--kp-amber); }
  .lock.ok { color: var(--kp-green); }
  .spin { width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--kp-cyan-dim); border-top-color: var(--kp-cyan); animation: spin 600ms linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .bookmarks { display: flex; gap: 2px; padding: 4px 8px; border-bottom: 1px solid var(--kp-line); background: var(--kp-bg-2); overflow: hidden; }
  .bookmarks button { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 9px; border: 0; border-radius: 6px; background: transparent; color: var(--kp-text-1); font-size: 11.5px; white-space: nowrap; }
  .bookmarks button:hover { background: var(--kp-bg-4); color: var(--kp-text-0); }
  .bookmarks :global(svg) { color: var(--kp-cyan); }
  .view { position: relative; flex: 1; min-height: 0; display: flex; background: #fff; }
  iframe { flex: 1; width: 100%; height: 100%; border: 0; background: #fff; }
  .error, .kp-empty { flex: 1; background: var(--kp-bg-1); }
  .error { display: flex; flex-direction: column; justify-content: center; padding: 40px 12%; gap: 8px; }
  .eicon { color: var(--kp-text-2); }
  .blocked .eicon { color: var(--kp-red); }
  .timeout .eicon { color: var(--kp-amber); }
  h2 { margin: 8px 0 0; font-size: 22px; letter-spacing: -0.01em; }
  .error p { margin: 0; color: var(--kp-text-1); max-width: 560px; line-height: 1.6; }
  .url { color: var(--kp-text-2) !important; font-size: 12px; word-break: break-all; }
  .policy { margin-top: 10px !important; padding: 10px 12px; border-radius: var(--kp-radius-s); background: var(--kp-red-dim); color: #ffb3c0 !important; font-size: 12.5px; }
  .history { position: absolute; top: 0; right: 0; bottom: 0; width: 360px; overflow: auto; background: var(--kp-bg-2); border-left: 1px solid var(--kp-line-strong); box-shadow: var(--kp-shadow-2); }
  .hhead { display: flex; flex-direction: column; gap: 2px; padding: 12px 14px; border-bottom: 1px solid var(--kp-line); }
  .hrow { display: flex; flex-direction: column; gap: 1px; width: 100%; padding: 8px 14px; border: 0; border-bottom: 1px solid var(--kp-line); background: transparent; text-align: left; color: var(--kp-text-0); }
  .hrow:hover { background: var(--kp-cyan-dim); }
  .ht { font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hu { font-size: 11px; color: var(--kp-cyan); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ha { font-size: 10.5px; color: var(--kp-text-2); }
  .dim { color: var(--kp-text-2); font-size: 11px; }
  .pad { padding: 14px; }
</style>
