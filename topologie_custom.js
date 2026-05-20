/*
 topologie_custom.js
 Web Components for the network topology view.
 - Defines `network-device`, `network-group` and `network-topology` custom elements
 - Handles layout, dragging and SVG line drawing

 Debug logs and in-page error overlay have been removed for a clean production build.
*/

const appConfig = window.NETHERA_CONFIG || {};
const ROUTERS_API_URL = `${appConfig.API_BASE_URL || 'http://localhost:8080'}${appConfig.ROUTERS_PATH || '/api/routers/list'}`;

// NetworkDevice: visual device node. Supports dragging and showing a small info box.
class NetworkDevice extends HTMLElement {
    constructor() {
        super();
        // offsets are left undefined so initLayout can detect uninitialized offsets
        this.offsetX = undefined;
        this.offsetY = undefined;
        this.infoBox = null;
        // Do not set attributes or inline styles here — some browsers (Safari) throw when
        // a newly constructed custom element is assigned attributes in the constructor.
        // Set styles in connectedCallback instead.
    }

    connectedCallback(){
        // Ensure basic positioning styles when attached
        try{
            this.style.position = this.style.position || 'absolute';
            this.style.cursor = this.style.cursor || 'pointer';
        }catch(e){ /* ignore */ }
    }

    addDragAndClick(topology) {
        let dragging=false, startX, startY, offsetX, offsetY;

        this.addEventListener('mousedown', e=>{
            e.preventDefault();
            startX=e.clientX; startY=e.clientY;
            offsetX=e.clientX - this.offsetLeft;
            offsetY=e.clientY - this.offsetTop;
            dragging=false;

            // disable transitions during drag for immediate response
            try{ const tRoot = topology.querySelector('#topology'); if(tRoot) tRoot.classList.add('dragging'); }catch(e){}

            const moveHandler = e=>{
                const dx = e.clientX-startX;
                const dy = e.clientY-startY;
                if(Math.abs(dx)>2||Math.abs(dy)>2) dragging=true;
                this.style.left = e.clientX - offsetX + 'px';
                this.style.top = e.clientY - offsetY + 'px';
                // update cached center for device to help drawLines avoid reflow
                this._cx = this.offsetLeft + (this.offsetWidth||30)/2;
                this._cy = this.offsetTop + (this.offsetHeight||30)/2;
                const group = topology.groups.find(g=>g.dataset.group===this.dataset.group);
                if(group){ this.offsetX = this.offsetLeft - group.offsetLeft; this.offsetY = this.offsetTop - group.offsetTop; }
                // throttle redraw for smoother performance
                topology.scheduleDraw();
            };
            const upHandler = ()=>{ document.removeEventListener('mousemove',moveHandler); document.removeEventListener('mouseup',upHandler); };
            document.addEventListener('mousemove',moveHandler);
            document.addEventListener('mouseup',upHandler);
            document.addEventListener('mouseup', ()=>{
                // re-enable transitions after drag ends
                try{ const tRoot = topology.querySelector('#topology'); if(tRoot) tRoot.classList.remove('dragging'); }catch(e){}
            }, { once: true });
        });

        this.addEventListener('click', ()=>{
            if(dragging) return;
            topology.selectedIndex = topology.devices.indexOf(this);
            topology.showBottomInfo(topology.selectedIndex);
        });
    }

    updateInfoBox(time, topology){
        if(!this.infoBox){
            const box = document.createElement('div');
            box.classList.add('device-info');
            this.infoBox = box;
            topology.querySelector('#topology')?.appendChild(box);
        }
        const topologyBox = topology.querySelector('#topology');
        const topologyRect = topologyBox?.getBoundingClientRect();
        const rect=this.getBoundingClientRect();
        const group = topology.groups.find(g=>g.dataset.group===this.dataset.group);
        const groupRect = group?.getBoundingClientRect();
        if(!topologyRect) return;

        const devCx = rect.left - topologyRect.left + rect.width / 2;
        const devCy = rect.top - topologyRect.top + rect.height / 2;
        const groupCx = groupRect ? groupRect.left - topologyRect.left + groupRect.width / 2 : topologyRect.width / 2;
        const groupCy = groupRect ? groupRect.top - topologyRect.top + groupRect.height / 2 : topologyRect.height / 2;
        const dx = devCx - groupCx;
        const dy = devCy - groupCy;

        this.infoBox.innerHTML = `<b>${this.dataset.name}</b><span class="meta">${this.dataset.group} · ${this.dataset.ipAddress || '-'} · ${time}</span>`;

        const boxW = this.infoBox.offsetWidth || 180;
        const boxH = this.infoBox.offsetHeight || 44;
        const gap = 10;
        let left = devCx + (dx >= 0 ? rect.width / 2 + gap : -rect.width / 2 - gap - boxW);
        let top = devCy + (Math.abs(dy) > Math.abs(dx) ? (dy >= 0 ? rect.height / 2 + gap : -rect.height / 2 - gap - boxH) : -boxH / 2);
        const pad = 8;
        left = Math.max(pad, Math.min(left, topologyRect.width - boxW - pad));
        top = Math.max(pad, Math.min(top, topologyRect.height - boxH - pad));
        this.infoBox.style.left = left+'px';
        this.infoBox.style.top = top+'px';
    }
}

// NetworkGroup: container for devices. Can be dragged; devices follow its position.
class NetworkGroup extends HTMLElement {
    constructor(){ super(); }

    connectedCallback(){
        try{
            this.style.position = this.style.position || 'absolute';
            this.style.cursor = this.style.cursor || 'pointer';
        }catch(e){ /* ignore */ }
    }

    addDragAndClick(topology){
        let dragging=false, startX, startY, offsetX, offsetY;

        this.addEventListener('mousedown', e=>{
            e.preventDefault();
            startX=e.clientX; startY=e.clientY;
            offsetX=e.clientX - this.offsetLeft;
            offsetY=e.clientY - this.offsetTop;
            dragging=false;
            // disable transitions for responsive dragging
            try{ const tRoot = topology.querySelector('#topology'); if(tRoot) tRoot.classList.add('dragging'); }catch(e){}

            const moveHandler = e=>{
                const dx=e.clientX-startX, dy=e.clientY-startY;
                if(Math.abs(dx)>2||Math.abs(dy)>2) dragging=true;
                this.style.left = e.clientX-offsetX+'px';
                this.style.top = e.clientY-offsetY+'px';

                // position children devices immediately and update cached centers
                topology.devices.filter(d=>d.dataset.group===this.dataset.group)
                    .forEach(dev=>{
                        const left = this.offsetLeft + this.offsetWidth/2 + (dev.offsetX||0) - (dev.offsetWidth||30)/2;
                        const top = this.offsetTop + this.offsetHeight/2 + (dev.offsetY||0) - (dev.offsetHeight||30)/2;
                        dev.style.left = left + 'px';
                        dev.style.top = top + 'px';
                        dev._cx = left + (dev.offsetWidth||30)/2;
                        dev._cy = top + (dev.offsetHeight||30)/2;
                    });
                // update group cached center as well
                this._cx = this.offsetLeft + this.offsetWidth/2;
                this._cy = this.offsetTop + this.offsetHeight/2;
                // throttle redraw
                topology.scheduleDraw();
            };
            const upHandler = ()=>{ document.removeEventListener('mousemove',moveHandler); document.removeEventListener('mouseup',upHandler); };
            document.addEventListener('mousemove',moveHandler);
            document.addEventListener('mouseup',upHandler);
            document.addEventListener('mouseup', ()=>{ try{ const tRoot = topology.querySelector('#topology'); if(tRoot) tRoot.classList.remove('dragging'); }catch(e){} }, { once: true });
        });
    }

}

// NetworkTopology: root element that creates groups/devices, computes layout and draws lines.
class NetworkTopology extends HTMLElement {
    constructor(){
        super();
        this.groups=[]; this.devices=[]; this.selectedIndex=0;
        this.routerData = null;
        this.infoUpdateInterval = null;
    }

    connectedCallback(){
        try{
        this.innerHTML=`
        <div id="topology">
            <img src="router.png" id="router" draggable="false" tabindex="-1" aria-hidden="true">
            <button id="regroup-topology" type="button">Neu anordnen</button>
            <svg id="lines"></svg>
        </div>
        <div id="bottom-info">
            <button id="prev-device">&lt;</button>
            <div id="device-detail"></div>
            <button id="next-device">&gt;</button>
        </div>
        `;
        this.router=this.querySelector('#router');
        this.svg=this.querySelector('#lines');
        this.bottomDetail=this.querySelector('#device-detail');

        // Ensure first line render is correct after router image dimensions are available.
        if(this.router && !this.router.complete){
            this.router.addEventListener('load', ()=> this.drawLines(), { once: true });
        }

        // Recalculate layout on window resize for a responsive, compact arrangement
        window.addEventListener('resize', () => { clearTimeout(this._resizeTimer); this._resizeTimer = setTimeout(() => { this.initLayout(); this.drawLines(); this.updateDeviceInfo(); }, 120); });

        this.querySelector('#prev-device').addEventListener('click', ()=>{
            if(!this.devices.length) return;
            this.selectedIndex=(this.selectedIndex-1+this.devices.length)%this.devices.length;
            this.showBottomInfo(this.selectedIndex);
        });
        this.querySelector('#next-device').addEventListener('click', ()=>{
            if(!this.devices.length) return;
            this.selectedIndex=(this.selectedIndex+1)%this.devices.length;
            this.showBottomInfo(this.selectedIndex);
        });

        this.querySelector('#regroup-topology')?.addEventListener('click', ()=>{
            this.regroup();
        });

        this.addGroupsAndDevices();
        }catch(e){
            throw e;
        }
    }

    async addGroupsAndDevices(){
        try{
            const routers = await this.fetchRouters();
            if(!Array.isArray(routers) || routers.length===0){
                this.showEmptyState('Keine Routerdaten von der API erhalten.');
                return;
            }

            this.routerData = routers[0];
            this.populateTopologyFromApi(this.routerData);
        }catch(e){
            this.showEmptyState('Routerdaten konnten nicht geladen werden.');
        }
    }

    async fetchRouters(){
        const response = await fetch(ROUTERS_API_URL, {
            method: 'GET',
            headers: { Accept: 'application/json' }
        });
        if(!response.ok){
            throw new Error(`API request failed with status ${response.status}`);
        }
        return response.json();
    }

    populateTopologyFromApi(router){
        this.clearTopology();

        const devices = Array.isArray(router.devices) ? router.devices : [];
        const groupOrder = ['wifi','lan','other'];
        const groups = [...new Set(devices.map(d => this.normalizeConnectionType(d.connectionType)))];

        groups
            .sort((a,b)=>groupOrder.indexOf(a)-groupOrder.indexOf(b))
            .forEach(group=>this.addGroup(this.toGroupLabel(group)));

        devices.forEach(deviceData=>{
            const normalizedType = this.normalizeConnectionType(deviceData.connectionType);
            const groupLabel = this.toGroupLabel(normalizedType);
            this.addDevice(
                deviceData.hostname || deviceData.ipAddress || deviceData.macAddress || `Client ${deviceData.id}`,
                groupLabel,
                0,
                {
                    id: deviceData.id,
                    ipAddress: deviceData.ipAddress,
                    macAddress: deviceData.macAddress,
                    hostname: deviceData.hostname,
                    connectionType: normalizedType,
                    lastSeen: deviceData.lastSeen
                }
            );
        });

        setTimeout(()=>{
            this.initLayout();
            this.drawLines();
            this.updateDeviceInfo();
            if(this.devices.length){
                this.selectedIndex = 0;
                this.showBottomInfo(this.selectedIndex);
            }
            this.startInfoUpdates();
        }, 50);
    }

    clearTopology(){
        this.groups.forEach(group => group.remove());
        this.devices.forEach(device => {
            if(device.infoBox) device.infoBox.remove();
            device.remove();
        });
        this.groups = [];
        this.devices = [];
        this.selectedIndex = 0;
        this.stopInfoUpdates();
    }

    showEmptyState(message){
        this.clearTopology();
        if(this.bottomDetail){
            this.bottomDetail.textContent = message;
        }
        this.drawLines();
    }

    startInfoUpdates(){
        this.stopInfoUpdates();
        this.infoUpdateInterval = setInterval(()=>{
            this.updateDeviceInfo();
            if(this.devices.length){
                this.showBottomInfo(this.selectedIndex);
            }
        }, 1000);
    }

    stopInfoUpdates(){
        if(this.infoUpdateInterval){
            clearInterval(this.infoUpdateInterval);
            this.infoUpdateInterval = null;
        }
    }

    normalizeConnectionType(connectionType){
        const value = (connectionType || '').toString().trim().toLowerCase();
        if(value === 'wifi') return 'wifi';
        if(value === 'lan') return 'lan';
        return 'other';
    }

    toGroupLabel(connectionType){
        if(connectionType === 'wifi') return 'WLAN';
        if(connectionType === 'lan') return 'LAN';
        return 'Sonstige';
    }

    formatLastSeen(lastSeenRaw){
        if(!lastSeenRaw) return 'unbekannt';
        const lastSeenDate = new Date(lastSeenRaw);
        if(Number.isNaN(lastSeenDate.getTime())) return 'unbekannt';

        const diffSeconds = Math.max(0, Math.floor((Date.now() - lastSeenDate.getTime()) / 1000));
        if(diffSeconds < 60) return `vor ${diffSeconds}s`;
        if(diffSeconds < 3600) return `vor ${Math.floor(diffSeconds/60)}min`;
        if(diffSeconds < 86400) return `vor ${Math.floor(diffSeconds/3600)}h`;
        return `vor ${Math.floor(diffSeconds/86400)}d`;
    }

    addGroup(name){
        let group;
        try{
            group = document.createElement('network-group');
        }catch(e){
            // fallback to a div if custom element creation is not supported
            group = document.createElement('div');
            group.className = 'network-group-fallback';
            // attach prototype methods if available
            if(typeof NetworkGroup !== 'undefined' && NetworkGroup.prototype && typeof NetworkGroup.prototype.addDragAndClick === 'function'){
                group.addDragAndClick = NetworkGroup.prototype.addDragAndClick.bind(group);
            }
        }
        group.dataset.group=name; group.innerText=name;
        // Accessibility: make groups focusable and announceable
        try{ group.setAttribute('tabindex','0'); group.setAttribute('role','group'); group.setAttribute('aria-label', `Gruppe ${name}`); }catch(e){ }
        // make the element use the same styles as the original implementation
        try{ 
            group.classList.add('group'); 
            group.style.display = group.style.display || 'block'; 
            // ensure size if stylesheet hasn't been applied yet
            group.style.width = group.style.width || '100px';
            group.style.height = group.style.height || '50px';
        }catch(e){ /* ignore */ }
        this.querySelector('#topology').appendChild(group);
        if(typeof group.addDragAndClick==='function') group.addDragAndClick(this);
        this.groups.push(group);
        return group;
    }

    addDevice(name, groupName, time, meta={}){
        let device;
        try{
            device = document.createElement('network-device');
        }catch(e){
            // fallback to a div if custom element creation is not supported
            device = document.createElement('div');
            device.className = 'network-device-fallback';
            // attach prototype methods if available
            if(typeof NetworkDevice !== 'undefined' && NetworkDevice.prototype){
                if(typeof NetworkDevice.prototype.addDragAndClick === 'function') device.addDragAndClick = NetworkDevice.prototype.addDragAndClick.bind(device);
                if(typeof NetworkDevice.prototype.updateInfoBox === 'function') device.updateInfoBox = NetworkDevice.prototype.updateInfoBox.bind(device);
            }
        }
        device.dataset.name=name; device.dataset.group=groupName; device.dataset.time=time;
        if(meta.id!=null) device.dataset.deviceId = String(meta.id);
        if(meta.hostname) device.dataset.hostname = meta.hostname;
        if(meta.ipAddress) device.dataset.ipAddress = meta.ipAddress;
        if(meta.macAddress) device.dataset.macAddress = meta.macAddress;
        if(meta.connectionType) device.dataset.connectionType = meta.connectionType;
        if(meta.lastSeen) device.dataset.lastSeen = meta.lastSeen;
        // Accessibility: make devices focusable and provide aria-label/role
        try{ device.setAttribute('tabindex','0'); device.setAttribute('role','button'); device.setAttribute('aria-label', `${name}, Gruppe ${groupName}`); }catch(e){ }
        // assign original class so topologie.css applies
        try{ 
            device.classList.add('device'); 
            device.style.display = device.style.display || 'block'; 
            // ensure size if stylesheet hasn't been applied yet
            device.style.width = device.style.width || '30px';
            device.style.height = device.style.height || '30px';
        }catch(e){ /* ignore */ }
        this.querySelector('#topology').appendChild(device);
        if(typeof device.addDragAndClick==='function') device.addDragAndClick(this);
        this.devices.push(device);
        return device;
    }

    drawLines(){
        if(!this.svg) return;
        if(!this.router) return;
        this.svg.innerHTML='';
        const topologyRect = this.querySelector('#topology')?.getBoundingClientRect();
        if(!topologyRect) return;
        const routerCenter = this.getLocalCenter(this.router, topologyRect);
        const rX = routerCenter.x;
        const rY = routerCenter.y;

        this.groups.forEach(group=>{
            const groupCenter = this.getLocalCenter(group, topologyRect);
            const gX = groupCenter.x;
            const gY = groupCenter.y;
            this.createLine(rX,rY,gX,gY);

            this.devices.filter(d=>d.dataset.group===group.dataset.group)
                .forEach(dev=>{
                    const devCenter = this.getLocalCenter(dev, topologyRect);
                    const dX = devCenter.x;
                    const dY = devCenter.y;
                    this.createLine(gX,gY,dX,dY);
                });
        });
    }

    getLocalCenter(el, topologyRect){
        if(el._cx != null && el._cy != null){
            return { x: el._cx, y: el._cy };
        }
        const rect = el.getBoundingClientRect();
        return {
            x: rect.left - topologyRect.left + rect.width / 2,
            y: rect.top - topologyRect.top + rect.height / 2
        };
    }

    // Schedule a draw on the next animation frame (throttles multiple calls).
    scheduleDraw(){
        if(this._rafScheduled) return;
        this._rafScheduled = true;
        requestAnimationFrame(()=>{ this._rafScheduled = false; this.drawLines(); });
    }

    createLine(x1,y1,x2,y2){
        const line=document.createElementNS("http://www.w3.org/2000/svg","line");
        line.setAttribute("x1",x1); line.setAttribute("y1",y1);
        line.setAttribute("x2",x2); line.setAttribute("y2",y2);
        line.setAttribute("stroke","#2FB09A"); line.setAttribute("stroke-width","2"); line.setAttribute("stroke-opacity","0.7");
        this.svg.appendChild(line);
    }

    formatTime(sec){
        const h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60), s=sec%60;
        return `${h}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
    }

    regroup(){
        this.devices.forEach(dev => { dev.offsetX = undefined; dev.offsetY = undefined; });
        this._hasAnimatedInitial = true;
        this.initLayout(true);
        this.updateDeviceInfo();
        if(this.devices.length) this.showBottomInfo(this.selectedIndex);
    }

    initLayout(forceRegroup=false){
        // Responsive compact layout:
        // - Place groups evenly around a small circle centered on the viewport
        // - Scale the circle radius to keep groups compact but avoid overlap with edges
        const topologyBox = this.querySelector('#topology');
        const width = Math.max(400, topologyBox?.clientWidth || window.innerWidth);
        const height = Math.max(300, topologyBox?.clientHeight || window.innerHeight - 60);
        const centerX = width / 2;
        const centerY = height / 2;

        // Base radius for group placement: smaller for small viewports, larger for wide screens
        const base = Math.min(width, height);
        const groupRadius = Math.max(95, Math.min(base * 0.30, 260));

        const n = this.groups.length || 1;
        // Prepare arrays of target positions so we can optionally animate from center
        const groupTargets = [];

        // compute targets but don't apply them yet if this is the first layout (to animate)
        this.groups.forEach((group, idx) => {
            // ensure the group's measured size is available; provide reasonable defaults
            const gW = group.offsetWidth || 100;
            const gH = group.offsetHeight || 50;

            // angle for this group (start at -90deg to put first group top-center)
            const angle = (2 * Math.PI * idx / n) - Math.PI / 2 + (forceRegroup ? Math.PI / 6 : 0);

            // compute candidate position and then clamp to viewport padding
            let gLeft = centerX + groupRadius * Math.cos(angle) - gW / 2;
            let gTop = centerY + groupRadius * Math.sin(angle) - gH / 2;

            const pad = 16;
            gLeft = Math.max(pad, Math.min(gLeft, width - gW - pad));
            gTop = Math.max(pad, Math.min(gTop, height - gH - pad));

            groupTargets.push({ group, gLeft, gTop, gW, gH });

            // layout devices around the group in a compact circle scaled to number of devices
            const children = this.devices.filter(d => d.dataset.group === group.dataset.group);
            // device radius depends on number of children; keep compact but non-overlapping
            const devRadius = Math.min(base < 650 ? 118 : 170, Math.max(base < 650 ? 54 : 72, 42 + children.length * (base < 650 ? 9 : 12)));

            children.forEach((dev, i) => {
                if (dev.offsetX === undefined || dev.offsetY === undefined) {
                    const devAngle = (2 * Math.PI * i / Math.max(1, children.length)) - Math.PI / 2;
                    dev.offsetX = Math.round(devRadius * Math.cos(devAngle));
                    dev.offsetY = Math.round(devRadius * Math.sin(devAngle));
                }
                const targetLeft = gLeft + group.offsetWidth / 2 + dev.offsetX - (dev.offsetWidth || 30) / 2;
                const targetTop = gTop + group.offsetHeight / 2 + dev.offsetY - (dev.offsetHeight || 30) / 2;
                // store target on device for later animation
                dev._targetLeft = targetLeft;
                dev._targetTop = targetTop;
            });
        });

        // If this is the first layout pass, animate from center into place
        if(!this._hasAnimatedInitial){
            const centerLeft = centerX; const centerTop = centerY;
            // place everything at center first
            groupTargets.forEach(t=>{
                const {group, gW, gH} = t;
                group.style.left = (centerLeft - gW/2) + 'px';
                group.style.top = (centerTop - gH/2) + 'px';
                // devices at center
                const children = this.devices.filter(d=>d.dataset.group===group.dataset.group);
                children.forEach(dev=>{
                    dev.style.left = (centerLeft - (dev.offsetWidth||30)/2) + 'px';
                    dev.style.top = (centerTop - (dev.offsetHeight||30)/2) + 'px';
                });
            });

            // Ensure any lingering 'dragging' class is removed so transitions are active
            try{ const tRoot = this.querySelector('#topology'); if(tRoot && tRoot.classList.contains('dragging')) tRoot.classList.remove('dragging'); }catch(e){}

            // Force a layout reflow so the browser registers the "from" positions
            void this.offsetWidth;

            // apply targets on next animation frame to trigger transitions
            requestAnimationFrame(()=>{
                requestAnimationFrame(()=>{
                    groupTargets.forEach(t=>{
                        const {group, gLeft, gTop} = t;
                        group.style.left = gLeft + 'px';
                        group.style.top = gTop + 'px';
                        const children = this.devices.filter(d=>d.dataset.group===group.dataset.group);
                        children.forEach(dev=>{
                            if(dev._targetLeft!=null){ dev.style.left = dev._targetLeft + 'px'; dev.style.top = dev._targetTop + 'px'; }
                        });
                    });
                    // After applying target positions, ensure lines and info boxes update.
                    this.drawLines();
                    this.updateDeviceInfo();

                    // While the CSS transitions run, keep redrawing lines for smooth tracking.
                    const duration = 600; // ms - should match/cover CSS transition duration
                    const start = performance.now();
                    const tick = (ts) => {
                        this.drawLines();
                        if (ts - start < duration) requestAnimationFrame(tick);
                        else this.drawLines();
                    };
                    requestAnimationFrame(tick);
                });
            });
            this._hasAnimatedInitial = true;
        } else {
            // not first pass: animate to new targets
            try{ const tRoot = this.querySelector('#topology'); if(tRoot && tRoot.classList.contains('dragging')) tRoot.classList.remove('dragging'); }catch(e){}
            // force reflow so transitions fire when we set new positions
            void this.offsetWidth;
            requestAnimationFrame(()=>{
                groupTargets.forEach(t=>{
                    const {group, gLeft, gTop} = t;
                    group.style.left = gLeft + 'px';
                    group.style.top = gTop + 'px';
                    const children = this.devices.filter(d=>d.dataset.group===group.dataset.group);
                    children.forEach(dev=>{
                        if(dev._targetLeft!=null){ dev.style.left = dev._targetLeft + 'px'; dev.style.top = dev._targetTop + 'px'; }
                    });
                });
                // draw lines after positions set so transitions can animate them smoothly
                this.drawLines();
            });
        }

        // After positioning groups/devices, refresh lines (lines will update as transitions occur)
        this.drawLines();
    }

    updateDeviceInfo(){
        if(!this.devices || !this.devices.length) return;
        this.devices.forEach(dev=>{
            try{
                let displayTime = 'unbekannt';
                if(dev.dataset.lastSeen){
                    displayTime = this.formatLastSeen(dev.dataset.lastSeen);
                }else{
                    dev.dataset.time = String((parseInt(dev.dataset.time,10)||0)+1);
                    displayTime = this.formatTime(parseInt(dev.dataset.time,10)||0);
                }
                dev.dataset.timeLabel = displayTime;
                if(typeof dev.updateInfoBox==='function') dev.updateInfoBox(displayTime,this);
            }catch(e){ }
        });
    }

    showBottomInfo(i){
        if(!this.devices || !this.devices.length) return;
        if(!this.devices[i]) return;
        const d=this.devices[i];
        try{
            this.devices.forEach(dev=>dev.classList && dev.classList.remove('selected'));
            d.classList && d.classList.add('selected');
            const timeLabel = d.dataset.timeLabel || this.formatLastSeen(d.dataset.lastSeen);
            if(this.bottomDetail) this.bottomDetail.innerHTML=`<b>${d.dataset.name}</b> · Gruppe: ${d.dataset.group} · IP: ${d.dataset.ipAddress || '-'} · zuletzt: ${timeLabel}`;
        }catch(e){ }
    }
}

// ======================
// Custom Elements definieren
// ======================
customElements.define('network-device', NetworkDevice);
customElements.define('network-group', NetworkGroup);
customElements.define('network-topology', NetworkTopology);
    // Erzeuge und füge das Topology-Element jetzt ein (nach der Definition)
    try{
        const topologyEl = document.createElement('network-topology');
        document.body.appendChild(topologyEl);
    }catch(e){
        // Fallback: create a simple container if custom element cannot be created.
        const div = document.createElement('div'); div.id = 'topology-root-fallback'; document.body.appendChild(div);
        try{ if(typeof NetworkTopology === 'function'){ const inst = new NetworkTopology(); if(typeof inst.connectedCallback==='function') inst.connectedCallback(); }}catch(err){ /* ignore fallback init errors */ }
    }
