<script lang="ts">
  import { untrack } from 'svelte';
  import { os } from '$lib/os/os.svelte';
  import type { AppProps } from '$lib/os/apps';
  import { parseMail, parseAddress, path as P, type ParsedMail } from '@kp/kernel';
  import Icon from '$lib/desktop/Icon.svelte';
  import { fsErrorText } from '../fs-helpers';

  let { win }: AppProps = $props();
  const k = os.kernel!;
  const home = k.users.get(k.sessionUser)!.home;
  const FOLDERS = [
    { id: 'inbox', name: 'Réception', icon: 'inbox', dirs: [`${home}/Maildir/new`, `${home}/Maildir/cur`] },
    { id: 'sent', name: 'Envoyés', icon: 'send', dirs: [`${home}/Maildir/.Sent/cur`] },
  ];

  interface Item {
    path: string;
    mail: ParsedMail;
    unread: boolean;
    time: number;
  }

  let folder = $state('inbox');
  let selected = $state<string | null>(null);
  let showSource = $state(false);
  let query = $state('');

  const listing = $derived.by((): { items: Item[]; error: string | null; unread: Record<string, number> } => {
    void os.version;
    const unread: Record<string, number> = {};
    let error: string | null = null;
    const byFolder: Record<string, Item[]> = {};
    for (const f of FOLDERS) {
      byFolder[f.id] = [];
      for (const dir of f.dirs) {
        try {
          for (const e of k.vfs.readdir(dir, os.cred, { silent: true })) {
            if (e.type !== 'file') continue;
            const mail = parseMail(k.vfs.readFile(e.path, os.cred, { silent: true }));
            byFolder[f.id]!.push({ path: e.path, mail, unread: dir.endsWith('/new'), time: Date.parse(mail.date) || e.mtime });
          }
        } catch (err) {
          if ((err as { code?: string }).code !== 'ENOENT') error = fsErrorText(err, P.tildify(dir, home));
        }
      }
      unread[f.id] = byFolder[f.id]!.filter((i) => i.unread).length;
    }
    const items = (byFolder[folder] ?? []).sort((a, b) => b.time - a.time);
    return { items, error, unread };
  });

  const visible = $derived(
    listing.items.filter((i) => {
      if (!query) return true;
      const q = query.toLowerCase();
      return i.mail.subject.toLowerCase().includes(q) || i.mail.from.toLowerCase().includes(q) || i.mail.body.toLowerCase().includes(q);
    }),
  );

  const current = $derived(listing.items.find((i) => i.path === selected) ?? null);

  function open(path: string) {
    showSource = false;
    let p = path;
    try {
      const raw = k.vfs.readFile(p, os.cred);
      const mail = parseMail(raw);
      if (P.dirname(p).endsWith('/Maildir/new')) {
        const dest = `${P.dirname(P.dirname(p))}/cur/${P.basename(p)}`;
        k.vfs.move(p, dest, os.cred);
        p = dest;
      }
      selected = p;
      k.bus.emit('mail.open', { path: p, messageId: mail.messageId, subject: mail.subject, from: mail.from });
    } catch {
      selected = path;
    }
  }

  // Deep link: wm.open('mail', { path })
  $effect(() => {
    void win.nonce;
    const target = win.args.path;
    untrack(() => {
      if (typeof target === 'string') {
        folder = target.includes('/.Sent/') ? 'sent' : 'inbox';
        open(target);
      }
    });
  });

  $effect(() => {
    const n = listing.unread.inbox ?? 0;
    win.title = n ? `Mail — ${n} non lu${n > 1 ? 's' : ''}` : 'Mail';
  });

  const fmtDate = (t: number) => {
    const d = k.time;
    return d.iso(t).slice(0, 10) === d.iso(k.now()).slice(0, 10) ? d.hm(t) : d.iso(t).slice(5, 10).split('-').reverse().join('/');
  };

  /** Splits body text into plain/link fragments (links are displayed, never navigable). */
  /**
   * Plain-text mails are hard-wrapped around 80 columns. Re-flow prose so it fits the pane,
   * but keep structure: lists, quotes, indented/code lines and signatures stay on their own line.
   */
  function reflow(text: string): string {
    const keep = (l: string) => /^\s|^[-*•>]|^\d+[.)]\s|^--\s*$|^—|^\S+:\s/.test(l) || l.length < 40;
    return text
      .replace(/\r\n/g, '\n')
      .split(/\n{2,}/)
      .map((para) => {
        const lines = para.split('\n');
        let out = lines[0] ?? '';
        for (let i = 1; i < lines.length; i++) {
          const prev = lines[i - 1]!;
          const cur = lines[i]!;
          // Join only prose continuations: previous line was long prose, current isn't structural.
          out += !keep(prev) && !keep(cur) ? ' ' + cur : !keep(prev) && /^[a-zà-ÿ(«"]/.test(cur) ? ' ' + cur : '\n' + cur;
        }
        return out;
      })
      .join('\n\n');
  }

  function fragments(text: string) {
    const out: Array<{ t: string; link: boolean }> = [];
    let last = 0;
    for (const m of text.matchAll(/https?:\/\/[^\s<>"]+/g)) {
      if (m.index! > last) out.push({ t: text.slice(last, m.index), link: false });
      out.push({ t: m[0], link: true });
      last = m.index! + m[0].length;
    }
    out.push({ t: text.slice(last), link: false });
    return out;
  }

  const initials = (s: string) => parseAddress(s).name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
</script>

<div class="mail">
  <aside class="kp-sidebar">
    <div class="account mono">{k.bundle.session.email ?? `${k.sessionUser}@${k.machine.domain ?? k.machine.hostname}`}</div>
    {#each FOLDERS as f (f.id)}
      <button class="kp-side-item" class:active={folder === f.id} onclick={() => { folder = f.id; selected = null; }}>
        <Icon name={f.icon} size={15} />{f.name}
        {#if listing.unread[f.id]}<span class="count">{listing.unread[f.id]}</span>{/if}
      </button>
    {/each}
  </aside>

  <section class="list">
    <div class="kp-toolbar"><input class="kp-input search" placeholder="Rechercher…" bind:value={query} /></div>
    {#if listing.error}<div class="kp-error">{listing.error}</div>{/if}
    <div class="items">
      {#each visible as it (it.path)}
        <button class="item" class:sel={selected === it.path} class:unread={it.unread} onclick={() => open(it.path)}>
          <div class="row1">
            <span class="from">{folder === 'sent' ? 'À : ' + parseAddress(it.mail.to).name : parseAddress(it.mail.from).name}</span>
            <span class="date mono num">{fmtDate(it.time)}</span>
          </div>
          <div class="subject">{it.mail.subject}</div>
          <div class="preview">{it.mail.body.replace(/\s+/g, ' ').slice(0, 90)}</div>
        </button>
      {:else}
        <div class="kp-empty">Aucun message</div>
      {/each}
    </div>
  </section>

  <article class="reader">
    {#if current}
      {@const m = current.mail}
      <header class="head">
        <h2>{m.subject}</h2>
        <div class="who">
          <span class="avatar">{initials(m.from)}</span>
          <div class="addr">
            <div><b>{parseAddress(m.from).name}</b> <span class="mono dim">&lt;{parseAddress(m.from).address}&gt;</span></div>
            <div class="dim">À : {m.to}{m.get('Cc') ? ` · Cc : ${m.get('Cc')}` : ''}</div>
          </div>
          <span class="dim mono num">{k.time.iso(current.time).slice(0, 16)}</span>
        </div>
        <div class="tools">
          <button class="kp-btn" class:active={showSource} onclick={() => (showSource = !showSource)}><Icon name="source" size={14} /> {showSource ? 'Message' : 'Afficher la source'}</button>
          <button class="kp-btn ghost" disabled title="Session forensique : envoi désactivé"><Icon name="send" size={14} /> Répondre</button>
        </div>
      </header>
      {#if showSource}
        <pre class="source mono">{#each current.mail.headers as [h, v], i (i)}<span class="hk">{h}:</span> {v}
{/each}
{m.body}</pre>
      {:else}
        <div class="body">{#each fragments(reflow(m.body)) as f, i (i)}{#if f.link}<span class="link" title="Lien externe — navigation désactivée dans la session forensique">{f.t}</span>{:else}{f.t}{/if}{/each}</div>
      {/if}
    {:else}
      <div class="kp-empty"><div><Icon name="mail" size={36} stroke={1.2} /><p>Sélectionnez un message</p></div></div>
    {/if}
  </article>
</div>

<style>
  .mail { display: flex; flex: 1; min-height: 0; }
  .kp-sidebar { width: 170px; }
  .account { color: var(--kp-text-2); font-size: 11px; padding: 4px 8px 12px; overflow: hidden; text-overflow: ellipsis; }
  .count { margin-left: auto; font-family: var(--kp-font-mono); font-size: 11px; color: var(--kp-cyan); }
  .list { width: 300px; flex-shrink: 0; display: flex; flex-direction: column; border-right: 1px solid var(--kp-line); background: var(--kp-bg-1); }
  .search { flex: 1; }
  .items { flex: 1; overflow: auto; }
  .item { display: block; width: 100%; text-align: left; padding: 11px 14px; border: 0; border-bottom: 1px solid var(--kp-line); background: transparent; color: var(--kp-text-1); }
  .item:hover { background: rgba(255, 255, 255, 0.02); }
  .item.sel { background: var(--kp-cyan-dim); box-shadow: inset 2px 0 0 var(--kp-cyan); }
  .row1 { display: flex; justify-content: space-between; gap: 8px; }
  .from { color: var(--kp-text-0); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .unread .from, .unread .subject { font-weight: 600; color: var(--kp-text-0); }
  .unread .from::before { content: ''; display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--kp-cyan); margin-right: 7px; box-shadow: 0 0 8px var(--kp-cyan); vertical-align: 1px; }
  .date { font-size: 11px; color: var(--kp-text-2); flex-shrink: 0; }
  .subject { margin-top: 2px; font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .preview { margin-top: 2px; font-size: 12px; color: var(--kp-text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .reader { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: auto; background: var(--kp-bg-1); }
  .head { padding: 20px 24px 14px; border-bottom: 1px solid var(--kp-line); }
  h2 { margin: 0 0 14px; font-size: 17px; font-weight: 600; letter-spacing: -0.01em; }
  .who { display: flex; align-items: center; gap: 12px; }
  .avatar { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; background: var(--kp-violet-dim); color: var(--kp-violet); font-weight: 600; font-size: 12px; flex-shrink: 0; }
  .addr { flex: 1; min-width: 0; font-size: 12.5px; }
  .dim { color: var(--kp-text-2); font-size: 12px; }
  .tools { display: flex; gap: 6px; margin-top: 14px; }
  .body { padding: 20px 24px 32px; white-space: pre-wrap; line-height: 1.65; font-size: 13.5px; color: var(--kp-text-0); user-select: text; max-width: 760px; }
  .link { color: var(--kp-cyan); text-decoration: underline; text-decoration-color: rgba(62, 230, 245, 0.4); cursor: not-allowed; }
  .source { margin: 0; padding: 18px 24px; font-size: 12px; line-height: 1.6; white-space: pre-wrap; word-break: break-all; color: var(--kp-text-1); user-select: text; }
  .hk { color: var(--kp-amber); }
</style>
