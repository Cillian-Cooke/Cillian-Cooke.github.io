/* ============================================
   Cillian Cooke · Portfolio JS
   Routing, font toggle, reveals, hubs
   ============================================ */

(function () {
  'use strict';

  const pages = {};
  const WRITING_PAGES = new Set(['writing', 'opinions', 'poetry']);
  const MEDIA_PAGES = new Set(['media', 'books', 'podcasts']);

  function initFontToggle() {
    const saved = localStorage.getItem('font') || 'default';
    applyFont(saved);

    document.querySelectorAll('.font-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = document.documentElement.getAttribute('data-font') === 'dyslexic'
          ? 'default'
          : 'dyslexic';
        applyFont(next);
        localStorage.setItem('font', next);
      });
    });
  }

  function applyFont(mode) {
    if (mode === 'dyslexic') {
      document.documentElement.setAttribute('data-font', 'dyslexic');
    } else {
      document.documentElement.removeAttribute('data-font');
    }
    document.querySelectorAll('.font-toggle').forEach((btn) => {
      const on = mode === 'dyslexic';
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      const label = btn.querySelector('.font-toggle-label');
      if (label) {
        label.textContent = on ? 'Dyslexia-friendly on' : 'Dyslexia-friendly';
      }
    });
  }

  function initRouter() {
    document.querySelectorAll('.page').forEach((p) => {
      pages[p.id] = p;
    });

    document.querySelectorAll('[data-page]').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo(link.getAttribute('data-page'));
        closeMobileMenu();
      });
    });

    window.addEventListener('hashchange', () => {
      const hash = window.location.hash.slice(1) || 'home';
      showPage(hash);
    });

    showPage(window.location.hash.slice(1) || 'home');
  }

  function navigateTo(pageId) {
    window.location.hash = pageId === 'home' ? '' : pageId;
    showPage(pageId);
  }

  function showPage(pageId) {
    if (!pages[pageId]) pageId = 'home';

    document.querySelectorAll('.nav-links [data-page]').forEach((link) => {
      const target = link.getAttribute('data-page');
      let active = target === pageId;
      if (target === 'writing' && WRITING_PAGES.has(pageId)) active = true;
      if (target === 'media' && MEDIA_PAGES.has(pageId)) active = true;
      if (target === 'projects' && (pageId === 'projects' || pageId.startsWith('detail-'))) active = true;
      link.classList.toggle('active', active);
    });

    document.querySelectorAll('.subnav [data-page]').forEach((link) => {
      link.classList.toggle('active', link.getAttribute('data-page') === pageId);
    });

    Object.values(pages).forEach((page) => {
      page.classList.remove('active', 'visible');
    });

    const target = pages[pageId];
    if (!target) return;

    window.scrollTo(0, 0);
    target.classList.add('active', 'visible');

    target.querySelectorAll('.reveal:not(.revealed), .stagger:not(.revealed)').forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight) el.classList.add('revealed');
    });

    initReveals();

    if (window.CillianLottie && typeof window.CillianLottie.refresh === 'function') {
      window.CillianLottie.refresh(target);
    }
  }

  function initMobileMenu() {
    const toggle = document.querySelector('.nav-toggle');
    const links = document.querySelector('.nav-links');
    const overlay = document.querySelector('.nav-overlay');
    if (!toggle || !links) return;

    toggle.addEventListener('click', () => {
      const isOpen = links.classList.toggle('open');
      toggle.classList.toggle('open', isOpen);
      if (overlay) overlay.classList.toggle('active', isOpen);
    });

    if (overlay) overlay.addEventListener('click', () => closeMobileMenu());
  }

  function closeMobileMenu() {
    document.querySelector('.nav-toggle')?.classList.remove('open');
    document.querySelector('.nav-links')?.classList.remove('open');
    document.querySelector('.nav-overlay')?.classList.remove('active');
  }

  function initNavScroll() {
    const nav = document.querySelector('.nav');
    if (!nav) return;
    window.addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', window.scrollY > 40);
    }, { passive: true });
  }

  function initPoemAccordion() {
    const poems = document.querySelectorAll('.poem-item');
    poems.forEach((poem) => {
      poem.addEventListener('toggle', () => {
        if (!poem.open) return;
        poems.forEach((other) => {
          if (other !== poem && other.open) other.open = false;
        });
      });
    });
  }

  function initReveals() {
    const reveals = document.querySelectorAll('.reveal:not(.revealed), .stagger:not(.revealed)');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    reveals.forEach((el) => observer.observe(el));
  }

  function initBrandKeyboard() {
    document.querySelectorAll('.nav-brand[data-page]').forEach((el) => {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigateTo(el.getAttribute('data-page'));
        }
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initFontToggle();
    initRouter();
    initMobileMenu();
    initNavScroll();
    initPoemAccordion();
    initBrandKeyboard();
    initReveals();
  });

  window.navigateTo = navigateTo;
})();
