<script lang="ts">
  import { onMount } from 'svelte';
  import { os } from '$lib/os/os.svelte';
  import { wm } from '$lib/os/wm.svelte';
  import { APPS } from '$lib/os/apps';
  import { help } from '$lib/os/help.svelte';
  import { openEntry, trashFiles } from '$lib/os/fileops.svelte';
  import { fileIcon } from './icons';
  import { path as P, type Stat } from '@kp/kernel';
  import Icon from './Icon.svelte';

  let { close }: { close: () => void } = $props();

  const k = os.kernel!;
  const home = k.users.get(k.sessionUser)!.home;
  let query = $state('');
  let input: HTMLInputElement;
  let active = $state(0);

  onMount(() => input.focus());

  /** Searchable files: the user's home (no dotfiles) — what a desktop search indexes. */
  const index = $derived.by(() => {
    void os.version;
    const out: Stat[] = [];
    const walk = (dir: string, depth: number) => {
      if (depth > 5 || out.length > 600) return;
      let entries: Stat[];
      try {
        entries = k.vfs.readdir(dir, os.cred, { silent: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (e.hidden) continue;
        out.push(e);
        if (e.type === 'dir') walk(e.path, depth + 1);
      }
    };
    walk(home, 0);
    return out;
  });

  type Result = { key: string; icon: string; label: string; detail: string; run: () => void };

  const results = $derived.by((): Result[] => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const apps: Result[] = APPS.filter((a) => a.title.toLowerCase().includes(q) || a.id.includes(q)).map((a) => ({
      key: `app:${a.id}`,
      icon: a.icon,
      label: a.title,
      detail: 'Application',
      run: () => wm.open(a.id),
    }));
    const files: Result[] = index
      .filter((e) => e.name.toLowerCase().includes(q))
      .slice(0, 12)
      .map((e) => ({
        key: e.path,
        icon: fileIcon(e.name, e.type === 'dir').icon,
        label: e.name,
        detail: P.tildify(P.dirname(e.path), home),
        run: () => openEntry(e),
      }));
    return [...apps, ...files];
  });

  $effect(() => {
    void query;
    active = 0;
  });

  function go(run: () => void) {
    close();
    run();
  }

  function onKey(e: KeyboardEvent) {
    if (!results.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      active = (active + 1) % results.length;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active - 1 + results.length) % results.length;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(results[active]!.run);
    }
  }

  const places = [
    { label: 'Dossier personnel', icon: 'home', path: home },
    { label: 'Bureau', icon: 'square', path: `${home}/Desktop` },
    { label: 'Documents', icon: 'folder', path: `${home}/Documents` },
    { label: 'Téléchargements', icon: 'folder', path: `${home}/Downloads` },
    { label: 'Racine du système', icon: 'hard-drive', path: '/' },
    { label: 'Corbeille', icon: 'trash', path: trashFiles() },
  ];
  const user = k.users.get(k.sessionUser)!;
</script>

<div class="tb-panel launcher" role="dialog" aria-label="Applications">
  <div class="search">
    <Icon name="search" size={15} />
    <input bind:this={input} bind:value={query} onkeydown={onKey} placeholder="Rechercher une application, un fichier…" spellcheck="false" />
  </div>

  {#if query.trim()}
    <div class="results">
      {#each results as r, i (r.key)}
        <button class="res" class:active={active === i} onpointerenter={() => (active = i)} onclick={() => go(r.run)}>
          <span class="ri"><Icon name={r.icon} size={16} /></span>
          <span class="rl">{r.label}</span>
          <span class="rd mono">{r.detail}</span>
        </button>
      {:else}
        <p class="none">Aucun résultat pour « {query} ».</p>
      {/each}
    </div>
  {:else}
    <div class="kp-label sec">Applications</div>
    <div class="grid">
      {#each APPS.filter((a) => a.id !== 'properties') as a (a.id)}
        <button class="app" onclick={() => go(() => wm.open(a.id))}>
          <span class="tile"><Icon name={a.icon} size={22} /></span>
          <span>{a.title}</span>
        </button>
      {/each}
    </div>
    <div class="kp-label sec">Emplacements</div>
    <div class="places">
      {#each places as p (p.path)}
        <button class="place" onclick={() => go(() => wm.open('files', { path: p.path }))}>
          <Icon name={p.icon} size={15} /><span>{p.label}</span>
        </button>
      {/each}
    </div>
  {/if}

  <footer>
    <div class="user">
      <span class="avatar">{(user.fullName ?? user.name).slice(0, 1).toUpperCase()}</span>
      <div>
        <div class="un">{user.fullName ?? user.name}</div>
        <div class="uh mono">{user.name}@{k.machine.hostname}</div>
      </div>
    </div>
    <div class="actions">
      <button class="ab" title="Aide — premiers pas" aria-label="Aide" onclick={() => go(() => help.toggle())}><Icon name="info" size={16} /></button>
      <button class="ab" title="Paramètres" aria-label="Paramètres" onclick={() => go(() => wm.open('settings'))}><Icon name="settings" size={16} /></button>
      <button class="ab" title="Sauvegarder" aria-label="Sauvegarder" onclick={() => go(() => os.save())}><Icon name="save" size={16} /></button>
      <button class="ab" title="Verrouiller (Ctrl+Alt+L)" aria-label="Verrouiller" onclick={() => go(() => os.lock())}><Icon name="lock2" size={16} /></button>
      <button class="ab" title="Quitter vers le menu" aria-label="Quitter vers le menu" onclick={() => go(() => os.quitToMenu())}><Icon name="power" size={16} /></button>
      <button
        class="ab danger"
        title="Recommencer le scénario"
        aria-label="Recommencer le scénario"
        onclick={() => { if (confirm('Recommencer le scénario depuis le début ? La progression sera perdue.')) go(() => os.restart()); }}
      ><Icon name="refresh" size={16} /></button>
    </div>
  </footer>
</div>

<style>
  .launcher {
    position: absolute;
    left: 8px;
    bottom: 56px;
    width: 460px;
    max-width: calc(100vw - 16px);
    max-height: calc(100vh - 72px);
    display: flex;
    flex-direction: column;
    background: rgba(12, 16, 22, 0.94);
    backdrop-filter: blur(22px) saturate(150%);
    border: 1px solid var(--kp-line-strong);
    border-radius: var(--kp-radius-l);
    box-shadow: var(--kp-shadow-2);
    z-index: 10003;
    overflow: hidden;
    animation: rise var(--kp-dur) var(--kp-ease);
  }
  @keyframes rise { from { opacity: 0; transform: translateY(10px); } }
  .search { display: flex; align-items: center; gap: 10px; margin: 14px 14px 6px; padding: 0 12px; height: 38px; border-radius: 10px; background: var(--kp-bg-1); border: 1px solid var(--kp-line); color: var(--kp-text-2); }
  .search:focus-within { border-color: rgba(62, 230, 245, 0.45); box-shadow: 0 0 0 3px var(--kp-cyan-dim); }
  .search input { flex: 1; border: 0; outline: none; background: transparent; font-size: 13.5px; user-select: text; }
  .sec { padding: 12px 18px 6px; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; padding: 0 10px; }
  button { border: 0; background: transparent; color: var(--kp-text-0); }
  .app { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 10px 4px; border-radius: 10px; font-size: 11.5px; }
  .app:hover { background: rgba(255, 255, 255, 0.05); }
  .tile { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 12px; background: linear-gradient(160deg, rgba(28, 36, 48, 0.95), rgba(15, 20, 28, 0.95)); border: 1px solid var(--kp-line-strong); color: var(--kp-cyan); }
  .places { display: grid; grid-template-columns: 1fr 1fr; gap: 2px; padding: 0 10px 10px; }
  .place { display: flex; align-items: center; gap: 9px; height: 32px; padding: 0 10px; border-radius: 7px; font-size: 12.5px; color: var(--kp-text-1); text-align: left; }
  .place:hover { background: rgba(255, 255, 255, 0.05); color: var(--kp-text-0); }
  .results { padding: 6px 10px 10px; overflow: auto; }
  .res { display: flex; align-items: center; gap: 10px; width: 100%; height: 36px; padding: 0 10px; border-radius: 7px; text-align: left; }
  .res.active { background: var(--kp-cyan-dim); }
  .ri { display: grid; color: var(--kp-cyan); }
  .rl { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rd { color: var(--kp-text-2); font-size: 11px; max-width: 45%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .none { color: var(--kp-text-2); padding: 12px; margin: 0; }
  footer { display: flex; align-items: center; justify-content: space-between; margin-top: auto; padding: 10px 12px; border-top: 1px solid var(--kp-line); background: rgba(0, 0, 0, 0.18); }
  .user { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .avatar { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; background: var(--kp-violet-dim); color: var(--kp-violet); font-weight: 700; }
  .un { font-weight: 600; font-size: 12.5px; }
  .uh { color: var(--kp-green); font-size: 11px; }
  .actions { display: flex; gap: 2px; }
  .ab { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 7px; color: var(--kp-text-1); }
  .ab:hover { background: rgba(255, 255, 255, 0.07); color: var(--kp-text-0); }
  .ab.danger:hover { background: var(--kp-red-dim); color: var(--kp-red); }
</style>
