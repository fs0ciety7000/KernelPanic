// "Premiers pas" panel: shown once on the first desktop session, reopenable from the system menu.

import { load, store } from './storage';

const KEY = 'kp.help.seen';

class Help {
  open = $state(false);

  /** Called when the desktop appears. */
  maybeShowFirstTime(): void {
    if (!load<boolean>(KEY)) this.open = true;
  }

  toggle(): void {
    if (this.open) this.close();
    else this.open = true;
  }

  close(): void {
    this.open = false;
    store(KEY, true);
  }
}

export const help = new Help();
