<script lang="ts">
  import { onMount } from 'svelte';
  import { os } from '$lib/os/os.svelte';

  const LINES = [
    '[    0.000000] Linux version 6.8.0-41-lumen (buildd@lumenos) #48-Lumen SMP PREEMPT_DYNAMIC',
    '[    0.000000] Command line: BOOT_IMAGE=/vmlinuz root=/dev/mapper/vg0-root ro quiet splash forensic=1',
    '[    0.112408] ACPI: Core revision 20230628',
    '[    0.418211] PCI: Using configuration type 1 for base access',
    '[    1.002918] EXT4-fs (dm-0): mounted filesystem with ordered data mode',
    '[    1.204517] kp-forensics: snapshot ws-varga@2026-04-17T08:11:58 attached (overlay rw)',
    '[    1.204600] kp-forensics: untrusted binary execution disabled by policy',
    '[  OK  ] Started systemd-journald.service - Journal Service.',
    '[  OK  ] Reached target network-online.target - Network is Online.',
    '[  OK  ] Started ssh.service - OpenBSD Secure Shell server.',
    '[  OK  ] Started cron.service - Regular background program processing daemon.',
    '[  OK  ] Started lumen-agent.service - Lumen telemetry agent.',
    '[  OK  ] Started kp-session.service - Forensic desktop session.',
  ];

  let shown = $state(0);
  let done = $state(false);

  onMount(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    os.loadIndex();
    if (reduced) {
      shown = LINES.length;
      done = true;
      return;
    }
    const t = setInterval(() => {
      shown++;
      if (shown >= LINES.length) {
        clearInterval(t);
        setTimeout(() => (done = true), 350);
      }
    }, 110);
    return () => clearInterval(t);
  });

  $effect(() => {
    if (done && os.phase === 'boot') os.phase = 'select';
  });

  function skip() {
    shown = LINES.length;
    done = true;
  }
</script>

<svelte:window onkeydown={skip} />

<div class="boot mono" role="presentation" onclick={skip}>
  {#each LINES.slice(0, shown) as line, i (i)}
    <div class="line" class:ok={line.startsWith('[  OK')}>
      {#if line.startsWith('[  OK')}[  <span>OK</span>  ]{line.slice(8)}{:else}{line}{/if}
    </div>
  {/each}
  <div class="cursor">_</div>
</div>

<style>
  .boot {
    position: fixed; inset: 0; padding: 28px 32px; overflow: hidden;
    background: var(--kp-bg-0); color: var(--kp-text-2); font-size: 12.5px; line-height: 1.7;
    cursor: default;
  }
  .line { white-space: pre; animation: in 80ms linear; }
  .line.ok { color: var(--kp-text-1); }
  .line span { color: var(--kp-green); }
  .cursor { color: var(--kp-cyan); animation: blink 1s steps(1) infinite; }
  @keyframes blink { 50% { opacity: 0; } }
  @keyframes in { from { opacity: 0; } }
</style>
