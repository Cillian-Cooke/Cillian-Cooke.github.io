/* ============================================
   Cillian Cooke · Portfolio JS
   Scroll spine + detail/hub panels
   ============================================ */

(function () {
  'use strict';

  const SPINE = new Set(['home', 'projects', 'about', 'cv']);
  const HUBS = new Set(['opinions', 'poetry', 'books', 'podcasts', 'photos']);
  const REDIRECTS = { writing: 'about', media: 'about' };

  const panels = {};
  let activePanel = null;
  let scrollTicking = false;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function initFontToggle() {
    applyFont(localStorage.getItem('font') || 'default');
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

  function navOffset() {
    const nav = document.querySelector('.nav');
    return (nav ? nav.offsetHeight : 72) + 8;
  }

  function setNavActive(id) {
    document.querySelectorAll('.nav-links [data-page]').forEach((link) => {
      const target = link.getAttribute('data-page');
      let active = target === id;
      if (target === 'projects' && id && id.startsWith('detail-')) active = true;
      if (target === 'about' && HUBS.has(id)) active = true;
      link.classList.toggle('active', active);
    });
  }

  function closePanel() {
    if (!activePanel) return;
    activePanel.classList.remove('active');
    activePanel = null;
    document.body.classList.remove('panel-open');
  }

  function openPanel(id) {
    const panel = panels[id];
    if (!panel) return false;

    Object.values(panels).forEach((p) => p.classList.remove('active'));
    panel.classList.add('active');
    activePanel = panel;
    document.body.classList.add('panel-open');
    panel.scrollTop = 0;
    setNavActive(id);

    if (window.CillianLottie && typeof window.CillianLottie.refresh === 'function') {
      window.CillianLottie.refresh(panel);
    }
    return true;
  }

  function scrollToSection(id, { updateHash = true } = {}) {
    closePanel();
    const el = document.getElementById(id) || document.getElementById('home');
    const top = el.getBoundingClientRect().top + window.scrollY - navOffset();
    window.scrollTo({ top: Math.max(0, top), behavior: reduceMotion ? 'auto' : 'smooth' });
    setNavActive(id === 'home' ? 'home' : id);
    if (updateHash) {
      const next = id === 'home' ? '' : id;
      if ((window.location.hash.slice(1) || '') !== next) {
        history.replaceState(null, '', next ? `#${next}` : window.location.pathname + window.location.search);
      }
    }
  }

  function navigateTo(pageId) {
    pageId = REDIRECTS[pageId] || pageId || 'home';

    if (SPINE.has(pageId)) {
      scrollToSection(pageId, { updateHash: true });
      return;
    }

    if (pageId.startsWith('detail-') || HUBS.has(pageId)) {
      const next = `#${pageId}`;
      if (window.location.hash !== next) {
        window.location.hash = pageId;
      } else {
        openPanel(pageId);
      }
      return;
    }

    scrollToSection('home');
  }

  function routeFromHash() {
    const raw = window.location.hash.slice(1);
    const hash = REDIRECTS[raw] || raw || 'home';
    if (SPINE.has(hash)) {
      closePanel();
      const el = document.getElementById(hash);
      if (el) {
        const top = el.getBoundingClientRect().top + window.scrollY - navOffset();
        window.scrollTo(0, Math.max(0, top));
      }
      setNavActive(hash);
      return;
    }
    if (hash.startsWith('detail-') || HUBS.has(hash)) {
      openPanel(hash);
      return;
    }
    closePanel();
    setNavActive('home');
  }

  function initRouter() {
    document.querySelectorAll('.panel').forEach((p) => {
      panels[p.id] = p;
    });

    document.querySelectorAll('[data-page]').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo(link.getAttribute('data-page'));
        closeMobileMenu();
      });
    });

    window.addEventListener('hashchange', routeFromHash);
    routeFromHash();
  }

  function initSectionObserver() {
    const sections = ['home', 'projects', 'about', 'cv']
      .map((id) => document.getElementById(id))
      .filter(Boolean);

    const observer = new IntersectionObserver(
      (entries) => {
        if (activePanel) return;
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (!visible.length) return;
        const id = visible[0].target.id;
        setNavActive(id);
        const next = id === 'home' ? '' : id;
        if ((window.location.hash.slice(1) || '') !== next) {
          history.replaceState(null, '', next ? `#${next}` : window.location.pathname + window.location.search);
        }
      },
      { rootMargin: '-80px 0px -45% 0px', threshold: [0.15, 0.35, 0.6] }
    );

    sections.forEach((s) => observer.observe(s));
  }

  function initNameParallax() {
    const hero = document.getElementById('name-hero');
    const home = document.getElementById('home');
    if (!hero || !home || reduceMotion) return;

    const update = () => {
      scrollTicking = false;
      if (activePanel) return;
      const rect = home.getBoundingClientRect();
      const travel = Math.min(1, Math.max(0, -rect.top / Math.max(rect.height * 0.65, 1)));
      hero.style.transform = `translate3d(0, ${travel * 72}px, 0) scale(${1 - travel * 0.12})`;
      hero.style.opacity = String(1 - travel * 0.92);
      home.classList.toggle('is-leaving', travel > 0.08);
    };

    window.addEventListener(
      'scroll',
      () => {
        if (scrollTicking) return;
        scrollTicking = true;
        requestAnimationFrame(update);
      },
      { passive: true }
    );
    update();
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

  function initNavChrome() {
    const nav = document.querySelector('.nav');
    if (!nav) return;
    window.addEventListener(
      'scroll',
      () => nav.classList.toggle('scrolled', window.scrollY > 40),
      { passive: true }
    );
  }

  function initPoemAccordion() {
    document.querySelectorAll('.poem-item').forEach((poem) => {
      poem.addEventListener('toggle', () => {
        if (!poem.open) return;
        document.querySelectorAll('.poem-item').forEach((other) => {
          if (other !== poem && other.open) other.open = false;
        });
      });
    });
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
    initSectionObserver();
    initNameParallax();
    initMobileMenu();
    initNavChrome();
    initPoemAccordion();
    initBrandKeyboard();
  });

  window.navigateTo = navigateTo;
})();
