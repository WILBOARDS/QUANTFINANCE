/* Dipakai HANYA oleh qa/e2e.mjs: server memanggil sumber palsu (format asli) karena sandbox tanpa internet. */
import { fakeUpstream, FakeAisSocket } from './fake-upstream.mjs';
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const href = typeof input === 'string' ? input : input.url;
  const r = fakeUpstream(href);
  if (!r) return realFetch(input, init);
  await new Promise(res => setTimeout(res, 15));
  return new Response(r.body, { status: r.status, headers: { 'Content-Type': r.type } });
};
globalThis.WebSocket = FakeAisSocket;
