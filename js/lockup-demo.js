/* ============================================
   LOCKUP SHOWCASE · auto-cycling demo
   ============================================ */

(function () {
  'use strict';

  const STEP_MS = 3200;
  const STEPS = 4;

  let currentPage = null;
  let timer = null;
  let step = 0;

  /* Matches staggered phone check-ins: 0 → 1 → 3 → checkout */
  const CHECKED_IN = [0, 1, 3, 0];

  function setStep(stage, next) {
    step = next;
    stage.dataset.step = String(step);

    const checkedIn = stage.querySelector('.lockup-dash-stat-num--in');
    if (checkedIn) checkedIn.textContent = String(CHECKED_IN[step]);

    const labels = stage.closest('.lockup-showcase')?.querySelectorAll('.lockup-step');
    if (labels) {
      labels.forEach((el, i) => {
        el.classList.toggle('is-active', i === step);
      });
    }
  }

  function startCycle(stage) {
    stopCycle();
    setStep(stage, 0);

    timer = window.setInterval(() => {
      setStep(stage, (step + 1) % STEPS);
    }, STEP_MS);
  }

  function stopCycle() {
    if (timer) {
      window.clearInterval(timer);
      timer = null;
    }
  }

  function initShowcase(page) {
    const stage = page.querySelector('.lockup-stage');
    if (!stage) return;
    startCycle(stage);
  }

  function teardown() {
    stopCycle();
    step = 0;
  }

  function onPageChange(pageId) {
    if (currentPage === 'detail-lockup') teardown();

    currentPage = pageId;

    if (pageId === 'detail-lockup') {
      const page = document.getElementById('detail-lockup');
      if (page) initShowcase(page);
    }
  }

  function watchPages() {
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        const el = m.target;
        if (!el.classList || !el.classList.contains('page')) continue;

        if (el.classList.contains('active')) {
          if (el.id !== currentPage) onPageChange(el.id);
          continue;
        }

        if (el.id === currentPage) onPageChange(null);
      }
    });

    document.querySelectorAll('.page').forEach((p) => {
      observer.observe(p, { attributes: true, attributeFilter: ['class'] });
    });

    const active = document.querySelector('.page.active');
    onPageChange(active ? active.id : null);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopCycle();
      return;
    }
    if (currentPage === 'detail-lockup') {
      const page = document.getElementById('detail-lockup');
      if (page) initShowcase(page);
    }
  });

  document.addEventListener('DOMContentLoaded', watchPages);
})();
