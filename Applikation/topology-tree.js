(() => {
  const U = window.NetheraTopologyRenderer;
  function render(stage, view) {
    stage.replaceChildren(); stage.dataset.layout = 'baum';
    const layer = U.element('div', 'tree-layer', stage);
    const lines = U.svg('svg', { class: 'topology-lines', 'aria-hidden': 'true' }, layer);
    const router = U.router(layer, view.model, view.onSelect);
    const matches = U.matches(view), items = [];
    let selected = view.selectedId;
    view.hubs.forEach(hub => {
      const devices = hub.devices.filter(device => matches.has(device.id));
      if (!devices.length) return;
      const group = U.hub(layer, { ...hub, devices }, view);
      const rows = devices.map(device => {
        const node = U.device(layer, device, 'tree-device', view);
        U.element('span', 'tree-status', node).setAttribute('aria-hidden', 'true');
        U.element('strong', 'tree-name', node, device.name);
        U.element('span', 'tree-connection', node, device.connection);
        U.element('span', 'tree-ip', node, device.ip);
        return { device, node };
      });
      items.push({ group, hub, rows });
    });
    layer.addEventListener('click', event => { if (event.target === layer) view.onSelect(''); });
    function fit() {
      let y = 28;
      items.forEach(item => {
        const span = item.rows.length * 44 - 8;
        item.group.style.top = `${y + span / 2}px`;
        item.rows.forEach((row, index) => { row.node.style.top = `${y + index * 44}px`; });
        y += span + 30;
      });
      const height = Math.max(stage.clientHeight, y + 20, 240);
      layer.style.height = `${height}px`;
      router.style.top = `${Math.min(height / 2, 240)}px`;
      draw();
    }
    function draw() {
      lines.replaceChildren();
      lines.setAttribute('width', layer.clientWidth); lines.setAttribute('height', layer.clientHeight);
      const origin = layer.getBoundingClientRect();
      const anchor = (node, right) => {
        const box = node.getBoundingClientRect();
        return { x: (right ? box.right : box.left) - origin.left, y: box.top + box.height / 2 - origin.top };
      };
      const curve = (start, end, color, active) => {
        const dx = Math.max(10, (end.x - start.x) / 2);
        U.svg('path', { d: `M${start.x},${start.y} C${start.x + dx},${start.y} ${end.x - dx},${end.y} ${end.x},${end.y}`,
          fill: 'none', stroke: color, opacity: active ? 1 : .3, 'stroke-width': active ? 2 : 1.3 }, lines);
      };
      items.forEach(item => {
        curve(anchor(router, true), anchor(item.group, false), item.hub.color, item.rows.some(row => row.device.id === selected));
        item.rows.forEach(row => {
          const active = row.device.id === selected;
          row.node.setAttribute('aria-pressed', String(active));
          curve(anchor(item.group, true), anchor(row.node, false), item.hub.color, active);
        });
      });
    }
    fit();
    return { select(id) { selected = id; draw(); }, fit, reset: fit, destroy() { stage.replaceChildren(); } };
  }
  window.NetheraTopologyTree = { render };
})();
