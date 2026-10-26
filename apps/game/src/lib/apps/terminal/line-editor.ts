// Readline-style editing on top of xterm.js. xterm only renders; this owns the input line,
// history, completion and password prompts, and hands complete lines to the kernel shell.

import type { Shell } from '@kp/kernel';

export interface TermLike {
  write(data: string): void;
  clear(): void;
}

const CSI = '\x1b[';

export class LineEditor {
  private buf = '';
  private cursor = 0;
  private histIndex = -1;
  private draft = '';
  private busy = false;
  private secret: { resolve: (v: string | null) => void; value: string } | null = null;
  private plainPrompt: { resolve: (v: string | null) => void; value: string } | null = null;

  constructor(
    private term: TermLike,
    private shell: () => Shell,
    private history: () => string[],
  ) {}

  /** Used by the ShellIO prompt(). */
  ask(question: string, secret: boolean): Promise<string | null> {
    this.term.write(question);
    return new Promise((resolve) => {
      if (secret) this.secret = { resolve, value: '' };
      else this.plainPrompt = { resolve, value: '' };
    });
  }

  printPrompt(): void {
    this.term.write(this.shell().promptString());
  }

  /** Redraws the edit line after the prompt. */
  private redraw(): void {
    const tail = this.buf.slice(this.cursor);
    this.term.write(`\r${CSI}2K${this.shell().promptString()}${this.buf}`);
    if (tail.length) this.term.write(`${CSI}${tail.length}D`);
  }

  private insert(text: string): void {
    this.buf = this.buf.slice(0, this.cursor) + text + this.buf.slice(this.cursor);
    this.cursor += text.length;
    if (this.cursor === this.buf.length) this.term.write(text);
    else this.redraw();
  }

  async input(data: string): Promise<void> {
    if (this.secret || this.plainPrompt) return this.promptInput(data);
    if (this.busy) {
      return;
    }
    // Pasted text: handle line by line.
    if (data.length > 1 && !data.startsWith('\x1b') && /[\r\n]/.test(data)) {
      for (const [i, part] of data.split(/\r\n|\r|\n/).entries()) {
        if (i > 0) await this.submit();
        if (part) this.insert(part);
      }
      return;
    }
    switch (data) {
      case '\r':
        return this.submit();
      case '\x7f':
      case '\b':
        if (this.cursor > 0) {
          this.buf = this.buf.slice(0, this.cursor - 1) + this.buf.slice(this.cursor);
          this.cursor--;
          this.redraw();
        }
        return;
      case `${CSI}3~`:
        if (this.cursor < this.buf.length) {
          this.buf = this.buf.slice(0, this.cursor) + this.buf.slice(this.cursor + 1);
          this.redraw();
        }
        return;
      case `${CSI}D`:
        if (this.cursor > 0) {
          this.cursor--;
          this.term.write(data);
        }
        return;
      case `${CSI}C`:
        if (this.cursor < this.buf.length) {
          this.cursor++;
          this.term.write(data);
        }
        return;
      case `${CSI}H`:
      case '\x01':
        this.cursor = 0;
        return this.redraw();
      case `${CSI}F`:
      case '\x05':
        this.cursor = this.buf.length;
        return this.redraw();
      case `${CSI}A`:
        return this.historyStep(-1);
      case `${CSI}B`:
        return this.historyStep(1);
      case '\t':
        return this.complete();
      case '\x03':
        this.term.write('^C\r\n');
        this.reset();
        return this.printPrompt();
      case '\x0c':
        this.term.clear();
        this.term.write(`${CSI}2J${CSI}H`);
        return this.redraw();
      case '\x15':
        this.buf = this.buf.slice(this.cursor);
        this.cursor = 0;
        return this.redraw();
      case '\x17': {
        const left = this.buf.slice(0, this.cursor).replace(/\S+\s*$/, '');
        this.buf = left + this.buf.slice(this.cursor);
        this.cursor = left.length;
        return this.redraw();
      }
      case '\x04':
        if (!this.buf) {
          this.term.write('exit\r\n');
          this.busy = true;
          await this.shell().run('exit');
          this.busy = false;
          this.printPrompt();
        }
        return;
    }
    if (data.startsWith('\x1b')) return; // unhandled escape sequence
    const printable = data.replace(/[\x00-\x1f]/g, '');
    if (printable) this.insert(printable);
  }

  private promptInput(data: string): void {
    const p = (this.secret ?? this.plainPrompt)!;
    const isSecret = !!this.secret;
    const done = (value: string | null) => {
      this.secret = null;
      this.plainPrompt = null;
      this.term.write(value === null ? '^C\r\n' : '\r\n');
      p.resolve(value);
    };
    for (const ch of data) {
      if (ch === '\r' || ch === '\n') return done(p.value);
      if (ch === '\x03') return done(null);
      if (ch === '\x7f' || ch === '\b') {
        if (p.value) {
          p.value = p.value.slice(0, -1);
          if (!isSecret) this.term.write('\b \b');
        }
        continue;
      }
      if (ch >= ' ') {
        p.value += ch;
        if (!isSecret) this.term.write(ch);
      }
    }
  }

  private reset(): void {
    this.buf = '';
    this.cursor = 0;
    this.histIndex = -1;
    this.draft = '';
  }

  private async submit(): Promise<void> {
    const line = this.buf;
    this.term.write('\r\n');
    this.reset();
    if (line.trim()) {
      this.busy = true;
      try {
        await this.shell().run(line);
      } finally {
        this.busy = false;
      }
    }
    this.printPrompt();
  }

  private historyStep(dir: -1 | 1): void {
    const h = this.history();
    if (!h.length) return;
    if (this.histIndex === -1) {
      if (dir === 1) return;
      this.draft = this.buf;
      this.histIndex = h.length - 1;
    } else {
      this.histIndex += dir;
      if (this.histIndex >= h.length) {
        this.histIndex = -1;
        this.buf = this.draft;
        this.cursor = this.buf.length;
        return this.redraw();
      }
      this.histIndex = Math.max(0, this.histIndex);
    }
    this.buf = h[this.histIndex]!;
    this.cursor = this.buf.length;
    this.redraw();
  }

  private complete(): void {
    const before = this.buf.slice(0, this.cursor);
    const { prefix, matches } = this.shell().complete(before);
    if (!matches.length) return;
    if (matches.length === 1) {
      const m = matches[0]!;
      const add = m.slice(prefix.length) + (m.endsWith('/') ? '' : ' ');
      return this.insert(add);
    }
    // Longest common prefix, else list candidates.
    let common = matches[0]!;
    for (const m of matches) while (!m.startsWith(common)) common = common.slice(0, -1);
    if (common.length > prefix.length) return this.insert(common.slice(prefix.length));
    const names = matches.map((m) => m.replace(/\/$/, '').split('/').pop() + (m.endsWith('/') ? '/' : ''));
    this.term.write('\r\n' + names.join('  ') + '\r\n');
    this.redraw();
  }
}
