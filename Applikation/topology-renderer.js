(() => {
  const element = (tag, className, parent, text) => {
    const node = document.createElement(tag);
    node.className = className;
    if (text != null) node.textContent = text;
    parent.append(node);
    return node;
  };
  const svg = (tag, attrs, parent) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    parent.append(node);
    return node;
  };
  const button = (className, parent, label, onClick) => {
    const node = element('button', className, parent);
    node.type = 'button'; node.title = label; node.setAttribute('aria-label', label);
    node.addEventListener('click', onClick);
    return node;
  };
  function router(parent, model, onClick) {
    const node = button('topology-router', parent, model.router.name, () => onClick(''));
    const image = element('img', '', node);
    image.src = 'topology-router.png'; image.alt = ''; image.draggable = false;
    element('strong', '', node, model.router.name);
    element('span', '', node, `${model.devices.length} Geräte · ${model.devices.filter(device => device.online).length} online`);
    return node;
  }
  function hub(parent, item, view) {
    const node = item.kind === 'connection' ? element('div', 'topology-hub', parent)
      : button('topology-hub', parent, `${item.name}, ${item.devices.length} Geräte`, () => view.onHubClick(item));
    node.dataset.hub = item.id;
    node.style.setProperty('--group-color', item.color);
    node.setAttribute('aria-pressed', String(item.id === view.groupFilter));
    element('span', 'hub-name', node, item.name);
    element('span', 'hub-count', node, item.devices.length);
    return node;
  }
  function device(parent, item, className, view) {
    const label = `${item.name}, ${item.groups.map(group => group.name).join(', ')}, ${item.online ? 'online' : 'offline'}`;
    const node = button(`topology-device ${className}${item.online ? '' : ' offline'}`, parent, label, () => view.onSelect(item.id));
    node.dataset.device = item.id;
    node.style.setProperty('--group-color', item.groups[0].color);
    node.setAttribute('aria-pressed', String(item.id === view.selectedId));
    return node;
  }
  function matches(view) {
    return new Set(NetheraTopology.matchingDevices(view.model, view.query, view.groupFilter).map(device => device.id));
  }
  // Native clicks retain keyboard activation; only a real pointer drag suppresses the click.
  function drag(node, getPosition, move, scale, signal) {
    let start = null, dragged = false;
    node.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.stopPropagation();
      start = { x: event.clientX, y: event.clientY, position: { ...getPosition() } };
      dragged = false; node.setPointerCapture(event.pointerId);
    }, { signal });
    node.addEventListener('pointermove', event => {
      if (!start) return;
      const x = event.clientX - start.x, y = event.clientY - start.y;
      if (!dragged && Math.hypot(x, y) < 4) return;
      dragged = true;
      move({ x: start.position.x + x / scale(), y: start.position.y + y / scale() });
    }, { signal });
    node.addEventListener('pointerup', () => { start = null; }, { signal });
    node.addEventListener('pointercancel', () => { start = null; dragged = true; }, { signal });
    node.addEventListener('click', event => {
      if (dragged && event.detail) { event.stopImmediatePropagation(); event.preventDefault(); }
      dragged = false;
    }, { capture: true, signal });
  }
  window.NetheraTopologyRenderer = { element, svg, button, router, hub, device, matches, drag };
})();
