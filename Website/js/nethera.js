 const container = document.querySelector('.grid-container');
const boxes = document.querySelectorAll('.grid-box');

function focusBox(index) {
    boxes.forEach((box, i) => {
        box.classList.remove('active', 'neighbor', 'hidden');

        if (i === index) {
            box.classList.add('active');
        } else if (i === index - 1 || i === index + 1) {
            box.classList.add('neighbor');
        } else {
            box.classList.add('hidden');
        }
    });
}

boxes.forEach((box, index) => {
    box.addEventListener('click', () => {
        if (box.classList.contains('active')) {
            boxes.forEach(b => b.classList.remove('active', 'neighbor', 'hidden'));
        } else {
            focusBox(index);
        }
    });
});

   document.querySelectorAll(".container-box").forEach(box => {
            const header = box.querySelector(".flex");
            const content = box.querySelector(".box-content");
            const caret = box.querySelector(".caret-down");
            const preview = box.querySelector(".preview");

            header.addEventListener("click", () => {

                if (content.style.maxHeight) {
                    // Zuklappen
                    content.style.maxHeight = null;
                    caret.classList.remove("caret-rotated");

                    // Preview wieder anzeigen
                    preview.style.opacity = 1;
                } else {
                    // Aufklappen
                    content.style.maxHeight = content.scrollHeight + "px";
                    caret.classList.add("caret-rotated");

                    // Preview ausblenden
                    preview.style.opacity = 0;
                }
            });
        });



const dots = [
    { x: 150, y: 200, size: 75 },
    { x: 1200, y: 700, size: 50 },
    { x: 375, y: 650, size: 75 },
    { x: 900, y: 350, size: 80 },
    { x: 1400, y: 200, size: 100 }
];

const repeats = 3;            
const verticalOffset = 800;   

for (let r = 0; r < repeats; r++) {
    dots.forEach(d => {
        const dot = document.createElement('div');
        dot.className = 'dot';
        dot.style.left = d.x + 'px';
        dot.style.top = (d.y + r * verticalOffset) + 'px';
        dot.style.width = d.size + 'px';
        dot.style.height = d.size + 'px';
        document.body.appendChild(dot);
    });
}



function smoothScrollTo(element) {
  const targetY = element.getBoundingClientRect().top + window.pageYOffset;
  const startY = window.pageYOffset;
  const distance = targetY - startY;
  const duration = 1000; // ms
  let start = null;

  function step(timestamp) {
    if (!start) start = timestamp;
    const progress = timestamp - start;
    const ease = 1 - Math.pow(1 - progress / duration, 3); // easeOutCubic
    window.scrollTo(0, startY + distance * ease);
    if (progress < duration) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('more-btn');
  const target = document.getElementById('steps');

  btn.addEventListener('click', e => {
    e.preventDefault();
    smoothScrollTo(target);
  });
});

document.addEventListener('DOMContentLoaded', () => {
  const featuresLink = document.getElementById('features-link');
  const target2 = document.getElementById('steps2'); // Ziel-Section

  if (featuresLink && target2) {
    featuresLink.addEventListener('click', e => {
      e.preventDefault();
      smoothScrollTo(target2);
    });
  }
});
