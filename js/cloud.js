// Publishable client key. Safe in the browser. Never put the secret key here.
const URL = 'https://zafdbndpldvpojozwekd.supabase.co';
const KEY = 'sb_publishable_4URW-23yx1sVUN92cFsWog_VGjiX5FI';
const STORE = 'kiln-session';

export class CloudError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code || '';
  }
}

let session = null;

export function peekUser() {
  return session?.user?.id ? session.user : null;
}

function readStore() {
  try { return JSON.parse(localStorage.getItem(STORE) || 'null'); } catch { return null; }
}

function writeStore(next) {
  session = next;
  if (next) localStorage.setItem(STORE, JSON.stringify(next));
  else localStorage.removeItem(STORE);
}

function messageFrom(data, status) {
  const code = data?.code || data?.error_code || '';
  if (code === 'PGRST205' || /schema cache/i.test(data?.message || '')) {
    return 'The pots table is not in this project yet. Open the SQL editor and run supabase/pots.sql.';
  }
  if (code === 'over_email_send_rate_limit' || /rate limit/i.test(data?.msg || data?.message || '')) {
    return 'Too many sign-in emails. Wait about an hour, or open the link already in your inbox.';
  }
  if (/redirect/i.test(data?.msg || data?.message || data?.error_description || '')) {
    return 'This page is not on the sign-in allow list. In Authentication → URL configuration, add this site and set it as the Site URL.';
  }
  return data?.msg || data?.message || data?.error_description || `Request failed (${status}).`;
}

async function api(path, { method = 'GET', body, token, prefer } = {}) {
  const headers = {
    apikey: KEY,
    Authorization: `Bearer ${token || KEY}`,
    Accept: 'application/json',
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(URL + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = { message: text }; } }
  if (!res.ok) throw new CloudError(messageFrom(data, res.status), data?.code || data?.error_code || String(res.status));
  return data;
}

function decodeUser(jwt) {
  try {
    const part = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const p = JSON.parse(atob(part));
    return { id: p.sub || '', email: p.email || '' };
  } catch {
    return { id: '', email: '' };
  }
}

function pack(data, fallbackUser) {
  const user = data.user?.id ? { id: data.user.id, email: data.user.email || '' } : (fallbackUser || decodeUser(data.access_token));
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at || Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
    user,
  };
}

async function refresh(current) {
  const data = await api('/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    body: { refresh_token: current.refresh_token },
  });
  const next = pack(data, current.user);
  writeStore(next);
  return next;
}

function stripAuth(search) {
  const q = new URLSearchParams(search);
  for (const k of ['access_token', 'refresh_token', 'expires_in', 'expires_at', 'token_type', 'type', 'error', 'error_code', 'error_description']) q.delete(k);
  const s = q.toString();
  return s ? `?${s}` : '';
}

function takeUrlSession() {
  const hash = new URLSearchParams((location.hash || '').replace(/^#/, ''));
  const search = new URLSearchParams(location.search);
  const err = hash.get('error_description') || search.get('error_description');
  if (err && (hash.get('error') || search.get('error'))) {
    history.replaceState(null, '', location.pathname + stripAuth(location.search));
    throw new CloudError(decodeURIComponent(err.replace(/\+/g, ' ')));
  }
  const access = hash.get('access_token') || search.get('access_token');
  const refreshTok = hash.get('refresh_token') || search.get('refresh_token');
  if (!access || !refreshTok) return null;
  const next = pack({
    access_token: access,
    refresh_token: refreshTok,
    expires_in: +(hash.get('expires_in') || search.get('expires_in') || 3600),
  });
  history.replaceState(null, '', location.pathname + stripAuth(location.search));
  return next;
}

export async function restoreSession() {
  const fromUrl = takeUrlSession();
  if (fromUrl) {
    writeStore(fromUrl);
    return fromUrl.user;
  }
  const stored = readStore();
  if (!stored?.access_token || !stored.refresh_token) return null;
  session = stored;
  if ((stored.expires_at || 0) * 1000 < Date.now() + 60000) {
    try { return (await refresh(stored)).user; } catch { writeStore(null); return null; }
  }
  return stored.user;
}

const SOCIAL_NAMES = { google: 'Google', github: 'GitHub', apple: 'Apple', discord: 'Discord', facebook: 'Facebook', twitter: 'X', azure: 'Microsoft', gitlab: 'GitLab', linkedin_oidc: 'LinkedIn', slack_oidc: 'Slack' };

export function socialLabel(id) {
  return SOCIAL_NAMES[id] || id.charAt(0).toUpperCase() + id.slice(1);
}

export async function enabledSocial() {
  const data = await api('/auth/v1/settings');
  const ext = data?.external || {};
  return Object.keys(ext).filter((k) => ext[k] && k !== 'email' && k !== 'phone' && k !== 'anonymous_users');
}

export function socialSignIn(provider) {
  const redirect = location.origin + location.pathname + location.search;
  const q = new URLSearchParams({ provider, redirect_to: redirect, apikey: KEY });
  location.assign(`${URL}/auth/v1/authorize?${q}`);
}

export async function sendLink(email) {
  const redirect = location.origin + location.pathname + location.search;
  await api(`/auth/v1/otp?redirect_to=${encodeURIComponent(redirect)}`, {
    method: 'POST',
    body: { email, create_user: true },
  });
}

export async function signOut() {
  const token = session?.access_token;
  writeStore(null);
  if (!token) return;
  try { await api('/auth/v1/logout', { method: 'POST', token, body: {} }); } catch { /* local sign-out still stands */ }
}

async function authed(path, opts) {
  if (!session?.access_token) throw new CloudError('Sign in first.');
  if ((session.expires_at || 0) * 1000 < Date.now() + 60000) await refresh(session);
  try {
    return await api(path, { ...opts, token: session.access_token });
  } catch (err) {
    if (err.code !== '401') throw err;
    await refresh(session);
    return api(path, { ...opts, token: session.access_token });
  }
}

function newShareId() {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  let raw = '';
  for (const b of bytes) raw += String.fromCharCode(b);
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function one(rows, empty) {
  if (Array.isArray(rows) && rows[0]) return rows[0];
  throw new CloudError(empty);
}

export async function saveRecipe({ id, title, recipe }) {
  const user = peekUser();
  if (!user) throw new CloudError('Sign in first.');
  if (id) {
    return one(await authed(`/rest/v1/pots?id=eq.${id}`, {
      method: 'PATCH',
      prefer: 'return=representation',
      body: { title, recipe, updated_at: new Date().toISOString() },
    }), 'That pot is not in your record.');
  }
  return one(await authed('/rest/v1/pots', {
    method: 'POST',
    prefer: 'return=representation',
    body: { owner: user.id, title, share_id: newShareId(), is_public: false, recipe },
  }), 'Save did not return a pot.');
}

export async function publishRecipe(id) {
  return one(await authed(`/rest/v1/pots?id=eq.${id}`, {
    method: 'PATCH',
    prefer: 'return=representation',
    body: { is_public: true, updated_at: new Date().toISOString() },
  }), 'Could not share that pot.');
}

export async function loadShared(shareId) {
  const rows = await api(`/rest/v1/pots?share_id=eq.${encodeURIComponent(shareId)}&select=id,owner,title,share_id,is_public,recipe&limit=1`, {
    token: session?.access_token,
  });
  return one(rows, 'No pot with that link.');
}

export async function loadOwned(id) {
  return one(await authed(`/rest/v1/pots?id=eq.${id}&select=id,owner,title,share_id,is_public,recipe&limit=1`), 'That pot is not in your record.');
}

export async function listMine() {
  const rows = await authed('/rest/v1/pots?select=id,title,share_id,updated_at&order=updated_at.desc&limit=20');
  return Array.isArray(rows) ? rows : [];
}
