// Bash-like command line parser.
// Supports: '…' "…" \escapes, $VAR ${VAR} $?, ~, globs, | ; && || &, > >> < 2> 2>> &> 2>&1, # comments.
// Expansion is deferred to execution time (see expand()), so the parser output is pure syntax.

export interface Segment {
  text: string;
  quote: 'none' | 'single' | 'double';
}
export type Word = Segment[];

export type RedirectOp = '>' | '>>' | '<' | '2>' | '2>>' | '&>' | '2>&1';
export interface Redirect {
  op: RedirectOp;
  target?: Word;
}

export interface SimpleCommand {
  words: Word[];
  redirects: Redirect[];
}

export interface Pipeline {
  commands: SimpleCommand[];
}

export interface ListItem {
  pipeline: Pipeline;
  /** Operator that connects this pipeline to the NEXT one. */
  next: ';' | '&&' | '||' | null;
}

export class ParseError extends Error {}

type Token = { kind: 'word'; word: Word } | { kind: 'op'; op: string };

const OPERATORS = ['2>&1', '2>>', '&&', '||', '>>', '&>', '2>', '|', ';', '&', '>', '<'];

export function tokenize(line: string): Token[] {
  const tokens: Token[] = [];
  let word: Word = [];
  let buf = '';
  let inWord = false;
  const flush = (quote: Segment['quote'] = 'none') => {
    if (buf) word.push({ text: buf, quote });
    buf = '';
  };
  const endWord = () => {
    flush();
    if (inWord) tokens.push({ kind: 'word', word });
    word = [];
    inWord = false;
  };

  let i = 0;
  while (i < line.length) {
    const c = line[i]!;
    if (c === ' ' || c === '\t' || c === '\n') {
      endWord();
      i++;
      continue;
    }
    if (c === '#' && !inWord) break;
    if (c === '\\') {
      // An escaped char is literal: store it as a single-quoted segment.
      flush();
      if (i + 1 < line.length) word.push({ text: line[i + 1]!, quote: 'single' });
      inWord = true;
      i += 2;
      continue;
    }
    if (c === "'") {
      flush();
      const end = line.indexOf("'", i + 1);
      if (end === -1) throw new ParseError('unexpected EOF while looking for matching `\'\'');
      word.push({ text: line.slice(i + 1, end), quote: 'single' });
      inWord = true;
      i = end + 1;
      continue;
    }
    if (c === '"') {
      flush();
      let j = i + 1;
      let text = '';
      while (j < line.length && line[j] !== '"') {
        if (line[j] === '\\' && /["\\$`]/.test(line[j + 1] ?? '')) {
          // Keep \$ distinguishable from $ for the expander.
          text += line[j + 1] === '$' ? '\u0000' : line[j + 1];
          j += 2;
        } else {
          text += line[j++];
        }
      }
      if (j >= line.length) throw new ParseError('unexpected EOF while looking for matching `"\'');
      word.push({ text, quote: 'double' });
      inWord = true;
      i = j + 1;
      continue;
    }
    // Operators — but "2>" only counts when it starts a word.
    const op = OPERATORS.find((o) => line.startsWith(o, i) && (!o.startsWith('2') || (!inWord && !buf)));
    if (op) {
      endWord();
      tokens.push({ kind: 'op', op });
      i += op.length;
      continue;
    }
    buf += c;
    inWord = true;
    i++;
  }
  endWord();
  return tokens;
}

export function parse(line: string): ListItem[] {
  const tokens = tokenize(line);
  const list: ListItem[] = [];
  let pipeline: Pipeline = { commands: [] };
  let cmd: SimpleCommand = { words: [], redirects: [] };

  const endCommand = () => {
    if (!cmd.words.length && !cmd.redirects.length) throw new ParseError('syntax error near unexpected token');
    pipeline.commands.push(cmd);
    cmd = { words: [], redirects: [] };
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.kind === 'word') {
      cmd.words.push(t.word);
      continue;
    }
    switch (t.op) {
      case '|':
        endCommand();
        break;
      case ';':
      case '&':
      case '&&':
      case '||':
        endCommand();
        list.push({ pipeline, next: t.op === '&' ? ';' : (t.op as ListItem['next']) });
        pipeline = { commands: [] };
        break;
      case '2>&1':
        cmd.redirects.push({ op: '2>&1' });
        break;
      default: {
        const target = tokens[++i];
        if (!target || target.kind !== 'word') throw new ParseError(`syntax error near unexpected token \`newline'`);
        cmd.redirects.push({ op: t.op as RedirectOp, target: target.word });
      }
    }
  }
  if (cmd.words.length || cmd.redirects.length) endCommand();
  else if (tokens.length && tokens[tokens.length - 1]!.kind === 'op' && (tokens[tokens.length - 1] as { op: string }).op === '|') {
    throw new ParseError('syntax error: unexpected end of file');
  }
  if (pipeline.commands.length) list.push({ pipeline, next: null });
  else if (list.length && list[list.length - 1]!.next !== ';') throw new ParseError('syntax error: unexpected end of file');
  if (list.length) list[list.length - 1]!.next = null;
  return list;
}

// ── Expansion ─────────────────────────────────────────────────────────────

export interface ExpandContext {
  env: Record<string, string>;
  home: string;
  /** Returns matches for an absolute or relative glob pattern, or [] if none. */
  glob(pattern: string): string[];
}

const VAR_RE = /\$(\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*)|(\?)|(\$))/g;

function expandVars(text: string, env: Record<string, string>): string {
  return text
    .replace(VAR_RE, (_m, _all, braced, plain, q, dollar) => {
      if (q) return env['?'] ?? '0';
      if (dollar) return env['$$'] ?? '4242';
      return env[braced ?? plain] ?? '';
    })
    .replace(/\u0000/g, '$');
}

/** Glob metacharacters that came from unquoted text are marked with \u0001 before matching. */
export function expandWord(word: Word, ctx: ExpandContext): string[] {
  let text = '';
  let pattern = '';
  let hasGlob = false;
  word.forEach((seg, idx) => {
    let t = seg.text;
    if (seg.quote === 'single') {
      text += t;
      pattern += t.replace(/[*?[\]]/g, '\\$&');
      return;
    }
    t = expandVars(t, ctx.env);
    if (seg.quote === 'none') {
      if (idx === 0 && (t === '~' || t.startsWith('~/'))) t = ctx.home + t.slice(1);
      if (/[*?]/.test(t)) hasGlob = true;
      pattern += t;
    } else {
      pattern += t.replace(/[*?[\]]/g, '\\$&');
    }
    text += t;
  });
  if (hasGlob) {
    const matches = ctx.glob(pattern);
    if (matches.length) return matches;
  }
  const unquoted = word.every((s) => s.quote === 'none');
  // Field splitting: an unquoted expansion splits on whitespace; an empty one disappears.
  if (unquoted && word.some((s) => s.text.includes('$'))) return text.split(/\s+/).filter(Boolean);
  return [text];
}

/** Converts a single path component glob into a RegExp. Backslash escapes a metachar. */
export function globToRegExp(component: string): RegExp {
  let re = '';
  for (let i = 0; i < component.length; i++) {
    const c = component[i]!;
    if (c === '\\' && i + 1 < component.length) re += component[++i]!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}
