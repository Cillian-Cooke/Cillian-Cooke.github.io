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

  /**
   * Expected files (optional — site works without them):
   *   lottie/logo.json
   *   lottie/mark-work.json
   *   lottie/mark-opinions.json
   *   lottie/mark-poetry.json
   *   lottie/mark-books.json
   *   lottie/mark-podcasts.json
   *   lottie/empty-opinions.json
   *   lottie/empty-podcasts.json
   *   lottie/emblem-atlas.json
   *   lottie/emblem-lockup.json
   *   lottie/emblem-metricare.json
   *   lottie/emblem-digishelf.json
   *   lottie/emblem-hackathon.json
   *   lottie/emblem-mars.json
   *
   * Artboard: logo 400×400; marks/empties/emblems 200×200.
   * Intro ~1.2–1.8s then optional idle loop for logo/marks.
   */

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

  async function tryLoadAnimation(slot) {
    const src = slot.getAttribute('data-lottie');
    if (!src || reduceMotion) return false;
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
    // Always try nav/hero slots
    document.querySelectorAll('.nav .lottie-slot[data-lottie], .hero .lottie-slot[data-lottie]').forEach(tryLoadAnimation);
  }

  document.addEventListener('DOMContentLoaded', () => refresh());

  window.CillianLottie = { refresh };
})();
