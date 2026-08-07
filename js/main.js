/* ============================================
   Cillian Cooke · Portfolio JS
   One-page scroll nav, secondary overlays, font toggle, reveals
   ============================================ */

(function () {
  'use strict';

  const pages = {};
  const MAIN_SECTIONS = new Set(['home', 'projects', 'about', 'cv']);
  const ABOUT_OVERLAYS = new Set([
    'opinions', 'poetry', 'books', 'podcasts', 'photos',
    'writing', 'media',
  ]);
  const REDIRECTS = {
    writing: 'about',
    media: 'about',
  };

  let scrollingProgrammatically = false;
  let revealObserver = null;

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
      btn.setAttribute('aria-pressed', mode === 'dyslexic' ? 'true' : 'false');
    });
  }

  function siteMain() {
    return document.getElementById('site-main');
  }

  function isOverlay(id) {
    return Boolean(pages[id]);
  }

  function setNavActive(sectionId) {
    document.querySelectorAll('.nav-links [data-scroll]').forEach((link) => {
      const target = link.getAttribute('data-scroll');
      let active = target === sectionId;
      if (target === 'about' && ABOUT_OVERLAYS.has(sectionId)) active = true;
      if (target === 'projects' && sectionId.startsWith('detail-')) active = true;
      link.classList.toggle('active', active);
    });
  }

  function showMain() {
    const main = siteMain();
    if (main) main.classList.remove('is-hidden');
    Object.values(pages).forEach((page) => {
      page.classList.remove('active', 'visible');
    });
  }

  function revealInView(root) {
    const scope = root || document;
    scope.querySelectorAll('.reveal:not(.revealed), .stagger:not(.revealed)').forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.92) el.classList.add('revealed');
    });
    initReveals();
  }

  function showOverlay(pageId) {
    const main = siteMain();
    if (main) main.classList.add('is-hidden');

    Object.values(pages).forEach((page) => {
      page.classList.remove('active', 'visible');
    });

    const target = pages[pageId];
    if (!target) return;

    window.scrollTo(0, 0);
    target.classList.add('active', 'visible');
    requestAnimationFrame(() => revealInView(target));
  }

  function scrollToSection(sectionId, { updateHash = true } = {}) {
    showMain();

    const id = MAIN_SECTIONS.has(sectionId) ? sectionId : 'home';
    const el = document.getElementById(id);

    setNavActive(id);

    if (updateHash) {
      const nextHash = id === 'home' ? '' : id;
      const current = window.location.hash.slice(1);
      if (current !== nextHash) {
        scrollingProgrammatically = true;
        if (nextHash) {
          history.replaceState(null, '', `#${nextHash}`);
        } else {
          history.replaceState(null, '', window.location.pathname + window.location.search);
        }
        scrollingProgrammatically = false;
      }
    }

    if (!el || id === 'home') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    requestAnimationFrame(() => revealInView(siteMain()));
  }

  function navigateTo(pageId) {
    const target = REDIRECTS[pageId] || pageId;

    if (MAIN_SECTIONS.has(target) || target === '' || !target) {
      scrollToSection(target || 'home');
      return;
    }

    if (!isOverlay(target)) {
      scrollToSection('home');
      return;
    }

    scrollingProgrammatically = true;
    window.location.hash = target;
    scrollingProgrammatically = false;
    setNavActive(target);
    showOverlay(target);
  }

  function handleRoute(hash) {
    const raw = REDIRECTS[hash] || hash || 'home';

    if (MAIN_SECTIONS.has(raw)) {
      scrollToSection(raw, { updateHash: false });
      return;
    }

    if (isOverlay(raw)) {
      setNavActive(raw);
      showOverlay(raw);
      return;
    }

    scrollToSection('home', { updateHash: false });
  }

  function initRouter() {
    document.querySelectorAll('.page').forEach((p) => {
      pages[p.id] = p;
    });

    document.querySelectorAll('[data-scroll]').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo(link.getAttribute('data-scroll'));
        closeMobileMenu();
      });
    });

    document.querySelectorAll('[data-page]').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo(link.getAttribute('data-page'));
        closeMobileMenu();
      });
    });

    window.addEventListener('hashchange', () => {
      if (scrollingProgrammatically) return;
      handleRoute(window.location.hash.slice(1));
    });

    handleRoute(window.location.hash.slice(1));
  }

  function initSectionObserver() {
    const sections = [...MAIN_SECTIONS]
      .map((id) => document.getElementById(id))
      .filter(Boolean);

    if (!sections.length) return;

    const observer = new IntersectionObserver((entries) => {
      if (siteMain()?.classList.contains('is-hidden')) return;

      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

      if (!visible.length) return;
      setNavActive(visible[0].target.id);
    }, {
      rootMargin: `-${Math.round(window.innerHeight * 0.25)}px 0px -45% 0px`,
      threshold: [0.1, 0.35, 0.6],
    });

    sections.forEach((section) => observer.observe(section));
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

  function initReveals() {
    if (!revealObserver) {
      revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('revealed');
          revealObserver.unobserve(entry.target);
        });
      }, {
        threshold: 0.12,
        rootMargin: '0px 0px -12% 0px',
      });
    }

    document.querySelectorAll('.reveal:not(.revealed), .stagger:not(.revealed)').forEach((el) => {
      revealObserver.observe(el);
    });
  }

  function initBrandKeyboard() {
    document.querySelectorAll('.nav-brand[data-scroll], .nav-brand[data-page]').forEach((el) => {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigateTo(el.getAttribute('data-scroll') || el.getAttribute('data-page'));
        }
      });
    });
  }

  function initPoetryNav() {
    const nav = document.querySelector('.poetry-nav');
    if (!nav) return;

    const links = [...nav.querySelectorAll('.poetry-nav-link')];
    const views = [...document.querySelectorAll('.poem-view')];

    function showPoem(id) {
      links.forEach((btn) => {
        btn.classList.toggle('is-active', btn.getAttribute('data-poem') === id);
      });
      views.forEach((view) => {
        const on = view.id === `poem-${id}`;
        view.classList.toggle('is-active', on);
        if (on) view.removeAttribute('hidden');
        else view.setAttribute('hidden', '');
      });
    }

    links.forEach((btn) => {
      btn.addEventListener('click', () => showPoem(btn.getAttribute('data-poem')));
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initFontToggle();
    initRouter();
    initSectionObserver();
    initMobileMenu();
    initNavScroll();
    initBrandKeyboard();
    initPoetryNav();
    initReveals();
    // Hero should appear immediately on load
    document.querySelectorAll('.reveal--hero').forEach((el) => el.classList.add('revealed'));
  });

  window.navigateTo = navigateTo;
})();
