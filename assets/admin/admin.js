(() => {
  const shell = document.querySelector('.admin-shell');
  const toggle = document.querySelector('[data-nav-toggle]');
  if (shell && toggle) toggle.addEventListener('click', () => shell.classList.toggle('nav-open'));
  document.querySelectorAll('[data-confirm]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      if (form.dataset.confirmed === 'yes') return;
      event.preventDefault();
      const dialog = document.createElement('dialog');
      dialog.className = 'confirm-dialog';
      dialog.innerHTML = `<form method="dialog"><p>${form.getAttribute('data-confirm') || 'Are you sure?'}</p><div class="actions"><button value="cancel">Cancel</button><button class="danger" value="confirm">Confirm</button></div></form>`;
      document.body.append(dialog);
      dialog.addEventListener('close', () => {
        if (dialog.returnValue === 'confirm') {
          form.dataset.confirmed = 'yes';
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = 'confirmed';
          input.value = 'yes';
          form.append(input);
          form.submit();
        }
        dialog.remove();
      });
      dialog.showModal();
    });
  });
  document.querySelectorAll('[data-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      await navigator.clipboard?.writeText(button.getAttribute('data-copy') || '');
      button.textContent = 'Copied';
    });
  });
})();
