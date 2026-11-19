(() => {
  const U = window.NetheraTopologyRenderer;
  const positions = new Map();
  const clamp = (min, value, max) => Math.max(min, Math.min(value, max));

  function render(stage, view) {
    const key = `${view.scope}:${view.mode}`;
    if (!positions.has(key)) positions.set(key, { hubs: new Map(), devices: new Map(), zoom: 1, pan: { x: 0, y: 0 } });
    const memory = positions.get(key), controller = new AbortController();
    stage.replaceChildren(); stage.dataset.layout = 'klassisch';
    const layer = U.element('div', 'classic-layer', stage);
    const lines = U.svg('svg', { class: 'topology-lines', 'aria-hidden': 'true' }, layer);
    const router = U.router(layer, view.model, view.onSelect);
    const tooltip = U.element('div', 'classic-tooltip', layer);
    tooltip.hidden = true;
    const items = view.hubs.map(hub => ({ hub, node: U.hub(layer, hub, view), point: {}, devices: [] }));
    const primary = new Map();
    items.forEach(item => {
      item.hub.devices.forEach(device => {
        if (primary.has(device.id)) return;
        const node = U.device(layer, device, 'classic-device', view);
        U.element('span', 'device-ring', node).setAttribute('aria-hidden', 'true');
        U.element('span', 'device-name', node, device.name.length > 16 ? device.name.slice(0, 15) + '…' : device.name);
        const child = { device, node, offset: {}, point: {} };
        item.devices.push(child); primary.set(device.id, child);
        U.drag(node, () => child.offset, point => {
          memory.devices.set(device.id, point); child.offset = point; place();
        }, () => scale, controller.signal);
      });
      U.drag(item.node, () => memory.hubs.get(item.hub.id) || { x: 0, y: 0 }, point => {
        memory.hubs.set(item.hub.id, point); fit();
      }, () => scale, controller.signal);
    });
    let width = 0, height = 0, scale = 1, selected = view.selectedId, center = {};
    const visible = U.matches(view);
    layer.addEventListener('click', event => { if (event.target === layer) view.onSelect(''); });
    function fit() {
      width = Math.max(stage.clientWidth, 680);
      height = Math.max(stage.clientHeight, 540);
      const small = width < 720;
      center = { x: width / 2, y: height / 2 + (small ? 14 : 0) };
      const radius = clamp(95, Math.min(width, height - 40) * .30, 260) * 1.04;
      const hubWidth = small ? 112 : 146, hubHeight = small ? 40 : 44, dotSize = small ? 22 : 26;
      layer.style.width = `${width}px`; layer.style.height = `${height}px`;
      const baseScale = Math.min(stage.clientWidth / width, stage.clientHeight / height);
      scale = baseScale * memory.zoom;
      layer.style.left = `${(stage.clientWidth - width * scale) / 2 + memory.pan.x}px`;
      layer.style.top = `${(stage.clientHeight - height * scale) / 2 + memory.pan.y}px`;
      layer.style.transform = `scale(${scale})`;
      layer.dataset.zoom = String(memory.zoom);
      lines.setAttribute('width', width); lines.setAttribute('height', height);
      router.style.left = `${center.x}px`; router.style.top = `${center.y}px`;
      router.style.width = `${clamp(small ? 110 : 140, width * .2, small ? 170 : 250)}px`;
      items.forEach((item, i) => {
        const angle = Math.PI * 2 * i / Math.max(1, items.length) - Math.PI / 2;
        const offset = memory.hubs.get(item.hub.id) || { x: 0, y: 0 };
        item.node.style.width = `${hubWidth}px`; item.node.style.height = `${hubHeight}px`;
        item.point = { x: clamp(16 + hubWidth / 2, center.x + radius * Math.cos(angle), width - 16 - hubWidth / 2) + offset.x,
          y: clamp(16 + hubHeight / 2, center.y + radius * Math.sin(angle), height - 70 - hubHeight / 2) + offset.y };
        const deviceRadius = clamp(small ? 60 : 82, 48 + item.devices.length * (small ? 10 : 14), small ? 112 : 168);
        item.devices.forEach((child, index) => {
          const theta = Math.PI * 2 * index / Math.max(1, item.devices.length) - Math.PI / 2;
          child.offset = memory.devices.get(child.device.id) || { x: Math.round(deviceRadius * Math.cos(theta)), y: Math.round(deviceRadius * Math.sin(theta)) };
          const ring = child.node.querySelector('.device-ring');
          ring.style.width = ring.style.height = `${dotSize}px`;
          child.node.style.padding = `${(44 - dotSize) / 2}px`;
          child.node.querySelector('.device-name').style.top = `${22 + dotSize / 2 + 4}px`;
        });
      });
      place();
    }
    function line(a, b, color, opacity, highlight = false, secondary = false) {
      U.svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: color, opacity,
        'stroke-width': highlight ? 2.2 : 1.3, ...(secondary ? { 'stroke-dasharray': '4 4', 'data-secondary': 'true' } : {}) }, lines);
    }
    function place() {
      lines.replaceChildren();
      items.forEach(item => {
        item.node.style.left = `${item.point.x}px`; item.node.style.top = `${item.point.y}px`;
        const faded = !item.hub.devices.some(device => visible.has(device.id));
        item.node.classList.toggle('filtered-out', faded);
        U.svg('line', { x1: center.x, y1: center.y, x2: item.point.x, y2: item.point.y,
          stroke: '#63e5c5', 'stroke-opacity': faded ? .06 : .32, 'stroke-width': 1.4 }, lines);
        item.devices.forEach(child => {
          child.point = { x: item.point.x + child.offset.x, y: item.point.y + child.offset.y };
          child.node.style.left = `${child.point.x}px`; child.node.style.top = `${child.point.y}px`;
          const active = child.device.id === selected, filtered = !visible.has(child.device.id);
          child.node.setAttribute('aria-pressed', String(active));
          child.node.classList.toggle('filtered-out', filtered);
          child.node.classList.toggle('selection-muted', Boolean(selected) && !active);
          line(item.point, child.point, item.hub.color, filtered ? .05 : active ? .9 : child.device.online ? .38 : .16, active);
        });
      });
      items.forEach(item => item.hub.devices.forEach(device => {
        if (item.devices.some(child => child.device.id === device.id)) return;
        const child = primary.get(device.id);
        line(item.point, child.point, item.hub.color, visible.has(device.id) ? .35 : .08, device.id === selected, true);
      }));
      const current = primary.get(selected);
      tooltip.hidden = !current;
      if (current) {
        tooltip.replaceChildren();
        U.element('b', '', tooltip, current.device.name);
        U.element('span', '', tooltip, `${current.device.groups.map(group => group.name).join(', ')} · ${current.device.ip} · ${current.device.online ? 'online' : 'offline'}`);
        const { x, y } = current.point, off = current.offset;
        const half = current.node.querySelector('.device-ring').offsetWidth / 2, gap = 10;
        const bw = tooltip.offsetWidth, bh = tooltip.offsetHeight;
        const left = x + (off.x >= 0 ? half + gap : -half - gap - bw);
        const top = y + (Math.abs(off.y) > Math.abs(off.x) ? (off.y >= 0 ? half + gap : -half - gap - bh) : -bh / 2);
        tooltip.style.left = `${clamp(8, left, width - bw - 8)}px`;
        tooltip.style.top = `${clamp(8, top, height - bh - 8)}px`;
      }
    }
    // A zoomed graph can be panned without changing the node arrangement.
    let panStart = null, panned = false;
    stage.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target.closest('button')) return;
      panStart = { x: event.clientX, y: event.clientY, pan: { ...memory.pan } };
      panned = false; stage.setPointerCapture(event.pointerId);
    }, { signal: controller.signal });
    stage.addEventListener('pointermove', event => {
      if (!panStart) return;
      const x = event.clientX - panStart.x, y = event.clientY - panStart.y;
      if (!panned && Math.hypot(x, y) < 4) return;
      panned = true; memory.pan = { x: panStart.pan.x + x, y: panStart.pan.y + y }; fit();
    }, { signal: controller.signal });
    stage.addEventListener('pointerup', () => { panStart = null; }, { signal: controller.signal });
    stage.addEventListener('pointercancel', () => { panStart = null; }, { signal: controller.signal });
    stage.addEventListener('click', event => {
      if (panned) { event.stopImmediatePropagation(); panned = false; }
      else if (event.target === stage) view.onSelect('');
    }, { capture: true, signal: controller.signal });
    fit();
    return {
      select(id) { selected = id; place(); }, fit,
      zoom(factor) { memory.zoom = clamp(.5, memory.zoom * factor, 2); fit(); },
      reset() { memory.hubs.clear(); memory.devices.clear(); memory.zoom = 1; memory.pan = { x: 0, y: 0 }; fit(); },
      destroy() { controller.abort(); stage.replaceChildren(); }
    };
  }
  window.NetheraTopologyClassic = { render };
})();
