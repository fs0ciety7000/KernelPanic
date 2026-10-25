<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { os } from '$lib/os/os.svelte';
  import { wm } from '$lib/os/wm.svelte';
  import type { AppProps } from '$lib/os/apps';
  import Icon from '$lib/desktop/Icon.svelte';

  let { win }: AppProps = $props();
  const k = os.kernel!;
  const chat = k.bundle.chat;
  const contacts = chat?.contacts ?? [];
  const evidenceTitle = (id: string) => k.bundle.evidence?.find((e) => e.id === id)?.title ?? id;

  let selected = $state<string | null>(contacts[0]?.id ?? null);
  let scroller = $state<HTMLDivElement>();
  /** Number of messages already revealed per contact; new NPC lines appear after a typing pause. */
  let shown = $state<Record<string, number>>({});
  let typing = $state(false);

  $effect(() => {
    void win.nonce;
    const c = win.args.contact;
    untrack(() => {
      if (typeof c === 'string' && contacts.some((x) => x.id === c)) selected = c;
    });
  });

  const chatState = $derived.by(() => {
    void os.version;
    return k.runtime.state.chat;
  });
  const log = $derived(selected ? (chatState.log[selected] ?? []) : []);
  const replies = $derived.by(() => {
    void os.version;
    return selected ? k.runtime.chatReplies(selected) : [];
  });

  // Reveal new messages one by one with a typing indicator (only for the open conversation).
  $effect(() => {
    const c = selected;
    const total = log.length;
    const seen = c ? shown[c] : undefined;
    if (!c || typing) return;
    untrack(() => {
      if (seen === undefined || wm.focused?.id !== win.id) {
        shown[c] = total; // first look, or window in background: show everything at once
        return;
      }
      if (seen >= total) return;
      const next = log[seen];
      if (next?.from === 'me') {
        shown[c] = seen + 1;
        return;
      }
      typing = true;
      setTimeout(() => {
        shown[c] = Math.min(seen + 1, log.length);
        typing = false;
      }, 650 + Math.min(1400, (next?.text.length ?? 20) * 18));
    });
  });

  const visible = $derived(selected ? log.slice(0, shown[selected] ?? log.length) : []);
  const done = $derived(selected ? (shown[selected] ?? log.length) >= log.length : true);

  // Opening a conversation marks it read; keep the view scrolled to the bottom.
  $effect(() => {
    void visible.length;
    void typing;
    if (selected && wm.focused?.id === win.id) untrack(() => k.runtime.markChatRead(selected!));
    tick().then(() => scroller?.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' }));
  });

  const unreadTotal = $derived(Object.values(chatState.unread).reduce((a, b) => a + b, 0));
  $effect(() => {
    win.title = unreadTotal ? `Messages — ${unreadTotal} non lu${unreadTotal > 1 ? 's' : ''}` : 'Messages';
  });

  const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const hue = (id: string) => [...id].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const time = (at: number) => k.time.hm(at);
  const day = (at: number) => k.time.iso(at).slice(0, 10).split('-').reverse().join('/');
  const lastOf = (id: string) => chatState.log[id]?.at(-1);
</script>

<div class="chat">
  <aside class="contacts">
    <div class="kp-label sec">Conversations</div>
    {#each contacts as c (c.id)}
      {@const last = lastOf(c.id)}
      <button class="contact" class:active={selected === c.id} onclick={() => (selected = c.id)}>
        <span class="av" style="--h:{hue(c.id)}">{initials(c.name)}</span>
        <span class="cinfo">
          <span class="cname">{c.name}</span>
          <span class="cprev">{last ? `${last.from === 'me' ? 'Vous : ' : ''}${last.text}` : (c.role ?? '')}</span>
        </span>
        {#if chatState.unread[c.id]}<span class="badge mono">{chatState.unread[c.id]}</span>{/if}
      </button>
    {:else}
      <p class="dim pad">Aucun contact sur ce poste.</p>
    {/each}
  </aside>

  <section class="conv">
    {#if selected}
      {@const c = contacts.find((x) => x.id === selected)!}
      <header>
        <span class="av" style="--h:{hue(c.id)}">{initials(c.name)}</span>
        <div>
          <div class="cname">{c.name}</div>
          <div class="status"><span class="dot"></span>{c.status ?? 'en ligne'}{c.role ? ` · ${c.role}` : ''}</div>
        </div>
      </header>
      <div class="msgs" bind:this={scroller}>
        {#each visible as m, i (i)}
          {#if i === 0 || day(m.at) !== day(visible[i - 1]!.at)}
            <div class="day mono">{day(m.at)}</div>
          {/if}
          <div class="msg" class:me={m.from === 'me'}>
            <div class="bubble">{m.text}</div>
            <span class="t mono">{time(m.at)}</span>
          </div>
        {/each}
        {#if typing}
          <div class="msg"><div class="bubble typing" aria-label="En train d'écrire"><span></span><span></span><span></span></div></div>
        {/if}
      </div>
      <footer>
        {#if done && replies.length}
          <div class="kp-label">Répondre</div>
          <div class="replies">
            {#each replies as r (r.id)}
              <button class="reply" disabled={r.missing.length > 0} onclick={() => k.runtime.chatReply(selected!, r.id)} title={r.missing.length ? `Il vous manque : ${r.missing.map(evidenceTitle).join(', ')}` : ''}>
                {#if r.missing.length}<Icon name="lock" size={12} />{/if}
                {r.text}
              </button>
            {/each}
          </div>
        {:else}
          <div class="noreply dim">{typing ? `${c.name.split(' ')[0]} écrit…` : 'Messagerie interne — les réponses apparaissent quand la conversation l’exige.'}</div>
        {/if}
      </footer>
    {:else}
      <div class="kp-empty">Sélectionnez une conversation</div>
    {/if}
  </section>
</div>

<style>
  .chat { display: flex; flex: 1; min-height: 0; }
  .contacts { width: 250px; flex-shrink: 0; overflow: auto; border-right: 1px solid var(--kp-line); background: var(--kp-bg-2); padding: 8px 6px; }
  .sec { padding: 4px 8px 8px; }
  .contact { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px; border: 0; border-radius: var(--kp-radius-m); background: transparent; color: var(--kp-text-0); text-align: left; }
  .contact:hover { background: rgba(255, 255, 255, 0.04); }
  .contact.active { background: var(--kp-cyan-dim); }
  .av { display: grid; place-items: center; width: 36px; height: 36px; flex-shrink: 0; border-radius: 50%; font-size: 12px; font-weight: 700; color: hsl(var(--h) 80% 78%); background: hsl(var(--h) 45% 22%); }
  .cinfo { display: flex; flex-direction: column; min-width: 0; flex: 1; }
  .cname { font-weight: 600; font-size: 12.5px; }
  .cprev { color: var(--kp-text-2); font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .badge { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: var(--kp-cyan); color: var(--kp-bg-0); font-size: 10.5px; font-weight: 700; line-height: 18px; text-align: center; }
  .conv { flex: 1; display: flex; flex-direction: column; min-width: 0; background: var(--kp-bg-1); }
  header { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--kp-line); }
  .status { display: flex; align-items: center; gap: 6px; color: var(--kp-text-2); font-size: 11.5px; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--kp-green); box-shadow: 0 0 6px var(--kp-green); }
  .msgs { flex: 1; overflow: auto; padding: 16px; display: flex; flex-direction: column; gap: 6px; }
  .day { align-self: center; margin: 8px 0; padding: 2px 10px; border-radius: 999px; background: var(--kp-bg-3); color: var(--kp-text-2); font-size: 10.5px; }
  .msg { display: flex; align-items: flex-end; gap: 6px; max-width: 78%; animation: in 200ms var(--kp-ease); }
  .msg.me { align-self: flex-end; flex-direction: row-reverse; }
  @keyframes in { from { opacity: 0; transform: translateY(4px); } }
  .bubble { padding: 8px 12px; border-radius: 14px 14px 14px 4px; background: var(--kp-bg-3); border: 1px solid var(--kp-line); font-size: 13px; line-height: 1.5; white-space: pre-wrap; user-select: text; }
  .me .bubble { border-radius: 14px 14px 4px 14px; background: rgba(62, 230, 245, 0.14); border-color: rgba(62, 230, 245, 0.25); }
  .t { color: var(--kp-text-2); font-size: 10px; flex-shrink: 0; }
  .typing { display: flex; gap: 4px; padding: 12px 14px; }
  .typing span { width: 6px; height: 6px; border-radius: 50%; background: var(--kp-text-2); animation: blink 1s infinite; }
  .typing span:nth-child(2) { animation-delay: 0.15s; }
  .typing span:nth-child(3) { animation-delay: 0.3s; }
  @keyframes blink { 0%, 60%, 100% { opacity: 0.3; } 30% { opacity: 1; } }
  footer { padding: 10px 14px 14px; border-top: 1px solid var(--kp-line); background: var(--kp-bg-2); }
  .replies { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
  .reply { display: flex; align-items: center; gap: 8px; padding: 9px 12px; border: 1px solid rgba(62, 230, 245, 0.3); border-radius: var(--kp-radius-m); background: var(--kp-bg-3); color: var(--kp-text-0); font-size: 12.5px; text-align: left; }
  .reply:hover:not(:disabled) { background: var(--kp-cyan-dim); border-color: var(--kp-cyan); }
  .reply:disabled { opacity: 0.5; border-color: var(--kp-line); cursor: not-allowed; }
  .noreply { font-size: 11.5px; padding: 4px 0; }
  .dim { color: var(--kp-text-2); }
  .pad { padding: 10px; }
</style>
