/* ============================================
   CILLIAN COOKE — PORTFOLIO JS
   Loading, routing, animations
   ============================================ */

(function () {
  'use strict';

  // --- Loader ---
  function initLoader() {
    const loader = document.querySelector('.loader');
    if (!loader) return;

    // Animate loader text letters
    const textEl = loader.querySelector('.loader-text');
    if (textEl) {
      const text = textEl.textContent.trim();
      textEl.innerHTML = '';
      [...text].forEach((char, i) => {
        const span = document.createElement('span');
        span.textContent = char === ' ' ? '\u00A0' : char;
        span.style.animationDelay = `${i * 0.05}s`;
        textEl.appendChild(span);
      });
    }

    // Hide loader after bar animation
    setTimeout(() => {
      loader.classList.add('hidden');
      // Trigger hero entrance animations
      animateHeroEntrance();
    }, 2200);
  }

  // --- Hero entrance ---
  function animateHeroEntrance() {
    const els = document.querySelectorAll('.hero-label, .hero-title, .hero-subtitle, .hero-cta');
    els.forEach((el, i) => {
      setTimeout(() => {
        el.style.transition = 'opacity 0.6s var(--transition), transform 0.6s var(--transition)';
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      }, i * 150);
    });
  }

  // --- SPA Router ---
  const pages = {};

  function initRouter() {
    document.querySelectorAll('.page').forEach(p => {
      pages[p.id] = p;
    });

    // Handle nav link clicks
    document.querySelectorAll('[data-page]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const target = link.getAttribute('data-page');
        navigateTo(target);
        closeMobileMenu();
      });
    });

    // Handle browser back/forward
    window.addEventListener('hashchange', () => {
      const hash = window.location.hash.slice(1) || 'home';
      showPage(hash, false);
    });

    // Initial page
    const initial = window.location.hash.slice(1) || 'home';
    showPage(initial, false);
  }

  function navigateTo(pageId) {
    window.location.hash = pageId === 'home' ? '' : pageId;
    showPage(pageId, true);
  }

  function showPage(pageId, animate) {
    // Update nav active states
    document.querySelectorAll('[data-page]').forEach(link => {
      link.classList.toggle('active', link.getAttribute('data-page') === pageId);
    });

    // Hide all pages
    Object.values(pages).forEach(page => {
      page.classList.remove('active', 'visible');
    });

    // Show target page
    const target = pages[pageId];
    if (!target) return;

    target.classList.add('active');

    // Scroll to top
    window.scrollTo(0, 0);

    // Animate in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        target.classList.add('visible');
        // Trigger reveals on the new page
        initReveals();
      });
    });
  }

  // --- Mobile Menu ---
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

    if (overlay) {
      overlay.addEventListener('click', () => closeMobileMenu());
    }
  }

  function closeMobileMenu() {
    const toggle = document.querySelector('.nav-toggle');
    const links = document.querySelector('.nav-links');
    const overlay = document.querySelector('.nav-overlay');
    if (toggle) toggle.classList.remove('open');
    if (links) links.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
  }

  // --- Theme Toggle ---
  function initThemeToggle() {
    const saved = localStorage.getItem('theme');
    if (saved) {
      document.documentElement.setAttribute('data-theme', saved);
    }

    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.theme-toggle-hero');
      if (!btn) return;
      const current = document.documentElement.getAttribute('data-theme');
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const isDark = current === 'dark' || (!current && systemDark);
      const next = isDark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
    });
  }

  // --- Nav scroll style ---
  function initNavScroll() {
    const nav = document.querySelector('.nav');
    if (!nav) return;

    window.addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', window.scrollY > 50);
    }, { passive: true });
  }

  // --- About tabs ---
  function initAboutTabs() {
    const tabButtons = document.querySelectorAll('.about-tab');
    const panels = document.querySelectorAll('.about-tab-panel');
    if (!tabButtons.length || !panels.length) return;

    tabButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const tab = button.getAttribute('data-tab');
        tabButtons.forEach(btn => btn.classList.toggle('active', btn === button));
        panels.forEach(panel => {
          panel.classList.toggle('active', panel.id === `about-tab-${tab}`);
        });
      });
    });
  }

  // --- Poetry accordion ---
  function initPoemAccordion() {
    const poems = document.querySelectorAll('.poem-item');
    if (!poems.length) return;

    poems.forEach(poem => {
      poem.addEventListener('toggle', (e) => {
        if (e.target.open) {
          poems.forEach(other => {
            if (other !== poem && other.open) {
              other.open = false;
            }
          });
        }
      });
    });
  }

  // --- Cursor Glow ---
  function initCursorGlow() {
    const glow = document.querySelector('.cursor-glow');
    if (!glow || window.innerWidth < 768) return;

    document.addEventListener('mousemove', (e) => {
      glow.style.transform = `translate(${e.clientX - 250}px, ${e.clientY - 250}px)`;
    });
  }

  // --- Scroll Reveal ---
  function initReveals() {
    const reveals = document.querySelectorAll('.reveal:not(.revealed), .stagger:not(.revealed)');

    if (!reveals.length) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    });

    reveals.forEach(el => observer.observe(el));
  }

  // --- Counter animation ---
  function animateCounters() {
    const counters = document.querySelectorAll('[data-count]');

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const el = entry.target;
          const target = parseInt(el.getAttribute('data-count'), 10);
          const suffix = el.getAttribute('data-suffix') || '';
          let current = 0;
          const step = Math.max(1, Math.floor(target / 40));
          const interval = setInterval(() => {
            current += step;
            if (current >= target) {
              current = target;
              clearInterval(interval);
            }
            el.textContent = current + suffix;
          }, 30);
          observer.unobserve(el);
        }
      });
    }, { threshold: 0.5 });

    counters.forEach(el => observer.observe(el));
  }

  // --- Init ---
  document.addEventListener('DOMContentLoaded', () => {
    initThemeToggle();
    initLoader();
    initRouter();
    initMobileMenu();
    initNavScroll();
    initAboutTabs();
    initPoemAccordion();
    initCursorGlow();
    initReveals();
    animateCounters();
  });

})();

window.handleContactSubmit = function (e) {
  e.preventDefault();
  const form = e.target;
  const success = form.nextElementSibling;
  form.hidden = true;
  if (success) success.hidden = false;
};
