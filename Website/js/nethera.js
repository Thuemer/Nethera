// Keep setup cards mutually exclusive without intercepting keyboard input.
const steps = document.querySelectorAll('.grid-box');

steps.forEach(step => {
    step.addEventListener('toggle', () => {
        if (!step.open) return;
        steps.forEach(other => {
            if (other !== step) other.open = false;
        });
    });
});

function openLinkedStep(hash = window.location.hash) {
    const target = document.getElementById(hash.slice(1));
    if (target?.matches('.grid-box')) target.open = true;
}

window.addEventListener('hashchange', () => openLinkedStep());
// A repeated click on the same anchor does not emit hashchange.
document.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#"]');
    if (link) openLinkedStep(link.getAttribute('href'));
});
openLinkedStep();

// Animate sections as they enter the viewport; keep everything readable
// when motion is reduced or IntersectionObserver is unavailable.
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
let revealObserver;

function setupReveals() {
    revealObserver?.disconnect();
    const sections = document.querySelectorAll('[data-reveal]');
    sections.forEach(section => section.classList.remove('reveal-pending', 'is-visible'));
    if (motionPreference.matches || !('IntersectionObserver' in window)) return;

    revealObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('is-visible');
            revealObserver.unobserve(entry.target);
        });
    }, { threshold: 0.08 });

    sections.forEach(section => {
        section.classList.add('reveal-pending');
        revealObserver.observe(section);
    });
}

setupReveals();
motionPreference.addEventListener('change', setupReveals);

const header = document.getElementById('headlineHead');
function updateHeader() {
    header?.classList.toggle('scrolled', window.scrollY > 12);
}
window.addEventListener('scroll', updateHeader, { passive: true });
updateHeader();
