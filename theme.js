(function () {
  var KEY = 'kamala-theme-v3';
  var root = document.documentElement;
  var COLORS = { dark: '#03130D', light: '#EEF4EE' };

  function saved() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }

  function systemTheme() {
    var wantsLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    return 'dark';
  }

  function apply(theme) {
    root.setAttribute('data-theme', theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', COLORS[theme]);
  }

  // Runs immediately, so the page never flashes the wrong theme
  apply(saved() || systemTheme());

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;

    btn.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.classList.add('theme-fade');
      apply(next);
      try { localStorage.setItem(KEY, next); } catch (e) { /* ignore */ }
      setTimeout(function () { root.classList.remove('theme-fade'); }, 450);
    });
  });
})();