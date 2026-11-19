// In-page dialogs (no window.confirm/alert/prompt: they block automation and look foreign).
import { esc } from './ui.js';

function open({ title, body, okLabel, cancelLabel = 'ยกเลิก', danger = false }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'admin-dialog';
    dlg.setAttribute('aria-labelledby', 'dlg-title');
    dlg.innerHTML = `<form method="dialog">
<h2 id="dlg-title">${esc(title)}</h2>${body}
<div class="form-actions"><button type="submit" value="ok" class="btn${danger ? ' btn-danger' : ''}" id="dlg-ok">${esc(okLabel)}</button>
<button type="button" class="btn btn-secondary" id="dlg-cancel">${esc(cancelLabel)}</button></div></form>`;
    document.body.appendChild(dlg);
    const input = dlg.querySelector('input');
    let result = null;
    dlg.querySelector('#dlg-cancel').addEventListener('click', () => dlg.close());
    dlg.querySelector('form').addEventListener('submit', () => { result = input ? input.value : true; });
    dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
    dlg.showModal();
    (input || dlg.querySelector('#dlg-cancel')).focus();
  });
}

// -> Promise<boolean>
export async function confirmDialog({ title, message, okLabel = 'ตกลง', danger = false }) {
  return (await open({ title, body: `<p>${esc(message)}</p>`, okLabel, danger })) === true;
}

// -> Promise<string|null> (null when cancelled)
export function promptDialog({ title, label, okLabel = 'ตกลง', placeholder = '', inputType = 'text' }) {
  return open({
    title, okLabel,
    body: `<div class="form-field"><label for="dlg-input">${esc(label)}</label><input id="dlg-input" type="${esc(inputType)}" autocomplete="off" placeholder="${esc(placeholder)}"></div>`,
  });
}
