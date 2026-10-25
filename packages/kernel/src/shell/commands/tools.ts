// seq, tee, xargs, sed, diff, awk — the subset an investigator actually types.
import { getopt } from '../args';
import { fsMessage, type CommandContext, type CommandDef } from '../shell';
import { eachInput } from './fs';

const lines = (text: string) => (text === '' ? [] : text.replace(/\n$/, '').split('\n'));

const seq: CommandDef = {
  name: 'seq',
  summary: 'print a sequence of numbers',
  usage: 'seq [FIRST [INCREMENT]] LAST',
  run(ctx) {
    const n = ctx.argv.map(Number);
    if (!n.length || n.some(Number.isNaN)) {
      ctx.err('usage: seq [FIRST [INCREMENT]] LAST\n');
      return 1;
    }
    const [first, inc, last] = n.length === 1 ? [1, 1, n[0]!] : n.length === 2 ? [n[0]!, 1, n[1]!] : [n[0]!, n[1]!, n[2]!];
    if (inc === 0) return 1;
    const out: number[] = [];
    for (let x = first; inc > 0 ? x <= last : x >= last; x += inc) if (out.push(x) > 10000) break;
    if (out.length) ctx.out(out.join('\n') + '\n');
    return 0;
  },
};

const tee: CommandDef = {
  name: 'tee',
  summary: 'read from standard input and write to standard output and files',
  usage: 'tee [-a] FILE...',
  run(ctx) {
    const { flags, rest } = getopt(ctx.argv, 'a');
    const data = ctx.stdin ?? '';
    let status = 0;
    for (const f of rest) {
      try {
        ctx.kernel.vfs.writeFile(ctx.resolve(f), data, ctx.cred, { append: flags.has('a') });
      } catch (e) {
        ctx.err(fsMessage('tee', e, f));
        status = 1;
      }
    }
    ctx.out(data);
    return status;
  },
};

const xargs: CommandDef = {
  name: 'xargs',
  summary: 'build and execute command lines from standard input',
  usage: 'xargs [-n N] [-I REPL] [COMMAND [ARGS]...]',
  async run(ctx) {
    // xargs options stop at the command: its own flags belong to it.
    const values: Record<string, string> = {};
    let i = 0;
    for (; i < ctx.argv.length && /^-[nI0rt]/.test(ctx.argv[i]!); i++) {
      const a = ctx.argv[i]!;
      if (a[1] === 'n' || a[1] === 'I') values[a[1]] = a.slice(2) || ctx.argv[++i] || '';
    }
    const rest = ctx.argv.slice(i);
    const items = (ctx.stdin ?? '').split(/\s+/).filter(Boolean);
    const cmd = rest.length ? rest : ['echo'];
    if (!items.length) return 0;
    const runOne = (argv: string[]) => ctx.sh.exec(argv, { out: ctx.out, err: ctx.err, tty: ctx.tty, cred: ctx.cred });
    let status = 0;
    if (values.I !== undefined) {
      for (const item of items.slice(0, 500)) status |= await runOne(cmd.map((a) => a.split(values.I!).join(item)));
      return status ? 123 : 0;
    }
    const n = values.n ? Math.max(1, parseInt(values.n, 10)) : items.length;
    for (let i = 0; i < items.length && i < 5000; i += n) status |= await runOne([...cmd, ...items.slice(i, i + n)]);
    return status ? 123 : 0;
  },
};

// ── sed: [addr[,addr]]{s///flags | p | d}, -n, -e, -i, -E ────────────────────

type SedAddr = { line?: number; re?: RegExp; last?: boolean };
type SedCmd = { a1?: SedAddr; a2?: SedAddr; op: 's' | 'p' | 'd'; re?: RegExp; rep?: string; global?: boolean; print?: boolean };

/** Basic-regex → JS: \( \) \{ \} \| \+ \? become operators, bare ( ) | + ? become literals. */
function bre(src: string): string {
  let out = '';
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (ch === '\\' && i + 1 < src.length) {
      const nx = src[++i]!;
      out += '(){}|+?'.includes(nx) ? nx : '\\' + nx;
    } else out += '(){}|+?'.includes(ch) ? '\\' + ch : ch;
  }
  return out;
}

function parseSed(script: string, extended: boolean): SedCmd[] {
  const cmds: SedCmd[] = [];
  let i = 0;
  const rx = (src: string, flags = '') => new RegExp(extended ? src : bre(src), flags);
  const delimited = (delim: string) => {
    let s = '';
    while (i < script.length && script[i] !== delim) {
      if (script[i] === '\\' && script[i + 1] === delim) {
        s += delim;
        i += 2;
      } else s += script[i++];
    }
    if (script[i] !== delim) throw new Error(`unterminated address regex`);
    i++;
    return s;
  };
  const addr = (): SedAddr | undefined => {
    if (/\d/.test(script[i] ?? '')) {
      const m = script.slice(i).match(/^\d+/)![0];
      i += m.length;
      return { line: parseInt(m, 10) };
    }
    if (script[i] === '$') {
      i++;
      return { last: true };
    }
    if (script[i] === '/') {
      i++;
      return { re: rx(delimited('/')) };
    }
    return undefined;
  };
  while (i < script.length) {
    while (/[\s;]/.test(script[i] ?? '')) i++;
    if (i >= script.length) break;
    const cmd: Partial<SedCmd> = { a1: addr() };
    if (cmd.a1 && script[i] === ',') {
      i++;
      cmd.a2 = addr();
    }
    const op = script[i++];
    if (op === 's') {
      const d = script[i++]!;
      const pat = delimited(d);
      const rep = delimited(d);
      const fl = script.slice(i).match(/^[gIip0-9]*/)![0];
      i += fl.length;
      cmds.push({ ...cmd, op: 's', re: rx(pat, (fl.includes('g') ? 'g' : '') + (/[Ii]/.test(fl) ? 'i' : '')), rep, global: fl.includes('g'), print: fl.includes('p') });
    } else if (op === 'p' || op === 'd') cmds.push({ ...cmd, op });
    else throw new Error(`unknown command: \`${op ?? ''}'`);
  }
  return cmds;
}

function runSed(cmds: SedCmd[], text: string, quiet: boolean): string {
  const src = lines(text);
  let out = '';
  const ranges = new Map<SedCmd, boolean>();
  const hit = (a: SedAddr, n: number, line: string) => (a.line !== undefined ? a.line === n : a.last ? n === src.length : a.re!.test(line));
  src.forEach((original, idx) => {
    const n = idx + 1;
    let line = original;
    let deleted = false;
    for (const c of cmds) {
      let selected = true;
      if (c.a1 && c.a2) {
        if (ranges.get(c)) {
          selected = true;
          if (hit(c.a2, n, line) || (c.a2.line !== undefined && n >= c.a2.line)) ranges.set(c, false);
        } else if (hit(c.a1, n, line)) {
          selected = true;
          ranges.set(c, !(c.a2.line !== undefined && c.a2.line <= n));
        } else selected = false;
      } else if (c.a1) selected = hit(c.a1, n, line);
      if (!selected) continue;
      if (c.op === 'd') {
        deleted = true;
        break;
      }
      if (c.op === 'p') out += line + '\n';
      if (c.op === 's') {
        c.re!.lastIndex = 0;
        if (c.re!.test(line)) {
          c.re!.lastIndex = 0;
          // sed's & and \1..\9 → JS $& and $1..$9
          const rep = c.rep!.replace(/\$/g, '$$$$').replace(/\\(\d)/g, '$$$1').replace(/(^|[^\\])&/g, '$1$$&').replace(/\\&/g, '&').replace(/\\n/g, '\n');
          line = line.replace(c.re!, rep);
          if (c.print) out += line + '\n';
        }
      }
    }
    if (!deleted && !quiet) out += line + '\n';
  });
  return out;
}

const sed: CommandDef = {
  name: 'sed',
  summary: 'stream editor for filtering and transforming text',
  usage: "sed [-n] [-E] [-i] [-e SCRIPT]... ['SCRIPT'] [FILE]...",
  run(ctx) {
    const scripts: string[] = [];
    const argv = [...ctx.argv];
    const files: string[] = [];
    let quiet = false;
    let inPlace = false;
    let extended = false;
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i]!;
      if (a === '-e' || a === '--expression') scripts.push(argv[++i] ?? '');
      else if (/^-[nEri]+$/.test(a)) {
        quiet ||= a.includes('n');
        inPlace ||= a.includes('i');
        extended ||= a.includes('E') || a.includes('r');
      } else if (!scripts.length && !files.length && a !== '-') scripts.push(a);
      else files.push(a);
    }
    if (!scripts.length) {
      ctx.err('Usage: sed [OPTION]... {script} [input-file]...\n');
      return 1;
    }
    let cmds: SedCmd[];
    try {
      cmds = parseSed(scripts.join('\n'), extended);
    } catch (e) {
      ctx.err(`sed: -e expression #1: ${(e as Error).message}\n`);
      return 1;
    }
    if (inPlace) {
      let status = 0;
      for (const f of files) {
        try {
          const path = ctx.resolve(f);
          ctx.kernel.vfs.writeFile(path, runSed(cmds, ctx.kernel.vfs.readFile(path, ctx.cred), quiet), ctx.cred);
        } catch (e) {
          ctx.err(fsMessage('sed', e, f));
          status = 4;
        }
      }
      return status;
    }
    let all = '';
    const status = eachInput(ctx, files, (t) => (all += t.endsWith('\n') || !t ? t : t + '\n'));
    ctx.out(runSed(cmds, all, quiet));
    return status ? 2 : 0;
  },
};

// ── diff: normal and unified formats ─────────────────────────────────────

type Op = { kind: '=' | '-' | '+'; a: number; b: number; text: string };

function editScript(a: string[], b: string[]): Op[] {
  const n = a.length;
  const m = b.length;
  // LCS table (inputs are small: scenario files).
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) ops.push({ kind: '=', a: i++, b: j++, text: a[i - 1]! });
    // Deletions before insertions, like GNU diff.
    else if (i < n && (j >= m || dp[i + 1]![j]! >= dp[i]![j + 1]!)) ops.push({ kind: '-', a: i++, b: j, text: a[i - 1]! });
    else ops.push({ kind: '+', a: i, b: j++, text: b[j - 1]! });
  }
  return ops;
}

const range = (from: number, count: number) => (count <= 1 ? String(from + (count === 0 ? 0 : 1)) : `${from + 1},${from + count}`);

function normalDiff(ops: Op[]): string {
  let out = '';
  for (let k = 0; k < ops.length; ) {
    if (ops[k]!.kind === '=') {
      k++;
      continue;
    }
    const del: Op[] = [];
    const add: Op[] = [];
    const start = ops[k]!;
    while (k < ops.length && ops[k]!.kind !== '=') (ops[k]!.kind === '-' ? del : add).push(ops[k++]!);
    if (del.length && add.length) out += `${range(start.a, del.length)}c${range(add[0]!.b, add.length)}\n`;
    else if (del.length) out += `${range(start.a, del.length)}d${start.b}\n`;
    else out += `${start.a}a${range(add[0]!.b, add.length)}\n`;
    for (const d of del) out += `< ${d.text}\n`;
    if (del.length && add.length) out += '---\n';
    for (const x of add) out += `> ${x.text}\n`;
  }
  return out;
}

function unifiedDiff(ops: Op[], ctxLines = 3): string {
  let out = '';
  const changes = ops.map((o, i) => (o.kind !== '=' ? i : -1)).filter((i) => i >= 0);
  let k = 0;
  while (k < changes.length) {
    let lo = Math.max(0, changes[k]! - ctxLines);
    let hi = Math.min(ops.length - 1, changes[k]! + ctxLines);
    while (k + 1 < changes.length && changes[k + 1]! - ctxLines <= hi + 1) hi = Math.min(ops.length - 1, changes[++k]! + ctxLines);
    k++;
    const hunk = ops.slice(lo, hi + 1);
    const aCount = hunk.filter((o) => o.kind !== '+').length;
    const bCount = hunk.filter((o) => o.kind !== '-').length;
    const aStart = hunk[0]!.a + (aCount ? 1 : 0);
    const bStart = hunk[0]!.b + (bCount ? 1 : 0);
    out += `@@ -${aStart},${aCount} +${bStart},${bCount} @@\n`;
    for (const o of hunk) out += `${o.kind === '=' ? ' ' : o.kind}${o.text}\n`;
    lo = hi;
  }
  return out;
}

const diff: CommandDef = {
  name: 'diff',
  summary: 'compare files line by line',
  usage: 'diff [-u] [-q] [-i] FILE1 FILE2',
  run(ctx) {
    const { flags, rest } = getopt(ctx.argv, 'uqiwN');
    if (rest.length !== 2) {
      ctx.err(`diff: ${rest.length < 2 ? 'missing operand' : 'extra operand'}\n`);
      return 2;
    }
    const texts: string[] = [];
    for (const f of rest) {
      try {
        texts.push(f === '-' ? (ctx.stdin ?? '') : ctx.kernel.vfs.readFile(ctx.resolve(f), ctx.cred));
      } catch (e) {
        ctx.err(fsMessage('diff', e, f));
        return 2;
      }
    }
    const norm = (l: string) => (flags.has('i') ? l.toLowerCase() : l).replace(flags.has('w') ? /\s+/g : /$^/, '');
    const [a, b] = texts.map(lines) as [string[], string[]];
    if (a.length > 3000 || b.length > 3000) {
      ctx.err('diff: files too large for this snapshot\n');
      return 2;
    }
    const ops = editScript(a.map(norm), b.map(norm)).map((o) => ({ ...o, text: o.kind === '+' ? b[o.b]! : a[o.a]! }));
    if (ops.every((o) => o.kind === '=')) return 0;
    if (flags.has('q')) ctx.out(`Files ${rest[0]} and ${rest[1]} differ\n`);
    else if (flags.has('u')) ctx.out(`--- ${rest[0]}\n+++ ${rest[1]}\n` + unifiedDiff(ops));
    else ctx.out(normalDiff(ops));
    return 1;
  },
};

// ── awk: rules, BEGIN/END, $N/NF/NR, comparisons, ~ /re/, print/printf, +=, ++ ──

type Tok = { t: 'num' | 'str' | 're' | 'name' | 'op'; v: string };

function awkTokens(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const reAllowed = () => {
    const last = toks[toks.length - 1];
    return !last || (last.t === 'op' && !')'.includes(last.v) && last.v !== '$');
  };
  while (i < src.length) {
    const ch = src[i]!;
    if (/\s/.test(ch)) {
      if (ch === '\n') toks.push({ t: 'op', v: ';' });
      i++;
    } else if (/\d/.test(ch) || (ch === '.' && /\d/.test(src[i + 1] ?? ''))) {
      const m = src.slice(i).match(/^\d*\.?\d+(e[+-]?\d+)?/i)![0];
      toks.push({ t: 'num', v: m });
      i += m.length;
    } else if (ch === '"') {
      let s = '';
      i++;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\') {
          const nx = src[++i];
          s += nx === 'n' ? '\n' : nx === 't' ? '\t' : nx ?? '';
          i++;
        } else s += src[i++];
      }
      i++;
      toks.push({ t: 'str', v: s });
    } else if (ch === '/' && reAllowed()) {
      let s = '';
      i++;
      while (i < src.length && src[i] !== '/') {
        if (src[i] === '\\' && src[i + 1] === '/') {
          s += '/';
          i += 2;
        } else s += src[i++];
      }
      i++;
      toks.push({ t: 're', v: s });
    } else if (/[A-Za-z_]/.test(ch)) {
      const m = src.slice(i).match(/^[A-Za-z_]\w*/)![0];
      toks.push({ t: 'name', v: m });
      i += m.length;
    } else {
      const op = ['&&', '||', '==', '!=', '>=', '<=', '!~', '++', '--', '+=', '-=', '*=', '/='].find((o) => src.startsWith(o, i)) ?? ch;
      toks.push({ t: 'op', v: op });
      i += op.length;
    }
  }
  return toks;
}

type Val = string | number;
type Expr = (rec: AwkRecord) => Val;
type Stmt = (rec: AwkRecord) => void | 'next';
interface AwkRecord {
  fields: string[];
  vars: Record<string, Val>;
  out: (s: string) => void;
}

const num = (v: Val) => (typeof v === 'number' ? v : parseFloat(v) || 0);
const str = (v: Val) => (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : String(+v.toPrecision(6))) : v);
const looksNum = (v: Val) => typeof v === 'number' || /^\s*[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?\s*$/i.test(v);

function printf(fmt: string, args: Val[]): string {
  let k = 0;
  return fmt.replace(/%(-?)(\d*)(?:\.(\d+))?([sdfix%c])/g, (_m, left: string, width: string, prec: string | undefined, conv: string) => {
    if (conv === '%') return '%';
    const a = args[k++] ?? '';
    let s =
      conv === 'd' || conv === 'i'
        ? String(Math.trunc(num(a)))
        : conv === 'f'
          ? num(a).toFixed(prec ? parseInt(prec, 10) : 6)
          : conv === 'x'
            ? Math.trunc(num(a)).toString(16)
            : conv === 'c'
              ? str(a).charAt(0)
              : prec
                ? str(a).slice(0, parseInt(prec, 10))
                : str(a);
    const w = parseInt(width || '0', 10);
    if (s.length < w) s = left ? s.padEnd(w) : s.padStart(w);
    return s;
  });
}

class AwkParser {
  i = 0;
  constructor(private toks: Tok[]) {}
  peek(v?: string) {
    const t = this.toks[this.i];
    return v === undefined ? t : t && (t.t === 'op' || t.t === 'name') && t.v === v ? t : undefined;
  }
  eat(v: string) {
    if (!this.peek(v)) throw new Error(`syntax error near ${this.toks[this.i]?.v ?? 'end of program'}`);
    this.i++;
  }
  skipSeps() {
    while (this.peek(';')) this.i++;
  }

  program() {
    const rules: Array<{ kind: 'begin' | 'end' | 'main'; cond?: Expr; body: Stmt[] }> = [];
    this.skipSeps();
    while (this.i < this.toks.length) {
      let kind: 'begin' | 'end' | 'main' = 'main';
      let cond: Expr | undefined;
      if (this.peek('BEGIN')) {
        this.i++;
        kind = 'begin';
      } else if (this.peek('END')) {
        this.i++;
        kind = 'end';
      } else if (!this.peek('{')) cond = this.expr();
      const body = this.peek('{') ? this.block() : [(r: AwkRecord) => r.out(r.fields[0]! + '\n')];
      rules.push({ kind, cond, body });
      this.skipSeps();
    }
    return rules;
  }

  block(): Stmt[] {
    this.eat('{');
    const stmts: Stmt[] = [];
    this.skipSeps();
    while (!this.peek('}')) {
      if (this.i >= this.toks.length) throw new Error('missing }');
      stmts.push(this.stmt());
      this.skipSeps();
    }
    this.eat('}');
    return stmts;
  }

  stmt(): Stmt {
    if (this.peek('{')) {
      const b = this.block();
      return (r) => {
        for (const s of b) if (s(r) === 'next') return 'next';
      };
    }
    if (this.peek('next')) {
      this.i++;
      return () => 'next';
    }
    if (this.peek('if')) {
      this.i++;
      this.eat('(');
      const c = this.expr();
      this.eat(')');
      this.skipSeps();
      const then = this.stmt();
      let otherwise: Stmt | undefined;
      const save = this.i;
      this.skipSeps();
      if (this.peek('else')) {
        this.i++;
        this.skipSeps();
        otherwise = this.stmt();
      } else this.i = save;
      return (r) => (truthy(c(r)) ? then(r) : otherwise?.(r));
    }
    if (this.peek('print') || this.peek('printf')) {
      const isF = this.toks[this.i++]!.v === 'printf';
      const args: Expr[] = [];
      const paren = this.peek('(') && this.closesAtStatementEnd();
      if (paren) this.i++;
      while (this.i < this.toks.length && !this.peek(';') && !this.peek('}') && !(paren && this.peek(')'))) {
        args.push(this.expr(true));
        if (this.peek(',')) this.i++;
        else break;
      }
      if (paren) this.eat(')');
      return (r) => {
        const vals = args.map((a) => a(r));
        if (isF) r.out(printf(str(vals[0] ?? ''), vals.slice(1)));
        else r.out((vals.length ? vals.map(str).join(str(r.vars.OFS ?? ' ')) : r.fields[0]!) + '\n');
      };
    }
    const e = this.expr();
    return (r) => void e(r);
  }

  /** print (a, b) vs print (a) b: only treat parens as an argument list if they close the statement. */
  closesAtStatementEnd() {
    let depth = 0;
    for (let j = this.i; j < this.toks.length; j++) {
      const v = this.toks[j]!;
      if (v.t !== 'op') continue;
      if (v.v === '(') depth++;
      else if (v.v === ')' && --depth === 0) {
        const nx = this.toks[j + 1];
        return !nx || (nx.t === 'op' && (nx.v === ';' || nx.v === '}'));
      }
    }
    return false;
  }

  expr(noGt = false): Expr {
    return this.assign(noGt);
  }
  assign(noGt: boolean): Expr {
    const start = this.i;
    const t = this.peek();
    if (t?.t === 'name' && this.toks[this.i + 1]?.t === 'op' && ['=', '+=', '-=', '*=', '/='].includes(this.toks[this.i + 1]!.v)) {
      const name = t.v;
      const op = this.toks[this.i + 1]!.v;
      this.i += 2;
      const rhs = this.assign(noGt);
      return (r) => {
        const cur = num(r.vars[name] ?? 0);
        const v = rhs(r);
        const res = op === '=' ? v : op === '+=' ? cur + num(v) : op === '-=' ? cur - num(v) : op === '*=' ? cur * num(v) : cur / (num(v) || 1);
        return (r.vars[name] = res);
      };
    }
    this.i = start;
    return this.or(noGt);
  }
  or(noGt: boolean): Expr {
    let l = this.and(noGt);
    while (this.peek('||')) {
      this.i++;
      const a = l;
      const b = this.and(noGt);
      l = (r) => (truthy(a(r)) || truthy(b(r)) ? 1 : 0);
    }
    return l;
  }
  and(noGt: boolean): Expr {
    let l = this.match(noGt);
    while (this.peek('&&')) {
      this.i++;
      const a = l;
      const b = this.match(noGt);
      l = (r) => (truthy(a(r)) && truthy(b(r)) ? 1 : 0);
    }
    return l;
  }
  match(noGt: boolean): Expr {
    let l = this.compare(noGt);
    while (this.peek('~') || this.peek('!~')) {
      const neg = this.toks[this.i++]!.v === '!~';
      const a = l;
      const t = this.peek();
      let re: (r: AwkRecord) => RegExp;
      if (t?.t === 're') {
        this.i++;
        const fixed = new RegExp(t.v);
        re = () => fixed;
      } else {
        const e = this.compare(noGt);
        re = (r) => new RegExp(str(e(r)));
      }
      l = (r) => (re(r).test(str(a(r))) !== neg ? 1 : 0);
    }
    return l;
  }
  compare(noGt: boolean): Expr {
    const l = this.concat();
    const t = this.peek();
    if (t?.t === 'op' && ['==', '!=', '<', '<=', '>=', ...(noGt ? [] : ['>'])].includes(t.v)) {
      this.i++;
      const r2 = this.concat();
      const op = t.v;
      return (r) => {
        const a = l(r);
        const b = r2(r);
        const numeric = looksNum(a) && looksNum(b);
        const x: Val = numeric ? num(a) : str(a);
        const y: Val = numeric ? num(b) : str(b);
        const res = op === '==' ? x === y : op === '!=' ? x !== y : op === '<' ? x < y : op === '<=' ? x <= y : op === '>' ? x > y : x >= y;
        return res ? 1 : 0;
      };
    }
    return l;
  }
  concat(): Expr {
    const parts = [this.additive()];
    for (;;) {
      const t = this.peek();
      if (!t) break;
      const starts = t.t === 'num' || t.t === 'str' || (t.t === 'name' && !['in', 'else'].includes(t.v)) || (t.t === 'op' && (t.v === '$' || t.v === '(' || t.v === '!'));
      if (!starts) break;
      parts.push(this.additive());
    }
    return parts.length === 1 ? parts[0]! : (r) => parts.map((p) => str(p(r))).join('');
  }
  additive(): Expr {
    let l = this.term();
    while (this.peek('+') || this.peek('-')) {
      const op = this.toks[this.i++]!.v;
      const a = l;
      const b = this.term();
      l = (r) => (op === '+' ? num(a(r)) + num(b(r)) : num(a(r)) - num(b(r)));
    }
    return l;
  }
  term(): Expr {
    let l = this.unary();
    while (this.peek('*') || this.peek('/') || this.peek('%')) {
      const op = this.toks[this.i++]!.v;
      const a = l;
      const b = this.unary();
      l = (r) => (op === '*' ? num(a(r)) * num(b(r)) : op === '/' ? num(a(r)) / (num(b(r)) || NaN) : num(a(r)) % num(b(r)));
    }
    return l;
  }
  unary(): Expr {
    if (this.peek('!')) {
      this.i++;
      const e = this.unary();
      return (r) => (truthy(e(r)) ? 0 : 1);
    }
    if (this.peek('-')) {
      this.i++;
      const e = this.unary();
      return (r) => -num(e(r));
    }
    return this.postfix();
  }
  postfix(): Expr {
    const t = this.peek();
    if (t?.t === 'name' && (this.toks[this.i + 1]?.v === '++' || this.toks[this.i + 1]?.v === '--') && this.toks[this.i + 1]?.t === 'op') {
      this.i += 2;
      const inc = this.toks[this.i - 1]!.v === '++' ? 1 : -1;
      return (r) => {
        const old = num(r.vars[t.v] ?? 0);
        r.vars[t.v] = old + inc;
        return old;
      };
    }
    return this.primary();
  }
  primary(): Expr {
    const t = this.toks[this.i++];
    if (!t) throw new Error('unexpected end of program');
    if (t.t === 'num') {
      const v = parseFloat(t.v);
      return () => v;
    }
    if (t.t === 'str') return () => t.v;
    if (t.t === 're') {
      const re = new RegExp(t.v);
      return (r) => (re.test(r.fields[0]!) ? 1 : 0);
    }
    if (t.t === 'op' && t.v === '$') {
      const e = this.primary();
      return (r) => r.fields[Math.trunc(num(e(r)))] ?? '';
    }
    if (t.t === 'op' && t.v === '(') {
      const e = this.expr();
      this.eat(')');
      return e;
    }
    if (t.t === 'name') {
      const fn = BUILTINS[t.v];
      if (fn && this.peek('(')) {
        this.i++;
        const args: Expr[] = [];
        while (!this.peek(')')) {
          args.push(this.expr());
          if (this.peek(',')) this.i++;
          else break;
        }
        this.eat(')');
        return (r) => fn(args.map((a) => a(r)), r);
      }
      if (fn && t.v === 'length') return (r) => r.fields[0]!.length;
      if (t.v === 'NF') return (r) => r.fields.length - 1;
      return (r) => r.vars[t.v] ?? '';
    }
    throw new Error(`syntax error near ${t.v}`);
  }
}

const truthy = (v: Val) => (typeof v === 'number' ? v !== 0 : v !== '');

const BUILTINS: Record<string, (a: Val[], r: AwkRecord) => Val> = {
  length: (a, r) => str(a[0] ?? r.fields[0]!).length,
  toupper: (a) => str(a[0] ?? '').toUpperCase(),
  tolower: (a) => str(a[0] ?? '').toLowerCase(),
  substr: (a) => str(a[0] ?? '').substr(Math.max(0, num(a[1] ?? 1) - 1), a[2] === undefined ? undefined : num(a[2])),
  index: (a) => str(a[0] ?? '').indexOf(str(a[1] ?? '')) + 1,
  int: (a) => Math.trunc(num(a[0] ?? 0)),
};

function splitFields(line: string, fs: string): string[] {
  const parts = fs === ' ' ? line.trim().split(/\s+/).filter(Boolean) : line.split(fs.length === 1 ? fs : new RegExp(fs));
  return [line, ...parts];
}

const awk: CommandDef = {
  name: 'awk',
  summary: 'pattern scanning and text processing language (subset)',
  usage: "awk [-F SEP] [-v VAR=VAL] 'PROGRAM' [FILE]...",
  run(ctx: CommandContext) {
    const argv = [...ctx.argv];
    const vars: Record<string, Val> = { OFS: ' ', NR: 0 };
    let fs = ' ';
    let program: string | undefined;
    const files: string[] = [];
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i]!;
      if (a.startsWith('-F')) fs = (a.slice(2) || argv[++i] || ' ').replace(/^\\t$/, '\t');
      else if (a === '-v') {
        const [k, ...v] = (argv[++i] ?? '').split('=');
        if (k) vars[k] = v.join('=');
      } else if (program === undefined) program = a;
      else files.push(a);
    }
    if (program === undefined) {
      ctx.err("usage: awk [-F fs] [-v var=value] 'prog' [file ...]\n");
      return 2;
    }
    let rules;
    try {
      rules = new AwkParser(awkTokens(program)).program();
    } catch (e) {
      ctx.err(`awk: ${(e as Error).message}\n`);
      return 2;
    }
    let output = '';
    const out = (s: string) => {
      output += s;
    };
    const run = (kind: 'begin' | 'end' | 'main', fields: string[]) => {
      const rec: AwkRecord = { fields, vars, out };
      for (const rule of rules.filter((x) => x.kind === kind)) {
        if (rule.cond && !truthy(rule.cond(rec))) continue;
        for (const s of rule.body) if (s(rec) === 'next') return;
      }
    };
    run('begin', ['']);
    let input = '';
    const status = eachInput(ctx, files, (t) => (input += t.endsWith('\n') || !t ? t : t + '\n'));
    let last = [''];
    for (const line of lines(input)) {
      vars.NR = num(vars.NR ?? 0) + 1;
      last = splitFields(line, String(vars.FS ?? fs));
      run('main', last);
      if (output.length > 2_000_000) break;
    }
    run('end', last);
    ctx.out(output);
    return status ? 2 : 0;
  },
};

export const toolCommands: CommandDef[] = [seq, tee, xargs, sed, diff, awk];
