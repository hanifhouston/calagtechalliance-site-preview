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
