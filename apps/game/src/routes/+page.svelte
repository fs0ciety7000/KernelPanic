<script lang="ts">
  import '$lib/styles/global.css';
  import { os } from '$lib/os/os.svelte';
  import Boot from '$lib/desktop/Boot.svelte';
  import Menu from '$lib/desktop/Menu.svelte';
  import Intro from '$lib/desktop/Intro.svelte';
  import Desktop from '$lib/desktop/Desktop.svelte';
  import EndScreen from '$lib/desktop/EndScreen.svelte';
</script>

{#if os.phase === 'boot'}
  <Boot />
{:else if os.phase === 'select'}
  <Menu />
{:else if os.phase === 'intro' && os.kernel}
  <Intro />
{:else if os.phase === 'desktop' && os.kernel}
  <Desktop />
{:else if os.phase === 'ended' && os.kernel}
  <EndScreen />
{/if}
