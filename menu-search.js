// Search box for Menu management: type a name to find an item
const list = document.getElementById('item-list');

if (list) {
  const box = document.createElement('input');
  box.type = 'search';
  box.id = 'item-search';
  box.placeholder = 'Search menu items...';
  box.autocomplete = 'off';
  box.style.marginBottom = '14px';

  const none = document.createElement('p');
  none.className = 'menu-empty';
  none.hidden = true;

  list.parentNode.insertBefore(box, list);
  list.parentNode.insertBefore(none, list);

  function applyFilter() {
    const q = box.value.trim().toLowerCase();
    let shown = 0;
    let heading = null;
    let headingHasRow = false;

    function closeGroup() {
      if (heading) heading.hidden = !headingHasRow;
    }

    Array.from(list.children).forEach((node) => {
      if (node.tagName === 'H4') {
        closeGroup();
        heading = node;
        headingHasRow = false;
      } else if (node.classList.contains('menu-row')) {
        const strong = node.querySelector('strong');
        const name = strong ? strong.textContent.toLowerCase() : '';
        const match = q === '' || name.includes(q);
        node.hidden = !match;
        if (match) {
          shown++;
          headingHasRow = true;
        }
      }
    });
    closeGroup();

    const hasRows = list.querySelector('.menu-row') !== null;
    none.hidden = !(q !== '' && hasRows && shown === 0);
    if (!none.hidden) none.textContent = 'No item found for "' + box.value.trim() + '".';
  }

  box.addEventListener('input', applyFilter);
  new MutationObserver(applyFilter).observe(list, { childList: true });
}