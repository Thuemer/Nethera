(function () {
  const renderers = new WeakMap();

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
    wrapper.append(button, menu);

    function selectedOption() {
      return select.options[select.selectedIndex] || select.options[0];
    }

    function render() {
      const selected = selectedOption();
      button.textContent = selected?.textContent || 'Auswählen';
      button.disabled = select.disabled;
      menu.innerHTML = '';
      Array.from(select.options).forEach(option => {
        const optionButton = document.createElement('button');
        optionButton.className = `nethera-select-option ${option.selected ? 'selected' : ''}`;
        optionButton.type = 'button';
        optionButton.role = 'option';
        optionButton.dataset.value = option.value;
        optionButton.disabled = option.disabled;
        optionButton.textContent = option.textContent;
        menu.appendChild(optionButton);
      });
    }

    function close() {
      wrapper.classList.remove('open');
    }

    button.addEventListener('click', event => {
      event.stopPropagation();
      document.querySelectorAll('.nethera-select.open').forEach(item => {
        if (item !== wrapper) item.classList.remove('open');
      });
      wrapper.classList.toggle('open');
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
    document.querySelectorAll('.nethera-select.open').forEach(item => item.classList.remove('open'));
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
