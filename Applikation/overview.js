// SPEED CHART
const canvas = document.getElementById("speedChart");
const ctx = canvas.getContext("2d");

const upload = [30, 220, 300, 250];
const download = [220, 250, 190, 300];

function drawLine(data, color) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;

    data.forEach((val, i) => {
        const x = i * (canvas.width / 3);
        const y = canvas.height - val * 0.6;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });

    ctx.stroke();
}

drawLine(upload, "#3b82f6");
drawLine(download, "#6ee7c8");

// POOL LAYOUT
const cards = Array.from(document.querySelectorAll('.card'));
const buttons = document.querySelectorAll(".bottom-nav button");

function fitCardsPool() {
    const dashboard = document.querySelector('.dashboard');
    const visibleCards = cards.filter(c => !c.classList.contains('hidden'));
    const gap = 20;
    const vw = window.innerWidth - 40;
    const vh = window.innerHeight - 40;

    if (!visibleCards.length) return;

    let bestCols = 1;
    let bestSize = 0;

    for (let cols = 1; cols <= visibleCards.length; cols++) {
        const rows = Math.ceil(visibleCards.length / cols);
        const w = (vw - gap*(cols-1))/cols;
        const h = (vh - gap*(rows-1))/rows;
        const size = Math.min(w,h);
        if (size > bestSize && w >= 120 && h >= 80) {
            bestSize = size;
            bestCols = cols;
        }
    }

    const rows = Math.ceil(visibleCards.length / bestCols);
    const cardWidth = (vw - gap*(bestCols-1))/bestCols *0.9;
    const cardHeight = (vh - gap*(rows-1))/rows *0.9;

    visibleCards.forEach((card,i)=>{
        const col = i % bestCols;
        const row = Math.floor(i / bestCols);
        card.style.position = 'absolute';
        card.style.left = `${col*(cardWidth+gap)}px`;
        card.style.top = `${row*(cardHeight+gap)}px`;
        card.style.width = `${cardWidth}px`;
        card.style.height = `${cardHeight}px`;
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
