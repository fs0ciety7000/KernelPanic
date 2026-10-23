<script lang="ts">
  import { onMount } from 'svelte';
  import { os } from '$lib/os/os.svelte';

  const intro = os.kernel!.bundle.intro!;
  let visible = $state(0);

  onMount(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      visible = intro.lines.length;
      return;
    }
    const t = setInterval(() => {
      visible++;
      if (visible >= intro.lines.length) clearInterval(t);
    }, 900);
    return () => clearInterval(t);
  });
</script>

<div class="intro">
  <div class="scan" aria-hidden="true"></div>
  <div class="box">
    <div class="kp-label">Dossier entrant · confidentiel</div>
    <h1 class="mono">{intro.title}</h1>
    <div class="lines">
      {#each intro.lines.slice(0, visible) as line, i (i)}
        <p class:first={i === 0}>{line}</p>
      {/each}
    </div>
    <button
      class="kp-btn primary go"
      class:ready={visible >= intro.lines.length}
      onclick={() => (visible >= intro.lines.length ? os.enterDesktop() : (visible = intro.lines.length))}
    >
      {visible >= intro.lines.length ? 'Ouvrir la session' : 'Passer'}
    </button>
  </div>
</div>

<style>
  .intro { position: fixed; inset: 0; display: grid; place-items: center; padding: 24px; background: var(--kp-bg-0); overflow: hidden; }
  .scan {
    position: absolute; inset: 0; pointer-events: none; opacity: 0.35;
    background: repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.02) 0 1px, transparent 1px 3px);
  }
  .box { position: relative; width: min(680px, 100%); }
  h1 {
    margin: 10px 0 28px; font-size: clamp(36px, 6vw, 60px); letter-spacing: 0.08em; font-weight: 700;
    text-shadow: 2px 0 rgba(255, 79, 109, 0.35), -2px 0 rgba(62, 230, 245, 0.35);
  }
  .lines { min-height: 260px; }
  p { margin: 0 0 14px; font-size: 16px; line-height: 1.6; color: var(--kp-text-1); animation: in var(--kp-dur-slow) var(--kp-ease); }
  p.first { font-family: var(--kp-font-mono); color: var(--kp-cyan); font-size: 13px; letter-spacing: 0.04em; }
  @keyframes in { from { opacity: 0; transform: translateY(6px); } }
  .go { height: 38px; padding: 0 20px; margin-top: 18px; }
  .go:not(.ready) { background: var(--kp-bg-4); color: var(--kp-text-1); }
</style>
