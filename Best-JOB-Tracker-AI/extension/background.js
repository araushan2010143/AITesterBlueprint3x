// Background Service Worker — Manifest V3

const APP_URL = 'https://best-job-tracker-ai.vercel.app';
const GOOGLE_CLIENT_ID = '158470437418-76l66p8tn2befp4ps8iml1m3i0ccrqj4.apps.googleusercontent.com';

// ─── Port-based handler (keeps service worker alive for the full request) ───────
chrome.runtime.onConnect.addListener(function (port) {
  if (port.name !== 'capture-job') return;
  port.onMessage.addListener(function (message) {
    if (message.action !== 'CAPTURE_JOB') return;
    handleCapture(message.data)
      .then(function (result) { port.postMessage(result); })
      .catch(function (err)   { port.postMessage({ success: false, error: err.message }); });
  });
});

// ─── Message router (login / logout / auth state) ──────────────────────────────
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message.action === 'CAPTURE_JOB') {
    handleCapture(message.data)
      .then(sendResponse)
      .catch(function (err) { sendResponse({ success: false, error: err.message }); });
    return true;
  }

  if (message.action === 'CHROME_LOGIN') {
    handleChromeLogin()
      .then(sendResponse)
      .catch(function (err) { sendResponse({ success: false, error: err.message }); });
    return true;
  }

  if (message.action === 'LOGOUT') {
    chrome.storage.local.remove(['supabase_token', 'user_email', 'recent_captures'], function () {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === 'GET_AUTH_STATE') {
    chrome.storage.local.get(['supabase_token', 'user_email'], function (data) {
      sendResponse({ loggedIn: !!data.supabase_token, email: data.user_email || null });
    });
    return true;
  }
});

// ─── External messages (from the web app) ──────────────────────────────────────
// Called by the Next.js app after login: chrome.runtime.sendMessage(EXT_ID, { action: 'SET_TOKEN', token, email })
chrome.runtime.onMessageExternal.addListener(function (message, sender, sendResponse) {
  if (message.action === 'SET_TOKEN' && message.token) {
    chrome.storage.local.set({
      supabase_token: message.token,
      user_email: message.email || '',
    }, function () { sendResponse({ success: true }); });
    return true;
  }
});

// ─── Chrome-native OAuth login ──────────────────────────────────────────────────
// Uses launchWebAuthFlow to get a Google ID token, then exchanges it for a
// Supabase session via /api/auth/extension-login.  No redirect to the web app required.
async function handleChromeLogin() {
  const redirectUrl = chrome.identity.getRedirectURL();

  // Generate raw nonce, hash it before sending to Google.
  // Google embeds the hash in the id_token; Supabase needs the raw nonce to verify.
  const rawNonce    = generateNonce();
  const hashedNonce = await sha256Hex(rawNonce);

  const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id:     GOOGLE_CLIENT_ID,
    redirect_uri:  redirectUrl,
    response_type: 'id_token token',
    scope:         'openid email profile',
    nonce:         hashedNonce,
    prompt:        'select_account',
  }).toString();

  // Launch the Google OAuth popup inside Chrome
  const responseUrl = await new Promise(function (resolve, reject) {
    chrome.identity.launchWebAuthFlow(
      { url: authUrl, interactive: true },
      function (url) {
        if (chrome.runtime.lastError || !url) {
          reject(new Error(chrome.runtime.lastError?.message || 'Auth flow cancelled'));
        } else {
          resolve(url);
        }
      }
    );
  });

  // Parse the id_token from the URL fragment (#id_token=...&access_token=...)
  const fragment = new URL(responseUrl).hash.slice(1);
  const params   = new URLSearchParams(fragment);
  const idToken  = params.get('id_token');

  if (!idToken) throw new Error('No ID token returned from Google');

  // Exchange for a Supabase session — send raw nonce so server can verify
  const res = await fetch(APP_URL + '/api/auth/extension-login', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ idToken, nonce: rawNonce }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Session exchange failed (' + res.status + ')');
  }

  const { accessToken, refreshToken, expiresAt, email } = await res.json();

  await chrome.storage.local.set({
    supabase_token:   accessToken,
    refresh_token:    refreshToken,
    token_expires_at: expiresAt,   // Unix seconds from Supabase
    user_email:       email,
  });

  return { success: true, email };
}

// ─── Token refresh ───────────────────────────────────────────────────────────────
// Refreshes the Supabase access token if it expires within the next 5 minutes.
async function refreshTokenIfNeeded() {
  const stored = await chrome.storage.local.get(['supabase_token', 'refresh_token', 'token_expires_at']);
  if (!stored.supabase_token) return null;

  const expiresAt  = stored.token_expires_at;  // Unix seconds
  const nowSeconds = Math.floor(Date.now() / 1000);
  // Refresh if within 5 minutes of expiry or already expired
  if (expiresAt && nowSeconds < expiresAt - 300) return stored.supabase_token;

  const refreshToken = stored.refresh_token;
  if (!refreshToken) return stored.supabase_token; // no refresh token — try with existing

  try {
    const res = await fetch(APP_URL + '/api/auth/extension-refresh', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      // Refresh failed — clear stored session so popup shows login
      await chrome.storage.local.remove(['supabase_token', 'refresh_token', 'token_expires_at', 'user_email']);
      return null;
    }
    const { accessToken, refreshToken: newRefresh, expiresAt: newExpiry, email } = await res.json();
    await chrome.storage.local.set({
      supabase_token:   accessToken,
      refresh_token:    newRefresh,
      token_expires_at: newExpiry,
      user_email:       email,
    });
    return accessToken;
  } catch {
    return stored.supabase_token; // network error — try with existing token
  }
}

// ─── Job capture ────────────────────────────────────────────────────────────────
async function handleCapture(jobData) {
  const token = await refreshTokenIfNeeded();

  if (!token) {
    return { success: false, error: 'not_logged_in' };
  }

  const response = await fetch(APP_URL + '/api/applications', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': 'Bearer ' + token,
    },
    body: JSON.stringify({
      company:    jobData.company,
      role_title: jobData.title,
      job_url:    jobData.job_url,
      source:     jobData.source,
      status:     'bookmarked',
      notes:      'Captured via extension\n\n' + (jobData.description || '').substring(0, 500),
      location:   jobData.location,
    }),
  });

  if (response.status === 401) {
    // Token expired — clear it so popup shows login screen
    await chrome.storage.local.remove(['supabase_token', 'user_email']);
    return { success: false, error: 'session_expired' };
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    // API returns { error: "..." }, not { message: "..." }
    return { success: false, error: err.error || err.message || 'API error ' + response.status };
  }

  const data = await response.json();

  // Chrome notification
  chrome.notifications.create({
    type:    'basic',
    iconUrl: 'icons/icon48.png',
    title:   'Job Tracked!',
    message: jobData.title + ' at ' + jobData.company + ' added to your board.',
  });

  // Save to recent captures (max 5)
  const { recent_captures = [] } = await chrome.storage.local.get(['recent_captures']);
  recent_captures.unshift({
    title:       jobData.title,
    company:     jobData.company,
    id:          data.data?.id,
    captured_at: Date.now(),
  });
  await chrome.storage.local.set({ recent_captures: recent_captures.slice(0, 5) });

  return { success: true, applicationId: data.data?.id };
}

// ─── Helpers ────────────────────────────────────────────────────────────────────
function generateNonce() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(plain) {
  const encoded    = new TextEncoder().encode(plain);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hashBuffer), b => b.toString(16).padStart(2, '0')).join('');
}
