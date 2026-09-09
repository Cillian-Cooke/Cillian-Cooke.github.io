/* ============================================
   LOCKUP SHOWCASE · phone lock demo (detail page)
   ============================================ */

(function () {
  'use strict';

  let currentPage = null;

  function initShowcase(page) {
    const wall = page.querySelector('.lockup-wall');
    const toggle = page.querySelector('.lockup-lock-toggle');
    if (!wall || !toggle) return;

    let locked = wall.dataset.locked === 'true';

    function sync() {
      wall.dataset.locked = locked ? 'true' : 'false';
      toggle.textContent = locked ? 'Unlock the room' : 'Lock the room';
      toggle.setAttribute('aria-pressed', locked ? 'true' : 'false');
      toggle.setAttribute('aria-label', locked ? 'Unlock phones in demo' : 'Lock phones in demo');
    }

    toggle.addEventListener('click', () => {
      locked = !locked;
      sync();
    });

    sync();
  }

  function teardown(page) {
    const toggle = page.querySelector('.lockup-lock-toggle');
    if (toggle) toggle.replaceWith(toggle.cloneNode(true));
  }

  function onPageChange(pageId) {
    const page = document.getElementById('detail-lockup');
    if (currentPage === 'detail-lockup' && page) teardown(page);

    currentPage = pageId;

    if (pageId === 'detail-lockup' && page) initShowcase(page);
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

  document.addEventListener('DOMContentLoaded', watchPages);
})();
