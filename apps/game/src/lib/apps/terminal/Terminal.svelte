<script lang="ts">
  import { onMount } from 'svelte';
  import { Terminal } from '@xterm/xterm';
  import { FitAddon } from '@xterm/addon-fit';
  import '@xterm/xterm/css/xterm.css';
  import { os } from '$lib/os/os.svelte';
  import { wm } from '$lib/os/wm.svelte';
  import type { AppProps } from '$lib/os/apps';
  import { LineEditor } from './line-editor';
  import type { Shell } from '@kp/kernel';

  let { win }: AppProps = $props();
  let host: HTMLDivElement;

  // NOCTIS ANSI palette (DESIGN_SYSTEM.md §2.3)
  const theme = {
    background: '#070a0f',
    foreground: '#c4cedc',
    cursor: '#3ee6f5',
    cursorAccent: '#070a0f',
    selectionBackground: 'rgba(62,230,245,0.25)',
    black: '#0a0e14', brightBlack: '#3a4454',
    red: '#ff4f6d', brightRed: '#ff7a91',
    green: '#5af2a0', brightGreen: '#8cf7bf',
    yellow: '#ffb648', brightYellow: '#ffcc7a',
    blue: '#5b9cff', brightBlue: '#8ab8ff',
    magenta: '#9d7bff', brightMagenta: '#bba3ff',
    cyan: '#3ee6f5', brightCyan: '#7befff',
    white: '#c4cedc', brightWhite: '#e8eef7',
  };

  onMount(() => {
    const kernel = os.kernel!;
    const term = new Terminal({
      theme,
      fontFamily: "'JetBrains Mono Variable', ui-monospace, Menlo, monospace",
      fontSize: 13,
      lineHeight: 1.25,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 4000,
      allowProposedApi: false,
      convertEol: false,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);

    const write = (t: string) => term.write(t.replace(/\r?\n/g, '\r\n'));
    let shell: Shell;
    const editor = new LineEditor(
      { write: (d) => term.write(d), clear: () => term.clear() },
      () => shell,
      () => kernel.history,
    );
    shell = kernel.createShell({
      write,
      prompt: (q, opts) => editor.ask(q, !!opts?.secret),
      exit: () => wm.close(win.id),
    });
    if (typeof win.args.cwd === 'string') {
      try {
        shell.chdir(win.args.cwd);
      } catch {
        /* keep home */
      }
    }

    const m = kernel.machine;
    write(`\x1b[2m${m.os} · ${m.kernel} · tty pts/0\x1b[0m\n`);
    write(`\x1b[2mSession forensique — tapez \x1b[0m\x1b[36mhelp\x1b[0m\x1b[2m pour la liste des commandes.\x1b[0m\n\n`);
    editor.printPrompt();
    term.onData((d) => editor.input(d));
    term.focus();

    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        /* hidden */
      }
    });
    ro.observe(host);
    requestAnimationFrame(() => fit.fit());

    return () => {
      ro.disconnect();
      term.dispose();
    };
  });

  // Refocus the terminal when its window gains focus.
  $effect(() => {
    if (wm.focused?.id === win.id) host?.querySelector('textarea')?.focus();
  });
</script>

<div class="term" bind:this={host}></div>

<style>
  .term {
    flex: 1;
    min-height: 0;
    padding: 10px 4px 6px 12px;
    background: #070a0f;
  }
  .term :global(.xterm) { height: 100%; }
  .term :global(.xterm-viewport) { background: transparent !important; }
</style>
