// VIBE: loads the new look (font + vibe.css) and keeps it as the LAST stylesheet,
// so it always wins over older style files. Visual only - no features here.
// To go back to the old look, remove the vibe.js line from index.html.
(function () {
  const head = document.head;

  if (!document.getElementById('vibe-font')) {
    const pre1 = document.createElement('link');
    pre1.rel = 'preconnect';
    pre1.href = 'https://fonts.googleapis.com';
    const pre2 = document.createElement('link');
    pre2.rel = 'preconnect';
    pre2.href = 'https://fonts.gstatic.com';
    pre2.crossOrigin = '';
    const font = document.createElement('link');
    font.id = 'vibe-font';
    font.rel = 'stylesheet';
    font.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap';
    head.append(pre1, pre2, font);
  }

  let css = document.getElementById('vibe-css');
  if (!css) {
    css = document.createElement('link');
    css.id = 'vibe-css';
    css.rel = 'stylesheet';
    css.href = 'vibe.css?v=5';
    head.appendChild(css);
  }

  // other screens add their own CSS later; move ours back to the end each time
  let busy = false;
  new MutationObserver(() => {
    if (busy || head.lastElementChild === css) return;
    busy = true;
    head.appendChild(css);
    busy = false;
  }).observe(head, { childList: true });

  // when you press a tab / chip / category, the new content animates in
  const TABS = '.tb-chip,.tb-view-btn,.rr-chip,.pp-tab,.od-tab,#order-cats button,.mm-cat,.mm-tab,.rp-tabs button,' +
    '.sh-chip,.md-chip,.serve-toggle button,.rp-nav button,.od-mode button,.tv-stock,.st-tab,.mp-chip';
  let watcher = null;
  document.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest(TABS);
    if (!t) return;
    const scope = t.closest('main.screen') || document.body;
    if (watcher) watcher.disconnect();
    let n = 0;
    const added = [];
    watcher = new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === 'attributes') {
          const el = m.target;
          if (el.nodeType === 1 && !el.hasAttribute('hidden') && m.oldValue !== null && !el.closest('.vb-in')) {
            el.style.animationDelay = Math.min(n++, 16) * 26 + 'ms';
            el.classList.add('vb-in');
            added.push(el);
          }
          continue;
        }
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1 || node.matches('script,style,link,svg *')) continue;
          if (node.closest('.vb-in') && node.closest('.vb-in') !== node) continue;
          if (node.parentElement && node.parentElement.closest('.vb-in')) continue;
          node.style.animationDelay = Math.min(n++, 16) * 26 + 'ms';
          node.classList.add('vb-in');
          added.push(node);
        }
      }
    });
    // cards that stay on screen also pop in again, one after another
    setTimeout(() => {
      const ITEMS = '.tb-card:not([hidden]),.tb-ta-card,.order-item:not([hidden]),.mm-row,.rr-item,.pp-ocard,.rp-tile,.rp-panel,.md-card,.sh-panel';
      let k = 0;
      scope.querySelectorAll(ITEMS).forEach((x) => {
        if (x.offsetParent === null || x.classList.contains('vb-in')) return;
        const r = x.getBoundingClientRect();
        if (r.bottom < 0 || r.top > innerHeight) return;
        x.style.animationDelay = Math.min(k++, 16) * 26 + 'ms';
        x.classList.add('vb-in');
        added.push(x);
      });
    }, 70);
    watcher.observe(scope, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'], attributeOldValue: true });
    setTimeout(() => {
      if (watcher) watcher.disconnect();
      added.forEach((x) => { x.classList.remove('vb-in'); x.style.animationDelay = ''; });
    }, 1300);
  }, true);
})();
