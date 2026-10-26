<script lang="ts">
  import { os } from '$lib/os/os.svelte';
  import type { AppProps } from '$lib/os/apps';
  import { describeFile, path as P } from '@kp/kernel';
  import Icon from '$lib/desktop/Icon.svelte';
  import { fsErrorText } from '../fs-helpers';
  import { notify } from '$lib/os/notify.svelte';

  let { win }: AppProps = $props();
  const k = os.kernel!;
  const home = k.users.get(k.sessionUser)!.home;

  let path = $state<string | null>(null);
  let text = $state('');
  let saved = $state('');
  let error = $state<string | null>(null);
  let readonly = $state(false);
  let binary = $state(false);
  let saveAs = $state<string | null>(null);

  function load(p: string) {
    error = null;
    binary = false;
    try {
      const content = k.vfs.readFile(p, os.cred);
      const kind = describeFile(p, content, k.vfs.stat(p, os.cred));
      binary = kind === 'data' || kind.startsWith('ELF') || kind.includes('image data') || kind.includes('firmware');
      text = binary ? '' : content;
      saved = text;
      readonly = !canWrite(p);
      path = p;
    } catch (e) {
      if ((e as { code?: string }).code === 'ENOENT') {
        // nano-style: a new file at this path
        path = p;
        text = saved = '';
        readonly = false;
      } else {
        path = p;
        error = fsErrorText(e, P.tildify(p, home));
      }
    }
  }

  function canWrite(p: string): boolean {
    const st = k.vfs.stat(p, os.cred);
    const c = os.cred;
    const bits = st.owner === c.user ? st.mode >> 6 : c.groups.includes(st.group) ? st.mode >> 3 : st.mode;
    return c.uid === 0 || (bits & 2) !== 0;
  }

  $effect(() => {
    void win.nonce;
    if (typeof win.args.path === 'string') load(win.args.path);
  });

  const dirty = $derived(text !== saved);
  $effect(() => {
    win.title = `${path ? P.basename(path) : 'Sans titre'}${dirty ? ' •' : ''} — Notes`;
  });

  function save(target = path) {
    if (!target) {
      saveAs = `${home}/notes-enquete.md`;
      return;
    }
    try {
      k.vfs.writeFile(target, text, os.cred);
      path = target;
      saved = text;
      saveAs = null;
      notify.push({ kind: 'success', title: 'Enregistré', body: P.tildify(target, home) }, 2500);
    } catch (e) {
      notify.push({ kind: 'error', title: 'Échec de l’enregistrement', body: fsErrorText(e, P.tildify(target, home)) });
    }
  }

  function onKey(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (!readonly) save();
    }
  }

  const lines = $derived(text.split('\n').length);
</script>

<div class="notes">
  <div class="kp-toolbar">
    <button class="kp-btn ghost" onclick={() => { path = null; text = saved = ''; error = null; readonly = false; binary = false; }}><Icon name="plus" size={14} /> Nouveau</button>
    <button class="kp-btn" disabled={readonly || !!error || binary || (!dirty && !!path)} onclick={() => save()}><Icon name="save" size={14} /> Enregistrer</button>
    <button class="kp-btn ghost" disabled={!!error || binary} onclick={() => (saveAs = path ?? `${home}/notes-enquete.md`)}>Enregistrer sous…</button>
    <span class="path mono">{path ? P.tildify(path, home) : 'nouveau document'}</span>
    {#if readonly}<span class="kp-badge amber">lecture seule</span>{/if}
  </div>
  {#if saveAs !== null}
    <form class="saveas" onsubmit={(e) => { e.preventDefault(); save(P.resolve(home, saveAs!, home)); }}>
      <span class="kp-label">Chemin</span>
      <input class="kp-input mono" bind:value={saveAs} />
      <button class="kp-btn primary" type="submit">OK</button>
      <button class="kp-btn ghost" type="button" onclick={() => (saveAs = null)}>Annuler</button>
    </form>
  {/if}
  {#if error}
    <div class="kp-error"><Icon name="lock" size={13} /> {error}</div>
  {:else if binary}
    <div class="kp-empty">
      <div>
        <Icon name="binary" size={32} />
        <p>Fichier binaire — non affichable en texte.</p>
        <p class="mono hint">Essayez au terminal : <b>file</b>, <b>strings</b>, <b>xxd</b>, <b>sha256sum</b></p>
      </div>
    </div>
  {:else}
    <div class="editor">
      <div class="gutter mono" aria-hidden="true">
        {#each { length: lines } as _, i (i)}<div>{i + 1}</div>{/each}
      </div>
      <textarea
        style="height: {lines * 20 + 28}px"
        spellcheck="false"
        bind:value={text}
        readonly={readonly}
        onkeydown={onKey}
        placeholder="Vos notes d’enquête…"
      ></textarea>
    </div>
  {/if}
  <footer class="status mono">
    <span>{lines} lignes · {text.length} car.</span>
    <span>Ctrl+S pour enregistrer</span>
  </footer>
</div>

<style>
  .notes { display: flex; flex-direction: column; flex: 1; min-height: 0; }
  .path { color: var(--kp-text-2); font-size: 11.5px; margin-left: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
  .saveas { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: var(--kp-bg-3); border-bottom: 1px solid var(--kp-line); }
  .saveas input { flex: 1; }
  .editor { flex: 1; display: flex; min-height: 0; overflow: auto; background: var(--kp-bg-1); }
  .gutter { padding: 14px 10px 14px 14px; color: var(--kp-text-2); font-size: 12px; line-height: 20px; height: max-content; text-align: right; user-select: none; opacity: 0.6; min-width: 46px; }
  textarea {
    flex: 1; resize: none; border: 0; outline: none; padding: 14px 16px 14px 6px;
    background: transparent; color: var(--kp-text-0); font-family: var(--kp-font-mono); font-size: 12.5px; line-height: 20px;
    white-space: pre; overflow-wrap: normal; overflow: hidden; min-height: 100%; user-select: text; tab-size: 4;
  }
  .hint { color: var(--kp-text-2); font-size: 12px; }
  .hint b { color: var(--kp-green); font-weight: 500; }
  .status { display: flex; justify-content: space-between; height: 26px; align-items: center; padding: 0 14px; border-top: 1px solid var(--kp-line); background: var(--kp-bg-2); color: var(--kp-text-2); font-size: 11px; }
</style>
