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

  function waitFonts(families) {
    if (!document.fonts || !families.length) return Promise.resolve();
    return Promise.all(
      families.map((f) => document.fonts.load(f).catch(() => null))
    ).then(() => document.fonts.ready.catch(() => null));
  }

  function revealSlot(slot, canvas) {
    canvas.style.opacity = '1';
    slot.setAttribute('data-loaded', 'true');
  }

  function bindHoverPlay(slot, anim, holdFrame) {
    const trigger = slot.closest('[data-lottie-hover]') || slot;
    if (trigger.dataset.lottieHoverBound === 'true') return;
    trigger.dataset.lottieHoverBound = 'true';

    const rest = () => {
      anim.loop = false;
      anim.goToAndStop(holdFrame, true);
    };

    trigger.addEventListener('pointerenter', () => {
      if (reduceMotion) return;
      anim.loop = slot.getAttribute('data-loop') !== 'false';
      anim.goToAndPlay(holdFrame, true);
    });

    trigger.addEventListener('pointerleave', rest);
    trigger.addEventListener('focusin', () => {
      if (reduceMotion) return;
      anim.loop = slot.getAttribute('data-loop') !== 'false';
      anim.goToAndPlay(holdFrame, true);
    });
    trigger.addEventListener('focusout', rest);
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
      if (old) {
        old.innerHTML = '';
        old.style.opacity = '0';
      }
      const trigger = slot.closest('[data-lottie-hover]');
      if (trigger) delete trigger.dataset.lottieHoverBound;
    }

    if (loaded.has(slot)) return true;

    try {
      const res = await fetch(src, { method: 'GET' });
      if (!res.ok) return false;
      const data = await res.json();

      // Avoid Syne FOUT / glyph pop on the home name Lottie
      if (slot.id === 'name-hero' || (data.fonts && data.fonts.list && data.fonts.list.length)) {
        await waitFonts(['700 64px Syne', '700 1em Syne']);
      }

      const lib = await loadLottieLib();
      if (!lib) return false;

      let canvas = slot.querySelector('.lottie-canvas');
      if (!canvas) {
        canvas = document.createElement('div');
        canvas.className = 'lottie-canvas';
        slot.appendChild(canvas);
      }
      canvas.innerHTML = '';
      canvas.style.opacity = '0';

      const playMode = slot.getAttribute('data-play');
      const hover = playMode === 'hover';
      const loop = !hover && slot.getAttribute('data-loop') !== 'false';
      const holdFrame = Number(slot.getAttribute('data-hold-frame') || 70);

      const anim = lib.loadAnimation({
        container: canvas,
        renderer: 'svg',
        loop: hover ? false : loop,
        autoplay: false,
        animationData: data,
      });

      const arm = () => {
        if (hover) {
          anim.goToAndStop(holdFrame, true);
          bindHoverPlay(slot, anim, holdFrame);
        } else {
          anim.goToAndPlay(0, true);
        }
        // Next frame so the SVG is painted before we hide the fallback
        requestAnimationFrame(() => {
          requestAnimationFrame(() => revealSlot(slot, canvas));
        });
      };

      if (anim.isLoaded) {
        arm();
      } else {
        anim.addEventListener('DOMLoaded', arm);
      }

      loaded.set(slot, anim);
      return true;
    } catch (_) {
      return false;
    }
  }

  function refresh(root) {
    const scope = root || document;
    scope.querySelectorAll('.lottie-slot[data-lottie]').forEach((slot) => {
      const panel = slot.closest('.panel');
      if (panel && !panel.classList.contains('active') && !slot.closest('.nav')) {
        return;
      }
      tryLoadAnimation(slot);
    });
    document.querySelectorAll('.nav .lottie-slot[data-lottie], .spine-home .lottie-slot[data-lottie]').forEach((slot) => {
      tryLoadAnimation(slot);
    });
  }

  /** Soft replay — seek to start without destroy (avoids fallback flash). */
  function replay(selector) {
    const slot = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!slot) return Promise.resolve(false);
    if (loaded.has(slot)) {
      const anim = loaded.get(slot);
      try {
        anim.goToAndPlay(0, true);
        return Promise.resolve(true);
      } catch (_) {
        return tryLoadAnimation(slot, { force: true });
      }
    }
    return tryLoadAnimation(slot);
  }

  document.addEventListener('DOMContentLoaded', () => refresh());

  window.CillianLottie = { refresh, replay };
})();
