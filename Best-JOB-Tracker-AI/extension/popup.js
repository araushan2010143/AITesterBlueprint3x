// popup.js — Best JOB Tracker AI Extension

const APP_URL = 'https://best-job-tracker-ai.vercel.app';

// ─── UI refs ──────────────────────────────────────────────────────────────────
const screenAuth   = document.getElementById('screen-auth');
const screenMain   = document.getElementById('screen-main');
const btnGoogle    = document.getElementById('btn-google-login');
const btnWebLogin  = document.getElementById('btn-web-login');
const btnLogout    = document.getElementById('btn-logout');
const userEmailEl  = document.getElementById('user-email');
const userAvatarEl = document.getElementById('user-avatar');
const jobPanel     = document.getElementById('job-panel');
const recentSec    = document.getElementById('recent-section');
const recentList   = document.getElementById('recent-list');
const toastEl      = document.getElementById('toast');

// ─── Bootstrap ────────────────────────────────────────────────────────────────
chrome.runtime.sendMessage({ action: 'GET_AUTH_STATE' }, function (state) {
  if (state && state.loggedIn) {
    showMainScreen(state.email);
  } else {
    showAuthScreen();
  }
});

// ─── Screen transitions ───────────────────────────────────────────────────────
function showAuthScreen() {
  screenAuth.classList.add('active');
  screenMain.classList.remove('active');
}

function showMainScreen(email) {
  screenAuth.classList.remove('active');
  screenMain.classList.add('active');

  if (email) {
    userEmailEl.textContent = email;
    userAvatarEl.textContent = email[0].toUpperCase();
  }

  loadCurrentJob();
  loadRecentCaptures();
}

// ─── Google login via chrome.identity ────────────────────────────────────────
btnGoogle.addEventListener('click', function () {
  btnGoogle.disabled = true;
  btnGoogle.innerHTML = '<span class="spinner"></span> Signing in…';

  chrome.runtime.sendMessage({ action: 'CHROME_LOGIN' }, function (result) {
    btnGoogle.disabled = false;
    btnGoogle.innerHTML = googleBtnInner();

    if (result && result.success) {
      showMainScreen(result.email);
      toast('Signed in as ' + result.email, 'success');
    } else {
      const msg = result ? result.error : 'Login failed';
      if (msg === 'Auth flow cancelled') {
        toast('Sign-in cancelled', 'info');
      } else {
        toast(msg || 'Sign-in failed', 'error');
      }
    }
  });
});

// Fallback: open web app
btnWebLogin.addEventListener('click', function () {
  chrome.tabs.create({ url: APP_URL + '/login?source=extension' });
  window.close();
});

// ─── Logout ───────────────────────────────────────────────────────────────────
btnLogout.addEventListener('click', function () {
  chrome.runtime.sendMessage({ action: 'LOGOUT' }, function () {
    showAuthScreen();
    toast('Signed out', 'info');
  });
});

// ─── Job capture ──────────────────────────────────────────────────────────────
function loadCurrentJob() {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (!tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id, { action: 'GET_JOB_DATA' }, function (jobData) {
      // content script may not be injected on non-job pages — that's fine
      if (chrome.runtime.lastError || !jobData || !jobData.title) {
        renderEmptyJobPanel();
        return;
      }
      renderJobPanel(jobData);
    });
  });
}

function renderEmptyJobPanel() {
  jobPanel.className = 'job-panel empty';
  jobPanel.innerHTML =
    '<div class="job-icon">📋</div>' +
    '<p>Open a job listing on LinkedIn,<br>Naukri, or Wellfound to capture it</p>';
}

function renderJobPanel(job) {
  const source = detectSource(job.job_url || '');
  const badgeCls = source === 'LinkedIn' ? 'linkedin' : source === 'Naukri' ? 'naukri' : 'other';

  jobPanel.className = 'job-panel';
  jobPanel.innerHTML =
    '<div class="job-meta">' +
      '<div class="role">' + esc(job.title) + '</div>' +
      '<div class="company">' + esc(job.company) + '</div>' +
      (job.location ? '<div class="location">📍 ' + esc(job.location) + '</div>' : '') +
    '</div>' +
    '<span class="badge ' + badgeCls + '">' + source + '</span>' +
    '<button class="btn-capture" id="btn-capture">+ Capture This Job</button>';

  document.getElementById('btn-capture').addEventListener('click', function () {
    captureJob(job);
  });
}

function captureJob(job) {
  const btn = document.getElementById('btn-capture');
  if (!btn) return;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Saving…';

  chrome.runtime.sendMessage({ action: 'CAPTURE_JOB', data: job }, function (result) {
    if (result && result.success) {
      btn.innerHTML = '✓ Tracked!';
      btn.style.background = '#166534';
      toast('Job tracked successfully!', 'success');
      // Reload recent captures
      setTimeout(loadRecentCaptures, 400);
    } else if (result && result.error === 'not_logged_in') {
      toast('Session expired — please sign in again', 'error');
      showAuthScreen();
    } else if (result && result.error === 'session_expired') {
      toast('Session expired — please sign in again', 'error');
      showAuthScreen();
    } else {
      btn.disabled = false;
      btn.innerHTML = '+ Capture This Job';
      toast((result && result.error) || 'Capture failed', 'error');
    }
  });
}

// ─── Recent captures list ─────────────────────────────────────────────────────
function loadRecentCaptures() {
  chrome.storage.local.get(['recent_captures'], function (data) {
    const items = data.recent_captures || [];
    if (items.length === 0) {
      recentSec.style.display = 'none';
      return;
    }

    recentSec.style.display = 'block';
    recentList.innerHTML = items.map(function (item) {
      return '<li class="recent-item">' +
        '<span class="dot"></span>' +
        '<div class="info">' +
          '<div class="r-title">' + esc(item.title) + '</div>' +
          '<div class="r-co">'   + esc(item.company) + '</div>' +
        '</div>' +
        '<span class="r-time">' + relativeTime(item.captured_at) + '</span>' +
      '</li>';
    }).join('');
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function detectSource(url) {
  if (url.includes('linkedin.com'))  return 'LinkedIn';
  if (url.includes('naukri.com'))    return 'Naukri';
  if (url.includes('wellfound.com') || url.includes('angel.co')) return 'Wellfound';
  return 'Other';
}

function relativeTime(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)   return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let toastTimer = null;
function toast(msg, type) {
  toastEl.textContent = msg;
  toastEl.className = 'toast ' + (type || 'info') + ' show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    toastEl.classList.remove('show');
  }, 3000);
}

function googleBtnInner() {
  return '<svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>' +
    '<path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>' +
    '<path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>' +
    '<path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>' +
    '</svg> Continue with Google';
}
