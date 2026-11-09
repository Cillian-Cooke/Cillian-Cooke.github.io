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
})();
