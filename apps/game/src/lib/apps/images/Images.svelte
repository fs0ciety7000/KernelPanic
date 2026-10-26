<script lang="ts">
  import { untrack } from 'svelte';
  import { os } from '$lib/os/os.svelte';
  import { wm } from '$lib/os/wm.svelte';
  import type { AppProps } from '$lib/os/apps';
  import { imageInfo, imageSrc, path as P, type ImageInfo } from '@kp/kernel';
  import Icon from '$lib/desktop/Icon.svelte';
  import { fsErrorText, fmtSize } from '../fs-helpers';

  let { win }: AppProps = $props();
  const k = os.kernel!;
  const home = k.users.get(k.sessionUser)!.home;
  const IMG = /\.(svg|png|jpe?g|gif|webp)$/i;

  let path = $state<string | null>(null);
  let src = $state<string | null>(null);
  let info = $state<ImageInfo | null>(null);
  let size = $state(0);
  let error = $state<string | null>(null);
  let zoom = $state<'fit' | number>('fit');
  let showInfo = $state(true);

  function load(p: string) {
    error = null;
    try {
      const content = k.vfs.readFile(p, os.cred);
      src = imageSrc(content);
      info = imageInfo(content);
      size = k.vfs.stat(p, os.cred).size;
      path = p;
      zoom = 'fit';
      k.bus.emit('image.open', { path: p });
    } catch (e) {
      path = p;
      src = null;
      error = fsErrorText(e, P.tildify(p, home));
    }
  }

  $effect(() => {
    void win.nonce;
    const target = typeof win.args.path === 'string' ? win.args.path : `${home}/Pictures`;
    untrack(() => {
      try {
        if (k.vfs.stat(target, os.cred).type === 'dir') {
          const first = k.vfs.readdir(target, os.cred, { silent: true }).find((e) => IMG.test(e.name) && !e.hidden);
          if (first) load(first.path);
          return;
        }
      } catch {
        /* load() reports it */
      }
      load(target);
    });
  });

  const siblings = $derived.by(() => {
    void os.version;
    if (!path) return [];
    try {
      return k.vfs.readdir(P.dirname(path), os.cred, { silent: true }).filter((e) => e.type === 'file' && IMG.test(e.name)).map((e) => e.path);
    } catch {
      return [];
    }
  });
  const idx = $derived(path ? siblings.indexOf(path) : -1);

  $effect(() => {
    win.title = path ? `${P.basename(path)} — Images` : 'Images';
  });

  function step(d: number) {
    if (siblings.length < 2) return;
    load(siblings[(idx + d + siblings.length) % siblings.length]!);
  }

  const zoomPct = $derived(zoom === 'fit' ? 'Ajusté' : `${Math.round(zoom * 100)} %`);
</script>

<svelte:window onkeydown={(e) => { if (wm.focused?.id !== win.id) return; if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1); }} />


<div class="viewer">
  <div class="kp-toolbar">
    <button class="kp-btn ghost" aria-label="Précédente" disabled={siblings.length < 2} onclick={() => step(-1)}><Icon name="chevron-left" /></button>
    <button class="kp-btn ghost" aria-label="Suivante" disabled={siblings.length < 2} onclick={() => step(1)}><Icon name="chevron-right" /></button>
    <span class="name mono">{path ? P.tildify(path, home) : ''}</span>
    <button class="kp-btn ghost" aria-label="Dézoomer" onclick={() => (zoom = Math.max(0.25, (zoom === 'fit' ? 1 : zoom) - 0.25))}><Icon name="zoom-out" size={15} /></button>
    <span class="zoom mono num">{zoomPct}</span>
    <button class="kp-btn ghost" aria-label="Zoomer" onclick={() => (zoom = Math.min(4, (zoom === 'fit' ? 1 : zoom) + 0.25))}><Icon name="zoom-in" size={15} /></button>
    <button class="kp-btn ghost" onclick={() => (zoom = zoom === 'fit' ? 1 : 'fit')}><Icon name="maximize" size={14} /></button>
    <button class="kp-btn" class:active={showInfo} onclick={() => (showInfo = !showInfo)} aria-label="Métadonnées"><Icon name="info" size={14} /> Infos</button>
  </div>
  <div class="body">
    <div class="stage" class:fit={zoom === 'fit'}>
      {#if error}
        <div class="kp-error">{error}</div>
      {:else if src}
        <img {src} alt={info?.title ?? (path ? P.basename(path) : '')} style={zoom === 'fit' ? '' : `width:${(info?.width ?? 800) * zoom}px`} draggable="false" />
      {:else}
        <div class="kp-empty">Aucune image</div>
      {/if}
    </div>
    {#if showInfo && info && path}
      <aside class="info">
        <div class="kp-label">Fichier</div>
        <dl>
          <dt>Nom</dt><dd class="mono">{P.basename(path)}</dd>
          <dt>Type</dt><dd class="mono">{info.mime}</dd>
          <dt>Taille</dt><dd class="mono">{fmtSize(size)}</dd>
          {#if info.width}<dt>Dimensions</dt><dd class="mono">{info.width} × {info.height}</dd>{/if}
        </dl>
        {#if info.title || info.description}
          <div class="kp-label">Description</div>
          <dl>
            {#if info.title}<dt>Titre</dt><dd>{info.title}</dd>{/if}
            {#if info.description}<dt>Légende</dt><dd>{info.description}</dd>{/if}
          </dl>
        {/if}
        <div class="kp-label">EXIF</div>
        {#if info.exif.length}
          <dl>
            {#each info.exif as [key, val] (key)}
              <dt>{key.replace(/([a-z])([A-Z])/g, '$1 $2')}</dt><dd class="mono" class:hl={key === 'DateTimeOriginal'}>{val}</dd>
            {/each}
          </dl>
        {:else}
          <p class="none">Aucune métadonnée EXIF.</p>
        {/if}
      </aside>
    {/if}
  </div>
</div>

<style>
  .viewer { display: flex; flex-direction: column; flex: 1; min-height: 0; }
  .name { flex: 1; color: var(--kp-text-2); font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-left: 6px; }
  .zoom { width: 56px; text-align: center; color: var(--kp-text-1); font-size: 11.5px; }
  .body { flex: 1; display: flex; min-height: 0; }
  .stage {
    flex: 1; overflow: auto; display: grid; place-items: center; padding: 20px;
    background: repeating-conic-gradient(#0c1017 0% 25%, #0a0e14 0% 50%) 50% / 24px 24px;
  }
  .stage.fit img { max-width: 100%; max-height: 100%; }
  .stage img { display: block; border-radius: 4px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5); }
  .stage.fit { overflow: hidden; }
  .info { width: 250px; flex-shrink: 0; overflow: auto; padding: 14px; background: var(--kp-bg-2); border-left: 1px solid var(--kp-line); }
  dl { margin: 6px 0 16px; display: grid; grid-template-columns: 1fr; gap: 2px; }
  dt { color: var(--kp-text-2); font-size: 11px; margin-top: 6px; }
  dd { margin: 0; font-size: 12px; color: var(--kp-text-0); word-break: break-word; user-select: text; }
  dd.hl { color: var(--kp-violet); }
  .none { color: var(--kp-text-2); font-size: 12px; }
</style>
