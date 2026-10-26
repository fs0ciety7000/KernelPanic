<script lang="ts">
  import { os } from '$lib/os/os.svelte';
  import type { AppProps } from '$lib/os/apps';
  import { describeFile, modeString, path as P, type Stat } from '@kp/kernel';
  import { notify } from '$lib/os/notify.svelte';
  import { fileIcon } from '$lib/desktop/icons';
  import { isInTrash, openEntry, trashOrigin } from '$lib/os/fileops.svelte';
  import { fsErrorText, fmtSize } from '../fs-helpers';
  import Icon from '$lib/desktop/Icon.svelte';

  let { win }: AppProps = $props();
  const k = os.kernel!;
  const home = k.users.get(k.sessionUser)!.home;
  const path = $derived(String(win.args.path ?? home));

  const info = $derived.by((): { st: Stat; kind: string; items?: number; error?: undefined } | { error: string } => {
    void os.version;
    try {
      const st = k.vfs.stat(path, os.cred, false);
      let kind = 'Dossier';
      let items: number | undefined;
      if (st.type === 'dir') {
        try {
          items = k.vfs.readdir(path, os.cred, { silent: true }).length;
        } catch {
          items = undefined;
        }
      } else {
        let content = '';
        try {
          content = k.vfs.readFile(path, os.cred, { silent: true });
        } catch {
          /* unreadable: type stays generic */
        }
        kind = content || st.size === 0 ? describeFile(st.name, content, st) : 'fichier (illisible : permission refusée)';
      }
      return { st, kind, items };
    } catch (e) {
      return { error: fsErrorText(e, path) };
    }
  });

  $effect(() => {
    win.title = `Propriétés — ${P.basename(path) || '/'}`;
  });

  const WHO = [
    { label: 'Propriétaire', shift: 6 },
    { label: 'Groupe', shift: 3 },
    { label: 'Autres', shift: 0 },
  ];
  const PERMS = [
    { label: 'Lecture', bit: 4 },
    { label: 'Écriture', bit: 2 },
    { label: 'Exécution', bit: 1 },
  ];

  // GUI chmod follows the real rule: only the owner (or root, via `sudo chmod` in the terminal).
  const canChmod = $derived('st' in info && (os.cred.uid === 0 || info.st.owner === os.cred.user));

  function toggle(shift: number, bit: number) {
    if (!('st' in info)) return;
    const mode = info.st.mode ^ (bit << shift);
    try {
      k.vfs.chmod(path, mode, os.cred);
    } catch (e) {
      notify.push({ kind: 'error', title: 'chmod refusé', body: fsErrorText(e, path) }, 4000);
    }
  }
</script>

<div class="props">
  {#if 'error' in info && info.error}
    <div class="kp-error">{info.error}</div>
  {:else if 'st' in info}
    {@const st = info.st}
    {@const ic = fileIcon(st.name, st.type === 'dir')}
    <header>
      <span class="big {ic.tone}"><Icon name={ic.icon} size={30} stroke={1.3} /></span>
      <div class="hn">
        <div class="name">{st.name || '/'}</div>
        <div class="kind">{info.kind}</div>
      </div>
    </header>

    <section>
      <div class="kp-label">Général</div>
      <dl>
        <dt>Emplacement</dt><dd class="mono">{P.tildify(P.dirname(path), home)}</dd>
        {#if isInTrash(path) && trashOrigin(path)}
          <dt>Origine</dt><dd class="mono">{trashOrigin(path)}</dd>
        {/if}
        <dt>Taille</dt>
        <dd class="mono">{st.type === 'dir' ? (info.items === undefined ? '—' : `${info.items} élément${info.items > 1 ? 's' : ''}`) : `${fmtSize(st.size)} (${st.size} octets)`}</dd>
        <dt>Modifié</dt><dd class="mono">{k.time.iso(st.mtime)}</dd>
        {#if st.target}<dt>Cible du lien</dt><dd class="mono">{st.target}</dd>{/if}
      </dl>
    </section>

    <section>
      <div class="kp-label">Permissions</div>
      <dl>
        <dt>Propriétaire</dt><dd class="mono">{st.owner}</dd>
        <dt>Groupe</dt><dd class="mono">{st.group}</dd>
        <dt>Mode</dt><dd class="mono">{modeString(st.type, st.mode)} · {(st.mode & 0o7777).toString(8).padStart(4, '0')}</dd>
      </dl>
      <table class="perm">
        <thead><tr><th></th>{#each PERMS as p (p.bit)}<th>{p.label}</th>{/each}</tr></thead>
        <tbody>
          {#each WHO as w (w.shift)}
            <tr>
              <th>{w.label}</th>
              {#each PERMS as p (p.bit)}
                <td>
                  <input
                    type="checkbox"
                    aria-label="{w.label} — {p.label}"
                    checked={((st.mode >> w.shift) & p.bit) !== 0}
                    disabled={!canChmod}
                    onchange={() => toggle(w.shift, p.bit)}
                  />
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
      {#if !canChmod}
        <p class="note">Seul le propriétaire peut modifier ces droits. En tant qu'administrateur : <span class="mono">sudo chmod</span> dans le terminal.</p>
      {/if}
    </section>

    <footer>
      <button class="kp-btn" onclick={() => openEntry(st)}>Ouvrir</button>
    </footer>
  {/if}
</div>

<style>
  .props { flex: 1; overflow: auto; padding: 18px; background: var(--kp-bg-1); }
  header { display: flex; align-items: center; gap: 14px; padding-bottom: 16px; border-bottom: 1px solid var(--kp-line); }
  .big { display: grid; place-items: center; width: 56px; height: 56px; border-radius: 14px; background: var(--kp-bg-3); border: 1px solid var(--kp-line-strong); color: var(--kp-text-1); flex-shrink: 0; }
  .big.dir { color: #8ab8ff; }
  .big.image { color: var(--kp-violet); }
  .big.log, .big.key { color: var(--kp-amber); }
  .big.script { color: var(--kp-green); }
  .name { font-weight: 600; font-size: 15px; word-break: break-all; user-select: text; }
  .kind { color: var(--kp-text-2); font-size: 12px; margin-top: 2px; }
  section { padding: 14px 0; border-bottom: 1px solid var(--kp-line); }
  dl { display: grid; grid-template-columns: 110px 1fr; gap: 7px 12px; margin: 10px 0 0; font-size: 12.5px; }
  dt { color: var(--kp-text-2); }
  dd { margin: 0; word-break: break-all; user-select: text; }
  .perm { margin-top: 14px; border-collapse: collapse; width: 100%; font-size: 12px; }
  .perm th { font-weight: 500; color: var(--kp-text-2); text-align: left; padding: 4px 6px; }
  .perm thead th { text-align: center; }
  .perm td { text-align: center; padding: 4px; }
  .perm input { accent-color: var(--kp-cyan); width: 15px; height: 15px; }
  .note { margin: 10px 0 0; color: var(--kp-text-2); font-size: 11.5px; line-height: 1.5; }
  footer { padding-top: 14px; display: flex; justify-content: flex-end; }
</style>
