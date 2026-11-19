(function () {
  const renderers = new WeakMap();
  let nextMenuId = 0;

  function enhanceSelect(select) {
    if (!select) return;
    if (select.dataset.netheraSelect === 'ready') {
      renderers.get(select)?.();
      return;
    }
    select.dataset.netheraSelect = 'ready';

    const wrapper = document.createElement('div');
    wrapper.className = 'nethera-select';
    select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(select);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nethera-select-button';
    const menu = document.createElement('div');
    menu.className = 'nethera-select-menu';
    menu.setAttribute('role', 'listbox');
    menu.id = `nethera-select-menu-${++nextMenuId}`;
    button.setAttribute('role', 'combobox');
    button.setAttribute('aria-haspopup', 'listbox');
    button.setAttribute('aria-controls', menu.id);
    button.setAttribute('aria-expanded', 'false');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
    wrapper.append(button, menu);

    function selectedOption() {
      return select.options[select.selectedIndex] || select.options[0];
    }

    function render() {
      const selected = selectedOption();
      button.textContent = selected?.textContent || 'Auswählen';
      button.disabled = select.disabled;
      const label = select.getAttribute('aria-label') || select.labels?.[0]?.querySelector('span')?.textContent || '';
      if (label) button.setAttribute('aria-label', `${label}: ${selected?.textContent || 'Auswählen'}`);
      menu.setAttribute('aria-label', label || 'Auswahl');
      if (select.disabled) close();
      menu.innerHTML = '';
      Array.from(select.options).forEach(option => {
        const optionButton = document.createElement('button');
        optionButton.className = `nethera-select-option ${option.selected ? 'selected' : ''}`;
        optionButton.type = 'button';
        optionButton.role = 'option';
        optionButton.tabIndex = -1;
        optionButton.setAttribute('aria-selected', String(option.selected));
        optionButton.dataset.value = option.value;
        optionButton.disabled = option.disabled;
        optionButton.textContent = option.textContent;
        menu.appendChild(optionButton);
      });
    }

    function close() {
      wrapper.classList.remove('open');
      button.setAttribute('aria-expanded', 'false');
    }

    button.addEventListener('click', event => {
      event.stopPropagation();
      document.querySelectorAll('.nethera-select.open').forEach(item => {
        if (item !== wrapper) { item.classList.remove('open'); item.querySelector('[role=combobox]')?.setAttribute('aria-expanded', 'false'); }
      });
      wrapper.classList.toggle('open');
      button.setAttribute('aria-expanded', String(wrapper.classList.contains('open')));
    });

    menu.addEventListener('click', event => {
      const optionButton = event.target.closest('.nethera-select-option');
      if (!optionButton || optionButton.disabled) return;
      const option = Array.from(select.options).find(item => item.value === optionButton.dataset.value);
      if (!option) return;
      select.value = option.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      render();
      close();
      button.focus();
    });

    wrapper.addEventListener('keydown', event => {
      const options = [...menu.querySelectorAll('button:not(:disabled)')];
      if (event.key === 'Escape') {
        event.preventDefault(); close(); button.focus(); return;
      }
      if (event.key === 'Tab') { close(); return; }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || !options.length) return;
      event.preventDefault();
      wrapper.classList.add('open'); button.setAttribute('aria-expanded', 'true');
      const index = options.indexOf(document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
        : index < 0 ? Math.max(0, options.findIndex(option => option.getAttribute('aria-selected') === 'true'))
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      options[next].focus();
    });
    select.addEventListener('change', render);
    new MutationObserver(render).observe(select, { childList: true, subtree: true, attributes: true });
    renderers.set(select, render);
    render();
  }

  function enhanceAll(root = document) {
    root.querySelectorAll('select').forEach(enhanceSelect);
  }

  function refreshAll(root = document) {
    root.querySelectorAll('select').forEach(select => renderers.get(select)?.());
  }

  document.addEventListener('click', () => {
    document.querySelectorAll('.nethera-select.open').forEach(item => { item.classList.remove('open'); item.querySelector('[role=combobox]')?.setAttribute('aria-expanded', 'false'); });
  });

  document.addEventListener('DOMContentLoaded', () => {
    enhanceAll();
    new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          if (node.matches?.('select')) enhanceSelect(node);
          enhanceAll(node);
        });
      });
    }).observe(document.body, { childList: true, subtree: true });
  });

  window.NetheraSelect = { enhanceAll, refreshAll };
})();
