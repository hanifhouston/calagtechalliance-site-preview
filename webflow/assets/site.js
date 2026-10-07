/* Shared progressive enhancement; all ordinary page links work without JS. */
(() => {
  // Site navigation (site_builder/navigation.py; the user's design of 2026-10-05). Each section's name becomes a button that
  // opens its panel (without the script it's a link to the section's overview page). One panel at a time; Escape, a click
  // outside or on the scrim, or focus leaving the panel closes it. Under 1200px the Menu button opens the drawer, where the
  // panels open in place.
  const nav = document.querySelector('[data-mnav]');
  const menu = document.querySelector('#primary-menu');
  const toggle = document.querySelector('[data-menu-toggle]');
  const narrow = window.matchMedia('(max-width: 1200px)');  // the drawer (site.css; 1200px since 2026-10-06)
  const lis = nav ? [...nav.querySelectorAll('.mnav-li')] : [];
  const scrim = nav && nav.querySelector('[data-mnav-scrim]');
  let openLi = null;
  lis.forEach(li => { li.querySelector('[data-mnav-link]').hidden = true; li.querySelector('[data-mnav-trigger]').hidden = false; li.querySelector('[data-mnav-panel]').hidden = true; });
  const setPanel = (li, refocus = false) => {
    const was = openLi;
    lis.forEach(x => {
      const on = x === li;
      x.querySelector('[data-mnav-trigger]').setAttribute('aria-expanded', String(on));
      x.querySelector('[data-mnav-panel]').hidden = !on;
    });
    if (scrim) scrim.hidden = !li || narrow.matches;
    openLi = li;
    if (li && narrow.matches) li.scrollIntoView({ block: 'start', behavior: 'instant' });  // the drawer: the menu just opened, from its top
    if (!li && refocus && was) was.querySelector('[data-mnav-trigger]').focus();
  };
  const closeMenu = (restoreFocus = false) => {
    menu?.classList.remove('is-open');
    toggle?.setAttribute('aria-expanded', 'false');
    setPanel(null);
    if (restoreFocus) toggle?.focus();
  };
  toggle?.addEventListener('click', () => {
    const open = !menu.classList.contains('is-open');
    menu.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    if (!open) setPanel(null);
    if (open && narrow.matches) {  // the toggle sits after the drawer in the DOM, so Tab would leave it: start inside (audit, 2026-10-06)
      const first = [...menu.querySelectorAll('a[href], button')].find(el => !el.hidden && el.getClientRects().length);
      first?.focus();
    }
  });
  lis.forEach(li => li.querySelector('[data-mnav-trigger]').addEventListener('click', () => setPanel(openLi === li ? null : li)));
  scrim?.addEventListener('click', () => setPanel(null));
  document.addEventListener('mousedown', event => { if (openLi && !narrow.matches && nav && !nav.contains(event.target)) setPanel(null); });
  nav?.addEventListener('focusout', event => {
    const to = event.relatedTarget;
    if (!to) return;
    if (narrow.matches) { if (!nav.contains(to) && menu?.classList.contains('is-open')) closeMenu(); }  // focus left the drawer
    else if (openLi && !openLi.contains(to)) setPanel(null);  // Tab past the open panel
  });
  // Following a menu link closes the menu (a link to a section of this page would otherwise leave it open over the section).
  nav?.addEventListener('click', event => { if (event.target.closest('a[href]') && (openLi || menu?.classList.contains('is-open'))) closeMenu(); });
  window.addEventListener('pageshow', event => { if (event.persisted) closeMenu(); });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (openLi) setPanel(null, true);
    else if (menu?.classList.contains('is-open')) closeMenu(true);
  });
  narrow.addEventListener('change', () => closeMenu());
  // Home "Across California" (the home design of 2026-10-05): a pill, a county or a partner dot selects a region; its card
  // shows, its counties turn mint, and the map zooms to it (a CSS transform on the counties). Partner locations are lime
  // dots; dots that would overlap at the current zoom become one dot with the number of partners in it (the user,
  // 2026-10-05). Choosing a dot zooms to its region; a dot's title names its partners. The dots fade out while the map
  // zooms and are redrawn at the new scale, so overlapping dots part as the map spreads. All (the first pill, and the default) and "Show all of California" show the whole state with no region chosen.
  document.querySelectorAll('[data-region-finder]').forEach(finder => {
    const W = +finder.dataset.w, H = +finder.dataset.h, NS = 'http://www.w3.org/2000/svg';
    const data = JSON.parse(finder.querySelector('[data-region-data]').textContent);
    const shapes = [...finder.querySelectorAll('path[data-region]')], pills = [...finder.querySelectorAll('.region-pill')];
    const zoomEl = finder.querySelector('[data-region-zoom]'), dotsEl = finder.querySelector('[data-region-dots]'), all = finder.querySelector('[data-region-all]');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let current = (pills.find(p => p.getAttribute('aria-pressed') === 'true') || pills[0] || {}).dataset?.region;
    let view = [0, 0, 1], timer;
    const svgEl = (tag, attrs) => { const el = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v)); return el; };
    // Merge the closest pair while it's under dist apart (map units at this zoom), as the directory map does.
    const cluster = (pts, dist) => {
      const groups = pts.map(p => ({ items: [p], x: p.X, y: p.Y }));
      for (;;) {
        let bi = -1, bj = -1, bd = dist;
        for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
          const d = Math.hypot(groups[i].x - groups[j].x, groups[i].y - groups[j].y);
          if (d < bd) { bd = d; bi = i; bj = j; }
        }
        if (bi < 0) return groups;
        const a = groups[bi], b = groups[bj], n = a.items.length + b.items.length;
        groups[bi] = { items: a.items.concat(b.items), x: (a.x * a.items.length + b.x * b.items.length) / n, y: (a.y * a.items.length + b.y * b.items.length) / n };
        groups.splice(bj, 1);
      }
    };
    // A group's sites by partner: [{n, u, places: [place, …]}], A–Z.
    const groupByPartner = items => {
      const by = new Map();
      items.forEach(d => {
        const p = by.get(d.u) || by.set(d.u, { n: d.n, u: d.u, places: [] }).get(d.u);
        if (d.p && !p.places.includes(d.p)) p.places.push(d.p);
      });
      return [...by.values()].sort((a, b) => a.n.localeCompare(b.n));
    };
    const draw = () => {
      const [tx, ty, s] = view;
      const pts = data.sites.map(d => Object.assign({}, d, { X: tx + s * d.x, Y: ty + s * d.y })).filter(d => d.X > -6 && d.X < W + 6 && d.Y > -6 && d.Y < H + 6);
      dotsEl.replaceChildren();
      cluster(pts, 9).forEach(g => {
        const node = svgEl('g', { transform: `translate(${g.x.toFixed(1)} ${g.y.toFixed(1)})` });
        const regions = {};
        g.items.forEach(d => { if (d.r) regions[d.r] = (regions[d.r] || 0) + 1; });
        const region = Object.keys(regions).sort((a, b) => regions[b] - regions[a])[0];
        if (region) node.dataset.region = region;
        const title = svgEl('title', {});
        const partners = groupByPartner(g.items);  // a partner's own nearby sites count once
        if (partners.length === 1) {
          const d = partners[0];
          node.setAttribute('class', 'region-dot');
          node.appendChild(svgEl('circle', { r: 4.2 }));
          title.textContent = d.n + (d.places.length ? ' · ' + d.places.join(', ') : '');
        } else {
          // Partners in one place: a bigger dot with their number.
          const n = partners.length;
          node.setAttribute('class', 'region-cluster');
          node.appendChild(svgEl('circle', { r: n > 9 ? 8 : 7 }));
          const label = svgEl('text', { class: 'region-cluster__n', 'text-anchor': 'middle', dy: '0.35em' });
          label.textContent = String(n);
          node.appendChild(label);
          const names = partners.map(d => d.n);
          title.textContent = n + ' partners: ' + names.slice(0, 12).join('; ') + (n > 12 ? '; and ' + (n - 12) + ' more' : '');
        }
        node.appendChild(title);
        dotsEl.appendChild(node);
      });
    };
    // The counties zoom with a transition; the dots fade out, then are redrawn (and reclustered) at the new view.
    const setView = v => {
      view = v;
      zoomEl.style.transform = `translate(${v[0].toFixed(1)}px, ${v[1].toFixed(1)}px) scale(${v[2].toFixed(3)})`;
      if (reduced) { draw(); return; }
      dotsEl.classList.add('is-moving');
      clearTimeout(timer);
      timer = setTimeout(() => { draw(); dotsEl.classList.remove('is-moving'); }, 520);
    };
    const zoomTo = key => {
      const pill = pills.find(p => p.dataset.region === key);
      if (key === 'all') { setView([0, 0, 1]); all.hidden = true; return; }  // All: the whole state
      if (!pill) return;
      const [x0, y0, x1, y1] = pill.dataset.box.split(' ').map(Number), pad = 16;
      const s = Math.min(W / (x1 - x0 + pad * 2), H / (y1 - y0 + pad * 2), 5);
      setView([W / 2 - s * (x0 + x1) / 2, H / 2 - s * (y0 + y1) / 2, s]);
      all.hidden = false;
    };
    const select = (key, zoom) => {
      current = key;
      pills.forEach(pill => pill.setAttribute('aria-pressed', String(pill.dataset.region === key)));
      finder.querySelectorAll('[data-region-panel]').forEach(card => { card.hidden = card.dataset.regionPanel !== key; });
      shapes.forEach(shape => shape.classList.toggle('is-on', shape.dataset.region === key));
      if (zoom) zoomTo(key);
    };
    const hover = key => shapes.forEach(shape => shape.classList.toggle('is-hover', !!key && shape.dataset.region === key));
    pills.forEach(pill => pill.addEventListener('click', () => select(pill.dataset.region, true)));
    shapes.forEach(shape => {
      shape.addEventListener('click', () => select(shape.dataset.region, true));
      shape.addEventListener('mouseenter', () => hover(shape.dataset.region));
      shape.addEventListener('mouseleave', () => hover(null));
    });
    // A dot selects its region and zooms there (overlapping dots part); its title names its partners.
    dotsEl.addEventListener('click', event => {
      const g = event.target.closest('.region-dot, .region-cluster');
      if (g && g.dataset.region && !(view[2] > 1 && current === g.dataset.region)) select(g.dataset.region, true);
    });
    all.addEventListener('click', () => {
      select('all', true);
      // The button hides, so focus moves to the All pill (without scrolling the map away on one-column layouts).
      finder.querySelector('.region-pill[data-region="all"]')?.focus({ preventScroll: true });
    });
    draw();
  });
  // Home "How It Works" (the home design of 2026-10-05): choosing an area (its card or its title button) makes it the dark
  // card, the areas it feeds mint (Workforce ↔ Commercialization; the Network feeds both), draws those arrows, and
  // highlights its phrase in the introduction.
  document.querySelectorAll('[data-how-flow]').forEach(flow => {
    const section = flow.closest('section');
    const ROLES = [['dark', 'mint', 'light'], ['mint', 'dark', 'light'], ['mint', 'mint', 'dark']], LIVE = [['wc'], ['cw'], ['nw', 'nc']];
    const pick = i => {
      flow.querySelectorAll('[data-flow-card]').forEach(card => {
        const k = +card.dataset.flowCard;
        card.dataset.role = ROLES[i][k];
        card.querySelector('[data-flow-pick]').setAttribute('aria-pressed', String(k === i));
      });
      flow.querySelectorAll('[data-flow-arrow]').forEach(a => a.classList.toggle('is-on', LIVE[i].includes(a.dataset.flowArrow)));
      section.querySelectorAll('[data-flow-phrase]').forEach(p => p.classList.toggle('is-on', +p.dataset.flowPhrase === i));
    };
    flow.querySelectorAll('[data-flow-card]').forEach(card => card.addEventListener('click', () => pick(+card.dataset.flowCard)));
  });
  const today = new Date(); today.setHours(0, 0, 0, 0);  // the guided search counts upcoming listings from today
  // Countdown tile (mirrors site_builder/events.py countdown_tile), colored by urgency: more than 10 days out, the date
  // (day, short month) on white; 6–10 days, "N days left" on mint; 5 days or fewer, navy with a lime number; on the day, "Today" on lime.
  const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const countdown = (iso, days) => {
    if (days > 10) { const [, m, d] = iso.split('-').map(Number); return `<div class="deadline deadline--date"><span class="deadline__n">${d}</span><span class="mono deadline__label">${MONTHS_SHORT[m - 1]}</span></div>`; }
    if (days <= 0) return '<div class="deadline deadline--today"><span class="deadline__n deadline__n--word">Today</span></div>';
    return `<div class="deadline ${days <= 5 ? 'deadline--soon' : 'deadline--near'}"><span class="deadline__n">${days}</span><span class="mono deadline__label">${days === 1 ? 'Day left' : 'Days left'}</span></div>`;
  };
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
  // ---------------------------------------------------------------------------------------------------------------
  // Shared filter sidebar (common.facet_layout / facet_sidebar / facet_group): Events & Opportunities and the Partner
  // and Program Directory. facetUI(wrap, { onChange, onClear }) runs the groups (collapsible; a count badge per group),
  // search, Clear all, and the "Show filters (N)" toggle, which CSS shows under a 900px container width. Each page keeps
  // its own predicates and sentence; the helpers below build the sentence H1's chips, keep filters in the address and
  // announce the count. With bar mode on (setBar(true), the directory's map view) the same inputs become dropdown
  // buttons whose panels open one at a time; showSet(name) shows one tab's groups (data-facet-set).
  // ---------------------------------------------------------------------------------------------------------------
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const facetUI = (wrap, { onChange = () => {}, onClear = () => {} } = {}) => {
    const groups = [...wrap.querySelectorAll('[data-facet]')];
    const search = wrap.querySelector('[data-facets-search]');
    const toggle = wrap.querySelector('[data-facets-toggle]');
    const toggleLabel = wrap.querySelector('[data-facets-toggle-label]');
    const clears = [...wrap.querySelectorAll('[data-facets-clear]')];
    const head = g => g.querySelector('.facet__head');
    const panel = g => g.querySelector('.facet__panel');
    const live = () => groups.filter(g => !g.hidden);  // the shown tab's groups
    const group = key => live().find(g => g.dataset.facet === key);
    const allInputs = key => [...(group(key)?.querySelectorAll('[data-facet-input]') || [])];
    const inputs = key => allInputs(key).filter(i => !i.closest('label').hidden);
    const expand = (g, open) => { head(g).setAttribute('aria-expanded', String(open)); panel(g).hidden = !open; };
    let bar = false, railOpen = null, dropdown = null;
    // The reading order follows the layout (WCAG 1.3.2, 2.4.3): the rail reads search, the "Filters" heading with Clear
    // all, then the groups; the bar reads the dropdowns, Clear all, then the search, so those two move after the groups.
    const railClear = clears.find(b => b.closest('.facets')), searchBox = search && search.closest('.facets__search');
    const groupsBox = wrap.querySelector('.facets__groups'), headBox = wrap.querySelector('.facets__head');
    const arrange = on => {
      if (!groupsBox) return;
      if (on) groupsBox.after(...[railClear, searchBox].filter(Boolean));
      else {
        if (railClear && headBox) headBox.append(railClear);
        if (searchBox) groupsBox.parentNode.insertBefore(searchBox, headBox || groupsBox);
      }
    };
    const closeDropdown = (focus = false) => {
      if (!dropdown) return;
      const g = dropdown;
      dropdown = null;
      expand(g, false);
      panel(g).style.marginRight = '';
      if (focus) head(g).focus();
    };
    const api = {
      search,
      values: key => inputs(key).filter(i => i.checked && i.value).map(i => i.value),  // a radio gives one value or none
      set: (key, values) => { let hit = false; inputs(key).forEach(i => { const on = values.includes(i.value) || (i.type === 'radio' && !values.length && !i.value); if (on && i.value) hit = true; i.checked = on; }); return hit; },
      clear: () => { live().forEach(g => api.set(g.dataset.facet, [])); if (search) search.value = ''; },
      count: () => live().reduce((n, g) => n + api.values(g.dataset.facet).length, 0),
      // Badges, Clear all and the toggle label follow the checked inputs (a radio choice counts 1).
      refresh: () => {
        live().forEach(g => {
          const n = api.values(g.dataset.facet).length, badge = g.querySelector('.facet__count');
          badge.hidden = !n;
          badge.innerHTML = n ? `${n}<span class="sr-only"> selected</span>` : '';
          g.classList.toggle('is-set', !!n);
        });
        const n = api.count(), filtered = !!n || !!(search && search.value.trim());
        clears.forEach(b => { if (b.closest('.facets')) b.hidden = !filtered; });
        if (toggleLabel) toggleLabel.textContent = (wrap.classList.contains('is-open') ? 'Hide filters' : 'Show filters') + (n ? ` (${n})` : '');
        return filtered;
      },
      // Bar mode (the directory's map view): dropdown buttons; the rail's open groups come back when it ends.
      setBar: on => {
        if (on === bar) return;
        bar = on;
        closeDropdown();
        wrap.classList.add('is-switching');  // the chevrons jump to their new state instead of turning
        requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.remove('is-switching')));
        if (on) { railOpen = groups.map(g => head(g).getAttribute('aria-expanded') === 'true'); groups.forEach(g => expand(g, false)); }
        else if (railOpen) groups.forEach((g, k) => expand(g, railOpen[k]));
        arrange(on);
        wrap.classList.toggle('is-bar', on);
        if (on) { wrap.classList.remove('is-open'); toggle?.setAttribute('aria-expanded', 'false'); }
        api.refresh();
      },
      showSet: (name, placeholder) => {
        closeDropdown();
        groups.forEach(g => { if (g.dataset.facetSet) g.hidden = g.dataset.facetSet !== name; });
        if (search && placeholder) { search.placeholder = placeholder; wrap.querySelector(`label[for="${search.id}"]`).textContent = placeholder; }
        api.refresh();
      },
      // Counts (user, 2026-10-06): countFor(key, value) is how many results that choice would give with the other filters
      // as they are; a choice that would give none is greyed out and can't be checked (a checked one can still be cleared).
      setCounts: countFor => live().forEach(g => inputs(g.dataset.facet).forEach(i => {
        const slot = i.closest('label').querySelector('[data-facet-n]');
        if (!slot || !i.value) return;
        const n = countFor(g.dataset.facet, i.value), off = !n && !i.checked;
        slot.innerHTML = n + `<span class="sr-only"> ${n === 1 ? 'match' : 'matches'}</span>`;
        i.disabled = off && i !== document.activeElement;  // never the one just unchecked: disabling it would drop focus to the page
        i.closest('label').classList.toggle('is-off', off);
      })),
      // Show only some options (e.g. the types under the chosen listing types); hidden ones are unchecked.
      showOptions: (key, keep) => allInputs(key).forEach(i => {
        const label = i.closest('label'), on = keep(label, i);
        label.hidden = !on;
        if (!on) i.checked = false;
      }),
    };
    groups.forEach(g => head(g).addEventListener('click', () => {
      if (!bar) { expand(g, head(g).getAttribute('aria-expanded') !== 'true'); return; }
      const open = dropdown !== g;
      closeDropdown();
      if (!open) return;
      // The last two shown groups open leftward, and so does any group whose popover would run off the screen; a
      // leftward popover that would run off the other side is nudged back on (narrow screens).
      const shown = live(), r = head(g).getBoundingClientRect(), vw = document.documentElement.clientWidth, pw = Math.min(300, vw - 40);
      const right = shown.indexOf(g) >= shown.length - 2 || r.left + pw > vw - 16;
      g.classList.toggle('is-right', right);
      panel(g).style.marginRight = right && r.right - pw < 16 ? (r.right - pw - 16) + 'px' : '';
      dropdown = g;
      expand(g, true);
    }));
    wrap.addEventListener('change', event => {
      const input = event.target.closest('[data-facet-input]');
      if (input) onChange(input.dataset.facetInput, input);
    });
    search?.addEventListener('input', () => onChange('q', search));
    // Every Clear all hides itself once nothing is chosen (the empty state's goes with the empty state), so focus moves on:
    // to the search when it shows, else to "Show filters" (the sidebar folded behind it on narrow screens).
    clears.forEach(b => b.addEventListener('click', () => {
      api.clear();
      onClear();
      if (b.offsetParent === null) [search, toggle].find(el => el && el.offsetParent !== null)?.focus();
    }));
    toggle?.addEventListener('click', () => {
      const open = !wrap.classList.contains('is-open');
      wrap.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      api.refresh();
    });
    document.addEventListener('mousedown', event => { if (dropdown && !dropdown.contains(event.target)) closeDropdown(); });
    wrap.addEventListener('keydown', event => { if (event.key === 'Escape' && dropdown) { event.stopPropagation(); closeDropdown(true); } });
    wrap.addEventListener('focusout', event => { if (dropdown && event.relatedTarget && !dropdown.contains(event.relatedTarget)) closeDropdown(); });
    if (toggle) toggle.hidden = false;
    wrap.dataset.ready = '';  // lets the narrow layout fold the sidebar behind the toggle
    return api;
  };
  // Sentence H1 chips (--chip-* tones in site.css) and lists in plain English, with a serial comma.
  const chip = (text, tone) => `<span class="hl hl--${tone}">${esc(text)}</span>`;
  const andList = parts => (parts.length < 3 ? parts.join(' and ') : parts.slice(0, -1).join(', ') + ', and ' + parts[parts.length - 1]);
  const capFirst = html => html.replace(/^((?:<[^>]*>)*)([a-z])/, (m, tags, ch) => tags + ch.toUpperCase());
  // Filters in the address (repeated parameters for several values), kept with replaceState so Back leaves the page.
  // path: another page's address with the same content (the directory writes /directory/ from /programs/ too).
  const writeQuery = (params, hash = '', path = location.pathname) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => [].concat(v).filter(x => x !== '' && x != null).forEach(x => qs.append(k, x)));
    try { history.replaceState(null, '', path + (qs.toString() ? '?' + qs : '') + hash); } catch (_) { /* file:// previews */ }
  };
  // "Can't find what you're looking for?" (2026-10-05): each Request a referral link ([data-referral-link]) opens the referral
  // form with the visitor's choices: need, type, audience, topic and region when there's one of each, and the page's sentence
  // heading as the search they ran (src: the page). The form fills its sentence and fields from these.
  const referralLinks = params => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, v); });
    document.querySelectorAll('[data-referral-link]').forEach(a => {
      if (!a.dataset.base) a.dataset.base = a.getAttribute('href').split('?')[0];
      a.setAttribute('href', a.dataset.base + (qs.toString() ? '?' + qs : ''));
    });
  };
  const one = vals => (vals.length === 1 ? vals[0] : '');
  // Screen readers hear the count once the filters settle, not on every keystroke, and not on page load.
  const announcer = el => { let timer; return text => { clearTimeout(timer); timer = setTimeout(() => { if (el) el.textContent = text; }, 600); }; };

  // Fuzzy matching for typed searches (the home guided search's popovers; once the Program Directory's dropdowns): each typed
  // word can match (OR) at the start of a word, inside a word, or within a small typo (one for 4–6 letters, two for longer;
  // swapped letters count as one). rank(q, items) orders items ({ words, also }) by how many words match, then how closely;
  // a word's typo matches count only when no item contains that word outright.
  const STOP = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'for', 'in', 'to', 'on', 'my', 'i', 'am', 'im', 'your', 'with', 'at', 'by', 'looking', 'dont']);
  const norm = t => String(t || '').trim().toLowerCase().replace(/[‘’]/g, "'").replace(/[–—]/g, '-').replace(/\s+/g, ' ');
  const words = t => norm(t).replace(/'/g, '').split(/[^a-z0-9]+/).filter(Boolean);  // "bachelor's" → "bachelors"
  const stem = w => (w.length > 4 ? w.replace(/(?:ings|ing|ers|er|es|ed|s)$/, '') : w);  // "farming", "farms" → "farm"
  const lev = (a, b, max) => {  // optimal-string-alignment distance, giving up past max
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev2 = [], prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let best = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev2[j - 2] + 1);
        best = Math.min(best, cur[j]);
      }
      if (best > max) return max + 1;
      prev2 = prev;
      prev = cur;
    }
    return prev[b.length];
  };
  // 100 = start of a word, 90 = same stem, 70 = inside a word, 55 / 40 = one / two typos (same first letter), 0 = none.
  const termScore = (t, ws) => {
    const ts = stem(t);
    let best = 0;
    for (const w of ws) {
      if (w.startsWith(t)) return 100;
      if (ts.length >= 3 && (w.startsWith(ts) || stem(w) === ts)) best = Math.max(best, 90);
      else if (t.length >= 3 && w.includes(t)) best = Math.max(best, 70);
      else if (t.length >= 4 && best < 55 && t[0] === w[0]) {
        const lim = t.length >= 8 ? 2 : 1;
        const d = Math.min(lev(t, w, lim), lev(t, w.slice(0, t.length), lim));
        if (d <= lim) best = Math.max(best, d === 1 ? 55 : 40);
      }
    }
    return best;
  };
  const rank = (q, items) => {
    let terms = words(q);
    if (terms.some(t => !STOP.has(t))) terms = terms.filter(t => !STOP.has(t));  // "a farmer" searches for "farmer"
    if (terms.some(t => t.length > 1)) terms = terms.filter(t => t.length > 1);  // stray letters match too much
    terms = [...new Set(terms)];
    // Words in the item's own text count fully; its group ("also") counts less.
    const scores = items.map(it => terms.map(t => termScore(t, it.words) || Math.round(termScore(t, it.also || []) * 0.75)));
    const outright = terms.map((_, j) => scores.some(r => r[j] >= 70));
    return items.map((it, i) => {
      const s = scores[i].map((v, j) => (outright[j] && v < 70 ? 0 : v));
      const hits = s.filter(Boolean).length;
      return { it, score: hits ? hits * 1000 + s.reduce((a, b) => a + b, 0) : 0 };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).map(x => x.it);  // ties keep the list's order
  };

  // ---------------------------------------------------------------------------------------------------------------
  // Home guided search (home design, 2026-10-04; site_builder/home_search.py). The hero's sentence, "I am a [role] looking
  // for [need] (refinement) in [region].", routes to a finder with its filters chosen: the Partner Directory, the Program
  // Directory, an Alliance program's page, or Events & Opportunities. Each blank opens one popover (a searchable ARIA combobox and
  // listbox, matched with rank() above); picking moves on to the next empty blank (the design's auto-advance). Keyboard,
  // as in the site's combos: arrows move the highlight, Enter or Tab takes it, Escape closes. Needs and refinements with
  // nothing for the chosen audience aren't offered, and the Opens line counts results the way the finder filters them
  // (a region also matches statewide records; "Any region" leaves the region out). Data from #gs-data; hidden without JS.
  // ---------------------------------------------------------------------------------------------------------------
  const gsEl = document.querySelector('[data-gs]');
  const gsDataEl = document.getElementById('gs-data');
  if (gsEl && gsDataEl) {
    const G = JSON.parse(gsDataEl.textContent);
    // The Request a Referral form uses the same sentence (data-gs-mode="refer"): always open, no Search; it fills the form's
    // fields, keeps choices with nothing listed (a referral can still help) and shows what's listed with a link to see it.
    const refer = gsEl.dataset.gsMode === 'refer';
    const form = refer ? gsEl.closest('form') : null;
    const fallback = refer ? form.querySelector('[data-gs-fallback]') : null;
    // Site-root paths follow the build's base path (GitHub Pages preview), read off the stylesheet link.
    const sheet = document.querySelector('link[rel="stylesheet"][href$="assets/styles/site.css"]');
    const base = sheet ? sheet.getAttribute('href').replace(/\/?assets\/styles\/site\.css$/, '') : '';
    const $g = sel => gsEl.querySelector(sel);
    const bar = $g('[data-gs-bar]'), barText = $g('[data-gs-bar-text]'), panel = $g('[data-gs-panel]'), sentence = $g('[data-gs-sentence]');
    const closeBtn = $g('[data-gs-close]'), hint = $g('[data-gs-hint]'), opens = $g('[data-gs-opens]'), reset = $g('[data-gs-reset]');
    const submit = $g('[data-gs-submit]'), pop = $g('[data-gs-pop]'), input = $g('[data-gs-input]'), listEl = $g('[data-gs-list]'), live = $g('[data-gs-live]');
    const CHEV = '<svg class="icon" viewBox="0 0 14 14" aria-hidden="true" focusable="false"><path d="M3.5 5.25 L 7 8.75 L 10.5 5.25"/></svg>';
    const CHECK = '<svg class="icon" viewBox="0 0 14 14" aria-hidden="true" focusable="false"><path d="M3 7.5 L 6 10.5 L 11 4"/></svg>';
    const NE = '<svg class="icon icon-arrow-ne arr" viewBox="0 0 14 14" aria-hidden="true" focusable="false"><path d="M3.5 10.5 L 10.5 3.5"/><path d="M5 3.5 L 10.5 3.5 L 10.5 9"/></svg>';
    const FIELD = { aud: 'Who you are', intent: 'What you need', region: 'Region' };  // public wording (user, 2026-10-06: not 'Audience type')
    const PH = { aud: 'Search roles', intent: 'Search', region: 'Search regions or counties' };
    const HINT = { aud: 'Start by telling us who you are.', intent: 'Choose what you’re looking for.', region: 'Choose a region, or search by county.' };
    const I = G.intents;
    const ROLE = Object.fromEntries(G.roles.map(r => [r.v, r]));
    const REG = Object.fromEntries(G.regions.map((r, i) => [r.v, Object.assign(r, { i })]));
    const todayIso = [today.getFullYear(), today.getMonth() + 1, today.getDate()].map((n, i) => (i ? String(n).padStart(2, '0') : n)).join('-');
    const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
    const art = w => (/^[aeiou]/i.test(w) ? 'an' : 'a');
    const st = { aud: null, intent: null, ref: 'any', region: null, county: '', tok: null, act: -1, opts: [], typed: false };
    const audOf = () => (st.aud ? ROLE[st.aud].a : null);
    let preAud = null;  // the referral form: the audience a finder passed (?aud=), until a role is chosen
    const passed = { need: null, type: null };  // the referral form: the need and type a finder passed, kept for every role
    const first = () => (!st.aud ? 'aud' : !st.intent ? 'intent' : !st.region ? 'region' : null);

    // Results the destination will show. Records: [audiences, refinements, regions, statewide, date] (indexes into G).
    const recsOf = k => I[k].recs || I[I[k].same].recs;
    const count = (k, a, ref, region) => {
      const t = ref && ref !== 'any' && k !== 'programs' ? I[k].opts.findIndex(o => o.v === ref) : -1;
      if (ref && ref !== 'any' && k !== 'programs' && t < 0) return 0;  // a mapped type the page's data doesn't list (nothing listed)
      const g = region && region !== 'any' ? REG[region].i : -1;
      return recsOf(k).filter(r => (a == null || r[0].includes(a)) && (t < 0 || r[1].includes(t)) &&
        (g < 0 || r[3] || r[2].includes(g)) && (!r[4] || r[4] >= todayIso)).length;
    };
    // The relevance map (content/sentence-relevance.json, the user's of 2026-10-05): a role sees only its needs and options,
    // in its order. A need the map doesn't cover (the Alliance programs) follows the listings alone. The home page also
    // leaves out a choice with nothing listed for the role's audience; the referral form keeps it.
    const own = (o, key) => key != null && Object.prototype.hasOwnProperty.call(o, key);  // never a name like "constructor" from the address
    const relOf = (k, role) => (own(G.rel, role) && G.relNeeds.includes(k) ? (own(G.rel[role], k) ? G.rel[role][k] : []) : null);
    const refOk = (k, v, a, role) => {
      if (refer && k === passed.need && v === passed.type) return true;
      const rel = relOf(k, role);
      if (rel && !rel.includes(v)) return false;
      if (refer) return true;
      return k === 'programs' ? a == null || I[k].opts.find(o => o.v === v).a.includes(a) : count(k, a, v, null) > 0;
    };
    const intentOk = (k, a, role) => {
      if (refer && k === passed.need) return true;
      const rel = relOf(k, role);
      if (rel) return rel.some(v => refOk(k, v, a, role));
      return refer || a == null || (k === 'programs' ? I[k].opts.some(o => o.a.includes(a)) : count(k, a, 'any', null) > 0);
    };
    const byRel = (k, role, opts) => { const rel = relOf(k, role); return rel ? opts.slice().sort((x, y) => rel.indexOf(x.v) - rel.indexOf(y.v)) : opts; };
    const listed = n => (n ? n + ' listed' : 'None listed yet');
    const refPhrase = (k, v) => (v === 'any' ? I[k].any : (I[k].opts.find(o => o.v === v) || {}).p || '');
    const conn = k => (st.ref === 'any' ? I[k].anyConn : I[k].conn);
    const fieldOf = k => (k === 'ref' ? I[st.intent].field : FIELD[k]);

    // Each blank's choices: { v, label, sub, group, words, also } (also: words that count less, e.g. a role's audience).
    const LISTS = {
      // The audiences in order; on the referral form, the one a finder passed comes first (the sort keeps the rest in order).
      aud: () => G.auds.map((name, a) => [name, a]).sort((x, y) => (y[1] === preAud) - (x[1] === preAud)).flatMap(([name, a]) => G.roles.filter(r => r.a === a)
        .map(r => ({ v: r.v, label: cap(r.v), sub: '', group: name, words: words(r.v + ' ' + r.kw), also: words(name) }))),
      intent: () => {
        const a = audOf();
        return G.order.filter(k => intentOk(k, a, st.aud)).map(k => {
          let opts = I[k].opts.filter(o => refOk(k, o.v, a, st.aud));
          if (relOf(k, st.aud)) opts = byRel(k, st.aud, opts);  // the role's order
          else if (a != null && k !== 'programs') opts.sort((x, y) => count(k, a, y.v, null) - count(k, a, x.v, null));  // the most listed first
          const sub = a == null ? I[k].desc : cap(opts.slice(0, 3).map(o => o.p).join(', '));
          return { v: k, label: I[k].label, sub, group: '', words: words(I[k].label + ' ' + sub + ' ' + I[k].desc), also: words(I[k].kw || '') };
        });
      },
      ref: () => {
        const k = st.intent, it = I[k], a = audOf(), head = st.aud ? 'For ' + st.aud + 's' : '';
        const n = v => (refer && k !== 'programs' ? listed(count(k, a, v, st.region)) : '');  // the form shows what's listed for each
        return [{ v: 'any', label: cap(it.any), sub: n('any'), group: '', words: words(it.any), also: [] }].concat(byRel(k, st.aud, it.opts.filter(o => refOk(k, o.v, a, st.aud)))
          .map(o => ({ v: o.v, label: cap(o.p), sub: o.sub || n(o.v), group: head, words: words(o.p + ' ' + (o.sub || (k === 'programs' ? '' : o.v))), also: [] })));
      },
      region: () => [{ v: 'any', label: 'Any region', sub: 'Statewide', group: '', words: words('any region statewide all california'), also: [] }]
        .concat(G.regions.map(r => ({ v: r.v, label: r.v, sub: r.c.slice(0, 4).join(', ') + (r.c.length > 4 ? ' + ' + (r.c.length - 4) + ' more' : ''),
          group: '', words: words(r.v + ' ' + r.hl), also: words(r.c.join(' ')), counties: r.c }))),
    };
    // The words searched: a region search leaves out "county" and "counties", which would otherwise match Kern County by
    // its name ("Monterey County" finds the Central Coast), unless that is all that was typed.
    const typed = () => {
      if (st.tok !== 'region') return input.value;
      const rest = input.value.replace(/\bcount(?:y|ies)\b/gi, ' ');
      return words(rest).length ? rest : input.value;
    };
    // A county search names the county that matched ("Includes Fresno County").
    const countyOf = o => {
      const terms = words(typed()).filter(t => !STOP.has(t) && t.length > 1);
      if (!o.counties || !terms.length || terms.some(t => termScore(t, o.words) >= 70)) return '';
      return o.counties.find(name => terms.every(t => termScore(t, words(name)) >= 55)) || '';
    };
    const countyHit = o => { const c = countyOf(o); return c ? 'Includes ' + c + ' County' : ''; };

    const tokBtn = k => sentence.querySelector(`[data-gs-tok="${k}"]`);
    const focusTok = k => { const b = tokBtn(k); if (b) b.focus({ preventScroll: true }); };
    // A blank is an inline button (role="button" on a span, so under 800px a long one wraps inside the sentence, each line
    // underlined; wider, site.css keeps it whole); the chevron stays with its last word.
    const tok = (k, label, empty) => `<span class="gs-tok${empty ? ' is-empty' : ''}" role="button" tabindex="0" data-gs-tok="${k}" aria-haspopup="listbox" ` +
      `aria-expanded="${st.tok === k}" aria-controls="gs-list" aria-label="${esc(fieldOf(k) + ': ' + (empty ? 'not chosen' : label))}">` +
      `${esc(label).replace(/\S+$/, w => `<span class="gs-tok__end">${w}${CHEV}</span>`)}</span>`;
    const renderSentence = () => {
      const r = st.region && st.region !== 'any' ? REG[st.region] : null;
      // Unchosen it reads "I am [who you are] looking for [what you need] in [region]."; chosen, "I am a farmer looking for …".
      let h = `<span>I am ${st.aud ? art(st.aud) + ' ' : ''}</span>${tok('aud', st.aud || 'who you are', !st.aud)}<span> looking for </span>${tok('intent', st.intent ? I[st.intent].label.toLowerCase() : 'what you need', !st.intent)}`;
      if (st.intent) h += `<span> ${conn(st.intent)} </span>${tok('ref', refPhrase(st.intent, st.ref), false)}`;
      sentence.innerHTML = h + `<span> in ${r ? esc(r.plain) : ''}</span>${tok('region', r ? r.hl : st.region ? 'any region' : 'region', !st.region)}<span>.</span>`;
    };
    const sentenceText = () => {
      const r = st.region !== 'any' ? REG[st.region] : null;
      return `I am ${art(st.aud)} ${st.aud} looking for ${I[st.intent].label.toLowerCase()} ${conn(st.intent)} ${refPhrase(st.intent, st.ref)} in ${r ? r.plain + r.hl : 'any region'}.`;
    };

    // The referral form with this sentence filled in (offered when nothing is listed).
    const referralUrl = () => {
      const qs = new URLSearchParams({ role: st.aud, need: st.intent, region: st.region });
      if (st.ref !== 'any') qs.set('type', st.ref);
      if (st.county) qs.set('county', st.county);
      return base + '/referral?' + qs;
    };
    // Where Search goes: the address, the finder's name, the filters it will show (as chips) and the count.
    const dest = () => {
      if (first()) return null;
      const k = st.intent, it = I[k], a = audOf(), aud = G.auds[a], r = st.region !== 'any' ? REG[st.region] : null;
      if (k === 'programs' && st.ref !== 'any') { const o = it.opts.find(x => x.v === st.ref); return { name: o.sub, url: o.v, chips: [[it.page, 'ring']] }; }
      const qs = new URLSearchParams(it.fixed || {}), chips = it.tab ? [[it.tab, 'ring']] : [];  // E&O names its Events or Opportunities view
      if (st.ref !== 'any') { qs.append('type', st.ref); chips.push([st.ref, 'type']); }
      qs.append('aud', aud); chips.push([aud, 'aud']);
      if (r) (it.eo ? r.eo : [r.v]).forEach((v, i) => { qs.append('region', v); chips.push([it.eo ? r.eoLabels[i] : v, 'region']); });
      return { name: it.dest, url: it.url + '?' + qs, chips, n: count(k, a, st.ref, st.region), unit: it.unit };
    };
    const renderFoot = () => {
      const d = dest();
      hint.hidden = !!d;
      hint.textContent = HINT[first()] || '';
      opens.hidden = !d;
      reset.hidden = !(st.aud || st.intent || st.region);
      if (refer) {  // what's listed now, a link to see it (a new tab, so the form keeps its answers), and the form's fields
        if (d) {
          const url = d.url.startsWith('/') ? base + d.url : d.url;
          opens.innerHTML = '<span class="mono">Listed now</span>' +
            (d.n == null ? '<span class="gs-opens__name">' + esc(d.name) + '</span>' : '<span class="gs-opens__count">' + (d.n ? d.n + ' ' + d.unit[d.n === 1 ? 0 : 1] + ' in ' : 'Nothing yet in ') +
              (/Directory/.test(d.name) ? 'the ' : '') + esc(d.name) + '</span>') +
            (d.n !== 0 ? `<a class="text-link" href="${esc(url)}" target="_blank" rel="noopener">See ${d.n == null || d.n === 1 ? 'it' : 'them'}<span class="sr-only"> (opens in a new tab)</span> ${NE}</a>` : '') +
            '<p class="gs-opens__note">' + (d.n === 0 ? 'Alliance staff can still look across the network for you.' : 'Send your request too, and Alliance staff will suggest which fit your work.') + '</p>';
        }
        sync();
        return;
      }
      if (d) {
        opens.innerHTML = '<span class="mono">Opens</span><span class="gs-opens__name">' + esc(d.name) + '</span>' +
          (d.n == null ? '' : '<span class="gs-opens__count">' + d.n + ' ' + d.unit[d.n === 1 ? 0 : 1] + '</span>') +
          d.chips.map(([t, tone]) => `<span class="gs-chip gs-chip--${tone}">${esc(t)}</span>`).join('') +
          (d.n === 0 ? '<p class="gs-opens__note">' + (st.region !== 'any' ? 'Nothing is listed for this region yet. Choose any region to see more, or ' : 'Nothing is listed right now. ') +
            `<a class="text-link" href="${esc(referralUrl())}">${st.region !== 'any' ? 'request' : 'Request'} a referral ${NE}</a></p>` : '');
      }
      submit.disabled = !d;
      barText.textContent = d ? sentenceText() : barText.dataset.prompt;
      barText.classList.toggle('is-ready', !!d);
    };

    // The popover: one list, placed under the open blank (across the panel on phones).
    let liveTimer;
    const highlight = i => {
      st.act = i;
      listEl.querySelectorAll('.gs-opt').forEach((el, j) => el.classList.toggle('is-active', j === i));
      const el = i >= 0 ? document.getElementById('gs-opt-' + i) : null;
      if (!el) { input.removeAttribute('aria-activedescendant'); return; }
      input.setAttribute('aria-activedescendant', el.id);
      if (el.offsetTop < listEl.scrollTop) listEl.scrollTop = el.offsetTop - 8;
      else if (el.offsetTop + el.offsetHeight > listEl.scrollTop + listEl.clientHeight) listEl.scrollTop = el.offsetTop + el.offsetHeight - listEl.clientHeight + 8;
    };
    const renderList = () => {
      const all = LISTS[st.tok]();
      st.typed = !!norm(input.value);
      st.opts = st.typed ? rank(typed(), all) : all;
      let html = '', group = '', n = 0;
      st.opts.forEach((o, i) => {
        if (!st.typed && o.group !== group) {  // section headings, unless the list is a ranked search
          html += (group ? '</div>' : '') + (o.group ? `<div role="group" aria-labelledby="gs-g${n}"><div class="gs-group" id="gs-g${n++}" role="presentation">${esc(o.group)}</div>` : '');
          group = o.group;
        }
        const sel = st[st.tok] === o.v, sub = st.typed ? countyHit(o) || o.sub || o.group : o.sub;
        html += `<div class="gs-opt" role="option" id="gs-opt-${i}" data-i="${i}" aria-selected="${sel}"><span class="gs-opt__text">` +
          `<span class="gs-opt__label">${esc(o.label)}</span>${sub ? `<span class="gs-opt__sub">${esc(sub)}</span>` : ''}</span>${sel ? CHECK : ''}</div>`;
      });
      listEl.innerHTML = (html + (group ? '</div>' : '')) || '<div class="gs-empty">No matches. Try another word.</div>';
      listEl.scrollTop = 0;
      highlight(st.typed ? (st.opts.length ? 0 : -1) : st.opts.findIndex(o => o.v === st[st.tok]));
      clearTimeout(liveTimer);
      if (st.typed) liveTimer = setTimeout(() => { live.textContent = st.opts.length ? st.opts.length + (st.opts.length === 1 ? ' match' : ' matches') : 'No matches'; }, 500);
    };
    const place = () => {
      const b = st.tok && tokBtn(st.tok);
      if (!b) return;
      const p = panel.getBoundingClientRect(), t = b.getBoundingClientRect();
      pop.style.top = Math.round(t.bottom - p.top + 10) + 'px';
      if (matchMedia('(max-width: 640px)').matches) { pop.style.left = '12px'; pop.style.right = '12px'; return; }
      const left = t.left - p.left, w = pop.offsetWidth;
      pop.style.right = 'auto';
      pop.style.left = Math.round(left + w + 12 > p.width ? Math.max(12, t.right - p.left - w) : left) + 'px';  // flips to end under the blank's right edge
    };
    const openTok = k => {
      st.tok = k;
      input.value = '';
      input.placeholder = k === 'ref' ? I[st.intent].ph : PH[k];
      input.setAttribute('aria-label', input.placeholder);
      input.setAttribute('aria-expanded', 'true');
      listEl.setAttribute('aria-label', fieldOf(k));
      live.textContent = '';
      renderSentence();
      pop.hidden = false;
      renderList();
      place();
      input.focus({ preventScroll: true });
      const below = pop.getBoundingClientRect().bottom - window.innerHeight;  // keep the list in view on short screens
      if (below > 0) window.scrollBy({ top: below + 16, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    };
    const closeTok = (refocus = true) => {
      const k = st.tok;
      if (!k) return;
      st.tok = null;
      pop.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      clearTimeout(liveTimer);
      renderSentence();
      if (refocus) focusTok(k);
    };
    const pick = (k, v) => {
      if (k === 'aud') {  // a new audience drops a need or refinement it doesn't have
        st.aud = v;
        if (st.intent && !intentOk(st.intent, audOf(), st.aud)) { st.intent = null; st.ref = 'any'; }
        else if (st.intent && st.ref !== 'any' && !refOk(st.intent, st.ref, audOf(), st.aud)) st.ref = 'any';
      } else if (k === 'intent') { if (v !== st.intent) st.ref = 'any'; st.intent = v; }
      else if (k === 'region') {  // a county search keeps the county (the referral form sends it)
        if (st.typed) { const o = st.opts.find(x => x.v === v); st.county = o ? countyOf(o) : ''; }
        else if (v !== st.region) st.county = '';  // the same region chosen again keeps its county
        st.region = v;
      } else st[k] = v;
      renderFoot();
      // In sentence order (user, 2026-10-06): a need opens its refinement; otherwise the next empty blank after this one,
      // wrapping to an earlier one left empty (someone who starts with "what you need" is still asked who they are).
      const ORDER = ['aud', 'intent', 'region'], at = k === 'ref' ? 1 : ORDER.indexOf(k);
      const next = k === 'intent' ? 'ref' : [...ORDER.slice(at + 1), ...ORDER.slice(0, at + 1)].find(b => !st[b]) || null;
      if (next) { openTok(next); return; }
      closeTok(false);
      if (refer && dest()) { (afterSentence() || tokBtn(k)).focus(); return; }  // on to the form's next field
      if (dest()) submit.focus({ preventScroll: true }); else focusTok(k);
    };
    // The referral form's first field after the sentence.
    const afterSentence = () => (refer ? [...form.elements].find(el => (gsEl.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) &&
      el.matches('input, select, textarea, button') && !gsEl.contains(el) && !(fallback && fallback.contains(el)) && el.type !== 'hidden' && !el.disabled &&
      el.offsetParent !== null) : null);  // (form.elements also lists fieldsets, which can't take focus)
    // The referral form's fields (data-gs-field): role, audience, need, type (the option under that need), region, county.
    const sync = () => {
      const f = name => form.querySelector(`[data-gs-field="${name}"]`);
      const set = (name, v) => { const el = f(name); if (el) el.value = v || ''; };
      set('role', st.aud); set('audience', st.aud ? G.auds[audOf()] : preAud != null ? G.auds[preAud] : ''); set('need', st.intent);
      set('region', st.region); set('county', st.county);
      const type = f('type');
      if (type) {
        type.value = '';
        const o = st.intent && st.ref !== 'any' ? [...type.querySelectorAll(`optgroup[data-need="${st.intent}"] option`)].find(x => x.value === st.ref) : null;
        if (o) o.selected = true;
      }
    };

    const expand = () => {
      bar.hidden = true;
      bar.setAttribute('aria-expanded', 'true');
      panel.hidden = false;
      renderSentence();
      renderFoot();
      if (first()) openTok(first()); else focusTok('aud');
    };
    const collapse = (refocus = true) => {
      closeTok(false);
      panel.hidden = true;
      bar.hidden = false;
      bar.setAttribute('aria-expanded', 'false');
      if (refocus) bar.focus({ preventScroll: true });
    };
    if (bar) bar.addEventListener('click', expand);
    if (closeBtn) closeBtn.addEventListener('click', () => collapse());
    reset.addEventListener('click', () => { Object.assign(st, { aud: null, intent: null, ref: 'any', region: null, county: '' }); renderFoot(); openTok('aud'); });
    sentence.addEventListener('click', e => {
      const b = e.target.closest('[data-gs-tok]');
      if (b) { if (st.tok === b.dataset.gsTok) closeTok(); else openTok(b.dataset.gsTok); }
    });
    sentence.addEventListener('keydown', e => {
      const b = e.target.closest('[data-gs-tok]');
      if (!b) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); b.click(); }  // as a native button
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); openTok(b.dataset.gsTok); }
    });
    input.addEventListener('input', renderList);
    input.addEventListener('keydown', e => {
      const n = st.opts.length, o = st.act >= 0 ? st.opts[st.act] : null;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (n) highlight(e.key === 'ArrowDown' ? (st.act + 1) % n : (st.act <= 0 ? n - 1 : st.act - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();  // never submits from the list
        if (o) pick(st.tok, o.v);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeTok();
      } else if (e.key === 'Tab') {  // takes the highlighted choice and moves on; otherwise leaves the list
        e.preventDefault();
        if (!e.shiftKey && o) { pick(st.tok, o.v); return; }
        const k = st.tok;
        closeTok(e.shiftKey);
        if (e.shiftKey) return;
        const order = [...panel.querySelectorAll('button, a[href], [role="button"], [data-gs-tok]')].filter(b => !b.disabled && b.offsetParent !== null);
        (order[order.indexOf(tokBtn(k)) + 1] || afterSentence() || order[0]).focus();
      }
    });
    pop.addEventListener('mousedown', e => { if (e.target !== input) e.preventDefault(); });  // keep focus in the search field
    listEl.addEventListener('click', e => { const o = e.target.closest('.gs-opt'); if (o) pick(st.tok, st.opts[Number(o.dataset.i)].v); });
    listEl.addEventListener('mousemove', e => { const o = e.target.closest('.gs-opt'); if (o && Number(o.dataset.i) !== st.act) highlight(Number(o.dataset.i)); });
    // Focus moving elsewhere closes the list; a click outside the block also folds it away while nothing is chosen. Focus
    // moving to a blank leaves the list to the sentence's click handler (one click switches lists, or closes the open
    // one): closing here would redraw the sentence on mousedown, replacing the blank under the pointer, so the click
    // would never land and focus would fall to the page.
    const away = to => to && !pop.contains(to) && !to.closest('[data-gs-tok]');
    pop.addEventListener('focusout', e => { if (away(e.relatedTarget)) closeTok(false); });
    sentence.addEventListener('focusout', e => { if (st.tok && away(e.relatedTarget)) closeTok(false); });
    document.addEventListener('mousedown', e => {
      if (panel.hidden) return;
      if (!gsEl.contains(e.target)) { closeTok(false); if (!refer && !(st.aud || st.intent || st.region)) collapse(false); }
      else if (st.tok && !pop.contains(e.target) && !e.target.closest('[data-gs-tok]')) closeTok(false);
    });
    window.addEventListener('resize', () => { if (st.tok) place(); });
    if (refer) {
      // Answers from the address (?role=farmer&need=services&type=Research+%26+Testing&region=Central+San+Joaquin&county=Fresno),
      // e.g. a search that found nothing; anything the role doesn't offer is left out.
      const q = new URLSearchParams(location.search);
      if (own(ROLE, q.get('role'))) st.aud = q.get('role');
      if (own(I, q.get('need')) && intentOk(q.get('need'), audOf(), st.aud)) st.intent = q.get('need');
      if (st.intent && I[st.intent].opts.some(o => o.v === q.get('type')) && refOk(st.intent, q.get('type'), audOf(), st.aud)) st.ref = q.get('type');
      if (q.get('from')) { passed.need = st.intent; passed.type = st.ref !== 'any' ? st.ref : null; }  // from a finder's search
      if (own(REG, q.get('region')) || q.get('region') === 'any') st.region = q.get('region');
      if (st.region && own(REG, st.region) && REG[st.region].c.includes(q.get('county'))) st.county = q.get('county');
      if (!st.aud && G.auds.includes(q.get('aud'))) preAud = G.auds.indexOf(q.get('aud'));
      const topic = form.querySelector('[name="r-topic"]');
      if (topic && [...topic.options].some(o => o.value && o.value === q.get('topic'))) topic.value = q.get('topic');
      // The search they ran on a finder (its sentence heading), shown as text and sent with the request; Remove drops it.
      const clip = (t, n) => (t.length <= n ? t : t.slice(0, n).replace(/\s+\S*$/, '') + '…');
      const SRC = ['Partner Directory', 'Program Directory', 'Events & Open Calls'];  // Events & Open Calls was Events & Opportunities until 2026-10-06
      const searched = clip((q.get('q') || '').trim(), 120);
      let from = clip((q.get('from') || '').trim(), 1000);
      if (searched && !from.includes(searched)) from += (from ? ' ' : '') + 'Searched for “' + searched + '”.';  // a cut heading keeps the search
      const src = q.get('src') === 'Events & Opportunities' ? 'Events & Open Calls' : SRC.includes(q.get('src')) ? q.get('src') : '';  // an older link's name
      const fromEl = $g('[data-gs-from]');
      if (from && fromEl) {
        $g('[data-gs-from-text]').textContent = (src ? src + ': ' : '') + from;
        form.querySelector('[data-gs-field="search"]').value = (src ? src + ': ' : '') + from;
        fromEl.hidden = false;
        $g('[data-gs-lead]').hidden = true;
        $g('[data-gs-from-clear]').addEventListener('click', () => {
          form.querySelector('[data-gs-field="search"]').value = '';
          fromEl.hidden = true;
          $g('[data-gs-lead]').hidden = false;
          focusTok(first() || 'aud');
        });
      }
      // The plain fields stay as the form's values (hidden, so not required); a request needs the whole sentence.
      if (fallback) { fallback.hidden = true; fallback.querySelectorAll('[required]').forEach(c => { c.required = false; }); }
      form.addEventListener('submit', e => { if (first()) { e.preventDefault(); openTok(first()); } });
      panel.hidden = false;
      renderSentence();
    } else {
      panel.addEventListener('submit', e => {
        e.preventDefault();
        const d = dest();
        if (d) location.href = d.url.startsWith('/') ? base + d.url : d.url;
      });
    }
    renderFoot();
    gsEl.hidden = false;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Partner Directory (/directory/) and Program Directory (/programs/): two finders (the user, 2026-10-04, splitting the
  // merged Partner and Program Directory; site_builder/directory.py). D.tab says which page this is. The shared filter
  // sidebar (facetUI) narrows the records: OR within a group, AND across groups, and on the Program Directory a region
  // choice also matches statewide programs. On the Partner Directory, Who they serve with Support offered needs one program
  // that is both (TESTS). Each choice shows its count and greys out at zero (facetCounts). The H1 restates the filters as a read-only sentence ("Partners across
  // California." until filtered); the count is announced once they settle. List view (the default since 2026-10-05): an
  // accordion, one row open. Map view (?view=map): the filters become a bar of dropdowns over a map of the nine Alliance regions and Other California
  // Regions (a region click filters and zooms). Partner Directory: clustered pins at each organization's California
  // addresses. Program Directory: each region shaded by how many of the programs shown serve it, statewide programs counted
  // on a separate button, and a selected program's regions highlighted with its providers' offices as small pins. A
  // floating card shows the selected record and, on the Program Directory, a programs panel. Records link across: a
  // partner's programs open in the Program Directory (#prg-0000), a program's providers open their profiles. The address
  // keeps the state: ?q=&type=&support=&aud=&topic=&region=&view= (repeated for several values), and #<slug> or #prg-0000
  // for the selected record; the old ?for=<audience> (programs) still opens filtered, and the merged directory's
  // /directory/?tab=programs… and /directory/#prg-0000 addresses move to /programs/. Data comes from #directory-data;
  // without JS the records are listed as links.
  // ---------------------------------------------------------------------------------------------------------------
  const dirEl = document.querySelector('.dir');
  const dirData = document.getElementById('directory-data');
  const dirWrap = dirEl && dirEl.querySelector('[data-facets]');
  if (dirEl && dirData && dirWrap) (() => {
    const D = JSON.parse(dirData.textContent);
    // Site-root paths follow the build's base path (GitHub Pages preview), read off the stylesheet link.
    const sheet = document.querySelector('link[rel="stylesheet"][href$="assets/styles/site.css"]');
    const base = sheet ? sheet.getAttribute('href').replace(/\/?assets\/styles\/site\.css$/, '') : '';
    const at = path => (path && path.startsWith('/') ? base + path : path);
    // The merged directory's Programs tab now lives at /programs/: carry its address over (filters, view, record).
    const params = new URLSearchParams(location.search);
    if (D.tab === 'partners' && (params.get('tab') === 'programs' || /^#prg-\d+$/i.test(location.hash))) {
      params.delete('tab');
      location.replace(at(D.programsUrl) + (params.toString() ? '?' + params : '') + location.hash);
      return;
    }
    const ORGS = D.orgs, PROGS = D.programs, NINE = D.nine, OTHER = 'Other California Regions', REGS = [...NINE, OTHER];
    const orgById = Object.fromEntries(ORGS.map(o => [o.id, o]));
    const progById = Object.fromEntries(PROGS.map(p => [p.id, p]));
    // Each page has its own records in full (the other directory's only for links and pins), so only those are searched.
    if (D.tab === 'programs') PROGS.forEach(p => { p.hay = [p.name, p.short, p.summary, p.type, ...p.audiences, ...p.regions, ...p.topics, ...p.providers.map(x => x.name)].join(' ').toLowerCase(); });
    else ORGS.forEach(o => { o.hay = [o.name, o.short, o.type, o.city, ...o.locations, ...o.support, ...o.audiences, ...o.regions, ...o.topics].join(' ').toLowerCase(); });
    const TABS = {
      partners: { keys: ['type', 'support', 'aud', 'region', 'topic'], one: 'organization', many: 'organizations', list: 'Organizations',
        empty: 'No organizations match these filters.', legend: 'Organization location', hint: 'Select a region to zoom in, or a marker to view a profile' },
      programs: { keys: ['type', 'aud', 'region', 'topic'], one: 'program', many: 'programs', list: 'Programs',
        empty: 'No programs match these filters.', legend: 'Provider office', hint: 'Select a region to zoom in, or a program to see where it works' },
    };
    const $ = sel => dirEl.querySelector(sel);
    const h1 = document.querySelector('[data-dir-sentence]');
    const countEl = $('[data-dir-count]'), sortEl = $('[data-dir-sort]'), sortWrap = $('[data-dir-sort-wrap]');
    const views = $('[data-dir-views]'), emptyEl = $('[data-dir-empty]'), emptyHead = $('[data-dir-empty-head]');
    const listBox = $('[data-dir-list]'), listUl = $('[data-dir-rows]'), listHead = $('[data-dir-list-head]');
    const mapEl = $('[data-dir-map]'), stage = $('[data-dir-stage]'), cardEl = $('[data-dir-card]');
    const offMap = $('[data-dir-offmap]'), attrib = $('[data-dir-attrib]');
    const announce = announcer($('[data-dir-live]'));
    const ARR_NE = '<svg class="icon icon-arrow-ne arr" viewBox="0 0 14 14" aria-hidden="true" focusable="false"><path d="M3.5 10.5 L 10.5 3.5"/><path d="M5 3.5 L 10.5 3.5 L 10.5 9"/></svg>';
    const ARR_E = '<svg class="icon icon-arrow-e" viewBox="0 0 14 14" aria-hidden="true" focusable="false"><path d="M2.5 7 L 11.5 7"/><path d="M8 3.5 L 11.5 7 L 8 10.5"/></svg>';
    const ARR_W = '<svg class="icon icon-arrow-w" viewBox="0 0 14 14" aria-hidden="true" focusable="false"><path d="M11 7 L 3 7"/><path d="M6.5 3.5 L 3 7 L 6.5 10.5"/></svg>';
    const CHEV = '<svg class="icon dir-acc__chev" viewBox="0 0 14 14" aria-hidden="true" focusable="false"><path d="M3.5 5.25 L 7 8.75 L 10.5 5.25"/></svg>';
    const CLOSE = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const state = { tab: D.tab, view: 'list', sel: null, from: null, pop: null, hreg: null, items: [], scrollTo: null, shade: null, provider: null };  // from: where the card's record was picked; shade: the Programs map's counts; provider: the Program Directory's ?provider=<partner slug> (a partner card's "See all N programs")

    const ui = facetUI(dirWrap, {
      onChange: () => { state.pop = null; render(true); },
      onClear: () => { sortEl.value = sortEl.options[0].value; state.sel = null; state.pop = null; state.provider = null; render(true); },  // Clear all resets the page (design)
    });
    const filters = () => Object.fromEntries(TABS[state.tab].keys.map(k => [k, ui.values(k)]));
    const query = () => (ui.search ? ui.search.value.trim() : '');
    const anyIn = (vals, sel) => !sel.length || vals.some(v => sel.includes(v));
    const regionOk = (rs, sel) => !sel.length || rs.includes('Statewide') || rs.some(r => sel.includes(r));  // statewide records serve every region
    // Each filter's test. Partners (user, 2026-10-06): Who they serve is the partner's audiences and its programs'
    // (directory.py); with Support offered too, one of its programs has to be both, so "funding for farmers" lists partners
    // with a funding program for farmers, not partners that serve farmers and fund someone else.
    const paired = (o, F) => o.pairs.some(p => anyIn(p.a, F.aud) && anyIn(p.t, F.support));
    const TESTS = {
      partners: {
        type: (o, F) => anyIn(o.types, F.type),
        support: (o, F) => !F.support.length || (F.aud.length ? paired(o, F) : anyIn(o.support, F.support)),
        aud: (o, F) => !F.aud.length || (F.support.length ? paired(o, F) : anyIn(o.audiences, F.aud)),
        region: (o, F) => regionOk(o.regions, F.region),
        topic: (o, F) => anyIn(o.topics, F.topic),
      },
      programs: {
        type: (p, F) => anyIn(p.types, F.type),
        aud: (p, F) => anyIn(p.audiences, F.aud),
        region: (p, F) => regionOk(p.regions, F.region),
        topic: (p, F) => anyIn(p.topics, F.topic),
      },
    };
    const records = () => (state.tab === 'programs' ? PROGS : ORGS);
    const passes = (r, F, q) => TABS[state.tab].keys.every(k => TESTS[state.tab][k](r, F)) && (!q || r.hay.includes(q)) &&
      (state.tab !== 'programs' || !state.provider || r.providers.some(x => x.slug === state.provider));
    const results = () => {
      const F = filters(), q = query().toLowerCase();
      const items = records().filter(r => passes(r, F, q));
      if (state.tab !== 'programs') return items.sort(PARTNER_SORTS[sortEl.value] || PARTNER_SORTS.default);
      return items.sort(PROGRAM_SORTS[sortEl.value] || PROGRAM_SORTS.default);
    };
    // Each choice's count: the results with that choice alone in its group and the other filters as they are.
    const facetCounts = () => {
      const F = filters(), q = query().toLowerCase(), recs = records();
      ui.setCounts((key, v) => { const G = { ...F, [key]: [v] }; return recs.filter(r => passes(r, G, q)).length; });
    };
    // The Program Directory's sorts (user, 2026-10-05; directory.SORTS). Default: the Alliance's programs first, then A–Z.
    // Provider: the first provider's name. Type: the taxonomy's order. Region: statewide first, then each program's
    // northernmost region (the design's north-to-south order), Other California Regions, then none recorded.
    const byName = (a, b) => a.name.localeCompare(b.name);
    const firstProvider = r => (r.providers[0] ? r.providers[0].name : '\uffff');
    const typeAt = r => { const i = D.typeOrder.indexOf(r.type); return i < 0 ? 99 : i; };
    const regionAt = r => (r.regions.includes('Statewide') ? -1 : Math.min(99, ...r.regions.map(x => REGS.indexOf(x)).filter(i => i >= 0)));
    const PROGRAM_SORTS = {
      default: (a, b) => (b.alliance - a.alliance) || byName(a, b),
      az: byName,
      provider: (a, b) => firstProvider(a).localeCompare(firstProvider(b)) || byName(a, b),
      type: (a, b) => typeAt(a) - typeAt(b) || byName(a, b),
      region: (a, b) => regionAt(a) - regionAt(b) || byName(a, b),
    };
    // The Partner Directory's sorts. Default (user, 2026-10-06): the Alliance's partners (a formal Alliance role) first, then A–Z.
    const PARTNER_SORTS = {
      default: (a, b) => (b.alliance - a.alliance) || byName(a, b),
      asc: byName,
      desc: (a, b) => byName(b, a),
    };
    const record = id => (state.tab === 'programs' ? progById[id] : orgById[id]);

    // The sentence H1 (the user's grammar, 2026-10-04; values in the sidebar's order): the kind of partner ("College and
    // university partners") or program type ("Education and training programs"), then "offering" support, "for" audiences,
    // "working on" (Programs: "on") topics, then where: the regions, "working statewide" (Programs: all nine or Statewide
    // alone), or "across California" when no region is chosen; then the search. Unfiltered it is D.heading.
    const amp = s => s.replace(/ & /g, ' and ').toLowerCase();
    const sentence = () => {
      const F = filters(), q = query(), progs = state.tab === 'programs';
      const prov = progs && state.provider && orgById[state.provider];
      if (!ui.count() && !q && !prov) return D.heading;
      let s;
      if (progs) s = (F.type.length ? andList(F.type.map(t => chip(amp(t), 'type'))) + ' programs' : 'programs') + (prov ? ' from ' + chip(prov.name, 'ring') : '');
      else {
        s = F.type.length ? andList(F.type.map(t => chip(D.phrases.org[t] || amp(t), 'type'))) + ' partners' : 'partners';
        if (F.support.length) s += ' offering ' + andList(F.support.map(x => chip(amp(x), 'support')));
      }
      s = 'Alliance ' + s;  // the heading's "Alliance partners" / "Alliance programs" (user, 2026-10-06)
      if (F.aud.length) s += ' for ' + andList(F.aud.map(a => chip(amp(a), 'aud')));
      if (F.topic.length) s += (progs ? ' on ' : ' working on ') + andList(F.topic.map(x => chip(amp(x), 'topic')));
      const geo = NINE.filter(r => F.region.includes(r)), other = F.region.includes(OTHER), out = F.region.includes('Outside California');
      if (progs && (geo.length === NINE.length || (!geo.length && !other && F.region.includes('Statewide')))) s += ' working ' + chip('statewide', 'region');
      else if (!geo.length && !other && !out) s += prov ? '' : ' across California';  // e.g. Alliance programs from Hartnell College
      else {
        if (geo.length) s += ' in the ' + andList(geo.map(r => chip(r, 'region'))) + (geo.length > 1 ? ' regions' : ' region');
        if (other) s += (geo.length ? ' and' : '') + ' in ' + chip('other California regions', 'region');
        if (out) s += (geo.length || other ? ' and' : '') + ' ' + chip('outside California', 'region');  // the Partner Directory's Location only
      }
      if (q) s += ' matching ' + chip('“' + q + '”', 'ring');
      return capFirst(s + '.');
    };
    // Request a referral: Partners asks for connections (by organization type), or services when only Support offered is
    // chosen; Programs asks for services (by program type). Statewide reads as any region.
    const referral = () => {
      const F = filters(), q = query(), progs = state.tab === 'programs';
      const need = progs || (!F.type.length && F.support.length) ? 'services' : 'connections';
      const reg = one(F.region);
      referralLinks({ need, type: progs ? one(F.type) : need === 'services' ? one(F.support) : one(F.type), aud: one(F.aud), topic: one(F.topic),
        region: reg === 'Statewide' ? 'any' : reg === 'Outside California' ? '' : reg,
        q, from: ui.count() || q || state.provider ? (h1 ? h1.textContent.trim() : '') : '', src: progs ? 'Program Directory' : 'Partner Directory' });
    };
    // The address: this directory's own path, its filters, the view and the selected record.
    const sync = () => writeQuery({ q: query(), ...filters(), provider: state.provider || '', sort: sortEl.value === sortEl.options[0].value ? '' : sortEl.value, view: state.view === 'map' ? 'map' : '' },
      state.sel ? '#' + state.sel : '', at(D.path));

    // Shared pieces of the accordion body and the map card.
    const regShort = rs => (rs.includes('Statewide') ? 'Statewide' : !rs.length ? 'Region not recorded' : rs.length > 2 ? rs.length + ' regions' : rs.join(', '));
    const textLink = (label, href) => `<a class="text-link" href="${esc(href)}">${label} ${ARR_NE}</a>`;  // the site's text link (common.btn 'text')
    const ownPage = r => !!r.url && r.url.startsWith('/');  // a program with its own page here (an Alliance program's page, unless disconnected)
    const badges = p => (p.alliance || p.status ? `<span class="badges">${p.alliance ? `<span class="badge">Alliance ${state.tab === 'programs' ? 'program' : 'partner'}</span>` : ''}${p.status ? `<span class="badge badge--outline">${esc(p.status)}</span>` : ''}</span>` : '');
    const logoTile = (o, cls) => (o.logo ? `<div class="identity__logo ${cls}${o.logo_dark ? ' identity__logo--dark' : ''}"><img src="${esc(at(o.logo))}" alt="${esc(o.name)} logo"></div>` : '');
    // Records link across: a program's providers to their profiles, a partner's programs to the Program Directory.
    const related = r => (state.tab === 'programs'
      ? r.providers.map(x => (x.slug && orgById[x.slug] ? { label: x.name, href: at(orgById[x.slug].url) } : { label: x.name }))
      : r.programs.map(id => progById[id]).filter(Boolean).map(p => ({ label: p.name, href: at(D.programsUrl) + (state.view === 'map' ? '?view=map' : '') + '#' + p.id })));
    const domain = u => (u || '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '');
    // A program's facts (the map card) and its link: an Alliance program's page, else Learn more.
    const facts = r => [['Regions', r.regions.join(', ') || 'Not recorded'], ...(r.topics.length ? [['Topics', r.topics.join(', ')]] : [])];
    const actions = r => (ownPage(r) ? textLink('View program page', at(r.url)) : textLink(`Learn more<span class="sr-only"> about ${esc(r.name)}</span>`, r.url));

    // The partner card (the user's Partner Card Redesign 2a, 2026-10-06), in the open row and the map card: who they serve
    // (tags), what they do (the titles of the profile's offers), up to three of its programs (Alliance programs first, each
    // opening in the Program Directory), where it's located, then View profile and the website's domain. In the list, each
    // partner's row starts with its logo (an empty tile when there's none yet).
    const partnerLogo = o => (o.logo ? `<span class="pc-logo${o.logo_dark ? ' pc-logo--dark' : ''}"><img src="${esc(at(o.logo))}" alt="" loading="lazy"></span>`
      : `<span class="pc-logo pc-logo--mono" aria-hidden="true">${(o.monogram || '').split(' ').map(esc).join('<br>')}</span>`);  // its initials until it has a logo (user, 2026-10-06)
    const partnerBody = r => {
      const rel = related(r), shown = rel.slice(0, 3);
      const sec = (head, inner) => `<div class="pc-sec"><p class="mono pc-h">${head}</p>${inner}</div>`;
      return '<div class="pc-body">' +
        (r.audiences.length ? sec('Who they serve', '<div class="pc-tags">' + r.audiences.map(a => `<span class="pc-tag">${esc(a)}</span>`).join('') + '</div>') : '') +
        (r.offers.length ? sec('What they do', `<p class="pc-offers">${r.offers.map(esc).join(' · ')}</p>`) : '') +
        (rel.length ? sec(`Programs (${rel.length > shown.length ? shown.length + ' of ' + rel.length : shown.length} shown)`, '<div class="pc-links">' +
          shown.map(x => (x.href ? `<a href="${esc(x.href)}">${esc(x.label)}</a>` : `<span>${esc(x.label)}</span>`)).join('') + '</div>' +
          // More than three: all of them in the Program Directory, filtered to this partner (user, 2026-10-06)
          (rel.length > shown.length ? `<a class="pc-all" href="${esc(at(D.programsUrl) + '?provider=' + encodeURIComponent(r.id) + (state.view === 'map' ? '&view=map' : ''))}">See all ${rel.length} programs<span class="sr-only"> from ${esc(r.name)}</span>${ARR_E}</a>` : '')) : '') +
        (r.locations.length ? sec('Locations', '<div class="pc-locs">' + r.locations.map(l => `<span>${esc(l)}</span>`).join('') + '</div>') : '') +
        `<div class="pc-actions"><a class="pc-btn" href="${esc(at(r.url))}">View profile<span class="sr-only">: ${esc(r.name)}</span>${ARR_NE}</a>` +
        (r.website ? `<a class="pc-web" href="${esc(r.website)}">${esc(domain(r.website))}</a>` : '') + '</div></div>';
    };

    // List view: accordion rows (type, name, one line); the open row shows the partner card, or the program's details.
    // A program's row (user, 2026-10-05): its long description is the row's own line (in full once open); then Provided by
    // (linked names) with Regions on the same row; its upcoming
    // events and opportunities as linked headlines (directory.py matches them by name; past dates are dropped here); the link.
    const isoToday = [today.getFullYear(), today.getMonth() + 1, today.getDate()].map((n, i) => (i ? String(n).padStart(2, '0') : n)).join('-');
    const programBody = r => {
      const by = related(r).map(x => (x.href ? `<a href="${esc(x.href)}">${esc(x.label)}</a>` : esc(x.label))).join(', ');
      const up = (r.upcoming || []).filter(x => !x.w || x.w >= isoToday);
      return `<div class="dir-acc__meta"><div><p class="dir-rel__head">Provided by</p><p class="dir-acc__by">${by || 'Not recorded'}</p></div>` +
        `<div class="dir-acc__regions"><p class="dir-rel__head">Regions</p><p>${esc(r.regions.join(', ') || 'Not recorded')}</p></div></div>` +
        (up.length ? `<div class="dir-acc__upcoming"><p class="dir-rel__head">Upcoming events &amp; open calls</p><ul>` +
          up.map(x => `<li><a href="${esc(at(x.h))}">${esc(x.t)}</a></li>`).join('') + '</ul></div>' : '') +
        `<div class="dir-acc__actions">${actions(r)}</div>`;
    };
    const accBody = r => (state.tab === 'programs' ? programBody(r) : partnerBody(r));
    // The small line above a name: the type, or what the Program Directory is sorted by (the provider, or the region it's
    // placed under), so the order reads.
    const eyebrowOf = r => {
      if (state.tab !== 'programs') return r.type;
      if (sortEl.value === 'provider') return r.providers.length ? r.providers[0].name + (r.providers.length > 1 ? ' + ' + (r.providers.length - 1) + ' more' : '') : 'Provider not recorded';
      if (sortEl.value === 'region') {
        if (r.regions.includes('Statewide')) return 'Statewide';
        const known = r.regions.filter(x => REGS.includes(x)).sort((x, y) => REGS.indexOf(x) - REGS.indexOf(y));
        return known.length ? known[0] + (known.length > 1 ? ' + ' + (known.length - 1) + ' more' : '') : 'Region not recorded';
      }
      return r.type;
    };
    const accRow = r => {
      const on = r.id === state.sel, progs = state.tab === 'programs';
      return `<li class="dir-acc__item${on ? ' is-open' : ''}" data-id="${esc(r.id)}"><h3 class="dir-acc__h"><button type="button" class="dir-acc__head" data-dir-toggle="${esc(r.id)}" aria-expanded="${on}" aria-controls="dir-body-${esc(r.id)}">` +
        (progs ? '' : partnerLogo(r)) + `<span class="dir-acc__text"><span class="mono dir-acc__eyebrow">${esc(eyebrowOf(r))}</span><span class="dir-acc__name">${esc(r.name)}</span>${badges(r)}` +
        (progs  // a program's long description, cut to three lines with an ellipsis until the row opens (user, 2026-10-05)
          ? `<span class="dir-acc__short dir-acc__short--clamp">${esc(r.summary || r.short)}</span>`
          : `<span class="dir-acc__short">${esc(r.short)}</span>`) + `</span>${CHEV}</button></h3>` +
        `<div class="dir-acc__body${progs ? '' : ' pc'}" id="dir-body-${esc(r.id)}"${on ? '' : ' hidden'}>${on ? accBody(r) : ''}</div></li>`;
    };
    const drawList = () => {
      listUl.innerHTML = state.items.map(accRow).join('');
      const to = state.scrollTo;
      state.scrollTo = null;
      const li = to && listUl.querySelector(`[data-id="${CSS.escape(to.id)}"]`);
      if (!li) return;
      const top = listBox.getBoundingClientRect().top, behavior = to.focus && !reduced ? 'smooth' : 'instant';  // a linked record opens in place
      listBox.scrollTo({ top: Math.max(0, li.getBoundingClientRect().top - top + listBox.scrollTop), behavior });
      const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;  // the sticky header
      if (top < pad || top > window.innerHeight * 0.5) window.scrollTo({ top: Math.max(0, top + window.scrollY - pad - 24), behavior });
      if (to.focus) li.querySelector('.dir-acc__head').focus({ preventScroll: true });
    };
    const openRow = id => {  // one row open at a time; the rest of the list stays as it is (and keeps focus)
      state.sel = id;
      listUl.querySelectorAll('.dir-acc__item').forEach(li => {
        const on = li.dataset.id === id, body = li.querySelector('.dir-acc__body');
        li.classList.toggle('is-open', on);
        li.querySelector('.dir-acc__head').setAttribute('aria-expanded', String(on));
        body.hidden = !on;
        body.innerHTML = on ? accBody(record(id)) : '';
      });
      sync();
    };

    // Map view: a Mercator fit of California (network-directory-geo.json). The nine regions and Other California Regions are
    // their counties merged (D.counties: county id → region); their outer edges are the county edges used once. With regions
    // chosen, the map zooms to them (CSS transform on the SVG group) while the pins and labels fade and come back in place.
    const REG_ANCHOR = { 'Redwood': [-123.75, 40.15], 'North State': [-121.2, 41.25], 'Capital': [-120.75, 39.2], 'Bay Area': [-122.75, 38.5], 'Northern San Joaquin': [-120.75, 37.6],
      'Central San Joaquin': [-119.2, 36.3], 'Central Coast': [-120.75, 35.1], 'Kern County': [-117.9, 35.25], 'Southern Border': [-116.3, 33.0],
      [OTHER]: [-116.2, 34.75] };
    const RAD = Math.PI / 180, mx = lon => lon * RAD, my = lat => -Math.log(Math.tan(Math.PI / 4 + lat * RAD / 2));
    const polys = g => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
    const r1 = v => Math.round(v * 10) / 10;
    let geo = null, geoState = 'idle', rgeo = null, fit = null, lastZoom, zoomTimer, svgKey = '';
    const regionGeo = () => {
      if (rgeo) return rgeo;
      const by = {}, edges = {}, other = [], bb = {};
      REGS.forEach(r => { by[r] = []; });
      geo.counties.forEach(c => { const r = D.counties[c.id]; (r ? by[r] : other).push(c.geometry); });
      REGS.forEach(r => {
        const seen = new Map();
        by[r].forEach(g => polys(g).forEach(p => p.forEach(ring => {
          for (let i = 0; i < ring.length - 1; i++) {
            const a = ring[i], b = ring[i + 1], ka = a[0] + ',' + a[1], kb = b[0] + ',' + b[1];
            if (ka === kb) continue;
            const k = ka < kb ? ka + '|' + kb : kb + '|' + ka, e = seen.get(k);
            if (e) e.n++; else seen.set(k, { a, b, n: 1 });
          }
        })));
        edges[r] = [...seen.values()].filter(e => e.n === 1);
        const q = [Infinity, Infinity, -Infinity, -Infinity];
        by[r].forEach(g => polys(g).forEach(p => p.forEach(ring => ring.forEach(([lo, la]) => { const x = mx(lo), y = my(la); q[0] = Math.min(q[0], x); q[1] = Math.min(q[1], y); q[2] = Math.max(q[2], x); q[3] = Math.max(q[3], y); }))));
        bb[r] = q;
      });
      return (rgeo = { by, edges, other, bb });
    };
    // California sits left of the floating card on wide stages (1000px or more), centered otherwise.
    const project = (w, h) => {
      const key = w + 'x' + h;
      if (fit && fit.key === key) return fit;
      const ca = geo.states.find(s => s.id === '06');
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      polys(ca.geometry).forEach(p => p.forEach(ring => ring.forEach(([lo, la]) => { const x = mx(lo), y = my(la); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); })));
      const wide = w >= 1000, padY = 32, padL = wide ? 64 : 48, padR = wide ? 440 : 48, ew = w - padL - padR, eh = h - padY * 2;
      const k = Math.min(ew / (x1 - x0), eh / (y1 - y0));
      const tx = padL + (wide ? 0 : (ew - k * (x1 - x0)) / 2) - k * x0, ty = padY + (eh - k * (y1 - y0)) / 2 - k * y0;
      const proj = (lo, la) => [k * mx(lo) + tx, k * my(la) + ty];
      const path = gs => gs.map(g => polys(g).map(p => p.map(ring => 'M' + ring.map(([lo, la]) => { const [x, y] = proj(lo, la); return x.toFixed(1) + ',' + y.toFixed(1); }).join('L') + 'Z').join('')).join('')).join('');
      const segPath = segs => { let s = '', last = ''; segs.forEach(e => { const [ax, ay] = proj(e.a[0], e.a[1]), [bx, by] = proj(e.b[0], e.b[1]), ka = ax.toFixed(1) + ',' + ay.toFixed(1), kb = bx.toFixed(1) + ',' + by.toFixed(1); if (ka === kb) return; s += (ka === last ? '' : 'M' + ka) + 'L' + kb; last = kb; }); return s; };
      const rg = regionGeo();
      fit = { key, w, h, wide, proj, k, tx, ty, neighbors: path(geo.states.filter(s => s.id !== '06').map(s => s.geometry)), outline: path([ca.geometry]), other: path(rg.other),
        regions: REGS.map(r => ({ name: r, d: path(rg.by[r]), edge: segPath(rg.edges[r]), anchor: proj(REG_ANCHOR[r][0], REG_ANCHOR[r][1]) })) };
      return fit;
    };
    const loadGeo = () => {
      if (geoState !== 'idle') return;
      geoState = 'loading';
      const link = dirEl.querySelector('[data-dir-geo]');
      fetch(link ? link.href : at('https://hanifhouston.github.io/calagtechalliance-site-preview/assets/network-directory-geo.json')).then(r => r.json())
        .then(g => { geo = g; geoState = 'ready'; if (state.view === 'map') drawMap(); })
        .catch(() => { geoState = 'error'; const s = stage.querySelector('[data-dir-status]'); if (s) s.textContent = 'Map unavailable'; });
    };
    // The SVG is drawn once per stage size; region fills, edges and the zoom change in place so the zoom can animate.
    const drawBase = b => {
      stage.innerHTML = `<svg class="dir-map__svg" viewBox="0 0 ${b.w} ${b.h}" aria-hidden="true" focusable="false"><g class="dir-map__zoom" data-dir-zoom>` +
        `<path class="dir-map__land" d="${b.neighbors}"/><path class="dir-map__other" d="${b.other}"/>` +
        b.regions.map(g => `<path class="dir-region" data-region="${esc(g.name)}" d="${g.d}"><title>${esc(g.name)}</title></path>`).join('') +
        `<path class="dir-map__outline" d="${b.outline}"/><g data-dir-edges></g></g></svg>` +
        '<div class="dir-map__layer" data-dir-layer></div>' +
        `<button type="button" class="dir-map__zoomout" data-dir-zoomout hidden>${ARR_W}All of California</button>` +
        '<button type="button" class="dir-map__statewide" data-dir-statewide aria-pressed="false" hidden></button>' +
        '<p class="dir-empty-map small" data-dir-map-empty hidden></p>';
      svgKey = b.key;
      lastZoom = undefined;  // a new stage starts at its zoom, without animating
    };
    // Region fills and edges (hovered and chosen edges drawn last, on top) and the region labels' color. On the Program Directory
    // a region's fill is its level (shade) from drawMap's counts; with a program selected, only its regions are filled.
    const paintRegions = () => {
      if (!fit || svgKey !== fit.key) return;
      const chosen = ui.values('region'), shade = state.tab === 'programs' ? state.shade : null;
      const rank = g => (chosen.includes(g.name) ? 2 : state.hreg === g.name ? 1 : 0);
      stage.querySelectorAll('.dir-region').forEach(p => {
        const name = p.dataset.region;
        p.classList.toggle('is-on', chosen.includes(name));
        p.classList.toggle('is-hover', state.hreg === name);
        p.classList.toggle('is-sel', !!(shade && shade.sel && shade.sel.includes(name)));
        if (shade) p.dataset.level = shade.sel ? 0 : shade.level[name]; else delete p.dataset.level;
        p.querySelector('title').textContent = shade ? name + ': ' + shade.count[name] + ' ' + (shade.count[name] === 1 ? 'program' : 'programs') : name;
      });
      stage.querySelector('[data-dir-edges]').innerHTML = [...fit.regions].sort((a, c) => rank(a) - rank(c))
        .map(g => `<path class="dir-map__edge${rank(g) === 2 ? ' is-on' : rank(g) === 1 ? ' is-hover' : ''}" d="${g.edge}"/>`).join('');
      stage.querySelectorAll('[data-dir-rlabel]').forEach(l => l.classList.toggle('is-on', !!rank({ name: l.dataset.dirRlabel })));
    };
    const clusters = (points, dist) => {
      const groups = points.map(p => ({ items: p.items, x: p.x, y: p.y }));
      while (groups.length > 1) {
        let bi = -1, bj = -1, bd = Infinity;
        for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
          const d = Math.hypot(groups[i].x - groups[j].x, groups[i].y - groups[j].y);
          if (d < bd) { bd = d; bi = i; bj = j; }
        }
        if (bd >= dist) break;
        const items = [...groups[bi].items, ...groups[bj].items], n = groups[bi].items.length + groups[bj].items.length;
        groups[bi] = { items, x: (groups[bi].x * groups[bi].items.length + groups[bj].x * groups[bj].items.length) / n, y: (groups[bi].y * groups[bi].items.length + groups[bj].y * groups[bj].items.length) / n };
        groups.splice(bj, 1);
      }
      return groups;
    };
    const drawMap = () => {
      loadGeo();
      const w = stage.clientWidth, h = stage.clientHeight;
      mapEl.classList.toggle('is-wide', w >= 1000);
      if (!geo || !w || !h) { drawCard(); return; }
      const b = project(w, h), T = TABS[state.tab], progs = state.tab === 'programs';
      mapEl.classList.toggle('is-programs', progs);  // region labels sit on shaded regions there, so they get a backing
      if (svgKey !== b.key) drawBase(b);
      const chosen = ui.values('region'), geoSel = REGS.filter(r => chosen.includes(r));
      // Zoom to the chosen regions inside the area left of the card (wide) or the whole stage.
      const A = b.wide ? [72, 72, w - 440, h - 40] : [24, 72, w - 24, h - 24];
      let zs = 1, zx = 0, zy = 0;
      if (geoSel.length) {
        const bb = regionGeo().bb;
        let X0 = Infinity, Y0 = Infinity, X1 = -Infinity, Y1 = -Infinity;
        geoSel.forEach(r => { const q = bb[r]; X0 = Math.min(X0, b.k * q[0] + b.tx); Y0 = Math.min(Y0, b.k * q[1] + b.ty); X1 = Math.max(X1, b.k * q[2] + b.tx); Y1 = Math.max(Y1, b.k * q[3] + b.ty); });
        zs = clamp(Math.min((A[2] - A[0]) / (X1 - X0), (A[3] - A[1]) / (Y1 - Y0)) * 0.92, 1, 6);
        zx = (A[0] + A[2]) / 2 - zs * (X0 + X1) / 2;
        zy = (A[1] + A[3]) / 2 - zs * (Y0 + Y1) / 2;
      }
      const Z = (x, y) => [zs * x + zx, zs * y + zy];
      const zp = (lo, la) => { const [x, y] = b.proj(lo, la); return Z(x, y); };
      const inb = (x, y) => x > 6 && x < w - 6 && y > 6 && y < h - 6;
      const zoomKey = geoSel.join('|');
      const layer = stage.querySelector('[data-dir-layer]'), g = stage.querySelector('[data-dir-zoom]');
      g.style.transform = `translate(${r1(zx)}px, ${r1(zy)}px) scale(${zs.toFixed(4)})`;
      if (lastZoom !== undefined && lastZoom !== zoomKey && !reduced) {
        g.classList.add('is-animating');
        layer.classList.add('is-zooming');
        clearTimeout(zoomTimer);
        zoomTimer = setTimeout(() => { layer.classList.remove('is-zooming'); g.classList.remove('is-animating'); }, 440);
      }
      lastZoom = zoomKey;
      stage.querySelector('[data-dir-zoomout]').hidden = !geoSel.length;
      // Programs: each region's count of the programs shown that serve it (statewide programs are counted separately), as
      // a level 1–4 relative to the largest; a selected program's regions (all of them when it's statewide).
      const shade = progs ? { count: {}, level: {}, statewide: 0, sel: null } : null;
      if (shade) {
        REGS.forEach(r => { shade.count[r] = 0; });
        state.items.forEach(p => { if (p.regions.includes('Statewide')) shade.statewide++; else p.regions.forEach(r => { if (r in shade.count) shade.count[r]++; }); });
        const most = Math.max(1, ...REGS.map(r => shade.count[r]));
        REGS.forEach(r => { const n = shade.count[r]; shade.level[r] = n ? Math.min(4, Math.ceil(4 * n / most)) : 0; });
        const sp = state.sel ? progById[state.sel] : null;
        if (sp) shade.sel = sp.regions.includes('Statewide') ? REGS.slice() : sp.regions.filter(r => REGS.includes(r));
      }
      state.shade = shade;
      const sw = stage.querySelector('[data-dir-statewide]');
      sw.hidden = !shade || (!shade.statewide && !chosen.includes('Statewide'));
      stage.classList.toggle('has-statewide', !sw.hidden);
      if (shade) {
        sw.textContent = shade.statewide + ' statewide ' + (shade.statewide === 1 ? 'program' : 'programs');
        sw.setAttribute('aria-pressed', String(chosen.length === 1 && chosen[0] === 'Statewide'));
      }
      // Pins: one bucket per location (Partners: each organization's California addresses; Programs: the selected program's
      // providers' offices), then nearby buckets merge into numbered groups. Provider pins open the provider's profile.
      const buckets = new Map();
      const add = (pl, item) => { const key = pl.coords.join(','); if (!buckets.has(key)) buckets.set(key, { pl, items: [] }); buckets.get(key).items.push({ r: item, city: pl.city }); };
      if (progs) {
        const sp = state.sel ? progById[state.sel] : null;
        if (sp) sp.providers.forEach(x => { const o = x.slug && orgById[x.slug]; if (o) o.places.forEach(pl => add(pl, o)); });
      } else state.items.forEach(r => r.places.forEach(pl => add(pl, r)));
      const points = [...buckets.values()].map(bk => { const [x, y] = zp(bk.pl.coords[0], bk.pl.coords[1]); return { items: bk.items, x, y }; }).filter(p => inb(p.x, p.y));
      const noun = progs ? 'providers' : T.many;
      let html = '', pop = '';
      const pins = clusters(points, progs ? 24 : 40).map(cl => {
        const seen = new Set(), u = cl.items.filter(p => !seen.has(p.r.id) && seen.add(p.r.id)).sort((a, c) => a.r.name.localeCompare(c.r.name));
        return { x: cl.x, y: cl.y, u, key: u.map(p => p.r.id).sort().join('|') + '@' + Math.round(cl.x) + ',' + Math.round(cl.y) };
      });
      pins.forEach(p => {
        if (progs) {  // a provider's office: small, and it opens the provider's profile
          p.size = 14;
          if (p.u.length === 1) {
            const x = p.u[0];
            html += `<a class="dir-pin dir-pin--provider" style="left:${r1(p.x)}px;top:${r1(p.y)}px" href="${esc(at(x.r.url))}" ` +
              `aria-label="${esc('Provider office: ' + x.r.name + ', ' + x.city + '. Opens its profile')}" title="${esc('Provider office · ' + x.r.name + ' · ' + x.city)}"><span></span></a>`;
            return;
          }
          // Several providers' offices close together: the pin opens a list, and each provider opens its profile.
          const open = state.pop === p.key;
          html += `<button type="button" class="dir-pin dir-pin--provider dir-pin--group" style="left:${r1(p.x)}px;top:${r1(p.y)}px" data-pin="${esc(p.key)}" data-group="1" ` +
            `aria-expanded="${open}"${open ? ' aria-controls="dir-pop"' : ''} aria-label="${esc(p.u.length + ' provider offices: ' + p.u.map(x => x.r.name).join(', '))}" title="${esc('Choose from ' + p.u.length + ' providers')}"><span>${p.u.length}</span></button>`;
          if (open) {
            const pw = Math.min(300, w - 24), ph = Math.min(56 + p.u.length * 66, h - 24);
            pop = `<div class="dir-pop" id="dir-pop" role="group" aria-label="Choose a provider" style="left:${r1(clamp(p.x - pw / 2, 12, w - pw - 12))}px;top:${r1(clamp(p.y + 24, 12, h - ph - 12))}px;width:${pw}px;max-height:${Math.round(h - 24)}px">` +
              `<div class="dir-pop__head"><span class="mono">${p.u.length} providers</span><button type="button" data-pop-close aria-label="Close map group">${CLOSE}</button></div>` +
              p.u.map(x => `<a class="dir-pop__item" href="${esc(at(x.r.url))}"><strong>${esc(x.r.name)}</strong><span>${esc(x.city)} · profile</span></a>`).join('') + '</div>';
          }
          return;
        }
        const multi = p.u.length > 1, on = p.u.some(x => x.r.id === state.sel), first = p.u[0];
        p.size = multi ? 30 : on ? 26 : 20;
        const label = multi ? p.u.length + ' ' + noun + ': ' + p.u.map(x => x.r.name).join(', ') : first.r.name + ', ' + first.city;
        // A single pin is a toggle (its record selected or not); a group pin opens and closes its list of records.
        const open = multi && state.pop === p.key, aria = multi ? `aria-expanded="${open}"${open ? ' aria-controls="dir-pop"' : ''}` : `aria-pressed="${on}"`;
        html += `<button type="button" class="dir-pin${multi ? ' dir-pin--group' : ''}${on ? ' is-on' : ''}" style="left:${r1(p.x)}px;top:${r1(p.y)}px" data-pin="${esc(multi ? p.key : first.r.id)}" ` +
          `data-group="${multi ? 1 : 0}" ${aria} aria-label="${esc(label)}" title="${esc(multi ? 'Choose from ' + p.u.length + ' ' + noun : first.r.name + ' · ' + first.city)}"><span>${multi ? p.u.length : ''}</span></button>`;
        if (open) {
          const pw = Math.min(300, w - 24), ph = Math.min(56 + p.u.length * 66, h - 24);
          pop = `<div class="dir-pop" id="dir-pop" role="group" aria-label="Choose ${progs ? 'a program' : 'an organization'}" style="left:${r1(clamp(p.x - pw / 2, 12, w - pw - 12))}px;top:${r1(clamp(p.y + 24, 12, h - ph - 12))}px;width:${pw}px;max-height:${Math.round(h - 24)}px">` +
            `<div class="dir-pop__head"><span class="mono">${p.u.length} ${noun}</span><button type="button" data-pop-close aria-label="Close map group">${CLOSE}</button></div>` +
            p.u.map(x => `<button type="button" class="dir-pop__item${x.r.id === state.sel ? ' is-on' : ''}" data-pick="${esc(x.r.id)}"${x.r.id === state.sel ? ' aria-current="true"' : ''}><strong>${esc(x.r.name)}</strong><span>${esc(x.city)}</span></button>`).join('') + '</div>';
        }
      });
      // Area and region labels; a region label moves to the nearest free spot off the pins, or is left out.
      let labels = '';
      if (w > 360) [['Nevada', [-117.2, 39.6]], ['Pacific Ocean', [-123.4, 35.2]]].forEach(([t, c]) => {
        const [px, y] = zp(c[0], c[1]), half = t.length * 5 + 6;
        if (y > 20 && y < h - 15 && px > 0 && px < w) labels += `<span class="mono dir-map__area" style="left:${r1(clamp(px, half + 12, w - half - 12))}px;top:${r1(y)}px">${t}</span>`;
      });
      if (w >= 560) {
        const boxes = pins.map(p => { const r = p.size / 2 + 4; return [p.x - r, p.y - r, p.x + r, p.y + r]; });
        const hit = (x, y, lw) => boxes.some(bx => x - lw / 2 < bx[2] && x + lw / 2 > bx[0] && y - 8 < bx[3] && y + 8 > bx[1]);
        const offs = [];
        [0, -20, 20, -38, 38, -56, 56].forEach(dy => [0, -40, 40, -70, 70].forEach(dx => offs.push([dx, dy])));
        offs.sort((a, c) => Math.hypot(a[0], a[1] * 1.6) - Math.hypot(c[0], c[1] * 1.6));
        b.regions.forEach(rg => {
          const [x, y] = Z(rg.anchor[0], rg.anchor[1]);
          if (!inb(x, y)) return;
          const text = rg.name + (shade && !shade.sel ? ' · ' + shade.count[rg.name] : '');  // Programs: the region's count (not while a program is selected)
          const lw = text.length * 8 + 8, ok = offs.find(([dx, dy]) => { const lx = x + dx; return lx - lw / 2 > 4 && lx + lw / 2 < w - 4 && !hit(lx, y + dy, lw); });
          if (!ok) return;
          const lx = x + ok[0], ly = y + ok[1];
          boxes.push([lx - lw / 2, ly - 9, lx + lw / 2, ly + 9]);
          labels += `<span class="mono dir-map__rlabel" data-dir-rlabel="${esc(rg.name)}" style="left:${r1(lx)}px;top:${r1(ly)}px">${esc(text)}</span>`;
        });
      }
      layer.innerHTML = labels + html + pop;
      const empty = stage.querySelector('[data-dir-map-empty]');
      empty.hidden = !!state.items.length;
      empty.textContent = T.empty;
      paintRegions();
      drawCard();
    };
    // The floating card (wide stages; under the legend otherwise): the selected record, or on the Program Directory the list
    // of programs shown (the design's programs panel).
    const drawCard = () => {
      const r = state.sel ? record(state.sel) : null, progs = state.tab === 'programs';
      const wide = mapEl.classList.contains('is-wide');
      cardEl.style.maxHeight = wide ? Math.max(200, stage.clientHeight - 40) + 'px' : '';
      if (r) {
        // A program: its regions, pages and providers in rows. A partner: the partner card (partnerBody), as in the list.
        const rel = related(r), site = ownPage(r) ? r.website : r.url;
        const rows = progs ? [...facts(r).map(([k, v]) => [k, esc(v)]),
          ...(ownPage(r) ? [['Program page', `<a href="${esc(at(r.url))}">View program page</a>`]] : []),
          ...(site ? [['Website', `<a href="${esc(site)}">${esc(domain(site))}</a>`]] : []),
          ...(rel.length ? [['Provided by', '<span class="dir-card__rel">' + rel.map(x => (x.href ? `<a href="${esc(x.href)}">${esc(x.label)}</a>` : `<span>${esc(x.label)}</span>`)).join('') + '</span>']] : [])] : [];
        cardEl.innerHTML = `<article class="dir-card" aria-label="${esc(r.name)}" tabindex="-1" data-dir-cardbox><div class="dir-card__top">` +
          (progs ? `<button type="button" class="dir-card__back" data-dir-close>${ARR_W}All programs</button>`
            : logoTile(r, 'dir-card__logo') + `<button type="button" class="dir-card__close" data-dir-close aria-label="Close profile">${CLOSE}</button>`) + '</div>' +
          `<p class="mono dir-card__eyebrow">${esc(r.type)}</p><h2 class="dir-card__name">${esc(r.name)}</h2>${badges(r)}` +
          (progs ? `<p class="mono dir-card__meta">${esc(regShort(r.regions))}</p>` : '') +
          `<p class="dir-card__lead">${esc(progs ? (r.summary || r.short) : r.short)}</p>` +
          (progs ? `<dl class="dir-card__rows">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl><div class="dir-card__actions">${actions(r)}</div>`
            : partnerBody(r)) + '</article>';
        cardEl.hidden = false;
      } else if (progs && state.items.length) {
        const chosen = ['Statewide', ...REGS].filter(x => ui.values('region').includes(x));
        const by = p => (p.providers.length > 2 ? p.providers.slice(0, 2).map(x => x.name).join(', ') + ' and ' + (p.providers.length - 2) + ' more' : andList(p.providers.map(x => x.name)));
        cardEl.innerHTML = `<article class="dir-card dir-card--list" aria-label="Programs"><p class="mono dir-card__count">${state.items.length} ${state.items.length === 1 ? 'program' : 'programs'}</p>` +
          `<h2 class="dir-card__name">${esc(chosen.length ? andList(chosen) : 'All regions')}</h2><ul class="dir-plist">` +
          state.items.map(p => `<li><button type="button" data-pick="${esc(p.id)}"><span><strong>${esc(p.name)}</strong>${p.providers.length ? `<span>Provided by ${esc(by(p))}</span>` : ''}` +
            `<span class="mono">${esc(p.type)} · ${esc(regShort(p.regions))}</span></span>${ARR_E}</button></li>`).join('') + '</ul></article>';
        cardEl.hidden = false;
      } else {
        cardEl.innerHTML = '';
        cardEl.hidden = true;
      }
    };
    // After a pick, keyboard and screen-reader users land on the card; on narrow stages it sits under the map.
    const showCard = () => {
      const card = cardEl.querySelector('[data-dir-cardbox]');
      if (!card) return;
      card.focus({ preventScroll: true });
      if (!mapEl.classList.contains('is-wide')) card.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
    };

    const render = (changed = false) => {
      const T = TABS[state.tab], isList = state.view === 'list';
      state.items = results();
      facetCounts();
      if (state.sel && !state.items.some(r => r.id === state.sel)) state.sel = null;
      const n = state.items.length;
      countEl.textContent = n + ' ' + (n === 1 ? T.one : T.many);
      // The partner the Program Directory is showing (?provider=), as a pill that clears it.
      const provPill = dirEl.querySelector('[data-dir-provider]'), prov = state.tab === 'programs' && state.provider && orgById[state.provider];
      if (provPill) provPill.remove();
      if (prov) countEl.insertAdjacentHTML('afterend', `<button type="button" class="dir-provider" data-dir-provider>From ${esc(prov.name)}<span class="sr-only">: show all programs</span>${CLOSE}</button>`);
      sortWrap.hidden = !isList;
      views.querySelectorAll('[data-dir-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.dirView === state.view)));
      emptyEl.hidden = !(isList && !n);
      emptyHead.textContent = T.empty;
      listHead.textContent = T.list;
      listUl.setAttribute('aria-label', T.list);
      listBox.hidden = !isList || !n;
      mapEl.hidden = isList;
      // The off-map note counts the records shown that the map can't place (an organization without a California street
      // address; a program with no service region), in directory.py's wording; with none, only the Program Directory's lead.
      const O = D.offmap[state.tab], off = state.items.filter(r => (state.tab === 'programs' ? !r.regions.length : !r.places.length)).length;
      offMap.textContent = [O.lead, off ? O[off === 1 ? 'one' : 'many'].replace('{n}', off) : ''].filter(Boolean).join(' ');
      offMap.hidden = isList || !offMap.textContent;
      attrib.hidden = isList;
      ui.refresh();
      if (h1) h1.innerHTML = sentence();
      referral();
      if (isList) drawList(); else drawMap();
      if (changed) { announce(countEl.textContent); sync(); }
    };
    dirEl.addEventListener('click', event => {
      if (!event.target.closest('[data-dir-provider]')) return;
      state.provider = null;
      render(true);
      // Focus where Clear all puts it: the search, or "Show filters" when the sidebar is folded away (narrow list view).
      [ui.search, dirWrap.querySelector('[data-facets-toggle]')].find(el => el && el.offsetParent !== null)?.focus();
    });
    const setView = view => {
      state.view = view;
      state.pop = null;
      ui.setBar(view === 'map');  // the map's filters are a bar of dropdowns
    };

    views.querySelectorAll('[data-dir-view]').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.dirView === state.view) return;
      setView(b.dataset.dirView);
      if (state.view === 'list' && state.sel) state.scrollTo = { id: state.sel };
      render(true);
    }));
    sortEl.addEventListener('change', () => render(true));
    listUl.addEventListener('click', event => {
      const toggle = event.target.closest('[data-dir-toggle]');
      if (toggle) openRow(state.sel === toggle.dataset.dirToggle ? null : toggle.dataset.dirToggle);
    });
    // A record's pin: its own, or the numbered group that holds it (a group's data-pin is "id|id|…@x,y").
    const pinOf = id => stage.querySelector(`[data-pin="${CSS.escape(id)}"]`) ||
      [...stage.querySelectorAll('[data-group="1"]')].find(p => p.dataset.pin.split('@')[0].split('|').includes(id));
    // Closing the card returns focus to where the record was opened: the programs panel's row, else its pin or group.
    const closeCard = () => {
      const id = state.sel || '', fromPanel = state.from === 'panel';
      state.sel = null;
      state.from = null;
      drawMap();
      sync();
      const row = id && cardEl.querySelector(`[data-pick="${CSS.escape(id)}"]`), pin = id && pinOf(id);
      const back = (fromPanel ? row || pin : pin || row) || stage.querySelector('[data-pin]');
      if (back) back.focus();
    };
    const pick = (id, from) => { state.sel = id; state.from = from; state.pop = null; drawMap(); sync(); showCard(); };
    cardEl.addEventListener('click', event => {
      const p = event.target.closest('[data-pick]');
      if (event.target.closest('[data-dir-close]')) closeCard();
      else if (p) pick(p.dataset.pick, 'panel');
    });
    cardEl.addEventListener('keydown', event => { if (event.key === 'Escape' && state.sel) { event.stopPropagation(); closeCard(); } });
    stage.addEventListener('click', event => {
      const pin = event.target.closest('[data-pin]'), item = event.target.closest('[data-pick]'), region = event.target.closest('[data-region]');
      const statewide = event.target.closest('[data-dir-statewide]');
      if (statewide) {  // shows the statewide programs alone, or all again
        const only = ui.values('region').length === 1 && ui.values('region')[0] === 'Statewide';
        ui.set('region', only ? [] : ['Statewide']);
        state.sel = null;
        state.pop = null;
        render(true);
        // Focus stays on the button, or moves to the Region served filter when the button hides (no statewide programs left).
        const again = stage.querySelector('[data-dir-statewide]');
        if (again && !again.hidden) again.focus();
        else dirWrap.querySelector('.facet:not([hidden])[data-facet="region"] .facet__head')?.focus();
      }
      else if (event.target.closest('[data-pop-close]')) { const key = state.pop; state.pop = null; drawMap(); stage.querySelector(`[data-pin="${CSS.escape(key || '')}"]`)?.focus(); }
      else if (item) pick(item.dataset.pick, 'map');
      else if (pin && pin.dataset.group === '1') {
        state.pop = state.pop === pin.dataset.pin ? null : pin.dataset.pin;
        drawMap();
        (stage.querySelector('.dir-pop [data-pick], .dir-pop a') || stage.querySelector(`[data-pin="${CSS.escape(pin.dataset.pin)}"]`))?.focus();
      } else if (pin) pick(pin.dataset.pin, 'map');
      else if (event.target.closest('[data-dir-zoomout]')) {
        ui.set('region', []);
        state.pop = null;
        render(true);
        // The button hides once the map zooms out, so focus moves to the Region served filter it cleared.
        dirWrap.querySelector('.facet:not([hidden])[data-facet="region"] .facet__head')?.focus();
      }
      else if (region) {  // a region toggles in the region filter (Partners: Location; Programs: Region served)
        const chosen = ui.values('region'), name = region.dataset.region;
        ui.set('region', chosen.includes(name) ? chosen.filter(r => r !== name) : [...chosen, name]);
        state.pop = null;
        render(true);
      }
    });
    stage.addEventListener('mouseover', event => {
      const region = event.target.closest('[data-region]'), name = region ? region.dataset.region : null;
      if (name !== state.hreg) { state.hreg = name; paintRegions(); }
    });
    stage.addEventListener('mouseleave', () => { if (state.hreg) { state.hreg = null; paintRegions(); } });
    stage.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !state.pop) return;
      event.stopPropagation();
      const key = state.pop;
      state.pop = null;
      drawMap();
      stage.querySelector(`[data-pin="${CSS.escape(key)}"]`)?.focus();
    });
    if ('ResizeObserver' in window) new ResizeObserver(() => { if (state.view === 'map') requestAnimationFrame(drawMap); }).observe(stage);

    // Open with the address: the record in #…, the filters (a value or its label, in any case), the search and the view.
    // The old Program Directory's ?for=<audience> picks Who it's for (a retired audience opens unfiltered); ?tab= and
    // ?need= are retired.
    const tab = D.tab;
    let hash = location.hash.slice(1);
    try { hash = decodeURIComponent(hash); } catch (_) { /* a stray % in the address: match it as written */ }
    state.sel = record(hash) ? hash : null;
    ui.showSet(tab, D.search[tab]);
    ui.clear();
    const wanted = {};
    const want = (key, raw) => {
      const v = String(raw).trim().toLowerCase();
      const hit = [...dirWrap.querySelectorAll(`[data-facet-set="${tab}"][data-facet="${key}"] [data-facet-input]`)]
        .find(i => i.value.toLowerCase() === v || i.closest('label').textContent.trim().toLowerCase() === v);
      if (hit) (wanted[key] = wanted[key] || []).push(hit.value);
    };
    TABS[tab].keys.forEach(k => params.getAll(k).forEach(v => want(k, v)));
    if (tab === 'programs') params.getAll('for').forEach(v => want('aud', D.renamed[v] || v));
    Object.entries(wanted).forEach(([k, v]) => ui.set(k, v));
    if (ui.search && params.get('q')) ui.search.value = params.get('q');
    if (tab === 'programs' && orgById[params.get('provider')] && PROGS.some(p => p.providers.some(x => x.slug === params.get('provider')))) state.provider = params.get('provider');
    if ([...sortEl.options].some(o => o.value === params.get('sort'))) sortEl.value = params.get('sort');  // else the first: the default order
    setView(params.get('view') === 'map' ? 'map' : 'list');  // both directories open on the list (user, 2026-10-05); ?view=map opens the map
    if (state.view === 'list' && state.sel) state.scrollTo = { id: state.sel };
    views.hidden = false;
    render();
    // A record opened from a link (a partner's program, a profile's "See in Program Directory"): on narrow stages its map
    // card sits under the map, so scroll it into view once the page has loaded (the browser's own jump to the #fragment
    // comes first and would undo it); list view already scrolls to the open row.
    const toCard = () => {
      if (state.sel && state.view === 'map' && !mapEl.classList.contains('is-wide')) cardEl.querySelector('[data-dir-cardbox]')?.scrollIntoView({ block: 'start', behavior: 'instant' });  // a jump, like a #link
    };
    if (state.sel) {  // a timer, not a frame callback: frames don't run in a background tab
      if (document.readyState === 'complete') setTimeout(toCard, 0);
      else window.addEventListener('load', () => setTimeout(toCard, 0), { once: true });
    }
    if (location.search) sync();  // tidy an old or partial address into the current parameters
    window.addEventListener('pageshow', event => { if (event.persisted) render(); });
    // A link to a record on this page (the menu's Alliance Programs on /programs/): open it, clearing filters that hide it.
    window.addEventListener('hashchange', () => {
      let id = location.hash.slice(1);
      try { id = decodeURIComponent(id); } catch (_) { /* as written */ }
      if (!record(id)) return;
      if (!state.items.some(r => r.id === id)) { ui.clear(); if (ui.search) ui.search.value = ''; state.provider = null; }
      state.sel = id;
      state.pop = null;
      if (state.view === 'list') state.scrollTo = { id };
      render(true);
      toCard();
    });
  })();

  // Audience pages, Partners & Members: picking an organization swaps the panel (rows link to profiles without JS).
  // "Get an introduction" jumps to the Get connected form and starts the note.
  document.querySelectorAll('[data-partners]').forEach(box => {
    const picks = [...box.querySelectorAll('[data-partner]')];
    const panels = [...box.querySelectorAll('[data-partner-panel]')];
    picks.forEach(a => a.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button) return;
      event.preventDefault();
      picks.forEach(p => { if (p === a) p.setAttribute('aria-current', 'true'); else p.removeAttribute('aria-current'); });
      panels.forEach(p => { p.hidden = p.dataset.partnerPanel !== a.dataset.partner; });
      const panel = panels.find(p => !p.hidden);
      if (panel && matchMedia('(max-width: 980px)').matches) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  });
  document.querySelectorAll('[data-intro]').forEach(a => a.addEventListener('click', () => {
    const note = document.getElementById('gc-comments');
    if (!note) return;
    if (!note.value.trim()) note.value = `I'd like an introduction to ${a.dataset.intro}. `;
    setTimeout(() => note.focus({ preventScroll: true }), 500);
  }));

  // Events & Opportunities (v2 design, 2026-10-04): the shared filter sidebar (facetUI) narrows one list of events and
  // opportunities (the user, Oct 2026: no Events / Opportunities toggle); the navy masthead's H1 restates the filters as a
  // read-only sentence; sort, pages of ten, and a List / Calendar switch. The filters live in the address
  // (?kind=&type=&aud=&region=&area=&when=&sort=&q=, repeated for several values); the audience pages' ?for=<audience>,
  // the design's ?tab= and ?audience=, and the old #events / #opportunities still open filtered. Data comes from #eo-data;
  // without JS every row is listed.
  const eo = document.querySelector('.eo');
  const eoData = document.getElementById('eo-data');
  const eoWrap = eo && eo.querySelector('[data-facets]');
  if (eo && eoData && eoWrap) {
    const D = JSON.parse(eoData.textContent);
    const sheet = document.querySelector('link[rel="stylesheet"][href$="assets/styles/site.css"]');
    const base = sheet ? sheet.getAttribute('href').replace(/\/?assets\/styles\/site\.css$/, '') : '';
    const at = path => (path && path.startsWith('/') ? base + path : path);  // organizer links stay as they are
    const ARROW = (eo.querySelector('.deadline-row__end svg') || {}).outerHTML || '';
    const PER = 10;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = iso => { const [y, m, d] = iso.split('-').map(Number); return Math.round((new Date(y, m - 1, d) - today) / 864e5); };
    D.items.forEach(i => {
      i.when = i.kind === 'opportunity' ? i.due : i.date;
      i.hay = [i.title, i.desc, i.org, i.type, i.place, i.region, ...(i.audiences || [])].join(' ').toLowerCase();
    });
    const sortEl = eo.querySelector('[data-eo-sort]');
    const list = eo.querySelector('[data-eo-list]');
    const pager = eo.querySelector('[data-eo-pager]');
    const calEl = eo.querySelector('[data-eo-cal]');
    const h1 = document.querySelector('[data-eo-sentence]');
    const announce = announcer(eo.querySelector('[data-eo-live]'));
    const state = { page: 1, view: 'list', month: new Date(today.getFullYear(), today.getMonth(), 1), day: null, pick: null, items: [] };
    const KEYS = ['kind', 'type', 'aud', 'region', 'area', 'when'];
    const f = {};
    const ui = facetUI(eoWrap, {
      onChange: key => { if (key === 'kind') followKind(); state.page = 1; render(true); },
      onClear: () => { followKind(); state.page = 1; render(true); },  // Clear all keeps the sort (design)
    });
    // Type follows Listing type: with one listing type checked, only its types show (the others are unchecked).
    const followKind = () => { const k = ui.values('kind'); ui.showOptions('type', label => k.length !== 1 || label.dataset.kind === k[0]); };
    // A region choice includes statewide listings, since they serve every region.
    const inRegion = (i, r) => (r === 'outside' ? /outside california|global|united states/i.test(i.region || '') : (i.region || '').includes(r) || /statewide/i.test(i.region || ''));
    const read = () => { KEYS.forEach(k => { f[k] = ui.values(k); }); f.q = (ui.search ? ui.search.value : '').trim(); };

    // The sentence H1, in the design's order: types (else listing types) for audiences in regions focused on areas, the
    // date window, the search. Values follow the sidebar's order; phrases come from support_pages (EO_TYPES, EO_REGIONS…).
    const PH = D.phrases;
    const CA = Object.keys(PH.region).filter(r => r !== 'outside');
    const KIND_OF = {};
    eoWrap.querySelectorAll('[data-facet="type"] label[data-kind] input').forEach(i => { KIND_OF[i.value] = i.closest('label').dataset.kind; });
    const region = r => { const [plain, hl] = (PH.region[r] || '|' + r).split('|'); return esc(plain) + chip(hl, 'region'); };
    const sentence = () => {
      if (!ui.count() && !f.q) return 'Events and open calls.';
      let s = f.type.length ? andList(f.type.map(t => chip(PH.type[t] || t.toLowerCase(), 'type')))
        : f.kind.length ? andList(f.kind.map(k => chip(PH.kind[k] || k, 'type'))) : 'events and open calls';
      if (f.aud.length) s += ' for ' + andList(f.aud.map(a => chip(PH.aud[a] || a, 'aud')));
      if (f.region.length) {  // "in the Bay Area, the Central Coast, and outside California"; every California region reads "statewide"
        const ca = f.region.filter(r => r !== 'outside'), all = ca.length === CA.length;
        const parts = (all ? [chip('statewide', 'region')] : ca.map(region)).concat(f.region.includes('outside') ? [region('outside')] : []);
        s += ' ' + (ca.length && !all ? 'in ' : '') + andList(parts);
      }
      if (f.area.length) s += ' focused on ' + andList(f.area.map(a => chip(PH.area[a] || a, 'area')));
      if (f.when.length) {
        const kinds = f.type.length ? [...new Set(f.type.map(t => KIND_OF[t]))] : f.kind.length ? f.kind : ['event', 'opportunity'];
        s += (kinds.length === 1 ? (kinds[0] === 'event' ? ' happening in the next ' : ' with deadlines in the next ') : ' happening or closing in the next ') + chip(f.when[0] + ' days', 'ring');
      }
      if (f.q) s += ' matching ' + chip('“' + f.q + '”', 'ring');
      return capFirst(s + '.');
    };
    // Request a referral: events or opportunities when the listing type (or the types chosen) settle on one kind.
    const referral = () => {
      const kinds = f.type.length ? [...new Set(f.type.map(t => KIND_OF[t]))] : f.kind;  // as the heading reads them
      const kind = one(kinds), type = one(f.type), reg = one(f.region);
      referralLinks({ need: kind === 'event' ? 'events' : kind === 'opportunity' ? 'opportunities' : '', type: kind && KIND_OF[type] === kind ? type : '',
        aud: one(f.aud), region: reg === 'outside' ? '' : reg, q: f.q, from: ui.count() || f.q ? (h1 ? h1.textContent.trim() : '') : '', src: 'Events & Open Calls' });
    };
    // The old tab addresses keep their place in history only until the first change rewrites the address.
    const keepHash = ['#events', '#opportunities'].includes(location.hash) ? '' : location.hash;
    const sync = () => writeQuery({ kind: f.kind, type: f.type, aud: f.aud, region: f.region, area: f.area, when: f.when, sort: sortEl.value === 'soon' ? '' : sortEl.value, q: f.q }, keepHash);

    const row = i => {
      const d = i.when ? days(i.when) : null, opp = i.kind === 'opportunity', href = at(i.href);
      const tile = d === null ? '<div class="deadline deadline--ongoing"><span class="mono deadline__label">Rolling</span></div>' : countdown(i.when, d);
      // Opportunities: the deadline (no time) | who offers it. Events: date, time | place | host, when the host is in the network.
      // Network hosts and offerers link to their profiles; this year's dates drop the year.
      const year = today.getFullYear();
      const when = s => (s || '').replace(/, (\d{4})$/, (m, y) => (Number(y) > year ? m : ''));
      const who = i.who_url ? `<a href="${esc(at(i.who_url))}">${esc(i.who)}</a>` : esc(i.who);
      const meta = (opp ? ['Deadline: ' + (i.when ? esc(when(i.date_short_due)) : 'Rolling'), who]
        : [[when(i.date_short), i.time_short].filter(Boolean).map(esc).join(', '), esc(i.place_short), i.who_url ? who : '']).filter(Boolean).join(' | ');
      const summary = esc(i.desc);
      const action = i.alliance || !opp ? 'Details' : (D.apply.includes(i.category) ? 'Apply' : 'Learn more');
      return `<article class="deadline-row">${tile}<div><p class="eyebrow">${esc(i.type)}</p><h3><a href="${esc(href)}">${esc(i.title)}</a></h3>` +
        (summary ? `<p>${summary}</p>` : '') + `<p class="mono eo-meta">${meta}</p></div>` +
        `<div class="deadline-row__end"><a class="text-link" href="${esc(href)}">${action} ${ARROW}</a></div></article>`;
    };
    // Each filter's test, so a choice's count can swap in that choice alone (facetUI.setCounts).
    const TESTS = {
      kind: (i, F) => !F.kind.length || F.kind.includes(i.kind),
      type: (i, F) => !F.type.length || (i.categories || [i.category]).some(c => F.type.includes(c)),
      aud: (i, F) => !F.aud.length || F.aud.some(a => (i.audiences || []).includes(a)),
      region: (i, F) => !F.region.length || F.region.some(r => inRegion(i, r)),
      area: (i, F) => !F.area.length || (i.pillars || []).some(a => F.area.includes(a)),
      when: (i, F) => !F.when.length || (!!i.when && days(i.when) <= Number(F.when[0])),
    };
    const passes = (i, F) => (!i.when || days(i.when) >= 0) && KEYS.every(k => TESTS[k](i, F)) && (!F.q || i.hay.includes(F.q.toLowerCase()));
    const render = (changed = false) => {
      read();
      const items = D.items.filter(i => passes(i, f));
      // A Listing type's count: checking it unchecks the other kind's types (followKind), whether or not a kind is
      // already checked, so the other kind never reads "0 matches" (audit, 2026-10-06).
      ui.setCounts((key, v) => D.items.filter(i => passes(i, key === 'kind'
        ? { ...f, kind: [v], type: f.type.filter(t => KIND_OF[t] === v) } : { ...f, [key]: [v] })).length);
      const sort = sortEl.value;
      items.sort((a, b) => sort === 'az' ? a.title.localeCompare(b.title)
        : (!a.when) - (!b.when) || (sort === 'late' ? (b.when || '').localeCompare(a.when || '') : (a.when || '').localeCompare(b.when || '')) || a.title.localeCompare(b.title));
      const n = items.length, pages = Math.max(1, Math.ceil(n / PER));
      state.items = items;
      state.page = Math.min(state.page, pages);
      const start = (state.page - 1) * PER, shown = items.slice(start, start + PER);
      const isList = state.view === 'list';
      eo.querySelectorAll('[data-eo-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.eoView === state.view)));
      eo.querySelector('[data-eo-sort-wrap]').hidden = !isList;  // the calendar is in date order
      list.hidden = !isList || !n;
      list.innerHTML = isList ? shown.map(row).join('') : '';
      calEl.hidden = isList || !n;
      if (!isList && n) drawCalendar();
      eo.querySelector('[data-eo-empty]').hidden = !!n;
      const count = n + (n === 1 ? ' result' : ' results');
      eo.querySelector('[data-eo-count]').textContent = count;
      ui.refresh();
      if (h1) h1.innerHTML = sentence();
      referral();
      pager.hidden = !isList || !n;
      pager.innerHTML = isList && n ? `<span>Showing ${start + 1}–${start + shown.length} of ${n}</span>` + (pages > 1 ? '<nav aria-label="Pagination">' +
        `<button type="button" data-eo-page="${state.page - 1}" data-eo-step="prev"${state.page === 1 ? ' disabled' : ''}>Previous</button>` +
        Array.from({ length: pages }, (_, k) => `<button type="button" data-eo-page="${k + 1}"${k + 1 === state.page ? ' aria-current="page"' : ''} aria-label="Page ${k + 1}">${k + 1}</button>`).join('') +
        `<button type="button" data-eo-page="${state.page + 1}" data-eo-step="next"${state.page === pages ? ' disabled' : ''}>Next</button></nav>` : '') : '';
      if (changed) { announce(count); sync(); }
    };
    // Calendar view (the user, Oct 2026): a month grid with each listing on its date (an event on its day, an opportunity
    // on its deadline), up to three per day, then "+N more". Choosing a date lists all of that day's rows below the grid;
    // choosing one listing shows just its row, with a link to the rest of that day. On phones the grid shows a dot per
    // day and the list does the rest. Rolling deadlines have no date, so a note counts them.
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const isoOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dateOf = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
    const longDate = iso => { const d = dateOf(iso); return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`; };
    const drawCalendar = () => {
      const dated = state.items.filter(i => i.when), rolling = state.items.length - dated.length;
      const byDay = {};
      dated.forEach(i => { (byDay[i.when] = byDay[i.when] || []).push(i); });
      const m = state.month, y = m.getFullYear(), mo = m.getMonth();
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastIso = dated.reduce((a, i) => (i.when > a ? i.when : a), isoOf(today));
      const last = new Date(dateOf(lastIso).getFullYear(), dateOf(lastIso).getMonth(), 1);
      if (m < first) state.month = first;
      if (m > last) state.month = last;
      if (state.month !== m) { drawCalendar(); return; }
      if (state.day && (!byDay[state.day] || dateOf(state.day).getMonth() !== mo)) state.day = null;
      if (!state.day || !byDay[state.day].some(i => i.id === state.pick)) state.pick = null;
      const inMonth = dated.filter(i => { const d = dateOf(i.when); return d.getFullYear() === y && d.getMonth() === mo; }).length;
      const cells = Array.from({ length: new Date(y, mo, 1).getDay() }, () => '<td class="eo-cal__pad"></td>');
      for (let d = 1, n = new Date(y, mo + 1, 0).getDate(); d <= n; d++) {
        const key = isoOf(new Date(y, mo, d)), day = byDay[key] || [], on = state.day === key;
        const cls = ['eo-cal__cell', key === isoOf(today) ? 'is-today' : '', key < isoOf(today) ? 'is-past' : '', day.length ? 'has-items' : '', on ? 'is-selected' : ''].filter(Boolean).join(' ');
        const label = `${MONTHS[mo]} ${d}: ${day.length} ${day.length === 1 ? 'listing' : 'listings'}`;
        const date = day.length ? `<button type="button" class="eo-cal__date" data-eo-day="${key}" aria-pressed="${on}" aria-label="${label}">${d}</button>`
          : `<span class="eo-cal__date">${d}</span>`;
        const chips = day.slice(0, 3).map(i => `<li><button type="button" class="eo-cal__item eo-cal__item--${i.kind}" data-eo-pick="${esc(i.id)}" data-eo-pick-day="${key}" ` +
          `aria-pressed="${state.pick === i.id}" title="${esc(i.type + ' · ' + i.title)}">${i.kind === 'opportunity' ? '<span class="sr-only">Deadline: </span>' : ''}${esc(i.title)}</button></li>`).join('');
        const more = day.length > 3 ? `<button type="button" class="eo-cal__more" data-eo-day="${key}" data-eo-all>+${day.length - 3} more</button>` : '';
        cells.push(`<td class="${cls}">${date}${chips ? `<ul class="eo-cal__items">${chips}</ul>` : ''}${more}</td>`);
      }
      while (cells.length % 7) cells.push('<td class="eo-cal__pad"></td>');
      const weeks = [];
      for (let k = 0; k < cells.length; k += 7) weeks.push('<tr>' + cells.slice(k, k + 7).join('') + '</tr>');
      const dayItems = state.day ? byDay[state.day] : null;
      const picked = dayItems && state.pick ? dayItems.filter(i => i.id === state.pick) : dayItems;
      const rest = dayItems && state.pick && dayItems.length > 1
        ? `<button type="button" class="eo-cal__all" data-eo-day="${state.day}" data-eo-all>See all ${dayItems.length} listings on this day</button>` : '';
      calEl.innerHTML = `<div class="eo-cal__head"><h3 class="eo-cal__title" aria-live="polite">${MONTHS[mo]} ${y}</h3>` +
        `<span class="mono eo-cal__count">${inMonth} ${inMonth === 1 ? 'listing' : 'listings'} this month</span>` +
        `<div class="eo-cal__nav"><button type="button" data-eo-month="-1"${state.month <= first ? ' disabled' : ''}>Previous</button>` +
        `<button type="button" data-eo-month="1"${state.month >= last ? ' disabled' : ''}>Next</button></div></div>` +
        `<table class="eo-cal__grid"><caption class="sr-only">${MONTHS[mo]} ${y}</caption><thead><tr>` +
        WEEKDAYS.map(w => `<th scope="col"><abbr title="${w}">${w.slice(0, 3)}</abbr></th>`).join('') + `</tr></thead><tbody>${weeks.join('')}</tbody></table>` +
        '<p class="eo-cal__legend"><span class="eo-cal__key eo-cal__key--event">Event</span><span class="eo-cal__key eo-cal__key--opportunity">Open call deadline</span></p>' +
        (picked ? `<div class="eo-cal__day"><h3>${longDate(state.day)}</h3><div class="deadlines">${picked.map(row).join('')}</div>${rest}</div>`
          : `<p class="small eo-cal__hint">Choose a date to see its listings.</p>`) +
        (rolling ? `<p class="small eo-cal__note">${rolling} ${rolling === 1 ? 'listing has a rolling deadline' : 'listings have rolling deadlines'}, so ${rolling === 1 ? 'it isn’t' : 'they aren’t'} on the calendar. Switch to List to see ${rolling === 1 ? 'it' : 'them'}.</p>` : '');
    };
    // The calendar and the pager are drawn again after each choice, so focus goes back to the control used, or the
    // closest one still there. A keyboard press (a click with no pointer count) keeps the view on that control; a pointer
    // click scrolls to the change as before.
    const refocus = (box, keys, keyboard) => {
      const el = keys.map(k => k && box.querySelector(k)).find(x => x && !x.disabled);
      if (el) el.focus({ preventScroll: !keyboard });
    };
    calEl.addEventListener('click', event => {
      const day = event.target.closest('[data-eo-day]'), step = event.target.closest('[data-eo-month]'), pick = event.target.closest('[data-eo-pick]');
      const used = pick || day || step, keyboard = event.detail === 0;
      const dayOf = used && (used.dataset.eoDay || used.dataset.eoPickDay);
      // The same chip, date, "+N more" or month button; else the open date ("See all" goes once used), or the other month.
      const keys = used ? [pick ? `[data-eo-pick="${CSS.escape(pick.dataset.eoPick)}"][data-eo-pick-day="${dayOf}"]` : step ? `[data-eo-month="${step.dataset.eoMonth}"]` : `.${used.classList[0]}[data-eo-day="${dayOf}"]`,
        dayOf ? `.eo-cal__date[data-eo-day="${dayOf}"]` : '[data-eo-month]:not([disabled])'] : [];
      if (pick || day) {
        if (pick) {  // one listing: its row alone (choosing it again closes it)
          const again = state.pick === pick.dataset.eoPick;
          state.pick = again ? null : pick.dataset.eoPick;
          state.day = again ? null : pick.dataset.eoPickDay;
        } else {  // a date, "+N more" or "See all": every listing that day (choosing the open date again closes it)
          state.day = state.day === day.dataset.eoDay && !state.pick && !day.hasAttribute('data-eo-all') ? null : day.dataset.eoDay;
          state.pick = null;
        }
        drawCalendar();
        refocus(calEl, keys, keyboard);
        const panel = calEl.querySelector('.eo-cal__day');
        if (panel && !keyboard) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else if (step && !step.disabled) {
        state.month = new Date(state.month.getFullYear(), state.month.getMonth() + Number(step.dataset.eoMonth), 1);
        state.day = null;
        drawCalendar();
        refocus(calEl, keys, keyboard);
      }
    });
    const views = eo.querySelector('[data-eo-views]');
    if (views) views.hidden = false;
    eo.querySelectorAll('[data-eo-view]').forEach(b => b.addEventListener('click', () => { state.view = b.dataset.eoView; render(); }));
    sortEl.addEventListener('change', () => { state.page = 1; render(true); });
    pager.addEventListener('click', event => {
      const b = event.target.closest('[data-eo-page]');
      if (!b || b.disabled) return;
      const keyboard = event.detail === 0;
      state.page = Number(b.dataset.eoPage);
      render();
      // Back to Previous / Next while it can go on, else to the page now shown; the new range is announced.
      refocus(pager, [b.dataset.eoStep && `[data-eo-step="${b.dataset.eoStep}"]`, '[aria-current="page"]'], keyboard);
      announce((pager.querySelector('span') || {}).textContent || '');
      if (!keyboard) eo.querySelector('.dir-bar').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    // Open with the address's filters: a value or its label, in any case. A browser's restored form state gives way to them.
    const params = new URLSearchParams(location.search);
    const wanted = {};
    const want = (key, raw) => {
      const v = String(raw).trim().toLowerCase();
      const hit = [...eoWrap.querySelectorAll(`[data-facet="${key}"] [data-facet-input]`)].find(i => i.value && (i.value.toLowerCase() === v || i.closest('label').textContent.trim().toLowerCase() === v));
      if (hit) (wanted[key] = wanted[key] || []).push(hit.value);
    };
    KEYS.forEach(k => params.getAll(k).forEach(v => want(k, v)));
    params.getAll('audience').forEach(v => want('aud', v));
    params.getAll('for').forEach(v => want('aud', D.renamed[v] || v));  // a retired audience (Alliance Partners) opens unfiltered
    const tab = params.get('tab') || { '#events': 'events', '#opportunities': 'opportunities' }[location.hash];
    if (tab) want('kind', { events: 'event', opportunities: 'opportunity' }[tab] || tab);
    ui.clear();
    ui.set('kind', wanted.kind || []);
    followKind();
    KEYS.slice(1).forEach(k => { if (wanted[k]) ui.set(k, wanted[k]); });
    if (ui.search && params.get('q')) ui.search.value = params.get('q');
    if ([...sortEl.options].some(o => o.value === params.get('sort'))) sortEl.value = params.get('sort');
    render();
    if (location.search || (!keepHash && location.hash)) sync();  // tidy an old address into the current parameters
    window.addEventListener('pageshow', event => { if (event.persisted) { followKind(); render(); } });
  }
  // Share a listing: the Events & Opportunities short form and the share page's full form. In both, the Event /
  // Opportunity choice swaps labels and fields, and a rolling deadline turns off the date. The short form's Continue goes to
  // the share page with its answers as query parameters; the page fills them in, then keeps only ?type= so it can be shared.
  const shareTypes = JSON.parse((document.getElementById('eo-types') || {}).textContent || 'null');
  if (shareTypes) {
    const escHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const kindOf = root => (root.querySelector('[data-eo-kind]:checked') || {}).value || 'event';
    const applyKind = (root, kind) => {
      root.querySelectorAll('[data-eo-only]').forEach(el => { el.hidden = el.dataset.eoOnly !== kind; });
      root.querySelectorAll('[data-eo-label-event]').forEach(l => { l.textContent = kind === 'event' ? l.dataset.eoLabelEvent : l.dataset.eoLabelOpportunity; });
      const types = root.querySelector('[data-eo-form-types]');
      if (types && types.dataset.kind !== kind) {
        types.innerHTML = '<option value="">Select</option>' + shareTypes[kind].map(([v]) => `<option>${escHtml(v)}</option>`).join('');
        types.dataset.kind = kind;
      }
      const date = root.querySelector('[data-eo-sync="date"]'), rolling = root.querySelector('[data-eo-rolling]');
      const off = kind === 'opportunity' && !!rolling && rolling.checked;
      if (date) { date.disabled = off; date.required = !off; }
    };
    const full = document.querySelector('.eo-form');
    if (full) {
      const params = new URLSearchParams(location.search);
      const kind = params.get('type') === 'opportunity' ? 'opportunity' : 'event';
      full.querySelector(`[data-eo-kind][value="${kind}"]`).checked = true;
      full.querySelectorAll('[data-eo-sync]').forEach(field => {
        const value = params.get(field.dataset.eoSync);
        if (value === null) return;
        if (field.type === 'checkbox') field.checked = value === '1'; else field.value = value;
      });
      const keepType = k => { try { history.replaceState(null, '', location.pathname + '?type=' + k); } catch (_) { /* file:// previews */ } };
      keepType(kind);
      full.querySelectorAll('[data-eo-kind]').forEach(r => r.addEventListener('change', () => keepType(r.value)));
      const desc = full.querySelector('[data-eo-desc]'), count = full.querySelector('[data-eo-desc-count]');
      desc?.addEventListener('input', () => { count.textContent = desc.value.length + '/140'; });
      if (params.get('title')) full.querySelector('[data-eo-form-types]').focus();
    }
    document.querySelectorAll('.eo-quick, .eo-form').forEach(root => {
      root.querySelectorAll('[data-eo-kind]').forEach(r => r.addEventListener('change', () => applyKind(root, r.value)));
      root.querySelector('[data-eo-rolling]')?.addEventListener('change', () => applyKind(root, kindOf(root)));
      applyKind(root, kindOf(root));
    });
  }
})();

/* Home, Find your place: the audience tabs (the arrow keys, Home and End move between them, as tabs do). */
(() => {
  const list = document.querySelector('[data-aud-tabs]');
  if (!list) return;
  const tabs = [...list.querySelectorAll('[role=tab]')];
  const pick = (tab, focus) => {
    tabs.forEach(t => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    });
    if (focus) tab.focus();
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => pick(t));
    t.addEventListener('keydown', e => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      const to = step ? tabs[(i + step + tabs.length) % tabs.length] : e.key === 'Home' ? tabs[0] : e.key === 'End' ? tabs[tabs.length - 1] : null;
      if (to) { e.preventDefault(); pick(to, true); }
    });
  });
})();

/* Home, Coming up: the first four listings of the chosen kind that haven't passed (the build drops past ones; this keeps
   the list right between builds). "All events & opportunities" opens that page on the same kind (?kind=). */
(() => {
  const tabs = document.querySelector('[data-cu-tabs]');
  if (!tabs) return;
  const rows = [...document.querySelectorAll('[data-cu-row]')];
  const all = document.querySelector('[data-cu-all]'), empty = document.querySelector('[data-cu-empty]'), live = document.querySelector('[data-cu-live]');
  const base = all ? all.getAttribute('href') : '';
  const t = new Date(), today = [t.getFullYear(), String(t.getMonth() + 1).padStart(2, '0'), String(t.getDate()).padStart(2, '0')].join('-');
  const feature = document.querySelector('.fe-card[data-when]');  // the featured event leaves once its day has passed too
  if (feature && feature.dataset.when < today) { feature.hidden = true; feature.closest('.cu-grid').classList.add('cu-grid--solo'); }
  const NAMES = { all: ['listing', 'events and open calls'], event: ['event', 'events'], opportunity: ['open call', 'open calls'] };
  const show = (kind, announce) => {
    let n = 0;
    rows.forEach(r => {
      const on = n < 4 && (kind === 'all' || r.dataset.kind === kind) && (!r.dataset.when || r.dataset.when >= today);
      r.hidden = !on;
      if (on) n++;
    });
    tabs.querySelectorAll('[data-cu-kind]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cuKind === kind)));
    if (all) all.setAttribute('href', base + (kind === 'all' ? '' : '?kind=' + kind));
    if (empty) empty.hidden = n > 0;
    if (announce && live) live.textContent = n ? 'Showing the next ' + (n === 1 ? NAMES[kind][0] : n + ' ' + NAMES[kind][1]) + '.' : empty.textContent;
  };
  tabs.addEventListener('click', e => { const b = e.target.closest('[data-cu-kind]'); if (b) show(b.dataset.cuKind, true); });
  show('all');
})();

/* Stories: the type bar shows one story type at a time; "All stories" brings back the featured story. The type is kept in
   the address (?type=in-practice) with replaceState, so a shared link opens on it and Back leaves the page. */
(() => {
  const bar = document.querySelector('[data-story-types]');
  if (!bar) return;
  bar.querySelector('.story-types__opts').hidden = false;  // the buttons need this script (hidden in the page without it)
  const buttons = [...bar.querySelectorAll('[data-story-type]')];
  const cards = [...document.querySelectorAll('.story-grid [data-story-type]')];
  const featured = document.querySelector('[data-story-featured]');
  const count = bar.querySelector('[data-story-count]');
  const show = type => {
    if (!buttons.some(b => b.dataset.storyType === type)) type = '';
    buttons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.storyType === type)));
    cards.forEach(c => { c.hidden = type ? c.dataset.storyType !== type : c.hasAttribute('data-story-lead'); });
    if (featured) featured.hidden = !!type;
    const n = type ? cards.filter(c => !c.hidden).length : cards.length;
    count.textContent = n + (n === 1 ? ' story' : ' stories');
    return type;
  };
  buttons.forEach(b => b.addEventListener('click', () => {
    const type = show(b.dataset.storyType);
    try { history.replaceState(null, '', location.pathname + (type ? '?type=' + type : '') + location.hash); } catch (_) { /* file:// previews */ }
  }));
  show(new URLSearchParams(location.search).get('type') || '');
})();

/* Newsroom: the type bar shows one kind of item at a time (only when two or more kinds are listed), and the count names
   the kind. The type is kept in the address (?type=press-releases) with replaceState, as on Stories. */
(() => {
  const bar = document.querySelector('[data-news-types]');
  const opts = bar && bar.querySelector('.story-types__opts');
  if (!opts) return;
  opts.hidden = false;
  const buttons = [...opts.querySelectorAll('[data-news-type]')];
  const rows = [...document.querySelectorAll('#releases .row[data-news-type]')];
  const count = bar.querySelector('[data-news-count]');
  const empty = document.querySelector('[data-news-empty]');
  const show = type => {
    let on = buttons.find(b => b.dataset.newsType === type);
    if (!on) { on = buttons[0]; type = ''; }
    buttons.forEach(b => b.setAttribute('aria-pressed', String(b === on)));
    rows.forEach(r => { r.hidden = !!type && r.dataset.newsType !== type; });
    const n = rows.filter(r => !r.hidden).length;
    count.textContent = n + ' ' + (n === 1 ? on.dataset.one : on.dataset.many);
    if (empty) empty.hidden = n > 0;
    return type;
  };
  const keep = type => { try { history.replaceState(null, '', location.pathname + (type ? '?type=' + type : '') + location.hash); } catch (_) { /* file:// previews */ } };
  buttons.forEach(b => b.addEventListener('click', () => keep(show(b.dataset.newsType))));
  document.querySelector('[data-news-reset]')?.addEventListener('click', () => keep(show('')));
  show(new URLSearchParams(location.search).get('type') || '');
})();

/* Copy buttons ([data-copy="#id"], e.g. the Newsroom's boilerplate): shown only where the clipboard API exists; the label
   reads "Copied" for two seconds. Where the browser refuses the write, the text is selected instead for the reader to copy.
   Without the script the button stays hidden and the text is there to select. */
(() => {
  if (!navigator.clipboard) return;
  document.querySelectorAll('[data-copy]').forEach(b => {
    const target = document.querySelector(b.dataset.copy);
    if (!target) return;
    const label = b.textContent;
    const status = document.createElement('span');  // announces the result; a button's changed name isn't reliably read out
    status.className = 'sr-only'; status.setAttribute('aria-live', 'polite');
    b.after(status);
    const say = (text, ms) => { b.textContent = status.textContent = text; setTimeout(() => { b.textContent = label; status.textContent = ''; }, ms); };
    b.hidden = false;
    b.addEventListener('click', () => navigator.clipboard.writeText(target.innerText.trim()).then(() => say('Copied', 2000), () => {
      window.getSelection().selectAllChildren(target);
      say('Selected: press Ctrl+C or ⌘C', 4000);
    }));
  });
})();

/* Request a Referral: a partner profile's button opens /referral/?partner=<slug>, which chooses that partner. */
(() => {
  const select = document.querySelector('[data-referral-partner]');
  const slug = select && new URLSearchParams(location.search).get('partner');
  if (slug && [...select.options].some(o => o.value === slug)) select.value = slug;
})();

/* Partner profile: the sidebar sticks under the header only while it fits in the window; a taller one scrolls with the
   page, so its Contact card isn't held below the fold until the end of the main column. */
(() => {
  const side = document.querySelector('.pp-side');
  if (!side) return;
  const fit = () => side.classList.toggle('is-sticky', side.offsetHeight + (parseFloat(getComputedStyle(side).top) || 0) + 24 <= window.innerHeight);
  fit();
  window.addEventListener('resize', fit);
  if ('ResizeObserver' in window) new ResizeObserver(fit).observe(side);  // logos and fonts change its height as they load
})();

(() => {
  // Partner profile on Webflow (the Partners collection's template page, built by export_webflow.py's recipe): the CMS binds
  // the name, logo, overview, what they do, addresses and contacts; this fills the rest from the directory data the page
  // loads (#directory-data, #pp-programs-data): the Alliance badge, the website label, the referral link, the sidebar's
  // type and tags, and the programs list. Sections whose rich text came back empty are hidden. Inert on the local build.
  const ppRoot = document.querySelector('[data-pp-slug]');
  if (ppRoot) (() => {
    const slug = ppRoot.getAttribute('data-pp-slug');
    const dirEl = document.getElementById('directory-data');
    const progEl = document.getElementById('pp-programs-data');
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const NE = '<svg class="icon icon-arrow-ne" viewBox="0 0 14 14" aria-hidden="true" focusable="false"><path d="M3.5 10.5 L 10.5 3.5"/><path d="M5 3.5 L 10.5 3.5 L 10.5 9"/></svg>';
    ppRoot.querySelectorAll('[data-pp-rt]').forEach(rt => {
      if (rt.textContent.trim() || rt.querySelector('img')) return;
      const sec = rt.closest('[data-pp-sec]'); if (sec) sec.hidden = true;
    });
    const ref = ppRoot.querySelector('[data-pp-referral]');
    if (ref) ref.setAttribute('href', '/referral?partner=' + encodeURIComponent(slug));
    if (!dirEl) return;
    let dir; try { dir = JSON.parse(dirEl.textContent); } catch (e) { return; }
    const org = (dir.orgs || []).find(o => o.id === slug);
    if (!org) return;
    let progs = []; try { progs = progEl ? JSON.parse(progEl.textContent).programs || [] : []; } catch (e) { progs = []; }
    const site = ppRoot.querySelector('[data-pp-site]');
    if (site) { if (org.website) { site.setAttribute('href', org.website); site.innerHTML = esc(org.domain || org.website) + NE; } else site.hidden = true; }
    const badges = ppRoot.querySelector('[data-pp-badges]');
    if (badges && org.alliance) { badges.innerHTML = '<span class="badges"><span class="badge">Alliance partner</span></span>'; badges.hidden = false; }
    const facts = ppRoot.querySelector('[data-pp-facts]');
    if (facts) {
      const type = facts.querySelector('[data-pp-type]');
      if (type) type.textContent = org.type || '';
      const group = (label, items) => items && items.length ? '<div><dt>' + esc(label) + '</dt><dd class="pc-tags">' + items.map(t => '<span class="pc-tag">' + esc(t) + '</span>').join('') + '</dd></div>' : '';
      facts.insertAdjacentHTML('beforeend', group('Who they serve', org.audiences) + group('Support offered', org.support) + group('Topics', org.topics));
    }
    const list = ppRoot.querySelector('[data-pp-programs]');
    if (list) {
      const mine = (org.programs || []).map(id => progs.find(p => p.id === id)).filter(Boolean);
      if (mine.length) {
        list.innerHTML = mine.map(p => '<li><a class="pp-prog" href="' + esc(p.url || p.website || '/programs') + '"><span class="pp-prog__text"><span class="pp-prog__name">' + esc(p.name) + '</span>' +
          (p.alliance ? '<span class="badges"><span class="badge">Alliance program</span></span>' : '') + (p.short ? '<span class="pp-prog__desc">' + esc(p.short) + '</span>' : '') +
          '</span><span class="pp-prog__go">Program website' + NE + '</span></a></li>').join('');
        const sec = ppRoot.querySelector('[data-pp-sec="programs"]'); if (sec) sec.hidden = false;
      }
    }
  })();
})();

(() => {
  // Newsroom item on Webflow (the Newsroom collection's template page): the CMS binds the type, title, subhead, date,
  // text and the original release's link; this fills the rest from data/newsroom-index.json: the date's wording, the
  // other-language links, Related (the release/advisory pair and the item's links) and More from the Newsroom. Inert
  // on the local build.
  const root = document.querySelector('[data-nr-slug]');
  if (!root) return;
  const slug = root.getAttribute('data-nr-slug');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const NE = '<svg class="icon icon-arrow-ne" viewBox="0 0 14 14" aria-hidden="true" focusable="false"><path d="M3.5 10.5 L 10.5 3.5"/><path d="M5 3.5 L 10.5 3.5 L 10.5 9"/></svg>';
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const long = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? MONTHS[+m[2] - 1] + ' ' + (+m[3]) + ', ' + m[1] : (iso || ''); };
  const short = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? MONTHS[+m[2] - 1].slice(0, 3).toUpperCase() + ' ' + m[3] + '<br>' + m[1] : ''; };
  const TYPE = { 'press-release': 'Press release', 'media-advisory': 'Media advisory' };
  const date = root.querySelector('[data-nr-date]');
  if (date && /^\d{4}-\d{2}-\d{2}/.test(date.textContent.trim())) date.textContent = long(date.textContent.trim());
  const sub = root.querySelector('[data-nr-subhead]');
  if (sub && !sub.textContent.trim()) sub.hidden = true;
  const orig = root.querySelector('[data-nr-original]'), origLink = root.querySelector('[data-nr-original-link]');
  const el = document.getElementById('newsroom-index');
  let items = []; try { items = el ? JSON.parse(el.textContent) : []; } catch (e) { items = []; }
  const me = items.find(i => i.slug === slug);
  if (orig) {
    if (me && me.original && me.original.url) {
      origLink.setAttribute('href', me.original.url); origLink.textContent = me.original.publisher || 'the issuing organization';
      orig.append(' on ' + long(me.original.date || me.date) + '.'); orig.lastChild.previousSibling && (orig.lastChild.previousSibling.textContent = '');
      orig.hidden = false;
    } else orig.hidden = true;
  }
  if (!me) return;
  const langs = root.querySelector('[data-nr-langs]');
  if (langs && me.languages && me.languages.length) {
    langs.innerHTML = me.languages.map(l => '<li><a class="text-link"' + (l.lang ? ' lang="' + esc(l.lang) + '"' : '') + ' href="' + esc(l.url) + '" rel="noopener">' + esc(l.label) + ' ' + NE + '</a></li>').join('');
    root.querySelector('[data-nr-langs-wrap]').hidden = false;
  }
  const rel = root.querySelector('[data-nr-related]');
  if (rel) {
    const links = [];
    (me.related || []).forEach(r => { if (r && r.url) links.push({ label: r.label || r.url, url: r.url }); });
    if (me.follows) { const f = items.find(i => i.slug === me.follows); if (f) links.push({ label: f.type === 'media-advisory' ? 'Media advisory for this release' : 'Press release for this advisory', url: '/newsroom' + f.slug }); }
    items.forEach(i => { if (i.follows === slug) links.push({ label: i.type === 'media-advisory' ? 'Media advisory for this release' : 'Press release for this advisory', url: '/newsroom' + i.slug }); });
    if (links.length) {
      rel.innerHTML = links.map(l => '<li><a class="text-link" href="' + esc(l.url) + '"' + (/^https?:/.test(l.url) ? ' rel="noopener"' : '') + '>' + esc(l.label) + (/^https?:/.test(l.url) ? ' ' + NE : '') + '</a></li>').join('');
      root.querySelector('[data-nr-related-wrap]').hidden = false;
    }
  }
  const more = root.querySelector('[data-nr-more]');
  if (more) {
    const others = items.filter(i => i.slug !== slug && i.status === 'published').sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 3);
    if (others.length) {
      more.innerHTML = others.map(i => '<div class="row"><div class="row__date"><time datetime="' + esc(i.date) + '">' + short(i.date) + '</time></div><div><h3><a href="/newsroom' + esc(i.slug) + '">' + esc(i.title) + '</a></h3><div class="row__meta">' + esc(TYPE[i.type] || i.type) + (i.issued_with ? ' · With ' + esc(i.issued_with) : '') + '</div>' + (i.summary ? '<p>' + esc(i.summary) + '</p>' : '') + '</div></div>').join('');
      root.querySelector('[data-nr-more-wrap]').hidden = false;
    }
  }
})();

(() => {
  // Webflow copy: the filter sidebars are wrapped in forms there (the builder accepts fields only inside a form); they
  // filter in place and never submit, and Webflow's own form handler must not see them.
  document.querySelectorAll('form[data-cata-form]').forEach(f => f.addEventListener('submit', e => { e.preventDefault(); e.stopImmediatePropagation(); }, true));
})();

// Webflow copy: the builder turns <button> into links with role=button; Enter and Space activate them like buttons.
document.addEventListener('keydown', e => { const t = e.target; if ((e.key === 'Enter' || e.key === ' ') && t instanceof Element && t.matches('a[role="button"]:not([href])')) { e.preventDefault(); t.click(); } });
