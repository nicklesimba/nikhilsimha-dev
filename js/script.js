document.getElementById('year').textContent = new Date().getFullYear();

// Highlight the active sidebar nav link based on which section is in view.
const sections = document.querySelectorAll('main section[id]');
const navLinks = document.querySelectorAll('.side-nav a');

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    navLinks.forEach((link) => {
      link.classList.toggle('active', link.getAttribute('href') === `#${entry.target.id}`);
    });
  });
}, { rootMargin: '-40% 0px -50% 0px' });

sections.forEach((section) => observer.observe(section));
