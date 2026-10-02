/* Shared progressive enhancement; all ordinary page links work without JS. */
(() => {
  const menu = document.querySelector('#primary-menu');
  const toggle = document.querySelector('[data-menu-toggle]');
  const groups = [...document.querySelectorAll('.nav-group')];
  const closeMenu = (restoreFocus = false) => {
    menu?.classList.remove('is-open');
    toggle?.setAttribute('aria-expanded', 'false');
    groups.forEach(group => { group.open = false; });
    if (restoreFocus) toggle?.focus();
  };
  toggle?.addEventListener('click', () => {
    const open = !menu.classList.contains('is-open');
    menu.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  });
  groups.forEach(group => group.addEventListener('toggle', () => {
    if (group.open) groups.filter(other => other !== group).forEach(other => { other.open = false; });
  }));
  document.addEventListener('click', event => {
    groups.filter(group => !group.contains(event.target)).forEach(group => { group.open = false; });
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const open = groups.find(group => group.open);
    if (open) { open.open = false; open.querySelector('summary').focus(); }
    else if (menu?.classList.contains('is-open')) closeMenu(true);
  });
  window.matchMedia('(max-width: 1100px)').addEventListener('change', () => closeMenu());
  // Home region finder: pills and county shapes select a region; the matching card shows.
  document.querySelectorAll('[data-region-finder]').forEach(finder => {
    const shapes = [...finder.querySelectorAll('path[data-region]')];
    const select = key => {
      finder.querySelectorAll('.region-pill').forEach(pill => pill.setAttribute('aria-pressed', String(pill.dataset.region === key)));
      finder.querySelectorAll('[data-region-panel]').forEach(card => { card.hidden = card.dataset.regionPanel !== key; });
      shapes.forEach(shape => shape.classList.toggle('is-on', shape.dataset.region === key));
    };
    const hover = key => shapes.forEach(shape => shape.classList.toggle('is-hover', !!key && shape.dataset.region === key));
    finder.querySelectorAll('.region-pill').forEach(pill => pill.addEventListener('click', () => select(pill.dataset.region)));
    shapes.forEach(shape => {
      shape.addEventListener('click', () => select(shape.dataset.region));
      shape.addEventListener('mouseenter', () => hover(shape.dataset.region));
      shape.addEventListener('mouseleave', () => hover(null));
    });
  });
  // Home calendar: recount "days left" against today so the static page stays current; drop past items.
  const today = new Date(); today.setHours(0, 0, 0, 0);
  document.querySelectorAll('[data-deadline]').forEach(row => {
    const [y, m, d] = row.dataset.deadline.split('-').map(Number);
    const days = Math.round((new Date(y, m - 1, d) - today) / 864e5) + (row.hasAttribute('data-inclusive') ? 1 : 0);
    if (days < 0) { row.hidden = true; return; }
    row.querySelector('.deadline__n').textContent = days;
    row.querySelector('.deadline__label').textContent = days === 1 ? 'Day left' : 'Days left';
    row.querySelector('.deadline').classList.toggle('is-soon', days <= 7);
  });
  document.querySelectorAll('[data-tabs]').forEach(group => {
    const tabs = [...group.querySelectorAll('[role="tab"]')];
    const select = tab => {
      tabs.forEach(other => {
        const active = other === tab;
        other.setAttribute('aria-selected', String(active));
        other.tabIndex = active ? 0 : -1;
        const panel = document.getElementById(other.getAttribute('aria-controls'));
        if (panel) panel.hidden = !active;
      });
    };
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => select(tab));
      tab.addEventListener('keydown', event => {
        let next;
        if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
        if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = tabs.length - 1;
        if (next !== undefined) { event.preventDefault(); select(tabs[next]); tabs[next].focus(); }
      });
    });
  });
})();
