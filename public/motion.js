(function () {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let entered = false;
  let renderTick = 0;

  function canAnimate() {
    return Boolean(window.gsap) && !reduceMotion.matches;
  }

  function pageEnter() {
    if (!canAnimate() || entered) return;
    entered = true;

    const timeline = window.gsap.timeline({
      defaults: { duration: 0.48, ease: 'power2.out' }
    });

    timeline
      .from('.sidebar', { autoAlpha: 0, x: -14 })
      .from('.topbar > *', { autoAlpha: 0, y: 12, stagger: 0.08 }, '-=0.25')
      .from('.metric', { autoAlpha: 0, y: 14, stagger: 0.05 }, '-=0.2')
      .from('.trend-card, .source-item', { autoAlpha: 0, y: 10, stagger: 0.018 }, '-=0.15');
  }

  function renderUpdate({ platform = 'all' } = {}) {
    if (!canAnimate()) return;

    const tick = ++renderTick;
    window.requestAnimationFrame(() => {
      if (tick !== renderTick) return;

      const listSelector = platform === 'all' ? '.trend-card' : '.source-item';
      const rows = Array.from(document.querySelectorAll(listSelector)).slice(0, 36);
      if (rows.length) {
        window.gsap.fromTo(
          rows,
          { autoAlpha: 0, y: 8 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.32,
            stagger: 0.014,
            ease: 'power2.out',
            overwrite: true
          }
        );
      }

    });
  }

  function setLoading(isLoading) {
    if (!canAnimate()) return;
    const button = document.querySelector('#refreshButton');
    if (!button) return;

    window.gsap.to(button, {
      scale: isLoading ? 0.94 : 1,
      duration: 0.18,
      ease: 'power2.out',
      overwrite: true
    });
  }

  document.addEventListener('change', (event) => {
    if (!canAnimate()) return;
    const input = event.target.closest('input[data-select-id]');
    if (!input) return;

    const mark = input.nextElementSibling;
    if (!mark) return;

    window.gsap.fromTo(mark, { scale: 0.8 }, { scale: 1, duration: 0.24, ease: 'back.out(2.2)' });
  });

  window.hpMotion = {
    pageEnter,
    renderUpdate,
    setLoading
  };
})();
