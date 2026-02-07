const http = require('http');

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://127.0.0.1:8055';
const ADMIN_EMAIL = process.env.DIRECTUS_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.DIRECTUS_ADMIN_PASSWORD;
const ADMIN_TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET;
const ALLOWED_ORIGIN = process.env.ADMIN_TOKEN_ALLOWED_ORIGIN || '*';
const PORT = Number(process.env.ADMIN_TOKEN_PORT || 3001);

let cachedToken = null;
let cachedExp = 0;
let inflight = null;

const jsonResponse = (res, status, body) => {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Secret, X-Admin-Token-Request',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  });
  res.end(JSON.stringify(body));
};

const decodeExp = (token) => {
  try {
    const payload = token.split('.')[1];
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const decoded = Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const exp = JSON.parse(decoded)?.exp;
    return typeof exp === 'number' ? exp : 0;
  } catch {
    return 0;
  }
};

const fetchAdminToken = async () => {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedExp > now + 30) {
    return cachedToken;
  }

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error('Missing DIRECTUS_ADMIN_EMAIL or DIRECTUS_ADMIN_PASSWORD');
  }

  if (!inflight) {
    inflight = fetch(`${DIRECTUS_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
    })
      .then(async (resp) => {
        const data = await resp.json();
        if (!resp.ok) {
          throw new Error(`Directus login failed: ${resp.status} ${JSON.stringify(data)}`);
        }
        const token = data?.data?.access_token;
        if (!token) {
          throw new Error('Directus login did not return access_token');
        }
        cachedToken = token;
        cachedExp = decodeExp(token);
        return token;
      })
      .finally(() => {
        inflight = null;
      });
  }

  return inflight;
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    return jsonResponse(res, 204, {});
  }

  if (req.url !== '/admin-token') {
    return jsonResponse(res, 404, { error: 'Not found' });
  }

  if (ADMIN_TOKEN_SECRET) {
    const secret = req.headers['x-admin-secret'];
    if (!secret || secret !== ADMIN_TOKEN_SECRET) {
      return jsonResponse(res, 401, { error: 'Unauthorized' });
    }
  }

  try {
    const token = await fetchAdminToken();
    return jsonResponse(res, 200, { access_token: token, expires: cachedExp });
  } catch (err) {
    return jsonResponse(res, 500, { error: String(err?.message || err) });
  }
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Admin token proxy listening on http://127.0.0.1:${PORT}/admin-token`);
});
