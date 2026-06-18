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
  let pages = [];        // [{ number, title, blocks, el, dot, done }]
  let active = 0;
  let navLock = false;

  // Block type aliases -> canonical
  const TYPE_ALIASES = {
    explain: 'explain', explanation: 'explain', text: 'explain', info: 'explain', note: 'explain',
    copy: 'copy', copybox: 'copy', clipboard: 'copy',
    link: 'link', tab: 'link', url: 'link',
    window: 'window', popup: 'window', newwindow: 'window', 'new-window': 'window'
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
    pages = [];
    active = 0;

    raw.forEach((p, i) => {
      const number = (p.number !== undefined && p.number !== null) ? String(p.number) : String(i + 1);
      const title = p.title ? String(p.title) : 'Untitled';
      const blocks = Array.isArray(p.blocks) ? p.blocks
                   : Array.isArray(p.content) ? p.content
                   : [];

      const pageEl = buildPageEl(number, title, blocks, i);
      track.appendChild(pageEl.el);

      const dot = buildDot(number, title, i);
      rail.appendChild(dot);

      pages.push({ number, title, el: pageEl.el, dot, done: false });
    });

    body.classList.remove('state-empty');
    body.classList.add('state-active');
    workspace.hidden = false;
    reloadBtn.hidden = false;

    navigate(0, false);
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
    const url = String(b.url || b.href || '');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'action-btn';
    btn.innerHTML = openTabIcon() + '<span>' + escapeHtml(b.label || b.text || 'Open link') + '</span>';
    btn.addEventListener('click', () => {
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    });
    wrap.appendChild(btn);
    if (b.showUrl !== false && url) wrap.appendChild(urlCaption(url));
    return wrap;
  }

  function blockWindow(b) {
    const wrap = document.createElement('div');
    wrap.className = 'block block-window';
    const url = String(b.url || b.href || '');
    const w = parseInt(b.width, 10) || 1024;
    const h = parseInt(b.height, 10) || 720;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'action-btn';
    btn.innerHTML = newWindowIcon() + '<span>' + escapeHtml(b.label || b.text || 'Open window') + '</span>';
    btn.addEventListener('click', () => {
      if (!url) return;
      const left = Math.max(0, Math.round((screen.width - w) / 2));
      const top = Math.max(0, Math.round((screen.height - h) / 2));
      const feat = 'noopener,noreferrer,popup=yes,width=' + w + ',height=' + h +
                   ',left=' + left + ',top=' + top;
      window.open(url, '_blank', feat);
    });
    wrap.appendChild(btn);
    if (b.showUrl !== false && url) wrap.appendChild(urlCaption(url));
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

    dot.addEventListener('click', () => navigate(index, true));
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
  }

  function updateProgress() {
    const total = pages.length;
    const done = pages.filter(p => p.done).length;
    progressEl.textContent = done + ' / ' + total + ' done';
  }

  // ====================================================
  //  Navigation (vertical slide)
  // ====================================================
  function navigate(index, animate) {
    index = Math.max(0, Math.min(pages.length - 1, index));
    active = index;

    if (!animate) {
      const prev = track.style.transition;
      track.style.transition = 'none';
      track.style.transform = 'translateY(-' + index * 100 + '%)';
      // force reflow then restore transition
      void track.offsetHeight;
      track.style.transition = prev;
    } else {
      navLock = true;
      track.style.transform = 'translateY(-' + index * 100 + '%)';
      setTimeout(() => { navLock = false; }, 620);
    }

    // Reset incoming page scroll to top so the slide reads cleanly
    pages[index].el.scrollTop = 0;

    // Header
    docNumber.textContent = pages[index].number;
    docTitle.textContent = pages[index].title;

    // Dots
    pages.forEach((p, i) => p.dot.classList.toggle('active', i === index));
    pages[index].dot.scrollIntoView({ block: 'nearest' });
  }

  function go(delta) { navigate(active + delta, true); }

  // Wheel: slide pages only at the scroll edges, so tall pages still scroll inside.
  function onWheel(e) {
    if (!body.classList.contains('state-active')) return;
    const page = pages[active].el;
    const atTop = page.scrollTop <= 0;
    const atBottom = page.scrollTop + page.clientHeight >= page.scrollHeight - 1;
    if (e.deltaY > 0 && atBottom) {
      e.preventDefault();
      if (!navLock && active < pages.length - 1) go(1);
    } else if (e.deltaY < 0 && atTop) {
      e.preventDefault();
      if (!navLock && active > 0) go(-1);
    }
  }

  // Keyboard
  function onKey(e) {
    if (!body.classList.contains('state-active')) return;
    if (['ArrowDown', 'PageDown'].includes(e.key)) { e.preventDefault(); go(1); }
    else if (['ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); go(-1); }
    else if (e.key === 'Home') { e.preventDefault(); navigate(0, true); }
    else if (e.key === 'End') { e.preventDefault(); navigate(pages.length - 1, true); }
  }

  // Touch (swipe between pages at the edges)
  let touchY = null;
  function onTouchStart(e) { touchY = e.touches[0].clientY; }
  function onTouchEnd(e) {
    if (touchY === null || !body.classList.contains('state-active')) return;
    const page = pages[active].el;
    const dy = e.changedTouches[0].clientY - touchY;
    touchY = null;
    if (Math.abs(dy) < 60 || navLock) return;
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
          number: 'II', title: 'Links & windows',
          blocks: [
            { type: 'explain', text: 'You can mix any number of blocks on a page.' },
            { type: 'link', label: 'Open documentation', url: 'https://example.com/docs' },
            { type: 'window', label: 'Open dashboard popup', url: 'https://example.com/app', width: 1100, height: 760 }
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
})();
