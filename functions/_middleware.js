// Protection d'accès par mot de passe pour Cloudflare Pages (Pages Functions).
// Activée uniquement si la variable d'environnement SITE_PASSWORD est définie
// dans Cloudflare (Settings › Variables and Secrets, type « Secret »).
// Le mot de passe est vérifié côté serveur : sans lui, aucun fichier de
// l'application n'est servi. Une fois connecté, un cookie sécurisé (1 an)
// évite de le retaper.

const COOKIE = 'orbit_auth';

async function token(secret) {
  const data = new TextEncoder().encode('orbit-studio:v1:' + secret);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function getCookie(request, name) {
  const h = request.headers.get('Cookie') || '';
  for (const part of h.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return '';
}

function loginPage(error) {
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#07060b">
<title>Orbit Studio — accès privé</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#07060b;color:#f3f0fa;font-family:system-ui,-apple-system,sans-serif}
form{width:min(92vw,360px);padding:28px;border-radius:22px;background:#100e17;border:1px solid #262233}
h1{font-size:22px;margin:0 0 6px}p{color:#9a93ad;margin:0 0 18px;font-size:14px}
input{width:100%;box-sizing:border-box;padding:14px;border-radius:12px;border:1px solid #262233;background:#16131f;color:inherit;font-size:16px}
button{width:100%;margin-top:12px;padding:14px;border:0;border-radius:12px;font-size:16px;font-weight:700;color:#120a14;background:linear-gradient(135deg,#ffae2b,#f24fd0 55%,#8b4dff)}
.e{color:#ff5a6a;margin-top:10px;font-size:14px}
</style></head><body>
<form method="POST" action="/__auth">
<h1>Orbit Studio</h1><p>Application privée. Entrez votre mot de passe.</p>
<input type="password" name="password" autocomplete="current-password" autofocus required placeholder="Mot de passe">
<button type="submit">Entrer</button>
${error ? '<div class="e">Mot de passe incorrect.</div>' : ''}
</form></body></html>`;
  return new Response(html, {
    status: 401,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
  });
}

export async function onRequest({ request, env, next }) {
  const password = env.SITE_PASSWORD;
  if (!password) return next(); // protection désactivée

  const expected = await token(password);
  const url = new URL(request.url);

  if (url.pathname === '/__auth' && request.method === 'POST') {
    const form = await request.formData().catch(() => null);
    const given = String((form && form.get('password')) || '');
    if (safeEqual(await token(given), expected)) {
      return new Response(null, {
        status: 303,
        headers: {
          Location: '/',
          'Set-Cookie': `${COOKIE}=${expected}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`,
          'Cache-Control': 'no-store',
        },
      });
    }
    await new Promise((r) => setTimeout(r, 1000)); // ralentit les essais en série
    return loginPage(true);
  }

  if (safeEqual(getCookie(request, COOKIE), expected)) return next();
  return loginPage(false);
}
