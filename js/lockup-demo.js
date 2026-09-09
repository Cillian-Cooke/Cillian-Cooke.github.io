/**
 * Lockup school overlay demo — live unlock countdown.
 * formatCountdown mirrors user/app/status.tsx.
 */
(function () {
  'use strict';

  function formatCountdown(diffMs) {
    const totalSecs = Math.max(0, Math.floor(diffMs / 1000));
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  /** Demo end time: ~2h 14m from first view so the countdown feels alive. */
  function demoEndTimeMs() {
    const key = 'lockup-demo-end-ms';
    const stored = sessionStorage.getItem(key);
    if (stored) return Number(stored);
    const end = Date.now() + (2 * 3600 + 14 * 60 + 32) * 1000;
    sessionStorage.setItem(key, String(end));
    return end;
  }

  function tick() {
    const el = document.getElementById('lockup-unlock-countdown');
    if (!el) return;

    const endMs = demoEndTimeMs();
    const diff = endMs - Date.now();

    if (diff <= 0) {
      el.textContent = 'Unlocked';
      return;
    }

    el.textContent = `Unlocks in ${formatCountdown(diff)}`;
  }

  function init() {
    tick();
    setInterval(tick, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
