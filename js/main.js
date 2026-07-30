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

  let homeVisited = false;
  let scrollingProgrammatically = false;

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

    target.querySelectorAll('.reveal:not(.revealed), .stagger:not(.revealed)').forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight) el.classList.add('revealed');
    });

    initReveals();

    if (window.CillianLottie && typeof window.CillianLottie.refresh === 'function') {
      window.CillianLottie.refresh(target);
    }
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

    initReveals();

    if (window.CillianLottie && typeof window.CillianLottie.refresh === 'function') {
      window.CillianLottie.refresh(siteMain());
    }

    if (id === 'home' && homeVisited && window.CillianLottie && typeof window.CillianLottie.replay === 'function') {
      window.CillianLottie.replay('#name-hero');
    }
    if (id === 'home') homeVisited = true;
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
    document.querySelectorAll('.nav-brand[data-scroll], .nav-brand[data-page]').forEach((el) => {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigateTo(el.getAttribute('data-scroll') || el.getAttribute('data-page'));
        }
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initFontToggle();
    initRouter();
    initSectionObserver();
    initMobileMenu();
    initNavScroll();
    initPoemAccordion();
    initBrandKeyboard();
    initReveals();
  });

  window.navigateTo = navigateTo;
})();
