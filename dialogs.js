// One designed pop-up for the whole app (replaces confirm, prompt and alert)
document.head.appendChild(
  Object.assign(document.createElement('link'), { rel: 'stylesheet', href: 'dialogs.css' })
);

function openDialog(opts) {
  return new Promise((resolve) => {
    const previousFocus = document.activeElement;

    const overlay = document.createElement('div');
    overlay.className = 'dlg-overlay';

    const card = document.createElement('div');
    card.className = 'dlg-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');

    const heading = document.createElement('h3');
    heading.textContent = opts.title;
    card.appendChild(heading);

    if (opts.message) {
      const msg = document.createElement('p');
      msg.className = 'dlg-message';
      msg.textContent = opts.message;
      card.appendChild(msg);
    }

    let field = null;
    let errorLine = null;
    if (opts.input) {
      field = document.createElement('input');
      field.type = 'text';
      field.className = 'dlg-input';
      field.placeholder = opts.input.placeholder || '';
      field.value = opts.input.value || '';
      field.autocomplete = 'off';
      card.appendChild(field);

      errorLine = document.createElement('p');
      errorLine.className = 'dlg-error';
      errorLine.hidden = true;
      card.appendChild(errorLine);
    }

    const actions = document.createElement('div');
    actions.className = 'dlg-actions';

    let cancelBtn = null;
    if (opts.cancelText !== null) {
      cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'secondary';
      cancelBtn.textContent = opts.cancelText || 'Cancel';
      actions.appendChild(cancelBtn);
    }

    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = opts.danger ? 'danger' : '';
    okBtn.textContent = opts.okText || 'OK';
    actions.appendChild(okBtn);

    card.appendChild(actions);
    overlay.appendChild(card);

    function close(value) {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      if (previousFocus && previousFocus.focus) previousFocus.focus();
      resolve(value);
    }

    function cancel() {
      close(field ? null : false);
    }

    function submit() {
      if (field) {
        const text = field.value.trim();
        if (!text) {
          errorLine.textContent = 'Please type something first.';
          errorLine.hidden = false;
          field.focus();
          return;
        }
        close(text);
        return;
      }
      close(true);
    }

    function onKey(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      } else if (event.key === 'Enter' && field && event.target === field) {
        event.preventDefault();
        event.stopPropagation();
        submit();
      }
    }

    okBtn.addEventListener('click', submit);
    if (cancelBtn) cancelBtn.addEventListener('click', cancel);
    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay && cancelBtn) cancel();
    });
    document.addEventListener('keydown', onKey, true);

    document.body.appendChild(overlay);

    if (field) field.focus();
    else if (opts.danger && cancelBtn) cancelBtn.focus();
    else okBtn.focus();
  });
}

// Yes / No question. Gives true or false.
export function askConfirm({ title, message, okText, cancelText, danger }) {
  return openDialog({ title, message, okText: okText || 'Yes', cancelText: cancelText || 'Cancel', danger });
}

// Question with a typing box. Gives the typed text, or null if cancelled.
export function askText({ title, message, placeholder, value, okText }) {
  return openDialog({
    title,
    message,
    input: { placeholder, value },
    okText: okText || 'OK',
    cancelText: 'Cancel',
  });
}

// Simple message with one OK button.
export function showNotice(message, title) {
  return openDialog({ title: title || 'Notice', message, okText: 'OK', cancelText: null });
}

// Any old alert(...) in the app now uses the designed pop-up too
window.alert = (text) => {
  showNotice(String(text));
};