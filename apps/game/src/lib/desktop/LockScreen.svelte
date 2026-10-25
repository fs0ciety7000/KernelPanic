<script lang="ts">
  import { onMount } from 'svelte';
  import { os } from '$lib/os/os.svelte';
  import { settings } from '$lib/os/settings.svelte';
  import Icon from './Icon.svelte';

  /** "login" = start of session, "lock" = screen locked over a running desktop. */
  let { mode }: { mode: 'login' | 'lock' } = $props();

  const k = os.kernel!;
  const user = k.users.get(k.sessionUser)!;
  const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  let password = $state('');
  let error = $state(0);
  let ok = $state(false);
  let input: HTMLInputElement;

  onMount(() => input?.focus());

  const now = $derived.by(() => {
    void os.tick;
    const iso = k.time.iso(k.now());
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number) as [number, number, number];
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return { time: iso.slice(11, 16), date: `${DAYS[dow]} ${d} ${MONTHS[m - 1]}` };
  });

  function enter() {
    os.enterDesktop();
  }

  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!password) return;
    if (k.users.verify(user.name, password)) {
      ok = true;
      setTimeout(enter, 450);
    } else {
      error++;
      password = '';
    }
  }

  const initials = (user.fullName ?? user.name).split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
</script>

<div class="lock wp-{settings.wallpaper}" class:overlay={mode === 'lock'} role="dialog" aria-label={mode === 'lock' ? 'Écran verrouillé' : 'Ouverture de session'}>
  <div class="veil"></div>
  <div class="clock">
    <div class="time num">{now.time}</div>
    <div class="date">{now.date}</div>
  </div>

  <div class="card">
    <span class="avatar">{initials}</span>
    <div class="name">{user.fullName ?? user.name}</div>
    <div class="host mono">{user.name}@{k.machine.hostname}{k.machine.domain ? `.${k.machine.domain}` : ''}</div>

    {#key error}
      <form class="pw" class:shake={error} class:ok onsubmit={submit}>
        <Icon name="lock2" size={14} />
        <input bind:this={input} type="password" bind:value={password} placeholder="Mot de passe" autocomplete="off" aria-label="Mot de passe de {user.name}" />
        <button type="submit" aria-label="Valider" disabled={!password}><Icon name="chevron-right" size={16} /></button>
      </form>
    {/key}
    {#if ok}
      <div class="msg good">Mot de passe accepté.</div>
    {:else if error}
      <div class="msg bad">Mot de passe incorrect ({error}).</div>
    {/if}

    <button class="forensic" onclick={enter}>
      <Icon name="shield" size={14} />
      {mode === 'lock' ? 'Déverrouiller — accès forensique (SOC)' : 'Ouvrir la session — accès forensique (SOC)'}
    </button>
    <p class="note">
      {mode === 'lock' ? 'Session verrouillée. Vos fenêtres sont intactes.' : 'Session préparée par le SOC : le mot de passe de l’utilisateur n’est pas requis.'}
    </p>
  </div>

  <div class="foot mono">{k.machine.os} · {k.machine.ip}</div>
</div>

<style>
  .lock {
    position: fixed;
    inset: 0;
    z-index: 30000;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 40px;
    background: radial-gradient(120% 90% at 50% 40%, #0d1420 0%, #080b11 55%, #05070b 100%);
    animation: fade 300ms var(--kp-ease);
  }
  .lock.wp-aurora { background: linear-gradient(160deg, #0b1d2a 0%, #0a0e14 45%, #1a1030 100%); }
  .lock.wp-dusk { background: linear-gradient(170deg, #1d1326 0%, #0b0d14 55%, #05070b 100%); }
  .lock.wp-mono, .lock.wp-circuit { background: linear-gradient(180deg, #111419 0%, #0a0c10 100%); }
  .overlay { background: rgba(5, 7, 11, 0.55) !important; backdrop-filter: blur(24px) saturate(120%); }
  @keyframes fade { from { opacity: 0; } }
  .veil { position: absolute; inset: 0; background: radial-gradient(600px 400px at 50% 30%, rgba(62, 230, 245, 0.08), transparent 70%); pointer-events: none; }
  .clock { position: relative; text-align: center; }
  .time { font-size: clamp(64px, 11vw, 120px); font-weight: 200; letter-spacing: -0.04em; line-height: 1; }
  .date { margin-top: 8px; color: var(--kp-text-1); font-size: 16px; }
  .date::first-letter { text-transform: uppercase; }
  .card { position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px; width: min(340px, 90vw); }
  .avatar { display: grid; place-items: center; width: 76px; height: 76px; margin-bottom: 6px; border-radius: 50%; font-size: 26px; font-weight: 700; color: var(--kp-violet); background: var(--kp-violet-dim); border: 1px solid rgba(157, 123, 255, 0.35); box-shadow: 0 0 40px -10px rgba(157, 123, 255, 0.6); }
  .name { font-size: 18px; font-weight: 600; }
  .host { color: var(--kp-text-2); font-size: 12px; }
  .pw { display: flex; align-items: center; gap: 8px; width: 100%; margin-top: 14px; padding: 0 6px 0 12px; height: 40px; border-radius: 999px; background: rgba(12, 16, 22, 0.75); border: 1px solid var(--kp-line-strong); color: var(--kp-text-2); }
  .pw:focus-within { border-color: rgba(62, 230, 245, 0.5); box-shadow: 0 0 0 3px var(--kp-cyan-dim); }
  .pw.ok { border-color: var(--kp-green); }
  .pw input { flex: 1; min-width: 0; border: 0; outline: none; box-shadow: none; background: transparent; font-size: 14px; color: var(--kp-text-0); user-select: text; }
  .pw button { display: grid; place-items: center; width: 30px; height: 30px; border: 0; border-radius: 50%; background: var(--kp-cyan); color: var(--kp-bg-0); }
  .pw button:disabled { background: var(--kp-bg-4); color: var(--kp-text-2); }
  .shake { animation: shake 320ms var(--kp-ease); }
  @keyframes shake { 20%, 60% { transform: translateX(-6px); } 40%, 80% { transform: translateX(6px); } }
  .msg { font-size: 12px; }
  .good { color: var(--kp-green); }
  .bad { color: var(--kp-red); }
  .forensic { display: inline-flex; align-items: center; gap: 8px; margin-top: 16px; padding: 9px 16px; border: 1px solid rgba(62, 230, 245, 0.35); border-radius: 999px; background: var(--kp-cyan-dim); color: var(--kp-cyan); font-weight: 500; }
  .forensic:hover { background: rgba(62, 230, 245, 0.2); border-color: var(--kp-cyan); }
  .note { margin: 4px 0 0; color: var(--kp-text-2); font-size: 11.5px; text-align: center; }
  .foot { position: absolute; bottom: 18px; color: var(--kp-text-2); font-size: 11px; }
</style>
