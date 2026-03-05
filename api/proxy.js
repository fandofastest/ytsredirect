const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function getUpstreamBase() {
  return process.env.YTS_API_BASE || 'https://movies-api.accel.li/api/v2/';
}

module.exports = async (req, res) => {
  try {
    const upstreamBase = getUpstreamBase();
    const path = typeof req.query.path === 'string' ? req.query.path : '';
    const upstreamUrl = new URL(path, upstreamBase);

    for (const [key, value] of Object.entries(req.query || {})) {
      if (key === 'path') continue;
      if (Array.isArray(value)) {
        for (const v of value) upstreamUrl.searchParams.append(key, String(v));
      } else if (value !== undefined) {
        upstreamUrl.searchParams.set(key, String(value));
      }
    }

    const headers = {};
    for (const [key, value] of Object.entries(req.headers || {})) {
      const k = key.toLowerCase();
      if (HOP_BY_HOP_HEADERS.has(k)) continue;
      if (k === 'host') continue;
      if (k === 'content-length') continue;
      headers[key] = value;
    }

    headers['accept-encoding'] = 'identity';

    let body;
    const method = (req.method || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      body = await new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
      });
    }

    const upstreamResp = await fetch(upstreamUrl.toString(), {
      method,
      headers,
      body,
      redirect: 'manual',
    });

    res.statusCode = upstreamResp.status;

    upstreamResp.headers.forEach((value, key) => {
      const k = key.toLowerCase();
      if (HOP_BY_HOP_HEADERS.has(k)) return;
      if (k === 'content-length') return;
      res.setHeader(key, value);
    });

    const buf = Buffer.from(await upstreamResp.arrayBuffer());
    res.end(buf);
  } catch (err) {
    res.statusCode = 502;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        status: 'error',
        status_message: 'Upstream fetch failed',
        error: String(err && err.message ? err.message : err),
      })
    );
  }
};
