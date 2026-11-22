import { supabase, makeButton } from './common.js';
import { askText } from './dialogs.js';

const orderScreen = document.getElementById('order-screen');
const orderTitle = document.getElementById('order-title');
const orderBackBtn = document.getElementById('order-back-btn');
const orderMessage = document.getElementById('order-message');
const ordersMessage = document.getElementById('orders-message');
const sentSection = document.getElementById('sent-section');
const cancelOrderBtn = document.getElementById('cancel-order-btn');
const tableGrid = document.getElementById('table-grid');

function say(box, text, isError) {
  box.textContent = text;
  box.className = 'menu-message ' + (isError ? 'menu-error' : 'menu-ok');
  box.hidden = false;
}

async function findOpenTableOrder(tableNo) {
  return await supabase
    .from('orders')
    .select('id')
    .eq('status', 'open')
    .eq('order_type', 'table')
    .eq('table_no', tableNo)
    .maybeSingle();
}

async function moveOrder() {
  orderMessage.hidden = true;

  if (!orderTitle.textContent.startsWith('Table ')) return;
  const fromTable = orderTitle.textContent.replace('Table ', '').trim();

  if (orderScreen.dataset.dirty === '1') {
    say(orderMessage, 'Save the new items first (Save order), then move the table.', true);
    return;
  }

  const typed = await askText({
    title: 'Move table ' + fromTable,
    message: 'Type the new table number. It must be a free table.',
    placeholder: 'New table number',
    okText: 'Move order',
  });
  if (typed === null) return;

  const text = typed.trim();
  if (!/^\d+$/.test(text)) {
    say(orderMessage, 'Please type a table number, for example 7.', true);
    return;
  }
  const toTable = String(Number(text));
  const tableCount = tableGrid.querySelectorAll('button').length;

  if (toTable === fromTable) {
    say(orderMessage, 'That is the same table.', true);
    return;
  }
  if (Number(toTable) < 1 || (tableCount > 0 && Number(toTable) > tableCount)) {
    say(orderMessage, 'Table ' + toTable + ' does not exist.', true);
    return;
  }

  try {
    const from = await findOpenTableOrder(fromTable);
    if (from.error) throw from.error;
    if (!from.data) throw new Error('There is no open order on table ' + fromTable + '.');

    const target = await findOpenTableOrder(toTable);
    if (target.error) throw target.error;
    if (target.data) {
      say(orderMessage, 'Table ' + toTable + ' already has an open order. Choose a free table.', true);
      return;
    }

    const { data, error } = await supabase
      .from('orders')
      .update({ table_no: toTable })
      .eq('id', from.data.id)
      .eq('status', 'open')
      .select();
    if (error) throw error;
    if (!data || data.length === 0) throw new Error('The database blocked this change.');

    // Go back to the tables page, then show the result
    orderBackBtn.click();
    setTimeout(() => {
      say(ordersMessage, 'Order moved from table ' + fromTable + ' to table ' + toTable + '.', false);
    }, 800);
  } catch (err) {
    say(orderMessage, 'Could not move the order: ' + err.message, true);
  }
}

const moveBtn = makeButton('Move to another table', moveOrder, 'secondary');
moveBtn.classList.add('mv-btn');
cancelOrderBtn.insertAdjacentElement('afterend', moveBtn);

// Show the button only for a table order that already has saved items
function refreshMoveButton() {
  const isTable = orderTitle.textContent.startsWith('Table ');
  moveBtn.style.display = isTable && !sentSection.hidden ? '' : 'none';
}
refreshMoveButton();
const watcher = new MutationObserver(refreshMoveButton);
watcher.observe(sentSection, { attributes: true, attributeFilter: ['hidden'] });
watcher.observe(orderTitle, { childList: true, characterData: true, subtree: true });