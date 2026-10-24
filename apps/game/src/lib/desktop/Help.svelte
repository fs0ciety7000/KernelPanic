<script lang="ts">
  import { help } from '$lib/os/help.svelte';
  import { wm } from '$lib/os/wm.svelte';
  import Icon from './Icon.svelte';

  const APPS = [
    { icon: 'mail', name: 'Mail', text: 'Les briefings arrivent ici. « Afficher la source » révèle les en-têtes.' },
    { icon: 'folder', name: 'Fichiers', text: 'Explorez la machine. Le bouton « Cachés » montre ce qui commence par un point.' },
    { icon: 'terminal', name: 'Terminal', text: 'Un vrai shell : tapez help. Tab complète, ↑ rappelle l’historique.' },
    { icon: 'activity', name: 'Logs', text: 'Les journaux système, filtrables par texte ou /regex/.' },
    { icon: 'image', name: 'Images', text: 'Le panneau Infos affiche les métadonnées EXIF.' },
    { icon: 'case', name: 'Dossier', text: 'Vos objectifs, vos réponses et des indices si vous bloquez.' },
  ];
  const KEYS = [
    ['Clic droit', 'Menu contextuel (bureau, fichiers, fenêtres)'],
    ['Ctrl+Alt+T', 'Nouveau terminal'],
    ['Ctrl+` ou Alt+`', 'Changer de fenêtre (maintenir)'],
    ['Ctrl+Alt+← → ↑', 'Ancrer / agrandir la fenêtre'],
    ['Ctrl+Alt+D', 'Afficher le bureau'],
    ['Ctrl+Alt+W', 'Fermer la fenêtre active'],
    ['Ctrl+Alt+H', 'Afficher / masquer cette aide'],
  ];
</script>

{#if help.open}
  <aside class="help" aria-label="Premiers pas" aria-live="polite">
    <header>
      <span class="kp-label">Premiers pas</span>
      <button class="close" aria-label="Fermer l’aide" onclick={() => help.close()}><Icon name="x" size={14} /></button>
    </header>
    <p class="lead">Tout ce que vous voyez est la machine : les icônes du bureau sont de vrais fichiers de <span class="mono">~/Desktop</span>, la barre du bas lance les apps et liste les fenêtres. Ce que vous faites au terminal, vous pouvez souvent le faire à la souris — et inversement.</p>
    <ul class="apps">
      {#each APPS as a (a.name)}
        <li>
          <span class="ico"><Icon name={a.icon} size={15} /></span>
          <div><b>{a.name}</b> <span>{a.text}</span></div>
        </li>
      {/each}
    </ul>
    <dl class="keys">
      {#each KEYS as [k, v] (k)}<dt class="mono">{k}</dt><dd>{v}</dd>{/each}
    </dl>
    <footer>
      <button class="kp-btn ghost" onclick={() => { wm.open('case'); help.close(); }}><Icon name="case" size={14} /> Ouvrir le dossier</button>
      <button class="kp-btn primary" onclick={() => help.close()}>Compris</button>
    </footer>
  </aside>
{/if}

<style>
  .help {
    position: absolute;
    left: 124px;
    bottom: 62px;
    width: 400px;
    max-width: calc(100vw - 32px);
    max-height: calc(100vh - 140px);
    overflow: auto;
    padding: 16px 18px;
    z-index: 10002;
    background: rgba(12, 16, 22, 0.92);
    backdrop-filter: blur(18px) saturate(140%);
    border: 1px solid var(--kp-line-strong);
    border-left: 2px solid var(--kp-cyan);
    border-radius: var(--kp-radius-l);
    box-shadow: var(--kp-shadow-2);
    animation: rise var(--kp-dur-slow) var(--kp-ease);
  }
  @keyframes rise { from { opacity: 0; transform: translateY(10px); } }
  header { display: flex; justify-content: space-between; align-items: center; }
  .close { display: grid; padding: 4px; border: 0; border-radius: 6px; background: transparent; color: var(--kp-text-2); }
  .close:hover { background: var(--kp-bg-4); color: var(--kp-text-0); }
  .lead { margin: 8px 0 12px; color: var(--kp-text-1); line-height: 1.55; }
  .apps { list-style: none; margin: 0; padding: 0; display: grid; gap: 9px; }
  .apps li { display: flex; gap: 10px; font-size: 12.5px; line-height: 1.45; }
  .apps b { color: var(--kp-text-0); font-weight: 600; }
  .apps span { color: var(--kp-text-1); }
  .ico { display: grid; place-items: center; flex-shrink: 0; width: 26px; height: 26px; border-radius: 7px; background: var(--kp-cyan-dim); color: var(--kp-cyan); }
  .keys { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 14px 0 0; padding-top: 12px; border-top: 1px solid var(--kp-line); font-size: 12px; }
  dt { color: var(--kp-green); font-size: 11.5px; }
  dd { margin: 0; color: var(--kp-text-1); }
  footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
  @media (max-width: 900px) { .help { left: 16px; } }
</style>
