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
  const saveJsonBtn = document.getElementById('saveJsonBtn');
  const qcToggle = document.getElementById('qcToggle');
  const qcBackdrop = document.getElementById('qcBackdrop');
  const workspace = document.getElementById('workspace');
  const track = document.getElementById('track');
  const rail = document.getElementById('rail');
  const qcPanel = document.getElementById('qcPanel');
  const docNumber = document.querySelector('.doc-number');
  const docTitle = document.querySelector('.doc-title');
  const progressEl = document.querySelector('.progress');

  // ---- State ----
  let pages = [];           // [{ number, title, blocks, el, dot, done }]
  let active = -1;          // currently centered page (integer)
  let railTrack = null;     // moving strip inside the rail
  let workspaceTitle = '';  // top-level title from the loaded JSON

  // Continuous position + inertia model
  let posF = 0;             // fractional page position (drives every transform)
  let vel = 0;              // velocity in pages/second
  let snapTarget = null;    // page to settle on when not flicking
  let rafId = null;
  let lastT = 0;


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
    search: 'search', google: 'search', 'google-search': 'search', lookup: 'search',
    help: 'help', hint: 'help', tip: 'help'
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

    workspaceTitle = (data && data.title) ? String(data.title) : '';

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
    saveJsonBtn.hidden = false;
    buildQuickCopyPanel();

    jumpTo(0);
    updateProgress();
  }

  function buildPageEl(number, title, blocks, index) {
    const el = document.createElement('section');
    el.className = 'page';
    el.dataset.index = index;

    const inner = document.createElement('div');
    inner.className = 'page-inner';
    const registry = {};  // shared placeholder input registry for this page
    el._inputRegistry = registry;
    setupPageDrag(inner);

    if (blocks.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'block-explain';
      empty.style.color = 'var(--c-muted)';
      empty.textContent = 'This page has no content blocks.';
      inner.appendChild(empty);
    } else {
      blocks.forEach(b => {
        const node = buildBlock(b, registry);
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

    // Permanent "Add block" button — always visible, not tied to an edit mode
    const addRow = buildAddBlockRow(index);
    inner.appendChild(addRow);

    inner.appendChild(doneRow);

    el.appendChild(inner);
    return { el };
  }

  // ---- Blocks ----
  function buildBlock(b, registry) {
    if (!b || typeof b !== 'object') return null;
    const type = TYPE_ALIASES[String(b.type || '').toLowerCase().trim()] || 'unknown';

    const wrap = document.createElement('div');
    wrap.className = 'block block-' + type;
    wrap._bd = Object.assign({}, b);
    wrap._bt = type;
    wrap._registry = registry || {};

    // Header row: drag handle (left) + label + edit/delete buttons (right, on hover)
    const hdr = document.createElement('div');
    hdr.className = 'block-hdr';

    const handle = document.createElement('span');
    handle.className = 'block-drag-handle';
    handle.setAttribute('aria-hidden', 'true');
    handle.innerHTML = dragIcon();
    hdr.appendChild(handle);

    const lbl = document.createElement('span');
    lbl.className = 'block-label';
    if (b.label) { lbl.textContent = String(b.label); } else { lbl.hidden = true; }
    hdr.appendChild(lbl);

    if (type !== 'unknown') {
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'block-edit-btn';
      editBtn.setAttribute('aria-label', 'Edit block');
      editBtn.innerHTML = pencilIcon();
      editBtn.addEventListener('click', e => { e.stopPropagation(); openEditor(wrap); });
      hdr.appendChild(editBtn);

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'block-delete-btn';
      delBtn.setAttribute('aria-label', 'Delete block');
      delBtn.innerHTML = trashIcon();
      delBtn.addEventListener('click', e => { e.stopPropagation(); deleteBlock(wrap); });
      hdr.appendChild(delBtn);
    }

    wrap.draggable = true;
    wrap.appendChild(hdr);
    renderBlockInner(wrap);
    return wrap;
  }

  function renderBlockInner(wrap) {
    const old = wrap.querySelector('.block-inner');
    if (old) old.remove();

    const inner = document.createElement('div');
    inner.className = 'block-inner';
    const b = wrap._bd;
    const reg = wrap._registry;

    switch (wrap._bt) {
      case 'explain': fillExplain(inner, b); break;
      case 'help':    fillHelp(inner, b); break;
      case 'copy':    fillCopy(inner, b, reg); break;
      case 'link':    fillLink(inner, b); break;
      case 'window':  fillWindow(inner, b, reg); break;
      case 'search':  fillSearch(inner, b, reg); break;
      default:        fillUnknown(inner, b); break;
    }

    // Sync the header label after a save
    const lbl = wrap.querySelector('.block-hdr .block-label');
    if (lbl) {
      if (b.label) { lbl.textContent = String(b.label); lbl.hidden = false; }
      else { lbl.textContent = ''; lbl.hidden = true; }
    }

    wrap.appendChild(inner);
  }

  function fillExplain(inner, b) {
    const heading = b.title || b.heading;
    if (heading) {
      const h = document.createElement('div');
      h.className = 'explain-title';
      h.textContent = String(heading);
      inner.appendChild(h);
    }
    const body = document.createElement('div');
    body.className = 'explain-body';
    body.textContent = String(b.text || b.body || '');
    inner.appendChild(body);
  }

  function fillHelp(inner, b) {
    const heading = b.title || b.heading;
    if (heading) {
      const h = document.createElement('div');
      h.className = 'help-title';
      h.textContent = String(heading);
      inner.appendChild(h);
    }
    const body = document.createElement('div');
    body.className = 'help-body';
    body.textContent = String(b.text || b.body || '');
    inner.appendChild(body);
  }

  // ---- Template placeholder helpers ----
  // Parses [placeholder] tokens from a text string, returns unique names in order.
  function parsePlaceholders(text) {
    const names = [], seen = new Set();
    let m;
    const re = /\[([^\]]+)\]/g;
    while ((m = re.exec(text)) !== null) {
      const name = m[1].trim();
      if (name && !seen.has(name)) { seen.add(name); names.push(name); }
    }
    return names;
  }

  // Builds fill-in inputs and appends them to container. Returns name→input map.
  // registry is a page-level object; if a name already exists in it, the existing
  // input is reused (no new DOM node) so all blocks sharing [name] stay in sync.
  function buildTemplateInputs(container, placeholders, registry) {
    registry = registry || {};
    const div = document.createElement('div');
    div.className = 'template-inputs';
    const map = {};
    let hasNew = false;
    placeholders.forEach(name => {
      if (registry[name]) {
        map[name] = registry[name]; // reuse — no new input rendered here
      } else {
        const field = document.createElement('div');
        field.className = 'template-field';
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'template-input';
        inp.placeholder = name;
        inp.setAttribute('aria-label', name);
        map[name] = inp;
        registry[name] = inp;
        field.appendChild(inp);
        div.appendChild(field);
        hasNew = true;
      }
    });
    if (hasNew) container.appendChild(div);
    return map;
  }

  // Returns innerHTML that highlights filled vs. unfilled placeholders.
  function renderTemplateHtml(templateText, inputMap) {
    let html = '', lastIndex = 0;
    const re = /\[([^\]]+)\]/g;
    let m;
    while ((m = re.exec(templateText)) !== null) {
      const name = m[1].trim();
      const val = inputMap[name] ? inputMap[name].value : '';
      html += escapeHtml(templateText.slice(lastIndex, m.index));
      html += val
        ? '<mark class="tmpl-filled">' + escapeHtml(val) + '</mark>'
        : '<span class="tmpl-empty">' + escapeHtml('[' + name + ']') + '</span>';
      lastIndex = m.index + m[0].length;
    }
    html += escapeHtml(templateText.slice(lastIndex));
    return html;
  }

  // Returns plain text with placeholders replaced by input values (empty string if blank).
  function getFilledText(templateText, inputMap) {
    return templateText.replace(/\[([^\]]+)\]/g, (_, name) => {
      const key = name.trim();
      return (inputMap[key] && inputMap[key].value) ? inputMap[key].value : '';
    });
  }

  function fillCopy(inner, b, registry) {
    const template = String(b.text !== undefined ? b.text : (b.value !== undefined ? b.value : ''));
    const placeholders = parsePlaceholders(template);
    let inputMap = {};
    if (placeholders.length > 0) inputMap = buildTemplateInputs(inner, placeholders, registry);

    const boxBtn = document.createElement('button');
    boxBtn.type = 'button';
    boxBtn.className = 'copy-box';
    boxBtn.title = 'Click to copy';
    const textSpan = document.createElement('span');
    textSpan.className = 'copy-text';
    const hint = document.createElement('span');
    hint.className = 'copy-hint';
    hint.textContent = 'Copy';
    boxBtn.appendChild(textSpan);
    boxBtn.appendChild(hint);

    if (placeholders.length > 0) {
      const update = () => { textSpan.innerHTML = renderTemplateHtml(template, inputMap); };
      update();
      placeholders.forEach(name => inputMap[name].addEventListener('input', update));
      boxBtn.addEventListener('click', () => copyText(getFilledText(template, inputMap), boxBtn, hint));
    } else {
      textSpan.textContent = template;
      boxBtn.addEventListener('click', () => copyText(template, boxBtn, hint));
    }

    inner.appendChild(boxBtn);
  }

  function fillLink(inner, b) {
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
    inner.appendChild(btn);
    if (b.showUrl !== false && url) {
      inner.appendChild(urlCaption(query ? 'Google: ' + query : url));
    }
  }

  function fillWindow(inner, b, registry) {
    const isSearch = !!b.search;
    const template = isSearch ? String(b.search) : String(b.url || b.href || '');
    const placeholders = parsePlaceholders(template);
    let inputMap = {};
    if (placeholders.length > 0) inputMap = buildTemplateInputs(inner, placeholders, registry);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'action-btn';
    const label = b.label || b.text || (isSearch ? 'Search in window' : 'Open in browser window');
    btn.innerHTML = (isSearch ? searchIcon() : newWindowIcon()) + '<span>' + escapeHtml(label) + '</span>';

    btn.addEventListener('click', () => {
      const filled = placeholders.length > 0 ? getFilledText(template, inputMap) : template;
      if (!filled) return;
      const target = isSearch ? googleURL(filled) : filled;
      window.open(target, 'utmost_ref', 'noopener,noreferrer');
    });

    inner.appendChild(btn);
    if (b.showUrl !== false && template && placeholders.length === 0) {
      inner.appendChild(urlCaption(isSearch ? 'Google: ' + template : template));
    }
  }

  // Click-the-box Google search (mirrors the copy box)
  function fillSearch(inner, b, registry) {
    const template = String(
      b.text !== undefined ? b.text :
      b.query !== undefined ? b.query :
      b.value !== undefined ? b.value : ''
    );
    const placeholders = parsePlaceholders(template);
    let inputMap = {};
    if (placeholders.length > 0) inputMap = buildTemplateInputs(inner, placeholders, registry);

    const boxBtn = document.createElement('button');
    boxBtn.type = 'button';
    boxBtn.className = 'search-box';
    boxBtn.title = 'Click to search Google';
    const textSpan = document.createElement('span');
    textSpan.className = 'search-text';
    const hint = document.createElement('span');
    hint.className = 'search-hint';
    hint.innerHTML = searchIcon() + '<span>Search</span>';
    boxBtn.appendChild(textSpan);
    boxBtn.appendChild(hint);

    if (placeholders.length > 0) {
      const update = () => { textSpan.innerHTML = renderTemplateHtml(template, inputMap); };
      update();
      placeholders.forEach(name => inputMap[name].addEventListener('input', update));
      boxBtn.addEventListener('click', () => {
        const q = getFilledText(template, inputMap);
        if (q) window.open(googleURL(q), '_blank', 'noopener,noreferrer');
      });
    } else {
      textSpan.textContent = template;
      boxBtn.addEventListener('click', () => {
        if (template) window.open(googleURL(template), '_blank', 'noopener,noreferrer');
      });
    }

    inner.appendChild(boxBtn);
  }

  function fillUnknown(inner, b) {
    inner.textContent = 'Unknown block type: "' + (b.type || '(missing)') + '"';
  }

  // ---- Inline block editor ----
  function pencilIcon() {
    return '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>';
  }
  function trashIcon() {
    return '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>' +
      '<path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>';
  }

  function deleteBlock(wrap) {
    if (!confirm('Delete this block?')) return;
    const form = wrap.querySelector('.block-editor');
    if (form) closeEditor(wrap, form);
    wrap.remove();
  }

  function getEditorFields(type) {
    switch (type) {
      case 'explain':
        return [
          { key: 'title', label: 'Title (optional)' },
          { key: 'text',  label: 'Body text', multiline: true }
        ];
      case 'help':
        return [
          { key: 'title', label: 'Title (optional)' },
          { key: 'text',  label: 'Hint text', multiline: true }
        ];
      case 'copy':
        return [
          { key: 'label', label: 'Label (optional)' },
          { key: 'text',  label: 'Text to copy', multiline: true }
        ];
      case 'link':
        return [
          { key: 'label', label: 'Button label' },
          { key: 'url',   label: 'URL', inputType: 'url' }
        ];
      case 'window':
        return [
          { key: 'label',  label: 'Button label' },
          { key: 'url',    label: 'URL', inputType: 'url' },
          { key: 'width',  label: 'Width (px)', inputType: 'number' },
          { key: 'height', label: 'Height (px)', inputType: 'number' }
        ];
      case 'search':
        return [
          { key: 'label', label: 'Label (optional)' },
          { key: 'text',  label: 'Search query', multiline: true }
        ];
      default:
        return [];
    }
  }

  function openEditor(wrap) {
    if (wrap.querySelector('.block-editor')) return;

    const inner = wrap.querySelector('.block-inner');
    if (inner) inner.hidden = true;
    const editBtn = wrap.querySelector('.block-edit-btn');
    if (editBtn) editBtn.hidden = true;

    const b = wrap._bd;
    const form = document.createElement('div');
    form.className = 'block-editor';

    getEditorFields(wrap._bt).forEach(({ key, label, multiline, inputType }) => {
      const fieldDiv = document.createElement('div');
      fieldDiv.className = 'editor-field';
      const lbl = document.createElement('label');
      lbl.className = 'editor-label';
      lbl.textContent = label;
      fieldDiv.appendChild(lbl);
      let input;
      if (multiline) {
        input = document.createElement('textarea');
        input.className = 'editor-input editor-textarea';
        input.rows = 3;
      } else {
        input = document.createElement('input');
        input.type = inputType || 'text';
        input.className = 'editor-input';
      }
      input.value = b[key] !== undefined ? String(b[key]) : '';
      input.dataset.key = key;
      // Escape cancels the editor
      input.addEventListener('keydown', e => { if (e.key === 'Escape') closeEditor(wrap, form); });
      fieldDiv.appendChild(input);
      form.appendChild(fieldDiv);
    });

    const btnRow = document.createElement('div');
    btnRow.className = 'editor-btns';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'editor-save';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', () => saveEditor(wrap, form));
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'editor-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => closeEditor(wrap, form));
    btnRow.appendChild(saveBtn);
    btnRow.appendChild(cancelBtn);
    form.appendChild(btnRow);

    wrap.appendChild(form);
    const first = form.querySelector('input, textarea');
    if (first) first.focus({ preventScroll: true });
  }

  function saveEditor(wrap, form) {
    form.querySelectorAll('[data-key]').forEach(input => {
      wrap._bd[input.dataset.key] = input.value;
    });
    closeEditor(wrap, form);
    renderBlockInner(wrap);
  }

  function closeEditor(wrap, form) {
    form.remove();
    const inner = wrap.querySelector('.block-inner');
    if (inner) inner.hidden = false;
    const editBtn = wrap.querySelector('.block-edit-btn');
    if (editBtn) editBtn.hidden = false;
  }

  // ---- Block drag-to-reorder (always on, no edit mode needed) ----
  function dragIcon() {
    return '<svg class="ico" viewBox="0 0 24 24" fill="currentColor">' +
      '<circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/>' +
      '<circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>' +
      '<circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>';
  }

  function setupPageDrag(inner) {
    let src = null;
    function onStart(e) {
      src = e.target.closest('.block');
      if (!src) return;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', '');
      setTimeout(() => src && src.classList.add('is-dragging'), 0);
    }
    function onOver(e) {
      if (!src) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      clearDropHints(inner);
      const tgt = dropTarget(inner, src, e.clientY);
      if (tgt.el) tgt.el.classList.add(tgt.before ? 'drag-hint-before' : 'drag-hint-after');
    }
    function onDrop(e) {
      e.preventDefault();
      if (!src) return;
      const tgt = dropTarget(inner, src, e.clientY);
      clearDropHints(inner);
      if (tgt.el && tgt.el !== src) {
        if (tgt.before) inner.insertBefore(src, tgt.el);
        else tgt.el.insertAdjacentElement('afterend', src);
      }
      src.classList.remove('is-dragging');
      src = null;
    }
    function onEnd() { clearDropHints(inner); if (src) { src.classList.remove('is-dragging'); src = null; } }
    inner.addEventListener('dragstart', onStart);
    inner.addEventListener('dragover', onOver);
    inner.addEventListener('drop', onDrop);
    inner.addEventListener('dragend', onEnd);
  }

  function dropTarget(inner, src, clientY) {
    const blocks = Array.from(inner.querySelectorAll(':scope > .block')).filter(b => b !== src);
    for (const b of blocks) {
      const r = b.getBoundingClientRect();
      if (clientY < r.top + r.height / 2) return { el: b, before: true };
      if (clientY <= r.bottom) return { el: b, before: false };
    }
    return { el: null };
  }

  function clearDropHints(inner) {
    inner.querySelectorAll('.drag-hint-before, .drag-hint-after')
      .forEach(el => el.classList.remove('drag-hint-before', 'drag-hint-after'));
  }

  // ---- Add block ----
  function plusIcon() {
    return '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
  }

  function buildAddBlockRow(pageIndex) {
    const row = document.createElement('div');
    row.className = 'add-block-row';

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'add-block-btn';
    addBtn.innerHTML = plusIcon() + '<span>Add block</span>';
    addBtn.addEventListener('click', () => toggleBlockPicker(pageIndex, row));
    row.appendChild(addBtn);

    return row;
  }

  function toggleBlockPicker(pageIndex, row) {
    const existing = row.querySelector('.block-picker');
    if (existing) { existing.remove(); return; }

    const picker = document.createElement('div');
    picker.className = 'block-picker';

    const types = [
      { type: 'explain', label: 'Note',   icon: notePickIcon() },
      { type: 'help',    label: 'Hint',   icon: hintPickIcon() },
      { type: 'copy',    label: 'Copy',   icon: copyPickIcon() },
      { type: 'link',    label: 'Link',   icon: openTabIcon()  },
      { type: 'window',  label: 'Window', icon: newWindowIcon()},
      { type: 'search',  label: 'Search', icon: searchIcon()   },
    ];

    types.forEach(({ type, label, icon }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'picker-type-btn';
      btn.innerHTML = icon + '<span>' + escapeHtml(label) + '</span>';
      btn.addEventListener('click', () => {
        picker.remove();
        addNewBlock(pageIndex, type);
      });
      picker.appendChild(btn);
    });

    row.appendChild(picker);
  }

  function addNewBlock(pageIndex, type) {
    const p = pages[pageIndex];
    if (!p) return;
    const inner = p.el.querySelector('.page-inner');

    const defaults = {
      explain: { type: 'explain', title: '', text: '' },
      help:    { type: 'help',   title: '', text: '' },
      copy:    { type: 'copy',   label: '', text: '' },
      link:    { type: 'link',   label: 'Open link', url: '' },
      window:  { type: 'window', label: 'Open in browser window', url: '' },
      search:  { type: 'search', label: '', text: '' },
    };

    const wrap = buildBlock(defaults[type] || { type }, p.el._inputRegistry || {});

    // Insert before add-block-row
    const addRow = inner.querySelector('.add-block-row');
    if (addRow) inner.insertBefore(wrap, addRow);
    else inner.insertBefore(wrap, inner.querySelector('.done-row'));

    openEditor(wrap);
    const first = wrap.querySelector('.block-editor input, .block-editor textarea');
    if (first) { first.focus({ preventScroll: true }); first.select(); }
  }

  // ---- Picker icons (filled, distinct from the stroke icons used in buttons) ----
  function notePickIcon() {
    return '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="3" y="3" width="18" height="18" rx="2"/>' +
      '<path d="M7 8h10M7 12h10M7 16h6"/></svg>';
  }
  function hintPickIcon() {
    return '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="12" cy="12" r="9"/><path d="M12 8v4"/><circle cx="12" cy="16" r=".5" fill="currentColor"/></svg>';
  }
  function copyPickIcon() {
    return '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="8" y="8" width="12" height="12" rx="2"/>' +
      '<path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>';
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

    dot.addEventListener('click', () => glideTo(index));
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

  // Drives the page deck; rail is now a plain scrollable nav so needs no JS transform
  function render() {
    const N = pages.length;
    if (!N) return;
    track.style.transform = 'translateY(' + (-posF * 100) + '%)';
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
    railScrollToActive();
  }

  // Scroll the rail so the active dot is visible — uses scrollTop directly
  // rather than scrollIntoView() to avoid propagating scroll to workspace.
  function railScrollToActive() {
    const dot = pages[active] && pages[active].dot;
    if (!dot) return;
    const dotRect = dot.getBoundingClientRect();
    const railRect = rail.getBoundingClientRect();
    const pad = 8;
    if (dotRect.top < railRect.top + pad) {
      rail.scrollTop += dotRect.top - railRect.top - pad;
    } else if (dotRect.bottom > railRect.bottom - pad) {
      rail.scrollTop += dotRect.bottom - railRect.bottom + pad;
    }
  }

  // Animation loop: apply inertia, then settle onto a page
  function startLoop() { if (rafId == null) { lastT = 0; rafId = requestAnimationFrame(loop); } }
  function loop(t) {
    const dt = lastT ? Math.min((t - lastT) / 1000, 0.05) : 0.016;
    lastT = t;

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

  // One wheel gesture = one page. Lock out further events until the snap lands.
  let wheelLock = false;
  function onWheel(e) {
    if (!isActive()) return;
    const page = pages[active] && pages[active].el;
    if (!page) return;
    const down = e.deltaY > 0;
    const atTop = page.scrollTop <= 0;
    const atBottom = page.scrollTop + page.clientHeight >= page.scrollHeight - 1;
    if ((down && !atBottom) || (!down && !atTop)) return; // let the page scroll internally
    e.preventDefault();
    if (wheelLock) return;
    if (e.deltaMode === 0 && Math.abs(e.deltaY) < 8) return; // ignore trackpad micro-ticks
    wheelLock = true;
    go(down ? 1 : -1);
    setTimeout(() => { wheelLock = false; }, 500);
  }

  // Keyboard
  function onKey(e) {
    if (e.key === 'Escape') { closeQcPanel(); return; }
    if (!isActive()) return;
    if (['ArrowDown', 'PageDown'].includes(e.key)) { e.preventDefault(); go(1); }
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
  //  Export current workspace state as JSON
  // ====================================================
  function serializeWorkspace() {
    const data = {
      pages: pages.map(p => {
        const pageInner = p.el.querySelector('.page-inner');
        const blocks = [];
        if (pageInner) {
          pageInner.querySelectorAll(':scope > .block').forEach(wrap => {
            if (wrap._bd) {
              const bd = Object.assign({}, wrap._bd);
              bd.type = wrap._bt; // use canonical type
              blocks.push(bd);
            }
          });
        }
        return { number: p.number, title: p.title, blocks };
      })
    };
    if (workspaceTitle) data.title = workspaceTitle;
    return data;
  }

  function downloadWorkspace() {
    const data = serializeWorkspace();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (workspaceTitle || 'workspace') + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  //  Quick-copy panel
  // ====================================================
  function buildQuickCopyPanel() {
    qcPanel.innerHTML = '';

    const hdr = document.createElement('div');
    hdr.className = 'qc-header';
    hdr.textContent = 'Quick Copy';
    qcPanel.appendChild(hdr);

    const slots = document.createElement('div');
    slots.className = 'qc-slots';
    qcPanel.appendChild(slots);

    // Today's date — read-only, pre-filled
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    const todayStr = dd + '-' + mm + '-' + yyyy;
    slots.appendChild(buildQcSlot(todayStr, true));

    const divider = document.createElement('div');
    divider.className = 'qc-divider';
    slots.appendChild(divider);

    // 5 blank editable slots
    for (let i = 0; i < 5; i++) {
      slots.appendChild(buildQcSlot('', false));
    }
  }

  function buildQcSlot(value, readOnly) {
    const row = document.createElement('div');
    row.className = 'qc-slot';

    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'qc-input' + (readOnly ? ' qc-date' : '');
    inp.value = value;
    inp.readOnly = readOnly;
    if (!readOnly) inp.placeholder = 'Type something…';
    row.appendChild(inp);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'qc-copy-btn';
    btn.setAttribute('aria-label', 'Copy');
    btn.innerHTML = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="9" y="9" width="13" height="13" rx="2"/>' +
      '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    btn.addEventListener('click', () => {
      const text = inp.value;
      if (!text) return;
      navigator.clipboard.writeText(text).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); } catch (_) {}
        document.body.removeChild(ta);
      });
      btn.classList.add('copied');
      setTimeout(() => btn.classList.remove('copied'), 1200);
    });
    row.appendChild(btn);

    return row;
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
    body.classList.remove('state-active', 'qc-open');
    body.classList.add('state-empty');
    workspace.hidden = true;
    reloadBtn.hidden = true;
    saveJsonBtn.hidden = true;
    fileInput.value = '';
    clearError();
  });

  saveJsonBtn.addEventListener('click', downloadWorkspace);

  function closeQcPanel() { body.classList.remove('qc-open'); }
  qcToggle.addEventListener('click', () => body.classList.toggle('qc-open'));
  qcBackdrop.addEventListener('click', closeQcPanel);

  workspace.addEventListener('wheel', onWheel, { passive: false });
  document.addEventListener('keydown', onKey);
  workspace.addEventListener('touchstart', onTouchStart, { passive: true });
  workspace.addEventListener('touchend', onTouchEnd, { passive: true });

  // Stop rail wheel events from bubbling to the workspace page-nav handler
  rail.addEventListener('wheel', e => e.stopPropagation(), { passive: true });
  // Workspace has overflow:hidden but browsers can still scroll it via focus/scrollIntoView.
  // Reset immediately so the transform-based paging never gets knocked off by a rogue scroll.
  workspace.addEventListener('scroll', () => { workspace.scrollTop = 0; workspace.scrollLeft = 0; });
  window.addEventListener('resize', () => { if (pages.length) render(); });
})();
