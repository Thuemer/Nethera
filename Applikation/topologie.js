const router = document.getElementById('router');
const groups = Array.from(document.querySelectorAll('.group'));
const devices = Array.from(document.querySelectorAll('.device'));
const svg = document.getElementById('lines');
const editBox = document.getElementById('edit-box');
const editName = document.getElementById('edit-name');
const editGroup = document.getElementById('edit-group');
const editSave = document.getElementById('edit-save');
const bottomDetail = document.getElementById('device-detail');
let selectedIndex = 0;

// Linien zeichnen
function drawLines(){
  svg.innerHTML='';
  const rRect=router.getBoundingClientRect();
  const rX=rRect.left+rRect.width/2;
  const rY=rRect.top+rRect.height/2;

  groups.forEach(group=>{
    const gRect=group.getBoundingClientRect();
    const gX=gRect.left+gRect.width/2;
    const gY=gRect.top+gRect.height/2;

    let line=document.createElementNS("http://www.w3.org/2000/svg","line");
    line.setAttribute("x1",rX);
    line.setAttribute("y1",rY);
    line.setAttribute("x2",gX);
    line.setAttribute("y2",gY);
    line.setAttribute("stroke","#0ff");
    line.setAttribute("stroke-width","2");
    line.setAttribute("stroke-opacity","0.7");
    svg.appendChild(line);

    const children = devices.filter(d=>d.dataset.group===group.dataset.group);
    children.forEach(dev=>{
      const dRect=dev.getBoundingClientRect();
      const dX=dRect.left+dRect.width/2;
      const dY=dRect.top+dRect.height/2;
      let l=document.createElementNS("http://www.w3.org/2000/svg","line");
      l.setAttribute("x1",gX);
      l.setAttribute("y1",gY);
      l.setAttribute("x2",dX);
      l.setAttribute("y2",dY);
      l.setAttribute("stroke","#0ff");
      l.setAttribute("stroke-width","2");
      l.setAttribute("stroke-opacity","0.7");
      svg.appendChild(l);
    });
  });
}

// Zeit formatieren
function formatTime(sec){
  const h=Math.floor(sec/3600);
  const m=Math.floor((sec%3600)/60);
  const s=sec%60;
  return `${h}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
}

// Mercedes-Stern Layout für Gruppen + Devices radial
function initLayout(){
  const width = window.innerWidth;
  const height = window.innerHeight-60;
  const centerX = width/2;
  const centerY = height/2;
  const groupRadius = Math.min(width,height)/3;

  // Mercedes-Stern Winkel
  const groupAngles = {
    "Alle": -Math.PI/2,
    "Kinder": (2*Math.PI)/3,
    "Eltern": -(2*Math.PI)/3
  };

  groups.forEach(group=>{
    const angle = groupAngles[group.dataset.group];
    const gLeft = centerX + groupRadius*Math.cos(angle) - group.offsetWidth/2;
    const gTop  = centerY + groupRadius*Math.sin(angle) - group.offsetHeight/2;
    group.style.left = gLeft+'px';
    group.style.top  = gTop+'px';

    const children = devices.filter(d=>d.dataset.group===group.dataset.group);
    const devRadius = 140;

    children.forEach((dev,i)=>{
      // **Nur initial setzen, wenn offsets undefined**
      if(dev.offsetX===undefined || dev.offsetY===undefined){
        const devAngle = (2*Math.PI/children.length)*i - Math.PI/2;
        dev.offsetX = devRadius*Math.cos(devAngle);
        dev.offsetY = devRadius*Math.sin(devAngle);
        dev.style.left = gLeft + group.offsetWidth/2 + dev.offsetX - dev.offsetWidth/2 + 'px';
        dev.style.top  = gTop  + group.offsetHeight/2 + dev.offsetY - dev.offsetHeight/2 + 'px';
      } else {
        // Falls offsets schon gesetzt sind, nur Position nach Gruppe verschieben
        dev.style.left = group.offsetLeft + group.offsetWidth/2 + dev.offsetX - dev.offsetWidth/2 + 'px';
        dev.style.top  = group.offsetTop  + group.offsetHeight/2 + dev.offsetY - dev.offsetHeight/2 + 'px';
      }
    });
  });

  drawLines();
}


// Info Box
function updateDeviceInfo(){
  devices.forEach(dev=>{
    dev.dataset.time = parseInt(dev.dataset.time)+1;
    if(!dev.infoBox){
      let box=document.createElement('div');
      box.classList.add('device-info');
      dev.infoBox=box;
      document.getElementById('topology').appendChild(box);
    }
    const rect=dev.getBoundingClientRect();
    dev.infoBox.style.left = (rect.right +5)+'px';
    dev.infoBox.style.top = rect.top+'px';
    dev.infoBox.innerHTML = `<b>${dev.dataset.name}</b><br>Im Netzwerk seit: ${formatTime(dev.dataset.time)}<br>Gruppe: ${dev.dataset.group}`;
  });
}

// Bottom Info
function showBottomInfo(i){
  let d=devices[i];
  devices.forEach(dev=>dev.classList.remove('selected'));
  d.classList.add('selected');
  bottomDetail.innerHTML=`<b>${d.dataset.name}</b> | Gruppe: ${d.dataset.group} | Netzwerkzeit: ${formatTime(d.dataset.time)}`;
}

// Drag & Drop
groups.concat(devices).forEach(elem=>{
  let dragging=false, startX, startY, offsetX, offsetY;
  elem.addEventListener('mousedown', e=>{
    e.preventDefault();
    startX=e.clientX; startY=e.clientY;
    offsetX=e.clientX - elem.offsetLeft;
    offsetY=e.clientY - elem.offsetTop;
    dragging=false;

    function moveHandler(e){
      let dx=e.clientX-startX;
      let dy=e.clientY-startY;
      if(Math.abs(dx)>2 || Math.abs(dy)>2) dragging=true;
      elem.style.left = e.clientX - offsetX + 'px';
      elem.style.top  = e.clientY - offsetY + 'px';

      if(elem.classList.contains('group')){
        const children = devices.filter(d=>d.dataset.group===elem.dataset.group);
        children.forEach(dev=>{
            dev.style.left = elem.offsetLeft + elem.offsetWidth/2 + dev.offsetX - dev.offsetWidth/2 + 'px';
            dev.style.top  = elem.offsetTop  + elem.offsetHeight/2 + dev.offsetY - dev.offsetHeight/2 + 'px';
        });
        }
 else if(elem.classList.contains('device')){
        const group = groups.find(g=>g.dataset.group===elem.dataset.group);
        elem.offsetX = elem.offsetLeft - group.offsetLeft;
        elem.offsetY = elem.offsetTop - group.offsetTop;
      }
      drawLines();
      updateDeviceInfo();
    }

    function upHandler(){
      document.removeEventListener('mousemove', moveHandler);
      document.removeEventListener('mouseup', upHandler);
    }

    document.addEventListener('mousemove', moveHandler);
    document.addEventListener('mouseup', upHandler);
  });

  elem.addEventListener('click', e=>{
    if(dragging) return;
    selectedIndex = devices.indexOf(elem);
    if(selectedIndex>=0) showBottomInfo(selectedIndex);
  });

  elem.addEventListener('dblclick', e=>{
    e.stopPropagation();
    if(elem.classList.contains('device')){
      const rect=elem.getBoundingClientRect();
      editBox.style.left = (rect.right+5)+'px';
      editBox.style.top  = rect.top+'px';
      editName.value = elem.dataset.name;
      editGroup.value = elem.dataset.group;
      editBox.currentDevice=elem;
      editBox.style.display='block';
    }
  });
});

// Edit Box
editSave.addEventListener('click', ()=>{
  let d = editBox.currentDevice;
  if(!d) return;

  const newName = editName.value.trim();
  const newGroupName = editGroup.value.trim();

  if(newName) d.dataset.name = newName;

  // Prüfen, ob Gruppe existiert
  let group = groups.find(g => g.dataset.group === newGroupName);
  if(!group){
    // Neue Gruppe erstellen
    group = document.createElement('div');
    group.classList.add('group');
    group.dataset.group = newGroupName;
    group.innerText = newGroupName;
    document.getElementById('topology').appendChild(group);
    groups.push(group);

    // Standardposition (radial um Router)
    const width = window.innerWidth;
    const height = window.innerHeight-60;
    const centerX = width/2;
    const centerY = height/2;
    const groupRadius = 200; // Abstand vom Router
    group.style.left = (centerX + Math.random()*groupRadius - groupRadius/2) + 'px';
    group.style.top  = (centerY + Math.random()*groupRadius - groupRadius/2) + 'px';

    // Drag & Drop für neue Gruppe aktivieren
    addDragAndClick(group);
  }

  // Gerät zur neuen Gruppe verschieben
  d.dataset.group = newGroupName;

  // Offset beibehalten, relativ zur Gruppe
  d.style.left = group.offsetLeft + group.offsetWidth/2 + (d.offsetX||0) - d.offsetWidth/2 + 'px';
  d.style.top  = group.offsetTop  + group.offsetHeight/2 + (d.offsetY||0) - d.offsetHeight/2 + 'px';

  drawLines();
  editBox.style.display='none';
  showBottomInfo(selectedIndex);
});

editBox.addEventListener('click', e=>e.stopPropagation());
window.addEventListener('click', ()=>{ editBox.style.display='none'; });

// Bottom Pfeile
document.getElementById('prev-device').addEventListener('click', ()=>{
  selectedIndex = (selectedIndex -1 + devices.length)%devices.length;
  showBottomInfo(selectedIndex);
});
document.getElementById('next-device').addEventListener('click', ()=>{
  selectedIndex = (selectedIndex +1)%devices.length;
  showBottomInfo(selectedIndex);
});

// Init nach dem Laden
window.addEventListener('load', ()=>{
  initLayout();
  updateDeviceInfo();
  showBottomInfo(selectedIndex);
});

setInterval(()=>{
  updateDeviceInfo();
  showBottomInfo(selectedIndex);
},1000);

window.addEventListener('resize', ()=>{
  drawLines();
});