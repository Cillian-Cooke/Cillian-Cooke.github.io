/* ============================================
   UTMOST · workspace builder
   Loads a JSON config and renders a vertical
   slide deck of checklist pages with a dot rail.
   State resets on every load (nothing stored).
   ============================================ */

(function () {
  'use strict';

  // ---- DOM ----
  const body = document.body;
  const fileInput = document.getElementById('fileInput');
  const dropzone = document.getElementById('dropzone');
  const loaderError = document.getElementById('loaderError');
  const sampleBtn = document.getElementById('sampleBtn');
  const reloadBtn = document.getElementById('reloadBtn');
  const workspace = document.getElementById('workspace');
  const track = document.getElementById('track');
  const rail = document.getElementById('rail');
  const docNumber = document.querySelector('.doc-number');
  const docTitle = document.querySelector('.doc-title');
  const progressEl = document.querySelector('.progress');

  // ---- State ----
  let pages = [];           // [{ number, title, blocks, el, dot, done }]
  let active = -1;          // currently centered page (integer)
  let railTrack = null;     // moving strip inside the rail

  // Continuous position + inertia model
  let posF = 0;             // fractional page position (drives every transform)
  let vel = 0;              // velocity in pages/second
  let snapTarget = null;    // page to settle on when not flicking
  let rafId = null;
  let lastT = 0;

  // Rail picker geometry (measured from the DOM so CSS can change it)
  let DOT_BASE = 18;
  let DOT_PITCH = 28;

  // Drag state
  let dragging = false, dragLastY = 0, dragLastT = 0, dragVel = 0, dragMoved = false;
  let suppressClickUntil = 0;

  // Inertia tuning
  const WHEEL_IMPULSE = 0.018;  // velocity added per unit of wheel delta
  const MAX_VEL = 46;           // pages/second cap (hard scroll can flick ~20 pages)
  const SNAP_VEL = 0.7;         // below this, settle onto a page
  const FRICTION = 0.10;        // fraction of velocity kept per second (strong decay)
  const SNAP_SPEED = 16;        // settle easing rate

  // Block type aliases -> canonical
  const TYPE_ALIASES = {
    explain: 'explain', explanation: 'explain', text: 'explain', info: 'explain', note: 'explain',
    copy: 'copy', copybox: 'copy', clipboard: 'copy',
    link: 'link', tab: 'link', url: 'link',
    window: 'window', popup: 'window', newwindow: 'window', 'new-window': 'window',
    search: 'search', google: 'search', 'google-search': 'search', lookup: 'search'
  };

  // ====================================================
  //  Loading
  // ====================================================
  function showError(msg) {
    loaderError.textContent = msg;
    loaderError.hidden = false;
  }
  function clearError() {
    loaderError.hidden = true;
    loaderError.textContent = '';
  }

  function handleFile(file) {
    clearError();
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let data;
      try {
        data = JSON.parse(reader.result);
      } catch (err) {
        showError('That file is not valid JSON.\n' + err.message);
        return;
      }
      try {
        build(data);
      } catch (err) {
        showError(err.message);
      }
    };
    reader.onerror = () => showError('Could not read that file.');
    reader.readAsText(file);
  }

  // Accept pages under several key names, be lenient.
  function extractPages(data) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== 'object') return null;
    const keys = ['pages', 'sections', 'documents', 'collections', 'items'];
    for (const k of keys) {
      if (Array.isArray(data[k])) return data[k];
    }
    return null;
  }

  // ====================================================
  //  Build
  // ====================================================
  function build(data) {
    const raw = extractPages(data);
    if (!raw || raw.length === 0) {
      throw new Error('No pages found. Expected a "pages" array in the JSON.');
    }

    // Reset
    track.innerHTML = '';
    rail.innerHTML = '';
    railTrack = document.createElement('div');
    railTrack.className = 'rail-track';
    rail.appendChild(railTrack);
    pages = [];
    active = -1;
    posF = 0; vel = 0; snapTarget = null;

    raw.forEach((p, i) => {
      const number = (p.number !== undefined && p.number !== null) ? String(p.number) : String(i + 1);
      const title = p.title ? String(p.title) : 'Untitled';
      const blocks = Array.isArray(p.blocks) ? p.blocks
                   : Array.isArray(p.content) ? p.content
                   : [];

      const pageEl = buildPageEl(number, title, blocks, i);
      track.appendChild(pageEl.el);

      const dot = buildDot(number, title, i);
      railTrack.appendChild(dot);

      pages.push({ number, title, el: pageEl.el, dot, done: false });
    });

    body.classList.remove('state-empty');
    body.classList.add('state-active');
    workspace.hidden = false;
    reloadBtn.hidden = false;

    measurePitch();
    jumpTo(0);
    updateProgress();
  }

  function buildPageEl(number, title, blocks, index) {
    const el = document.createElement('section');
    el.className = 'page';
    el.dataset.index = index;

    const inner = document.createElement('div');
    inner.className = 'page-inner';

    if (blocks.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'block-explain';
      empty.style.color = 'var(--c-muted)';
      empty.textContent = 'This page has no content blocks.';
      inner.appendChild(empty);
    } else {
      blocks.forEach(b => {
        const node = buildBlock(b);
        if (node) inner.appendChild(node);
      });
    }

    // Done row
    const doneRow = document.createElement('div');
    doneRow.className = 'done-row';
    const doneBtn = document.createElement('button');
    doneBtn.type = 'button';
    doneBtn.className = 'done-btn';
    doneBtn.innerHTML =
      '<span class="check"><svg viewBox="0 0 24 24" fill="none" stroke-width="3" ' +
      'stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg></span>' +
      '<span class="done-label">Mark done</span>';
    doneBtn.addEventListener('click', () => toggleDone(index));
    doneRow.appendChild(doneBtn);
    inner.appendChild(doneRow);

    el.appendChild(inner);
    return { el };
  }

  // ---- Blocks ----
  function buildBlock(b) {
    if (!b || typeof b !== 'object') return null;
    const type = TYPE_ALIASES[String(b.type || '').toLowerCase().trim()];
    switch (type) {
      case 'explain': return blockExplain(b);
      case 'copy':    return blockCopy(b);
      case 'link':    return blockLink(b);
      case 'window':  return blockWindow(b);
      case 'search':  return blockSearch(b);
      default:        return blockUnknown(b);
    }
  }

  function withLabel(wrap, label) {
    if (label) {
      const l = document.createElement('span');
      l.className = 'block-label';
      l.textContent = label;
      wrap.appendChild(l);
    }
  }

  function blockExplain(b) {
    const wrap = document.createElement('div');
    wrap.className = 'block block-explain';
    const heading = b.title || b.heading;
    if (heading) {
      const h = document.createElement('div');
      h.className = 'explain-title';
      h.textContent = String(heading);
      wrap.appendChild(h);
    }
    const body = document.createElement('div');
    body.className = 'explain-body';
    body.textContent = String(b.text || b.body || '');
    wrap.appendChild(body);
    return wrap;
  }

  function blockCopy(b) {
    const wrap = document.createElement('div');
    wrap.className = 'block block-copy';
    withLabel(wrap, b.label);

    const text = String(b.text !== undefined ? b.text : (b.value !== undefined ? b.value : ''));

    const boxBtn = document.createElement('button');
    boxBtn.type = 'button';
    boxBtn.className = 'copy-box';
    boxBtn.title = 'Click to copy';

    const textSpan = document.createElement('span');
    textSpan.className = 'copy-text';
    textSpan.textContent = text;

    const hint = document.createElement('span');
    hint.className = 'copy-hint';
    hint.textContent = 'Copy';

    boxBtn.appendChild(textSpan);
    boxBtn.appendChild(hint);
    boxBtn.addEventListener('click', () => copyText(text, boxBtn, hint));
    wrap.appendChild(boxBtn);
    return wrap;
  }

  function blockLink(b) {
    const wrap = document.createElement('div');
    wrap.className = 'block block-link';
    const query = b.search ? String(b.search) : '';
    const url = query ? googleURL(query) : String(b.url || b.href || '');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'action-btn';
    const label = b.label || b.text || (query ? 'Search Google' : 'Open link');
    btn.innerHTML = (query ? searchIcon() : openTabIcon()) + '<span>' + escapeHtml(label) + '</span>';
    btn.addEventListener('click', () => {
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    });
    wrap.appendChild(btn);
    if (b.showUrl !== false && url) {
      wrap.appendChild(urlCaption(query ? 'Google: ' + query : url));
    }
    return wrap;
  }

  function blockWindow(b) {
    const wrap = document.createElement('div');
    wrap.className = 'block block-window';
    const query = b.search ? String(b.search) : '';
    const url = query ? googleURL(query) : String(b.url || b.href || '');
    const w = parseInt(b.width, 10) || 1024;
    const h = parseInt(b.height, 10) || 720;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'action-btn';
    const label = b.label || b.text || (query ? 'Search in new window' : 'Open window');
    btn.innerHTML = (query ? searchIcon() : newWindowIcon()) + '<span>' + escapeHtml(label) + '</span>';
    btn.addEventListener('click', () => {
      if (!url) return;
      const left = Math.max(0, Math.round((screen.width - w) / 2));
      const top = Math.max(0, Math.round((screen.height - h) / 2));
      const feat = 'noopener,noreferrer,popup=yes,width=' + w + ',height=' + h +
                   ',left=' + left + ',top=' + top;
      window.open(url, '_blank', feat);
    });
    wrap.appendChild(btn);
    if (b.showUrl !== false && url) {
      wrap.appendChild(urlCaption(query ? 'Google: ' + query : url));
    }
    return wrap;
  }

  // Click-the-box Google search (mirrors the copy box)
  function blockSearch(b) {
    const wrap = document.createElement('div');
    wrap.className = 'block block-search';
    withLabel(wrap, b.label);

    const query = String(
      b.text !== undefined ? b.text :
      b.query !== undefined ? b.query :
      b.value !== undefined ? b.value : ''
    );

    const boxBtn = document.createElement('button');
    boxBtn.type = 'button';
    boxBtn.className = 'search-box';
    boxBtn.title = 'Click to search Google';

    const textSpan = document.createElement('span');
    textSpan.className = 'search-text';
    textSpan.textContent = query;

    const hint = document.createElement('span');
    hint.className = 'search-hint';
    hint.innerHTML = searchIcon() + '<span>Search</span>';

    boxBtn.appendChild(textSpan);
    boxBtn.appendChild(hint);
    boxBtn.addEventListener('click', () => {
      if (query) window.open(googleURL(query), '_blank', 'noopener,noreferrer');
    });
    wrap.appendChild(boxBtn);
    return wrap;
  }

  function blockUnknown(b) {
    const wrap = document.createElement('div');
    wrap.className = 'block block-unknown';
    wrap.textContent = 'Unknown block type: "' + (b.type || '(missing)') + '"';
    return wrap;
  }

  function urlCaption(url) {
    const c = document.createElement('span');
    c.className = 'action-url';
    c.textContent = url;
    return c;
  }

  // ---- Copy ----
  function copyText(text, box, hint) {
    const done = () => {
      box.classList.add('copied');
      hint.textContent = 'Copied';
      clearTimeout(box._t);
      box._t = setTimeout(() => {
        box.classList.remove('copied');
        hint.textContent = 'Copy';
      }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => legacyCopy(text, done));
    } else {
      legacyCopy(text, done);
    }
  }
  function legacyCopy(text, cb) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    cb();
  }

  // ====================================================
  //  Dot rail
  // ====================================================
  function buildDot(number, title, index) {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'dot';
    dot.dataset.index = index;
    dot.setAttribute('aria-label', number + ' ' + title);

    const num = document.createElement('span');
    num.className = 'dot-num';
    num.textContent = number;
    dot.appendChild(num);

    const label = document.createElement('span');
    label.className = 'dot-label';
    label.innerHTML = '<span class="dl-num">' + escapeHtml(number) + '</span>' + escapeHtml(title);
    dot.appendChild(label);

    dot.addEventListener('click', () => {
      if (performance.now() < suppressClickUntil) return; // ignore the click that ends a drag
      glideTo(index);
    });
    return dot;
  }

  // ====================================================
  //  Done state
  // ====================================================
  function toggleDone(index) {
    const p = pages[index];
    p.done = !p.done;
    p.el.classList.toggle('is-done', p.done);
    p.dot.classList.toggle('done', p.done);
    const label = p.el.querySelector('.done-label');
    if (label) label.textContent = p.done ? 'Done' : 'Mark done';
    updateProgress();

    // When a page is marked done (not when un-done), slide to the next page.
    if (p.done && index === active && index < pages.length - 1) {
      setTimeout(() => { if (active === index) navigate(index + 1, true); }, 220);
    }
  }

  function updateProgress() {
    const total = pages.length;
    const done = pages.filter(p => p.done).length;
    progressEl.textContent = done + ' / ' + total + ' done';
  }

  // ====================================================
  //  Navigation - continuous position with inertia
  // ====================================================
  function clampPos(v) { return Math.max(0, Math.min(pages.length - 1, v)); }
  function isActive() { return body.classList.contains('state-active'); }

  // Measure dot size + gap so the rail centering stays exact across breakpoints
  function measurePitch() {
    if (!pages.length || !railTrack) return;
    const base = pages[0].dot.offsetHeight || 18;   // transforms don't change the layout box
    const cs = getComputedStyle(railTrack);
    const gap = parseFloat(cs.rowGap || cs.gap) || 10;
    DOT_BASE = base;
    DOT_PITCH = base + gap;
  }

  function navigate(index, animate) {
    if (animate === false) jumpTo(index);
    else glideTo(index);
  }
  function jumpTo(index) {
    posF = clampPos(index);
    vel = 0; snapTarget = null; active = -1;
    render();
  }
  function glideTo(index) {
    snapTarget = clampPos(index);
    vel = 0;
    startLoop();
  }
  function go(delta) { glideTo(Math.round(posF) + delta); }

  // Paint the content deck + the rail picker from posF
  function render() {
    const N = pages.length;
    if (!N) return;
    track.style.transform = 'translateY(' + (-posF * 100) + '%)';

    const railH = rail.clientHeight || 0;
    if (railTrack) {
      railTrack.style.transform =
        'translateY(' + (railH / 2 - posF * DOT_PITCH - DOT_BASE / 2) + 'px)';
    }
    // Centered page is largest; neighbours shrink and fade with distance
    for (let i = 0; i < N; i++) {
      const dist = Math.abs(i - posF);
      const s = Math.max(0.5, 1.5 - dist * 0.22);
      const o = Math.max(0.2, 1 - dist * 0.13);
      const dot = pages[i].dot;
      dot.style.transform = 'scale(' + s.toFixed(3) + ')';
      dot.style.opacity = o.toFixed(3);
    }
    const ai = Math.round(posF);
    if (ai !== active) { active = ai; onActiveChange(); }
  }

  function onActiveChange() {
    const p = pages[active];
    if (!p) return;
    docNumber.textContent = p.number;
    docTitle.textContent = p.title;
    pages.forEach((q, i) => q.dot.classList.toggle('active', i === active));
    p.el.scrollTop = 0;
  }

  // Animation loop: apply inertia, then settle onto a page
  function startLoop() { if (rafId == null) { lastT = 0; rafId = requestAnimationFrame(loop); } }
  function loop(t) {
    const dt = lastT ? Math.min((t - lastT) / 1000, 0.05) : 0.016;
    lastT = t;

    if (dragging) { render(); rafId = requestAnimationFrame(loop); return; }

    let moving = false;
    if (Math.abs(vel) > 0.0001) {
      posF += vel * dt;
      vel *= Math.pow(FRICTION, dt);
      if (posF <= 0) { posF = 0; vel = 0; }
      else if (posF >= pages.length - 1) { posF = pages.length - 1; vel = 0; }
      if (Math.abs(vel) < SNAP_VEL) vel = 0;
      moving = true;
    } else {
      const target = (snapTarget != null) ? snapTarget : Math.round(posF);
      const d = target - posF;
      if (Math.abs(d) > 0.002) { posF += d * Math.min(1, dt * SNAP_SPEED); moving = true; }
      else { posF = target; snapTarget = null; }
    }

    render();
    if (moving) rafId = requestAnimationFrame(loop);
    else { rafId = null; lastT = 0; }
  }

  function addImpulse(deltaY, mode) {
    let d = deltaY;
    if (mode === 1) d *= 16; else if (mode === 2) d *= window.innerHeight;
    vel = Math.max(-MAX_VEL, Math.min(MAX_VEL, vel + d * WHEEL_IMPULSE));
    snapTarget = null;
    startLoop();
  }

  // Wheel over content: scroll a tall page internally, otherwise flick through pages
  function onWheel(e) {
    if (!isActive()) return;
    const page = pages[active] && pages[active].el;
    if (!page) return;
    const atTop = page.scrollTop <= 0;
    const atBottom = page.scrollTop + page.clientHeight >= page.scrollHeight - 1;
    const down = e.deltaY > 0;
    const flicking = Math.abs(vel) > 0.15;
    if (!flicking && ((down && !atBottom) || (!down && !atTop))) return; // let the page scroll
    e.preventDefault();
    addImpulse(e.deltaY, e.deltaMode);
  }

  // Wheel over the rail always flicks pages (no internal scroll there)
  function onRailWheel(e) {
    if (!isActive()) return;
    e.preventDefault();
    e.stopPropagation();
    addImpulse(e.deltaY, e.deltaMode);
  }

  // ---- Drag the rail like a scrollbar, with release momentum ----
  function railDown(e) {
    if (!isActive()) return;
    dragging = true; dragMoved = false;
    dragLastY = e.clientY; dragLastT = performance.now(); dragVel = 0;
    vel = 0; snapTarget = null;
    rail.classList.add('scrubbing');
    try { rail.setPointerCapture(e.pointerId); } catch (_) {}
    startLoop();
  }
  function railMove(e) {
    if (!dragging) return;
    const now = performance.now();
    const dy = e.clientY - dragLastY;
    if (Math.abs(dy) > 2) dragMoved = true;
    posF = clampPos(posF + dy / DOT_PITCH);
    const dts = (now - dragLastT) / 1000;
    if (dts > 0) dragVel = (dy / DOT_PITCH) / dts; // pages/sec
    dragLastY = e.clientY; dragLastT = now;
    render();
  }
  function railUp(e) {
    if (!dragging) return;
    dragging = false;
    rail.classList.remove('scrubbing');
    try { rail.releasePointerCapture(e.pointerId); } catch (_) {}
    if (dragMoved) {
      vel = Math.max(-MAX_VEL, Math.min(MAX_VEL, dragVel * 0.5)); // fling on release
      snapTarget = null;
      suppressClickUntil = performance.now() + 250;
    }
    startLoop();
  }

  // Keyboard
  function onKey(e) {
    if (!isActive()) return;
    if (['ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); go(1); }
    else if (['ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); go(-1); }
    else if (e.key === 'Home') { e.preventDefault(); glideTo(0); }
    else if (e.key === 'End') { e.preventDefault(); glideTo(pages.length - 1); }
  }

  // Touch swipe on content (tall pages scroll inside; at the edge a swipe flicks)
  let touchY = null;
  function onTouchStart(e) { touchY = e.touches[0].clientY; }
  function onTouchEnd(e) {
    if (touchY === null || !isActive()) return;
    const page = pages[active].el;
    const dy = e.changedTouches[0].clientY - touchY;
    touchY = null;
    if (Math.abs(dy) < 40) return;
    const atTop = page.scrollTop <= 0;
    const atBottom = page.scrollTop + page.clientHeight >= page.scrollHeight - 1;
    if (dy < 0 && atBottom) go(1);
    else if (dy > 0 && atTop) go(-1);
  }

  // ====================================================
  //  Helpers
  // ====================================================
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }
  function openTabIcon() {
    return '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M15 3h6v6"/><path d="M10 14L21 3"/>' +
      '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>';
  }
  function newWindowIcon() {
    return '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/></svg>';
  }
  function searchIcon() {
    return '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>';
  }
  function googleURL(q) {
    return 'https://www.google.com/search?q=' + encodeURIComponent(q);
  }

  // ====================================================
  //  Sample file
  // ====================================================
  function downloadSample() {
    const sample = {
      title: 'Sample workspace',
      pages: [
        {
          number: '1', title: 'Welcome',
          blocks: [
            { type: 'explain', title: 'What this is', text: 'This is a sample Utmost workspace.\nEach page is a checklist step. Use the dots on the right to jump around, and the button at the bottom to mark a page done.' },
            { type: 'copy', label: 'Copy this token', text: 'UTMOST-2026-XYZ-001' }
          ]
        },
        {
          number: 'II', title: 'Links, windows & search',
          blocks: [
            { type: 'explain', text: 'You can mix any number of blocks on a page.' },
            { type: 'link', label: 'Open documentation', url: 'https://example.com/docs' },
            { type: 'window', label: 'Open dashboard popup', url: 'https://example.com/app', width: 1100, height: 760 },
            { type: 'search', label: 'Click to Google this', text: 'how to use Utmost workspace' },
            { type: 'window', label: 'Google this in a window', search: 'corporate onboarding checklist' }
          ]
        },
        {
          number: 'C', title: 'Numbers can be anything',
          blocks: [
            { type: 'explain', text: 'The "number" is just a string, so 1, II, C, or anything works. It shows in the header and inside the dot.' },
            { type: 'copy', label: 'Snippet', text: 'npm install && npm run build' }
          ]
        }
      ]
    };
    const blob = new Blob([JSON.stringify(sample, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'utmost-sample.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ====================================================
  //  Wiring
  // ====================================================
  fileInput.addEventListener('change', e => handleFile(e.target.files[0]));

  ['dragenter', 'dragover'].forEach(ev =>
    dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.add('dragover'); })
  );
  ['dragleave', 'drop'].forEach(ev =>
    dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.remove('dragover'); })
  );
  dropzone.addEventListener('drop', e => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    handleFile(file);
  });

  sampleBtn.addEventListener('click', downloadSample);

  reloadBtn.addEventListener('click', () => {
    body.classList.remove('state-active');
    body.classList.add('state-empty');
    workspace.hidden = true;
    reloadBtn.hidden = true;
    fileInput.value = '';
    clearError();
  });

  workspace.addEventListener('wheel', onWheel, { passive: false });
  document.addEventListener('keydown', onKey);
  workspace.addEventListener('touchstart', onTouchStart, { passive: true });
  workspace.addEventListener('touchend', onTouchEnd, { passive: true });

  // Rail scrub + wheel + responsive sizing
  rail.addEventListener('pointerdown', railDown);
  rail.addEventListener('pointermove', railMove);
  rail.addEventListener('pointerup', railUp);
  rail.addEventListener('pointercancel', railUp);
  rail.addEventListener('wheel', onRailWheel, { passive: false });
  window.addEventListener('resize', () => { if (pages.length) { measurePitch(); render(); } });
})();
