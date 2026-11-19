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
      const swatch = U.element('span', 'swatch', group); swatch.setAttribute('aria-hidden', 'true'); group.prepend(swatch);
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
      const small = stage.clientWidth < 640;
      const rx = 16, rw = small ? 96 : 170, gx = small ? 128 : 250, gw = small ? 120 : 180, dx = small ? 268 : 500;
      const width = Math.max(stage.clientWidth, dx + (small ? 200 : 300));
      const deviceWidth = Math.min(width - dx - 16, 440);
      let y = 24;
      layer.style.width = `${width}px`;
      items.forEach(item => {
        const start = y;
        item.rows.forEach(row => {
          Object.assign(row.node.style, { top: `${y}px`, left: `${dx}px`, width: `${deviceWidth}px` });
          row.node.querySelector('.tree-ip').hidden = deviceWidth < 300;
          y += 36;
        });
        Object.assign(item.group.style, { top: `${(start + y - 36) / 2 + 15 - 20}px`, left: `${gx}px`, width: `${gw}px` });
        y += 22;
      });
      const height = Math.max(stage.clientHeight, y + 10);
      layer.style.height = `${height}px`;
      const rh = small ? 110 : 140;
      const ry = items.length ? (24 + y - 22 - 36) / 2 + 15 : height / 2;
      Object.assign(router.style, { left: `${rx}px`, top: `${ry - rh / 2}px`, width: `${rw}px`, height: `${rh}px` });
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
      const curve = (start, end, color, opacity, strokeWidth) => {
        const dx = Math.max(10, (end.x - start.x) / 2);
        U.svg('path', { d: `M${start.x},${start.y} C${start.x + dx},${start.y} ${end.x - dx},${end.y} ${end.x},${end.y}`,
          fill: 'none', stroke: color, 'stroke-opacity': opacity, 'stroke-width': strokeWidth }, lines);
      };
      items.forEach(item => {
        curve(anchor(router, true), anchor(item.group, false), '#63e5c5', .35, 1.4);
        item.rows.forEach(row => {
          const active = row.device.id === selected;
          row.node.setAttribute('aria-pressed', String(active));
          curve(anchor(item.group, true), anchor(row.node, false), item.hub.color, active ? .9 : .35, active ? 2 : 1.2);
        });
      });
    }
    fit();
    return { select(id) { selected = id; draw(); }, fit, reset: fit, destroy() { stage.replaceChildren(); } };
  }
  window.NetheraTopologyTree = { render };
})();
