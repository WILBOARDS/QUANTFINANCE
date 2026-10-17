/* Pola pemindai rahasia harus menangkap kunci asli dan tidak memicu pada placeholder. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PATTERNS } from '../scripts/secret-patterns.mjs';

const hit = s => PATTERNS.some(([, re]) => re.test(s));
test('pemindai menangkap bentuk kunci yang umum', () => {
  assert.ok(hit('FINNHUB_API_KEY=abcd1234efgh5678ijkl'));
  assert.ok(hit('const u = "https://x.test/q?token=ABCDEFGHIJKLMNOPQRSTUV"'));
  assert.ok(hit('AKIA' + 'ABCDEFGHIJKLMNOP'));
  assert.ok(hit('-----BEGIN RSA PRIVATE KEY-----'));
});
test('placeholder dan kode server tidak dianggap bocor', () => {
  assert.ok(!hit('FINNHUB_API_KEY='));
  assert.ok(!hit('const url = `https://finnhub.io/api/v1/quote?symbol=${s}&token=${KEY.finnhub}`;'));
  assert.ok(!hit('sourceUrl: "https://finnhub.io/api/v1/quote?symbol=AAPL&token=***"'));
  assert.ok(!hit("env: { FINNHUB_API_KEY: 'uji' }"));
});
