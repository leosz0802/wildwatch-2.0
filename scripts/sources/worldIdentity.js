// Only opaque account keys leave the server. WeChat names stay in open data.
function friendMatchKey(openid) {
  if (!openid) return '';
  const input = 'wild-friend-v1:' + String(openid);
  const words = [];
  for (let i = 0; i < input.length; i++) words[i >> 2] = (words[i >> 2] || 0) | (input.charCodeAt(i) & 255) << (24 - (i % 4) * 8);
  words[input.length >> 2] = (words[input.length >> 2] || 0) | 0x80 << (24 - (input.length % 4) * 8);
  const blocks = Math.ceil((input.length + 9) / 64);
  words[blocks * 16 - 1] = input.length * 8;
  const h = [], k = [];
  for (let p = 2; k.length < 64; p++) {
    let prime = true;
    for (let d = 2; d * d <= p; d++) if (p % d === 0) { prime = false; break; }
    if (!prime) continue;
    if (h.length < 8) h.push((Math.sqrt(p) % 1 * 0x100000000) | 0);
    k.push((Math.pow(p, 1 / 3) % 1 * 0x100000000) | 0);
  }
  const r = (v, n) => (v >>> n) | (v << (32 - n));
  for (let offset = 0; offset < blocks * 16; offset += 16) {
    const w = [];
    let [a,b,c,d,e,f,g,j] = h;
    for (let i = 0; i < 64; i++) {
      if (i < 16) w[i] = words[offset + i] | 0;
      else {
        const x = w[i - 15], y = w[i - 2];
        w[i] = (w[i - 16] + (r(x,7) ^ r(x,18) ^ (x >>> 3)) + w[i - 7] + (r(y,17) ^ r(y,19) ^ (y >>> 10))) | 0;
      }
      const t = (j + (r(e,6) ^ r(e,11) ^ r(e,25)) + ((e & f) ^ (~e & g)) + k[i] + w[i]) | 0;
      const u = ((r(a,2) ^ r(a,13) ^ r(a,22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      j=g; g=f; f=e; e=(d+t)|0; d=c; c=b; b=a; a=(t+u)|0;
    }
    [a,b,c,d,e,f,g,j].forEach((v,i) => { h[i] = (h[i] + v) | 0; });
  }
  return h.map(v => ('00000000' + (v >>> 0).toString(16)).slice(-8)).join('');
}

function normalizeWorldId(value) {
  return String(value || '').replace(/^cloud_/, '').slice(0, 20);
}

function matchWorldFriend(world, friends) {
  const list = (friends || []).filter((friend) => friend && friend.fromWorld !== true);
  const key = String((world && world.friendMatchKey) || '');
  if (/^[a-f0-9]{64}$/.test(key)) {
    const byKey = list.filter((friend) => friend.friendMatchKey === key);
    if (byKey.length) return byKey[0];
  }
  const id = normalizeWorldId(world && (world.publicId || world.worldPlayerId || world.id));
  const matches = list.filter((friend) => id && normalizeWorldId(friend.worldPlayerId) === id);
  return matches.length === 1 ? matches[0] : null;
}
module.exports = { friendMatchKey, matchWorldFriend };
