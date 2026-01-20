// SPEED CHART
const canvas = document.getElementById("speedChart");
const ctx = canvas.getContext("2d");

const upload = [30, 220, 300, 250];
const download = [220, 250, 190, 300];
const labels = ["12:00", "12:05", "12:10", "12:15"];

const padding = {
    left: 50,
    right: 20,
    top: 20,
    bottom: 40
};

function drawAxes(maxY) {
    ctx.strokeStyle = "#aaa";
    ctx.lineWidth = 1;

    // Y-Achse
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, canvas.height - padding.bottom);
    ctx.stroke();

    // X-Achse
    ctx.beginPath();
    ctx.moveTo(padding.left, canvas.height - padding.bottom);
    ctx.lineTo(canvas.width - padding.right, canvas.height - padding.bottom);
    ctx.stroke();

    // Y Labels
    ctx.fillStyle = "#aaa";
    ctx.font = "12px system-ui";
    const steps = 4;

    for (let i = 0; i <= steps; i++) {
        const val = Math.round((maxY / steps) * i);
        const y =
            canvas.height -
            padding.bottom -
            (i / steps) *
                (canvas.height - padding.top - padding.bottom);

        ctx.fillText(`${val} MB/s`, 5, y + 4);

        ctx.strokeStyle = "#333";
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(canvas.width - padding.right, y);
        ctx.stroke();
    }

    // X Labels
    labels.forEach((label, i) => {
        const x =
            padding.left +
            (i / (labels.length - 1)) *
                (canvas.width - padding.left - padding.right);

        ctx.fillText(label, x - 12, canvas.height - 10);
    });
}

function drawLine(data, color, maxY) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;

    data.forEach((val, i) => {
        const x =
            padding.left +
            (i / (data.length - 1)) *
                (canvas.width - padding.left - padding.right);

        const y =
            canvas.height -
            padding.bottom -
            (val / maxY) *
                (canvas.height - padding.top - padding.bottom);

        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });

    ctx.stroke();
}

function drawChart() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const maxY = Math.max(...upload, ...download) * 1.1;

    drawAxes(maxY);
    drawLine(upload, "#3b82f6", maxY);
    drawLine(download, "#6ee7c8", maxY);
}

drawChart();


// POOL LAYOUT
const cards = Array.from(document.querySelectorAll('.card'));
const buttons = document.querySelectorAll(".bottom-nav button");

function fitCardsPool() {
        if (editMode) return;

    const dashboard = document.querySelector('.dashboard');
    const visibleCards = cards.filter(c => !c.classList.contains('hidden'));
    const gap = 20;

    const vw = dashboard.clientWidth;
    const vh = dashboard.clientHeight;

    const count = visibleCards.length;
    if (!count) return;

    let cols;

    // Sonderfälle
    if (count === 3) cols = 2;
    else if (count === 5) cols = 3;
    else cols = Math.ceil(Math.sqrt(count));

    const rows = Math.ceil(count / cols);

    const cardWidth  = Math.min((vw - gap * (cols - 1)) / cols, 420);
    const cardHeight = Math.min((vh - gap * (rows - 1)) / rows, 260);

    const totalGridWidth =
        cols * cardWidth + gap * (cols - 1);

    const startX = (vw - totalGridWidth) / 2;

    visibleCards.forEach((card, i) => {
        const row = Math.floor(i / cols);
        const col = i % cols;

        // letzte Reihe erkennen
        const isLastRow = row === rows - 1;
        const itemsInLastRow =
            count % cols === 0 ? cols : count % cols;

        let x = startX + col * (cardWidth + gap);

        // letzte Reihe zentrieren
        if (isLastRow && itemsInLastRow < cols) {
            const rowWidth =
                itemsInLastRow * cardWidth +
                (itemsInLastRow - 1) * gap;

            const offset =
                (totalGridWidth - rowWidth) / 2;

            x = startX + offset + col * (cardWidth + gap);
        }

        card.style.position = 'absolute';
        card.style.width = `${cardWidth}px`;
        card.style.height = `${cardHeight}px`;
        card.style.left = `${x}px`;
        card.style.top = `${row * (cardHeight + gap)}px`;
    });
}



buttons.forEach(button => {
    button.addEventListener("click", () => {
        const filter = button.dataset.filter;

        // toggle nur die Karten dieser Section
        cards.forEach(card => {
            if (card.dataset.section && card.dataset.section.trim() === filter) {
                card.classList.toggle("hidden");
            }
        });

        button.classList.toggle("active");

        // Pool neu berechnen nach CSS Transition
        setTimeout(fitCardsPool, 50);
    });
});



// Laden & Resize
window.addEventListener("load", fitCardsPool);
window.addEventListener("resize", fitCardsPool);


let editMode = false;

document.getElementById("editToggle").onclick = () => {
    editMode = !editMode;
    document.body.classList.toggle("edit-mode", editMode);

    if (!editMode) saveLayout();
};


cards.forEach(card => {
    let offsetX, offsetY, dragging = false;

    card.addEventListener("mousedown", e => {
        if (!editMode) return;
        dragging = true;
        offsetX = e.clientX - card.offsetLeft;
        offsetY = e.clientY - card.offsetTop;
        card.style.zIndex = 1000;
    });

    document.addEventListener("mousemove", e => {
        if (!dragging) return;
        card.style.left = `${e.clientX - offsetX}px`;
        card.style.top = `${e.clientY - offsetY}px`;
    });

    document.addEventListener("mouseup", () => {
        dragging = false;
        card.style.zIndex = "";
    });
});
 

cards.forEach(card => {
    const handle = document.createElement("div");
    handle.className = "resize-handle";
    card.appendChild(handle);

    let resizing = false;

    handle.addEventListener("mousedown", e => {
        if (!editMode) return;
        e.stopPropagation();
        resizing = true;
    });

    document.addEventListener("mousemove", e => {
        if (!resizing) return;
        card.style.width = `${e.clientX - card.offsetLeft}px`;
        card.style.height = `${e.clientY - card.offsetTop}px`;
    });

    document.addEventListener("mouseup", () => resizing = false);
});


function saveLayout() {
    const layout = {};
    cards.forEach(card => {
        layout[card.dataset.section] = {
            left: card.style.left,
            top: card.style.top,
            width: card.style.width,
            height: card.style.height
        };
    });
    localStorage.setItem("dashboardLayout", JSON.stringify(layout));
}


function loadLayout() {
    const saved = JSON.parse(localStorage.getItem("dashboardLayout"));
    if (!saved) return;

    cards.forEach(card => {
        const l = saved[card.dataset.section];
        if (!l) return;

        Object.assign(card.style, l);
        card.style.position = "absolute";
    });
}

window.addEventListener("load", loadLayout);


document.getElementById("resetLayout").onclick = () => {
    localStorage.removeItem("dashboardLayout");

    editMode = false;
    document.body.classList.remove("edit-mode");

    cards.forEach(card => {
        card.style.left = "";
        card.style.top = "";
        card.style.width = "";
        card.style.height = "";
        card.style.position = "";
        card.style.zIndex = "";
    });

    setTimeout(fitCardsPool, 50);
};

