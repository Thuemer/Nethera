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
