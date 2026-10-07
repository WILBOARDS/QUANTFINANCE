/* Pengumpul posisi kapal (AIS) dari dua sumber nyata:
   1. AISStream.io  : global, WebSocket, butuh kunci gratis. Browser DILARANG konek langsung
                      (kebijakan AISStream), jadi server yang konek dan meneruskan ringkasannya.
   2. Digitraffic   : Fintraffic Finlandia, tanpa kunci, lisensi CC BY 4.0, cakupan Laut Baltik.
   Tidak ada posisi yang dikarang: kapal hanya muncul di posisi yang benar-benar dilaporkan.
   Jejak (trail) = deretan posisi asli yang pernah dilaporkan kapal itu. */
import { parseAisStream, parseDigitrafficLocations, parseDigitrafficVessels, shipClass } from '../../shared/parsers.mjs';
import { upstream } from './core.mjs';

/* kotak pantau [ [lat1, lon1], [lat2, lon2] ] di sekitar selat/kanal penting */
export const AIS_BOXES = {
  hormuz: { name: 'Selat Hormuz dan Teluk Persia', box: [[22.0, 47.5], [30.6, 60.5]] },
  babelmandeb: { name: 'Bab el-Mandeb dan Laut Merah selatan', box: [[11.0, 41.0], [17.0, 45.8]] },
  suez: { name: 'Terusan Suez', box: [[27.4, 32.0], [31.7, 34.2]] },
  malacca: { name: 'Selat Malaka dan Singapura', box: [[0.6, 95.0], [6.8, 104.6]] },
  sunda: { name: 'Selat Sunda', box: [[-6.9, 104.6], [-5.3, 106.4]] },
  lombok: { name: 'Selat Lombok', box: [[-9.1, 115.3], [-8.0, 116.1]] },
  makassar: { name: 'Selat Makassar', box: [[-4.5, 116.3], [1.5, 119.8]] },
  panama: { name: 'Terusan Panama', box: [[7.5, -80.8], [10.0, -78.8]] },
  bosporus: { name: 'Bosporus dan Laut Hitam', box: [[40.6, 27.4], [46.8, 41.9]] },
  dover: { name: 'Selat Dover / Kanal Inggris', box: [[49.6, -2.0], [51.7, 2.6]] },
  gibraltar: { name: 'Selat Gibraltar', box: [[35.6, -6.6], [36.5, -4.6]] },
  taiwan: { name: 'Selat Taiwan', box: [[22.0, 117.5], [26.2, 121.2]] },
  goodhope: { name: 'Tanjung Harapan', box: [[-36.5, 16.0], [-33.0, 22.0]] },
};

export class AisHub {
  constructor({ registry, aisKey, digitrafficUser, digitrafficEnabled, log = console }) {
    this.reg = registry; this.key = aisKey; this.dtUser = digitrafficUser; this.dtOn = digitrafficEnabled; this.log = log;
    this.v = new Map();            // mmsi -> kapal
    this.msgs = 0; this.ws = null; this.wsState = 'off'; this.retry = 0; this.lastMsg = null;
    this.dtLastPoll = null; this.dtFrom = Date.now() - 15 * 60e3; this.dtMetaAt = 0; this.dtMetaTry = 0; this.dtBusy = false; this.dtMetaErr = null;
    this.keyRejected = false;
  }
  start() {
    if (this.key) this.connect(); else this.wsState = 'no-key';
    if (this.dtOn) { this.pollDigitraffic(); setInterval(() => this.pollDigitraffic(), 60e3).unref(); }
    setInterval(() => this.prune(), 60e3).unref();
    /* pengawas: WebSocket yang "terbuka" tapi diam lebih dari 2 menit dianggap putus */
    setInterval(() => {
      if (this.wsState === 'open' && this.ws && Date.now() - (this.lastMsgT || this.openedAt || 0) > 120e3) {
        this.reg.fail('aisstream', new Error('Tidak ada pesan AIS selama 2 menit; menyambung ulang'));
        try { this.ws.close(); } catch { /* sudah tertutup */ }
      }
    }, 30e3).unref();
  }
  /* kapal dianggap live bila posisinya <= 10 menit; lebih tua = tertunda/basi */
  freshness() {
    const now = Date.now(), recent = this.lastMsgT && now - this.lastMsgT < 120e3;
    const dtRecent = this.dtLastPoll && now - Date.parse(this.dtLastPoll) < 180e3;
    return { anyFeedLive: !!(recent || dtRecent) };
  }

  upsert(m, src) {
    if (!m || !m.mmsi) return;
    let s = this.v.get(m.mmsi);
    if (!s) { s = { mmsi: m.mmsi, name: '', shipType: null, cls: 'unknown', dest: '', trail: [], src }; this.v.set(m.mmsi, s); }
    if (m.kind === 'static') {
      if (m.name) s.name = m.name;
      if (m.shipType !== null && m.shipType !== undefined) s.shipType = m.shipType;
      if (m.dest) s.dest = m.dest;
      if (m.callSign) s.callSign = m.callSign;
      if (m.imo) s.imo = m.imo;
      if (m.draught) s.draught = m.draught;
      s.cls = shipClass(s.shipType, s.name);
      return;
    }
    const ts = m.ts || Date.now();
    if (s.ts && ts < s.ts) return;                     // laporan lama datang belakangan
    if (m.name && !s.name) s.name = m.name;
    const last = s.trail[s.trail.length - 1];
    const moved = !last || Math.abs(last[0] - m.lon) + Math.abs(last[1] - m.lat) > 0.0015 || ts - last[2] > 5 * 60e3;
    if (moved) { s.trail.push([round5(m.lon), round5(m.lat), ts]); if (s.trail.length > 40) s.trail.shift(); }
    Object.assign(s, { lat: m.lat, lon: m.lon, sog: m.sog, cog: m.cog, heading: m.heading, navStatus: m.navStatus, ts, src });
  }
  prune() {
    const cut = Date.now() - 6 * 3600e3;                // posisi lebih tua dari 6 jam dibuang
    for (const [k, s] of this.v) if (!s.ts || s.ts < cut) this.v.delete(k);
  }

  /* ---------- AISStream WebSocket ---------- */
  connect() {
    if (typeof WebSocket === 'undefined') { this.wsState = 'no-websocket (butuh Node 22+)'; return; }
    this.wsState = 'connecting';
    const ws = new WebSocket('wss://stream.aisstream.io/v0/stream');
    ws.binaryType = 'arraybuffer';                      // AISStream mengirim frame biner berisi JSON
    this.ws = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({
        APIKey: this.key,
        BoundingBoxes: Object.values(AIS_BOXES).map(b => b.box),
        FilterMessageTypes: ['PositionReport', 'StandardClassBPositionReport', 'ShipStaticData'],
      }));
      /* jabat tangan selalu berhasil walau kuncinya salah; hitungan coba-ulang baru direset
         setelah pesan posisi pertama yang sah (lihat onmessage) */
      this.wsState = 'open'; this.openedAt = Date.now();
    };
    ws.onmessage = ev => {
      try {
        const txt = typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString('utf8');
        const j = JSON.parse(txt);
        if (j.error) {
          if (/api ?key/i.test(j.error)) this.keyRejected = true;
          this.reg.fail('aisstream', new Error(j.error)); return;
        }
        const m = parseAisStream(j);
        if (m) {
          this.upsert(m, 'aisstream'); this.msgs++; this.lastMsgT = Date.now(); this.lastMsg = new Date(this.lastMsgT).toISOString();
          if (this.retry) { this.retry = 0; }
          if (this.msgs % 500 === 1) this.reg.ok('aisstream', 0);
        }
      } catch { /* pesan rusak diabaikan */ }
    };
    ws.onerror = e => { this.reg.fail('aisstream', new Error(e.message || 'WebSocket error')); };
    ws.onclose = ev => {
      this.wsState = this.keyRejected ? 'key-rejected' : 'closed';
      if (ev.code === 1008 || /api ?key/i.test(ev.reason || '')) { this.keyRejected = true; this.wsState = 'key-rejected'; this.reg.fail('aisstream', new Error('Kunci ditolak: ' + (ev.reason || ev.code))); }
      /* kunci ditolak: coba lagi 30 menit kemudian (bukan tiap 5 detik); selain itu backoff eksponensial */
      const wait = this.keyRejected ? 30 * 60e3 : Math.min(300e3, 5e3 * 2 ** this.retry++);
      if (this.keyRejected) this.keyRejected = false;
      setTimeout(() => this.connect(), wait).unref();
    };
  }

  /* ---------- Digitraffic REST (tanpa kunci) ---------- */
  async pollDigitraffic() {
    if (this.dtBusy) return;                           // jangan tumpang tindih bila permintaan sebelumnya lambat
    this.dtBusy = true;
    const headers = { 'Digitraffic-User': this.dtUser, 'Accept-Encoding': 'gzip' };
    const t0 = Date.now();
    try {
      const from = this.dtFrom - 60e3;
      const loc = await upstream(`https://meri.digitraffic.fi/api/ais/v1/locations?from=${from}`, { headers, timeout: 30000 });
      for (const m of parseDigitrafficLocations(loc)) this.upsert(m, 'digitraffic');
      this.dtFrom = t0;
      this.dtLastPoll = new Date().toISOString();
      this.reg.ok('digitraffic', Date.now() - t0);
    } catch (e) {
      this.reg.fail('digitraffic', e, Date.now() - t0);
    }
    /* metadata (nama, tipe, tujuan) terpisah: kegagalannya tidak menandai posisi gagal, dan
       dicoba ulang paling cepat 10 menit kemudian */
    if (Date.now() - this.dtMetaAt > 15 * 60e3 && Date.now() - this.dtMetaTry > 10 * 60e3) {
      this.dtMetaTry = Date.now();
      try {
        const metaFrom = this.dtMetaAt ? this.dtMetaAt - 60e3 : Date.now() - 24 * 3600e3;
        const meta = await upstream(`https://meri.digitraffic.fi/api/ais/v1/vessels?from=${metaFrom}`, { headers, timeout: 30000 });
        for (const m of parseDigitrafficVessels(meta)) if (this.v.has(m.mmsi)) this.upsert(m, 'digitraffic');
        this.dtMetaAt = Date.now(); this.dtMetaErr = null;
      } catch (e) { this.dtMetaErr = String(e.message || e).slice(0, 160); }
    }
    this.dtBusy = false;
  }

  /* ringkasan untuk browser: array ringkas supaya hemat ukuran */
  snapshot({ box, limit = 8000, cls } = {}) {
    const out = [];
    for (const s of this.v.values()) {
      if (s.lat === undefined) continue;
      if (box && !(s.lat >= box[0] && s.lat <= box[2] && s.lon >= box[1] && s.lon <= box[3])) continue;
      if (cls && s.cls !== cls) continue;
      out.push([s.mmsi, s.name || '', s.cls, s.lat, s.lon, s.sog ?? null, s.cog ?? null, s.heading ?? null, s.ts, s.dest || '', s.src, s.trail.length > 1 ? s.trail.slice(-12) : null, s.shipType ?? null, s.imo || null]);
      if (out.length >= limit) break;
    }
    return {
      fields: ['mmsi', 'name', 'cls', 'lat', 'lon', 'sog', 'cog', 'heading', 'ts', 'dest', 'src', 'trail', 'shipType', 'imo'],
      vessels: out,
      total: this.v.size,
      sources: [
        { id: 'aisstream', state: this.wsState, messages: this.msgs, lastMessage: this.lastMsg, configured: !!this.key, coverage: 'Global, hanya kotak pantau di sekitar selat penting; bergantung stasiun penerima sukarela' },
        { id: 'digitraffic', state: this.dtOn ? (this.dtLastPoll ? 'polling' : 'starting') : 'off', lastPoll: this.dtLastPoll, configured: this.dtOn, coverage: 'Laut Baltik (Finlandia dan sekitarnya)', metadataError: this.dtMetaErr },
      ],
      boxes: AIS_BOXES,
      generatedAt: new Date().toISOString(),
    };
  }
  track(mmsi) { const s = this.v.get(mmsi); return s ? { ...s } : null; }
}
const round5 = x => Math.round(x * 1e5) / 1e5;
