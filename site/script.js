const copyButton = document.querySelector('[data-copy]');
const copyStatus = document.querySelector('#copy-status');

if (copyButton) {
  copyButton.addEventListener('click', async () => {
    const text = copyButton.getAttribute('data-copy');

    try {
      await navigator.clipboard.writeText(text);
      if (copyStatus) {
        copyStatus.textContent = 'Install command copied to clipboard.';
      }
    } catch {
      if (copyStatus) {
        copyStatus.textContent = 'Copy failed. The install command is visible in the hero panel.';
      }
    }
  });
}

const revealNodes = document.querySelectorAll('[data-reveal]');

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      }
    },
    {
      threshold: 0.18,
    },
  );

  revealNodes.forEach((node) => observer.observe(node));
} else {
  revealNodes.forEach((node) => node.classList.add('is-visible'));
}