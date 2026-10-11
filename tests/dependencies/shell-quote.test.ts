import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

type ShellQuote = { quote(tokens: (string | { comment: string })[]): string; parse(command: string): unknown[] };
const rootRequire = createRequire(import.meta.url);
const mobileRequire = createRequire(new URL('../../apps/mobile/package.json', import.meta.url));
const devtoolsRequire = createRequire(createRequire(mobileRequire.resolve('react-native')).resolve('react-devtools-core'));

function checkCommentBoundary(quote: ShellQuote) {
  // GHSA-pqg4-j6r4-53mv: never pass a generated command to a shell in this regression.
  for (const terminator of ['\n', '\r', '\u2028', '\u2029']) {
    assert.throws(() => quote.quote(['echo', 'ok', { comment: 'TEST ONLY' }, `a${terminator}id;#`]), TypeError);
  }
  assert.deepEqual(quote.parse(quote.quote(['echo', 'literal space', 'semicolon;data'])), ['echo', 'literal space', 'semicolon;data']);
}

test('concurrently resolves a shell serializer that rejects line breaks after a comment token', () => {
  checkCommentBoundary(createRequire(rootRequire.resolve('concurrently'))('shell-quote') as ShellQuote);
});
test('React Native devtools resolves a shell serializer that rejects line breaks after a comment token', () => {
  checkCommentBoundary(devtoolsRequire('shell-quote') as ShellQuote);
});
