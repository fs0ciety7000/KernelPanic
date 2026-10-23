import { describe, expect, it } from 'vitest';
import { parse, expandWord, tokenize } from '../src/shell/parser';

const ctx = { env: { HOME: '/home/a', X: 'hello world' }, home: '/home/a', glob: () => [] };
const words = (line: string) => parse(line)[0]!.pipeline.commands[0]!.words.flatMap((w) => expandWord(w, ctx));

describe('parser', () => {
  it('splits words and respects quotes', () => {
    expect(words(`echo "a b" 'c d' e\\ f`)).toEqual(['echo', 'a b', 'c d', 'e f']);
  });
  it('expands variables except in single quotes', () => {
    expect(words(`echo $X '$X' "$X!" \${X}`)).toEqual(['echo', 'hello', 'world', '$X', 'hello world!', 'hello', 'world']);
  });
  it('expands ~ at word start only', () => {
    expect(words('ls ~/docs a~b')).toEqual(['ls', '/home/a/docs', 'a~b']);
  });
  it('parses pipelines, lists and redirections', () => {
    const list = parse('cat a | grep x > out.txt 2>/dev/null && echo ok; echo done');
    expect(list).toHaveLength(3);
    expect(list[0]!.pipeline.commands).toHaveLength(2);
    expect(list[0]!.next).toBe('&&');
    expect(list[0]!.pipeline.commands[1]!.redirects.map((r) => r.op)).toEqual(['>', '2>']);
  });
  it('treats 2> as operator only at word start', () => {
    const t = tokenize('echo a2>x');
    expect(t.map((x) => (x.kind === 'op' ? x.op : 'W'))).toEqual(['W', 'W', '>', 'W']);
  });
  it('reports unterminated quotes and dangling operators', () => {
    expect(() => parse('echo "oops')).toThrow();
    expect(() => parse('ls |')).toThrow();
    expect(() => parse('ls &&')).toThrow();
  });
  it('ignores comments', () => {
    expect(words('echo hi # nope')).toEqual(['echo', 'hi']);
  });
});
