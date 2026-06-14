// Content script — runs on LinkedIn, Naukri, Wellfound job listing pages

(function () {
  'use strict';

  const SELECTORS = {
    linkedin: {
      title: [
        'h1.t-24',
        'h1.jobs-unified-top-card__job-title',
        '.job-details-jobs-unified-top-card__job-title h1',
        '.job-details-jobs-unified-top-card__job-title',
        'h1[class*="job-title"]',
        'h1[class*="t-24"]',
        '.jobs-details__main-content h1',
        'h1',
      ].join(', '),
      company: [
        '.jobs-unified-top-card__company-name a',
        '.jobs-unified-top-card__subtitle-primary-grouping a',
        '.job-details-jobs-unified-top-card__company-name a',
        '.job-details-jobs-unified-top-card__company-name',
        '[class*="company-name"]',
        '[class*="topcard__org-name"]',
      ].join(', '),
      location: [
        '.jobs-unified-top-card__bullet',
        '.jobs-unified-top-card__workplace-type',
        '.job-details-jobs-unified-top-card__primary-description-container .tvm__text',
        '[class*="workplace-type"]',
        '[class*="job-location"]',
      ].join(', '),
      description: '#job-details, .jobs-description__content, [class*="description__text"]',
    },
    naukri: {
      title:       '.jd-header-title h1',
      company:     '.jd-header-comp-name',
      location:    '.loc span',
      description: '.job-desc',
    },
    wellfound: {
      title:       'h1[data-test="JobListing-title"]',
      company:     '[data-test="JobListing-company-name"]',
      location:    '[data-test="JobListing-location"]',
      description: '[data-test="JobListing-description"]',
    },
  };

  function detectSite() {
    const host = window.location.hostname;
    if (host.includes('linkedin'))                      return 'linkedin';
    if (host.includes('naukri'))                        return 'naukri';
    if (host.includes('wellfound') || host.includes('angel.co')) return 'wellfound';
    return null;
  }

  function extractText(selector) {
    const el = document.querySelector(selector);
    return el ? el.innerText.trim() : '';
  }

  function captureJob() {
    const site = detectSite();
    if (!site) return null;
    const sel = SELECTORS[site];
    return {
      title:       extractText(sel.title),
      company:     extractText(sel.company),
      location:    extractText(sel.location),
      description: extractText(sel.description).substring(0, 500),
      job_url:     window.location.href,
      source:      site,
    };
  }

  // ── In-page toast ─────────────────────────────────────────────────────────────
  function showToast(message, color) {
    const existing = document.getElementById('bjt-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'bjt-toast';
    toast.innerText = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 80px;
      right: 24px;
      z-index: 2147483647;
      background: ${color || '#10b981'};
      color: white;
      border-radius: 10px;
      padding: 10px 16px;
      font-size: 13px;
      font-weight: 600;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      box-shadow: 0 4px 20px rgba(0,0,0,0.25);
      opacity: 1;
      transition: opacity 0.4s ease;
      pointer-events: none;
    `;
    document.body.appendChild(toast);
    setTimeout(function () {
      toast.style.opacity = '0';
      setTimeout(function () { toast.remove(); }, 400);
    }, 3000);
  }

  // ── LinkedIn native Save button intercept ─────────────────────────────────────
  // Strategy 1: MutationObserver watches for aria-label to change from
  //   "Save <role> at <company>" → "Saved <role> at <company>"
  // This is the most reliable approach since LinkedIn updates the attribute
  // after the save API call succeeds.
  //
  // Strategy 2: click listener as fallback, with loose startsWith checks.

  var _recentlySynced = new Set(); // debounce duplicate triggers

  function sendToTracker(jobData) {
    var key = jobData.job_url || (jobData.title + jobData.company);
    if (_recentlySynced.has(key)) return;
    _recentlySynced.add(key);
    setTimeout(function () { _recentlySynced.delete(key); }, 10000);

    var port;
    try { port = chrome.runtime.connect({ name: 'capture-job' }); }
    catch (e) { return; } // context invalidated — page needs refresh, silently skip
    var done = false;
    var t = setTimeout(function () { if (!done) { done = true; port.disconnect(); } }, 20000);

    port.onMessage.addListener(function (response) {
      if (done) return; done = true; clearTimeout(t); port.disconnect();
      if (response && response.success) {
        showToast('💾 Saved to AI Tracker!', '#6366f1');
      } else if (response && (response.error === 'not_logged_in' || response.error === 'session_expired')) {
        showToast('⚠ Open the AI Tracker extension and log in to enable auto-sync', '#f59e0b');
      }
    });
    port.onDisconnect.addListener(function () { if (!done) { done = true; clearTimeout(t); } });
    port.postMessage({ action: 'CAPTURE_JOB', data: jobData });
  }

  function watchLinkedInSaveButton() {
    if (detectSite() !== 'linkedin') return;

    // ── Strategy 1: attribute mutation observer ──
    // LinkedIn changes aria-label from "Save X job at Y" to "Saved X job at Y"
    // after the save succeeds. Watch for that transition.
    var attrObserver = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.type !== 'attributes') continue;
        var btn = m.target;
        if (btn.tagName !== 'BUTTON') continue;

        var label = (btn.getAttribute('aria-label') || '').toLowerCase();
        // Just transitioned TO "saved ..." state
        if (label.startsWith('saved ') || label === 'saved') {
          var jobData = captureJob();
          if (jobData && jobData.title) sendToTracker(jobData);
        }
      }
    });

    attrObserver.observe(document.body, {
      subtree:         true,
      attributes:      true,
      attributeFilter: ['aria-label', 'class'],
    });

    // ── Strategy 2: click listener fallback ──
    // Catches saves where LinkedIn doesn't mutate aria-label (some card variants).
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;

      var label     = (btn.getAttribute('aria-label') || '').toLowerCase();
      var cls       = btn.classList;

      // Match "Save …" but NOT "Saved …" and NOT "Unsave …"
      var isSaveBtn =
        (cls.contains('jobs-save-button') && !cls.contains('jobs-save-button--unsave')) ||
        (label.startsWith('save ') && !label.startsWith('saved ') && !label.includes('unsave'));

      if (!isSaveBtn) return;

      // Wait for LinkedIn's async save to complete, then capture
      setTimeout(function () {
        var jobData = captureJob();
        if (jobData && jobData.title) sendToTracker(jobData);
      }, 1000);
    }, true);
  }

  // ── Manual "Track This Job" floating button ───────────────────────────────────
  function injectButton() {
    if (document.getElementById('bjt-capture-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'bjt-capture-btn';
    btn.innerText = '+ Track This Job';
    btn.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 24px;
      z-index: 2147483647;
      background: #6366f1;
      color: white;
      border: none;
      border-radius: 8px;
      padding: 12px 20px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer !important;
      pointer-events: all !important;
      box-shadow: 0 4px 14px rgba(99,102,241,0.4);
      font-family: -apple-system, sans-serif;
    `;

    btn.addEventListener('click', function () {
      // Immediate visual feedback so user knows click registered
      btn.innerText = '⏳ Saving…';
      btn.style.background = '#4f46e5';

      var jobData = captureJob();

      // Fallback: extract from page title "Job Title at Company | LinkedIn"
      if (!jobData || !jobData.title) {
        jobData = jobData || { job_url: window.location.href, source: 'linkedin', location: '', description: '' };
        var pageTitle = document.title
          .replace(/\s*[\|–\-]\s*LinkedIn.*$/i, '')
          .replace(/\s*[\|–\-]\s*Easy Apply.*$/i, '')
          .trim();
        var firstH1 = document.querySelector('h1');
        jobData.title = pageTitle || (firstH1 ? firstH1.innerText.trim() : 'Job from LinkedIn');
      }
      // company is required by the API — extract from LinkedIn page title
      // Format: "(6) Job Title | Company Name hiring in Location, Country | LinkedIn"
      if (!jobData.company) {
        var rawTitle = document.title.replace(/^\(\d+\)\s*/, '');
        var parts    = rawTitle.split(' | ');
        if (parts.length >= 2) {
          // parts[1] = "Tata Consultancy Services hiring in Hyderabad..." or just "TCS"
          jobData.company = parts[1].replace(/\s+hiring\s+in\s+.+$/i, '').trim();
        }
        if (!jobData.company) {
          // Fallback: try DOM selectors for company
          var compEl = document.querySelector([
            '.job-details-jobs-unified-top-card__company-name a',
            '.jobs-unified-top-card__company-name a',
            '[class*="company-name"] a',
            '[class*="company-name"]',
          ].join(', '));
          jobData.company = compEl ? compEl.innerText.trim() : 'Unknown Company';
        }
      }

      // Guard against "Extension context invalidated" (tab open during extension reload)
      var port;
      try { port = chrome.runtime.connect({ name: 'capture-job' }); }
      catch (e) {
        btn.innerText = '⚠ Refresh page & retry';
        btn.style.background = '#f59e0b';
        setTimeout(function () { btn.innerText = '+ Track This Job'; btn.style.background = '#6366f1'; }, 3000);
        return;
      }
      var done = false;

      var failTimer = setTimeout(function () {
        if (!done) { done = true; port.disconnect(); resetBtn('⚠ Timed out — retry'); }
      }, 20000);

      port.onMessage.addListener(function (response) {
        if (done) return;
        done = true;
        clearTimeout(failTimer);
        port.disconnect();
        if (response && response.success) {
          btn.innerText = '✓ Saved!';
          btn.style.background = '#10b981';
        } else if (response && response.error === 'not_logged_in') {
          btn.innerText = '⚠ Login in extension';
          btn.style.background = '#f59e0b';
        } else {
          var errMsg = (response && response.error) ? response.error.substring(0, 35) : 'unknown';
          btn.innerText = '⚠ ' + errMsg;
          btn.style.background = '#ef4444';
        }
        setTimeout(function () { btn.innerText = '+ Track This Job'; btn.style.background = '#6366f1'; }, 2500);
      });

      port.onDisconnect.addListener(function () {
        if (!done) { done = true; clearTimeout(failTimer); resetBtn('⚠ SW disconnected — retry'); }
      });

      function resetBtn(msg) {
        btn.innerText = msg;
        btn.style.background = '#ef4444';
        setTimeout(function () { btn.innerText = '+ Track This Job'; btn.style.background = '#6366f1'; }, 2500);
      }

      port.postMessage({ action: 'CAPTURE_JOB', data: jobData });
    });

    document.body.appendChild(btn);
  }

  // ── LinkedIn Saved Jobs page bulk import ──────────────────────────────────────
  // When user visits linkedin.com/my-items/saved-jobs/, inject an import button
  // that sends all visible saved jobs to the tracker in one shot.
  function injectLinkedInSavedJobsImport() {
    if (!window.location.pathname.includes('/my-items/saved-jobs')) return;
    if (document.getElementById('bjt-import-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'bjt-import-btn';
    btn.innerText = '⬇ Import All to AI Tracker';
    btn.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #6366f1;
      color: white;
      border: none;
      border-radius: 8px;
      padding: 10px 18px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 2px 10px rgba(99,102,241,0.35);
      font-family: -apple-system, sans-serif;
      margin: 12px 0;
    `;

    btn.addEventListener('click', async function () {
      btn.innerText = '⏳ Importing…';
      btn.disabled = true;

      // LinkedIn saved jobs page: each card has the job title and company
      const cards = document.querySelectorAll(
        '.scaffold-layout__list-item, .reusable-search__result-container, .jobs-job-board-list__item'
      );

      let count = 0;
      for (const card of cards) {
        const titleEl   = card.querySelector('a.job-card-list__title, a[data-control-name="job_card_title"]');
        const companyEl = card.querySelector('.job-card-container__company-name, .artdeco-entity-lockup__subtitle span');
        const linkEl    = card.querySelector('a[href*="/jobs/view/"]');

        if (!titleEl && !linkEl) continue;

        const title   = titleEl ? titleEl.innerText.trim() : '';
        const company = companyEl ? companyEl.innerText.trim() : '';
        const url     = linkEl ? (linkEl.href.split('?')[0]) : window.location.href;

        if (!title && !company) continue;

        await new Promise(function (resolve) {
          chrome.runtime.sendMessage({
            action: 'CAPTURE_JOB',
            data: { title, company, job_url: url, source: 'linkedin', location: '', description: '' },
          }, function () { resolve(); });
        });
        count++;
        // Small delay to avoid hammering the API
        await new Promise(function (r) { setTimeout(r, 300); });
      }

      btn.innerText = count > 0 ? `✓ Imported ${count} job${count !== 1 ? 's' : ''}!` : '✓ Nothing new to import';
      btn.style.background = '#10b981';
      setTimeout(function () {
        btn.innerText = '⬇ Import All to AI Tracker';
        btn.style.background = '#6366f1';
        btn.disabled = false;
      }, 3000);
    });

    // Insert before the job list
    const header = document.querySelector('.scaffold-layout__list-header, h1, main');
    if (header) {
      header.parentNode.insertBefore(btn, header.nextSibling);
    } else {
      document.body.prepend(btn);
    }
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────────────
  // Start the LinkedIn save button intercept immediately
  watchLinkedInSaveButton();

  // For the floating button + bulk import — wait for the SPA to render content
  const observer = new MutationObserver(function () {
    const site = detectSite();
    if (!site) return;

    // Bulk import button on LinkedIn saved jobs page
    injectLinkedInSavedJobsImport();

    // Floating "Track This Job" button on job detail pages
    const titleEl = document.querySelector(SELECTORS[site]?.title);
    if (titleEl) injectButton();
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Run once on initial load too
  injectLinkedInSavedJobsImport();
  injectButton();
})();
