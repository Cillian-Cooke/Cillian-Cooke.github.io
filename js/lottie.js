/* ============================================
   Lottie slots — drop JSON into /lottie/
   Falls back to SVG/CSS marks until files exist.
   ============================================ */

(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const loaded = new Map();
  let lottieLib = null;
  let libPromise = null;

  function loadLottieLib() {
    if (lottieLib) return Promise.resolve(lottieLib);
    if (libPromise) return libPromise;
    libPromise = new Promise((resolve) => {
      if (window.lottie) {
        lottieLib = window.lottie;
        resolve(lottieLib);
        return;
      }
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie.min.js';
      s.onload = () => {
        lottieLib = window.lottie;
        resolve(lottieLib);
      };
      s.onerror = () => resolve(null);
      document.head.appendChild(s);
    });
    return libPromise;
  }

  async function tryLoadAnimation(slot, { force = false } = {}) {
    const src = slot.getAttribute('data-lottie');
    if (!src || reduceMotion) return false;

    if (force && loaded.has(slot)) {
      try {
        loaded.get(slot).destroy();
      } catch (_) { /* ignore */ }
      loaded.delete(slot);
      slot.removeAttribute('data-loaded');
      const old = slot.querySelector('.lottie-canvas');
      if (old) old.innerHTML = '';
    }

    if (loaded.has(slot)) return true;

    try {
      const res = await fetch(src, { method: 'GET' });
      if (!res.ok) return false;
      const data = await res.json();
      const lib = await loadLottieLib();
      if (!lib) return false;

      let canvas = slot.querySelector('.lottie-canvas');
      if (!canvas) {
        canvas = document.createElement('div');
        canvas.className = 'lottie-canvas';
        slot.appendChild(canvas);
      }
      canvas.innerHTML = '';

      const loop = slot.getAttribute('data-loop') !== 'false';
      const anim = lib.loadAnimation({
        container: canvas,
        renderer: 'svg',
        loop,
        autoplay: true,
        animationData: data,
      });
      loaded.set(slot, anim);
      slot.setAttribute('data-loaded', 'true');
      return true;
    } catch (_) {
      return false;
    }
  }

  function refresh(root) {
    const scope = root || document;
    scope.querySelectorAll('.lottie-slot[data-lottie]').forEach((slot) => {
      if (slot.closest('.page') && !slot.closest('.page.active') && !slot.closest('.nav')) {
        return;
      }
      tryLoadAnimation(slot);
    });
    document.querySelectorAll('.nav .lottie-slot[data-lottie], .hero .lottie-slot[data-lottie]').forEach((slot) => {
      tryLoadAnimation(slot);
    });
  }

  function replay(selector) {
    const slot = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!slot) return Promise.resolve(false);
    return tryLoadAnimation(slot, { force: true });
  }

  document.addEventListener('DOMContentLoaded', () => refresh());

  window.CillianLottie = { refresh, replay };
})();
