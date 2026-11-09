(function () {
  'use strict';

  document.documentElement.removeAttribute('data-font');

  var nav = document.querySelector('.nav');
  if (nav) {
    window.addEventListener('scroll', function () {
      nav.classList.toggle('scrolled', window.scrollY > 40);
    }, { passive: true });
  }

  document.querySelectorAll('img[data-hq]').forEach(function (img) {
    img.addEventListener('error', function () { stepThumb(img, true); });
    img.addEventListener('load', function () { stepThumb(img, false); });
    if (img.complete) stepThumb(img, img.naturalWidth === 0);
  });

  function stepThumb(img, failed) {
    var step = img.dataset.step || 'max';
    var tooSmall = img.naturalWidth > 0 && img.naturalWidth < 200;
    if (step === 'max' && (failed || tooSmall)) {
      img.dataset.step = 'hq';
      img.src = img.dataset.hq;
      return;
    }
    if (step === 'hq' && (failed || tooSmall)) {
      img.dataset.step = 'local';
      img.src = img.dataset.local;
    }
  }

  function shuffle(items) {
    var copy = items.slice();
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var swap = copy[i];
      copy[i] = copy[j];
      copy[j] = swap;
    }
    return copy;
  }

  document.querySelectorAll('[data-shuffle], [data-preview]').forEach(function (group) {
    var grid = group.querySelector('.channel-grid, .recommend-grid, .where-next-grid');
    if (!grid) return;
    var cards = Array.prototype.filter.call(grid.children, function (el) {
      return el.matches('a');
    });
    if (group.hasAttribute('data-shuffle')) {
      shuffle(cards).forEach(function (card) { grid.appendChild(card); });
    }
    var limit = Number(group.getAttribute('data-preview'));
    if (!limit) return;
    var shown = [];
    Array.prototype.forEach.call(grid.querySelectorAll(':scope > a'), function (card, index) {
      var hide = index >= limit;
      card.hidden = hide;
      if (!hide) shown.push(card);
    });
    shown.forEach(function (card, index) {
      card.classList.toggle('is-last-shown', index === shown.length - 1);
    });
  });
})();
