// Shared UI components. DOM only: no data imports, no store imports.
// All text reaches the DOM as text nodes (never innerHTML).

const SVG_NS = 'http://www.w3.org/2000/svg';

// ---------------------------------------------------------------------------
// h(): tiny element builder
// ---------------------------------------------------------------------------

function appendChildren(parent, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false || child === true) continue;
    if (Array.isArray(child)) appendChildren(parent, child);
    else if (child instanceof Node) parent.appendChild(child);
    else parent.appendChild(document.createTextNode(String(child)));
  }
}

/**
 * h(tag, props?, ...children) → HTMLElement
 * props: class, id, text, href, type, value, placeholder, name, for, role, title, hidden, disabled,
 *        dataset: {…}, attrs: {…}, style: {…}, on<Event> handlers.
 * children: Node | string | number | null | false | arrays of these. Strings become text nodes.
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  const isProps = props !== null && typeof props === 'object' && !(props instanceof Node) && !Array.isArray(props);
  if (!isProps) children.unshift(props);

  if (isProps) {
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined) continue;
      if (key === 'class') {
        if (value) el.className = Array.isArray(value) ? value.filter(Boolean).join(' ') : String(value);
      } else if (key === 'text') {
        el.textContent = String(value);
      } else if (key === 'dataset') {
        for (const [k, v] of Object.entries(value)) if (v !== null && v !== undefined) el.dataset[k] = String(v);
      } else if (key === 'attrs') {
        for (const [k, v] of Object.entries(value)) {
          if (v === null || v === undefined || v === false) continue;
          el.setAttribute(k, v === true ? '' : String(v));
        }
      } else if (key === 'style') {
        for (const [k, v] of Object.entries(value)) {
          if (k.startsWith('--')) el.style.setProperty(k, String(v));
          else el.style[k] = v;
        }
      } else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key === 'hidden' || key === 'disabled') {
        el[key] = Boolean(value);
      } else if (key === 'for') {
        el.setAttribute('for', String(value));
      } else if (key === 'value') {
        el.value = String(value);
      } else if (value === true) {
        el.setAttribute(key, '');
      } else if (value !== false) {
        el.setAttribute(key, String(value));
      }
    }
  }

  appendChildren(el, children);
  return el;
}

// ---------------------------------------------------------------------------
// Icons: 24px grid, 2px round stroke, drawn for this app
// ---------------------------------------------------------------------------

// Each icon is a list of shapes. A string is a path; an array is [tag, attributes].
const DOT = { fill: 'currentColor', stroke: 'none' };
const ICONS = {
  back: ['M19 12H5', 'M11 6l-6 6 6 6'],
  'chevron-right': ['M9 5l7 7-7 7'],
  'chevron-down': ['M5 9l7 7 7-7'],
  'arrow-up': ['M12 19V5', 'M6 11l6-6 6 6'],
  'arrow-down': ['M12 5v14', 'M6 13l6 6 6-6'],
  more: [
    ['circle', { cx: 12, cy: 5, r: 1.75, ...DOT }],
    ['circle', { cx: 12, cy: 12, r: 1.75, ...DOT }],
    ['circle', { cx: 12, cy: 19, r: 1.75, ...DOT }],
  ],
  reset: ['M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 8.9', 'M4.5 4.4v4.5H9'],
  calendar: [
    'M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z',
    'M4 10.5h16',
    'M8 3.5v4',
    'M16 3.5v4',
  ],
  store: [
    'M3.5 10l1.7-5.3a1 1 0 0 1 1-.7h11.6a1 1 0 0 1 1 .7L20.5 10z',
    'M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9',
    'M10 20v-5.5h4V20',
  ],
  route: [
    ['circle', { cx: 6, cy: 19, r: 2 }],
    ['circle', { cx: 18, cy: 5, r: 2 }],
    'M8 19h6.5a3.5 3.5 0 0 0 0-7h-5a3.5 3.5 0 0 1 0-7H16',
  ],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  info: [['circle', { cx: 12, cy: 12, r: 9 }], 'M12 11v6', 'M12 7.5v.01'],
  warn: ['M12 4l9 15.5H3z', 'M12 10v4.5', 'M12 17v.01'],
  risk: ['M8.3 3h7.4L21 8.3v7.4L15.7 21H8.3L3 15.7V8.3z', 'M12 7.5v5.5', 'M12 16.5v.01'],
  snow: [
    'M12 3v18',
    'M4.2 7.5l15.6 9',
    'M19.8 7.5l-15.6 9',
    'M9.5 4.5L12 7l2.5-2.5',
    'M9.5 19.5L12 17l2.5 2.5',
  ],
  search: [['circle', { cx: 11, cy: 11, r: 6.5 }], 'M16 16l4.5 4.5'],
  plus: ['M12 5v14', 'M5 12h14'],
  minus: ['M5 12h14'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  user: [['circle', { cx: 12, cy: 8, r: 3.5 }], 'M5 20a7 7 0 0 1 14 0'],
  lock: [
    'M6 11h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z',
    'M8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  ],
  cart: [
    'M3 4h2.2l2.3 11h10.2l1.8-8H6.3',
    ['circle', { cx: 9, cy: 19, r: 1.4 }],
    ['circle', { cx: 16.5, cy: 19, r: 1.4 }],
  ],
  truck: [
    'M3 6h11v10.5H3z',
    'M14 9.5h3.5L21 13v3.5h-7',
    ['circle', { cx: 7.5, cy: 17.5, r: 1.9 }],
    ['circle', { cx: 17, cy: 17.5, r: 1.9 }],
  ],
  tag: [
    'M4 4h7.2a1 1 0 0 1 .7.3l7.8 7.8a1 1 0 0 1 0 1.4l-6.2 6.2a1 1 0 0 1-1.4 0L4.3 11.9a1 1 0 0 1-.3-.7z',
    ['circle', { cx: 8.5, cy: 8.5, r: 1.25, ...DOT }],
  ],
};

/**
 * icon(name, { size = 20, title } = {}) → SVGElement
 * Decorative (aria-hidden) unless a title is given. An unknown name draws the info icon.
 */
export function icon(name, { size = 20, title } = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('focusable', 'false');
  if (title) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', title);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }
  for (const shape of ICONS[name] || ICONS.info) {
    const [tag, attrs] = typeof shape === 'string' ? ['path', { d: shape }] : shape;
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    svg.appendChild(node);
  }
  return svg;
}

// A tone is always an icon plus words. These are the default icons per tone.
const TONE_ICON = { info: 'info', ok: 'check', warn: 'warn', risk: 'risk', chill: 'snow' };

function overlayRoot() {
  return document.getElementById('overlay-root') || document.body;
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

/**
 * button(label, { variant, icon, iconEnd, href, onClick, type, block, disabled, ariaLabel }) → <button> or <a>
 * variants: primary | secondary | ghost | danger. With href it is a link styled as a button.
 */
export function button(label, {
  variant = 'primary', icon: iconName, iconEnd, href, onClick, type = 'button',
  block = false, disabled = false, ariaLabel,
} = {}) {
  const cls = ['btn', `btn--${variant}`, block && 'btn--block'];
  const children = [
    iconName && icon(iconName),
    h('span', { class: 'btn__label', text: label }),
    iconEnd && icon(iconEnd),
  ];
  const attrs = { 'aria-label': ariaLabel };
  if (href && !disabled) return h('a', { class: cls, href, onClick, attrs }, children);
  return h('button', { class: cls, type, disabled, onClick, attrs }, children);
}

/**
 * iconButton(iconName, label, { href, onClick, variant, disabled, size }) → 48×48 icon-only control.
 * `label` is the accessible name. variants: plain | outline | on-bar.
 */
export function iconButton(iconName, label, { href, onClick, variant = 'plain', disabled = false, size = 24 } = {}) {
  const cls = ['icon-btn', `icon-btn--${variant}`];
  const attrs = { 'aria-label': label };
  if (href && !disabled) return h('a', { class: cls, href, onClick, attrs }, icon(iconName, { size }));
  return h('button', { class: cls, type: 'button', disabled, onClick, attrs }, icon(iconName, { size }));
}

// ---------------------------------------------------------------------------
// Chips, tags, cards, rows
// ---------------------------------------------------------------------------

/**
 * chip(label, { tone = 'neutral', icon } = {}) → HTMLElement
 * tones: neutral | primary | chill | ok | warn | risk. ok, warn, risk and chill get an icon by default.
 */
export function chip(label, { tone = 'neutral', icon: iconName } = {}) {
  const name = iconName || TONE_ICON[tone];
  return h('span', { class: ['chip', `chip--${tone}`] },
    name && icon(name, { size: 16 }),
    h('span', { class: 'chip__label', text: label }));
}

/** demoTag(label = 'Demo') → the small tag that sits next to the product name. */
export function demoTag(label = 'Demo') {
  return h('span', { class: 'tag', text: label });
}

/**
 * filterChip(label, { pressed = false, onClick } = {}) → <button aria-pressed>
 * A selectable chip with a 48px hit area. The chosen chip is filled and shows a tick.
 * `.setPressed(bool)` changes the state; `.pressed` reads it.
 */
export function filterChip(label, { pressed = false, onClick } = {}) {
  const el = h('button', { class: 'fchip', type: 'button', onClick },
    h('span', { class: 'fchip__pill' },
      icon('check', { size: 16 }),
      h('span', { class: 'fchip__label', text: label })));
  el.setPressed = (on) => el.setAttribute('aria-pressed', on ? 'true' : 'false');
  Object.defineProperty(el, 'pressed', { get: () => el.getAttribute('aria-pressed') === 'true' });
  el.setPressed(pressed);
  return el;
}

/**
 * filterChips({ label, options, value = null, onChange } = {}) → HTMLElement
 * One row of filter chips with one choice at a time. options: [{ value, label }]. A long row scrolls
 * sideways inside itself. `label` names the group. `.setValue(v)` does not fire onChange; `.value` reads it.
 */
export function filterChips({ label, options = [], value = null, onChange } = {}) {
  let current = value;
  const chips = options.map((option) => {
    const el = filterChip(option.label, {
      pressed: option.value === current,
      onClick: () => {
        if (option.value === current) return;
        setValue(option.value);
        if (typeof onChange === 'function') onChange(current);
      },
    });
    return { option, el };
  });
  function setValue(next) {
    current = next;
    for (const { option, el } of chips) el.setPressed(option.value === current);
  }
  const row = h('div', { class: 'fchips', role: 'group', attrs: { 'aria-label': label } }, chips.map((c) => c.el));
  row.setValue = setValue;
  Object.defineProperty(row, 'value', { get: () => current });
  return row;
}

/**
 * tabs({ label, options, value, onChange, controls } = {}) → HTMLElement (role="tablist", aria-label = label)
 * One row of tabs with one selected at a time. options: [{ value, label }]. A long row scrolls sideways
 * inside itself. `controls` is the id of the element the tabs switch. Left and Right arrow keys move the
 * selection. `.setValue(v)` does not fire onChange; `.value` reads it.
 */
export function tabs({ label, options = [], value, onChange, controls } = {}) {
  let current = value;
  const items = options.map((option) => ({
    option,
    el: h('button', {
      class: 'tab', type: 'button', role: 'tab', attrs: { 'aria-controls': controls },
      onClick: () => choose(option.value),
    }, h('span', { class: 'tab__label', text: option.label })),
  }));

  function setValue(next) {
    current = next;
    for (const { option, el } of items) {
      const on = option.value === current;
      el.setAttribute('aria-selected', on ? 'true' : 'false');
      el.tabIndex = on ? 0 : -1;
      if (!on) continue;
      // Bring the chosen tab into view inside the row, without moving the page.
      if (el.offsetLeft < row.scrollLeft) row.scrollLeft = el.offsetLeft;
      else if (el.offsetLeft + el.offsetWidth > row.scrollLeft + row.clientWidth) row.scrollLeft = el.offsetLeft + el.offsetWidth - row.clientWidth;
    }
  }
  function choose(next) {
    if (next === current) return;
    setValue(next);
    if (typeof onChange === 'function') onChange(current);
  }

  const row = h('div', { class: 'tabs', role: 'tablist', attrs: { 'aria-label': label } }, items.map((item) => item.el));
  row.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const at = items.findIndex((item) => item.option.value === current);
    const next = items[(at + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length];
    if (!next) return;
    choose(next.option.value);
    next.el.focus();
    event.preventDefault();
  });
  row.setValue = setValue;
  Object.defineProperty(row, 'value', { get: () => current });
  setValue(current);
  return row;
}

/** card(props, ...children) → HTMLElement. props are h() props; `class` is added to "card". */
export function card(props, ...children) {
  const isProps = props !== null && typeof props === 'object' && !(props instanceof Node) && !Array.isArray(props);
  if (!isProps) return h('div', { class: 'card' }, props, children);
  return h('div', { ...props, class: ['card', props.class].flat().filter(Boolean).join(' ') }, children);
}

/**
 * listRow({ title, subtitle, meta, leading, trailing, href, onClick, ariaLabel }) → <a>, <button> or <div>
 * One large hit area. `meta`, `leading` and `trailing` take a Node, a string or an array of them.
 */
export function listRow({ title, subtitle, meta, leading, trailing, href, onClick, ariaLabel } = {}) {
  const hasMeta = Array.isArray(meta) ? meta.some(Boolean) : Boolean(meta);
  const children = [
    leading !== undefined && leading !== null && h('span', { class: 'row__leading' }, leading),
    h('span', { class: 'row__body' },
      h('span', { class: 'row__title', text: title }),
      subtitle && h('span', { class: 'row__subtitle', text: subtitle }),
      hasMeta && h('span', { class: 'row__meta' }, meta)),
    trailing !== undefined && trailing !== null && h('span', { class: 'row__trailing' }, trailing),
  ];
  const attrs = { 'aria-label': ariaLabel };
  if (href) return h('a', { class: 'row row--action', href, onClick, attrs }, children);
  if (onClick) return h('button', { class: 'row row--action', type: 'button', onClick, attrs }, children);
  return h('div', { class: 'row', attrs }, children);
}

// ---------------------------------------------------------------------------
// Bars and headers
// ---------------------------------------------------------------------------

/**
 * demoBar({ dateLabel, onReset, appName = 'GT App', tagLabel = 'Demo', menuItems = [] }) → HTMLElement
 * menuItems: extra [{ label, icon, onSelect }] shown above "Reset demo".
 */
export function demoBar({ dateLabel, onReset, appName = 'GT App', tagLabel = 'Demo', menuItems = [] } = {}) {
  // FEATURE-SLOT: demo-menu — the overflow menu's item list. The Demo guide entry goes here.
  const items = [
    ...menuItems,
    { label: 'Reset demo', icon: 'reset', onSelect: onReset },
  ];

  const menu = h('div', { class: 'menu', role: 'menu', hidden: true, attrs: { 'aria-label': 'Demo menu' } });
  const toggle = iconButton('more', 'Demo menu', { variant: 'on-bar' });
  toggle.setAttribute('aria-haspopup', 'menu');
  toggle.setAttribute('aria-expanded', 'false');

  // A tap outside only closes the menu: the click is swallowed, so it does not also
  // activate whatever is under the finger.
  const onDocClick = (event) => {
    if (menu.contains(event.target) || toggle.contains(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    close();
  };
  const onDocKey = (event) => {
    if (event.key === 'Escape') { close(); toggle.focus(); }
  };
  function open() {
    menu.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', onDocClick, true);
    document.addEventListener('keydown', onDocKey);
    const first = menu.querySelector('[role="menuitem"]');
    if (first) first.focus();
  }
  function close() {
    if (menu.hidden) return;
    menu.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onDocClick, true);
    document.removeEventListener('keydown', onDocKey);
  }
  toggle.addEventListener('click', () => (menu.hidden ? open() : close()));
  window.addEventListener('hashchange', close);

  for (const item of items) {
    menu.appendChild(h('button', {
      class: 'menu__item', type: 'button', role: 'menuitem',
      // Focus goes back to the toggle first, so a sheet opened by the item returns focus there.
      onClick: () => { close(); toggle.focus(); if (typeof item.onSelect === 'function') item.onSelect(); },
    }, icon(item.icon || 'info'), h('span', { text: item.label })));
  }
  menu.addEventListener('keydown', (event) => {
    // Tab leaves the menu: close it and let focus move on from the toggle.
    if (event.key === 'Tab') { toggle.focus(); close(); return; }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const list = Array.from(menu.querySelectorAll('[role="menuitem"]'));
    const at = list.indexOf(document.activeElement);
    const next = (at + (event.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
    list[next].focus();
    event.preventDefault();
  });

  return h('header', { class: 'demo-bar', attrs: { 'aria-label': 'Demo' } },
    h('div', { class: 'demo-bar__brand' },
      h('span', { class: 'demo-bar__name', text: appName }),
      demoTag(tagLabel)),
    h('div', { class: 'demo-bar__date' },
      icon('calendar', { size: 16, title: 'Demo date' }),
      h('span', { class: 'num', text: dateLabel })),
    toggle,
    menu);
}

/** appHeader({ title, subtitle, backHref, backLabel = 'Back', trailing }) → HTMLElement */
export function appHeader({ title, subtitle, backHref, backLabel = 'Back', trailing } = {}) {
  return h('header', { class: ['app-header', !backHref && 'app-header--no-back'] },
    backHref && iconButton('back', backLabel, { href: backHref }),
    h('div', { class: 'app-header__text' },
      h('h1', { class: 'app-header__title', text: title }),
      subtitle && h('p', { class: 'app-header__subtitle', text: subtitle })),
    trailing && h('div', { class: 'app-header__trailing' }, trailing));
}

/** actionBar(...children) → sticky bottom action bar */
export function actionBar(...children) {
  return h('div', { class: 'action-bar' }, h('div', { class: 'action-bar__inner' }, children));
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/**
 * textField({ label, name, type, value, placeholder, autocomplete, icon, inputmode, hideLabel }) → HTMLElement
 * A labelled input. The returned element has `.input` (the <input>) and
 * `.setInvalid(bool, messageId?)`; messageId is the id of the element that explains the error.
 * hideLabel keeps the label for screen readers only (use it when the placeholder says the same).
 */
export function textField({
  label, name, type = 'text', value = '', placeholder, autocomplete = 'off', icon: iconName, inputmode, hideLabel = false,
} = {}) {
  const id = `f-${name}`;
  const input = h('input', {
    class: ['field__input', iconName && 'field__input--icon'], id, name, type, value, placeholder,
    attrs: { autocomplete, autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', inputmode },
  });
  const el = h('div', { class: 'field' },
    h('label', { class: ['field__label', hideLabel && 'visually-hidden'], for: id, text: label }),
    h('div', { class: 'field__control' }, iconName && icon(iconName), input));
  el.input = input;
  el.setInvalid = (invalid, messageId) => {
    if (invalid) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    if (invalid && messageId) input.setAttribute('aria-describedby', messageId);
    else input.removeAttribute('aria-describedby');
  };
  return el;
}

/**
 * stepper({ value = 0, min = 0, max = 999, label, onChange }) → HTMLElement
 * − qty + with 48px buttons. `.setValue(n)` updates the display without firing onChange; `.value` reads it.
 */
export function stepper({ value = 0, min = 0, max = 999, label = 'Quantity', onChange } = {}) {
  const clamp = (n) => {
    const whole = Math.round(Number(n));
    if (!Number.isFinite(whole)) return min;
    return Math.min(max, Math.max(min, whole));
  };
  let current = clamp(value);

  const minus = iconButton('minus', `Less: ${label}`, { variant: 'outline' });
  const plus = iconButton('plus', `More: ${label}`, { variant: 'outline' });
  const display = h('span', { class: 'stepper__value num', attrs: { 'aria-live': 'polite', 'aria-atomic': 'true' } });
  const el = h('div', { class: 'stepper', role: 'group', attrs: { 'aria-label': label } }, minus, display, plus);

  function paint() {
    display.textContent = String(current);
    minus.disabled = current <= min;
    plus.disabled = current >= max;
    el.classList.toggle('stepper--zero', current === 0);
  }
  function change(delta) {
    const next = clamp(current + delta);
    if (next === current) return;
    current = next;
    const focused = document.activeElement;
    paint();
    // A button that has just disabled itself would drop keyboard focus to the page: hand it to the other one.
    if (focused === minus && minus.disabled) plus.focus({ preventScroll: true });
    else if (focused === plus && plus.disabled) minus.focus({ preventScroll: true });
    if (typeof onChange === 'function') onChange(current);
  }
  minus.addEventListener('click', () => change(-1));
  plus.addEventListener('click', () => change(1));

  el.setValue = (n) => { current = clamp(n); paint(); };
  Object.defineProperty(el, 'value', { get: () => current });
  paint();
  return el;
}

// ---------------------------------------------------------------------------
// Disclosure, facts, tiny bars
// ---------------------------------------------------------------------------

let disclosureCount = 0;

/**
 * disclosure({ title, hint, icon, content, open = false, onToggle } = {}) → HTMLElement
 * A card whose header is a button (aria-expanded) that shows or hides a region. Closed by default.
 * `hint` is the line under the title; it stays visible when closed. `content` is a Node, a string or an array.
 * `.setOpen(bool)` does not fire onToggle; `.open` reads the state.
 */
export function disclosure({ title, hint, icon: iconName, content, open = false, onToggle } = {}) {
  const n = ++disclosureCount;
  const buttonId = `disclosure-${n}`;
  const regionId = `disclosure-${n}-region`;
  let isOpen = false;

  const state = h('span', { class: 'disclosure__state' });
  const toggle = h('button', {
    class: 'disclosure__toggle', type: 'button', id: buttonId, attrs: { 'aria-controls': regionId },
    onClick: () => { setOpen(!isOpen); if (typeof onToggle === 'function') onToggle(isOpen); },
  },
    iconName && icon(iconName),
    h('span', { class: 'disclosure__text' },
      h('span', { class: 'disclosure__title', text: title }),
      hint && h('span', { class: 'disclosure__hint', text: hint })),
    state,
    icon('chevron-down'));
  const region = h('div', { class: 'disclosure__region', id: regionId, role: 'region', attrs: { 'aria-labelledby': buttonId } }, content);

  function setOpen(next) {
    isOpen = Boolean(next);
    toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    state.textContent = isOpen ? 'Hide' : 'Show';
    region.hidden = !isOpen;
  }
  const el = h('div', { class: 'card disclosure' }, toggle, region);
  el.setOpen = setOpen;
  Object.defineProperty(el, 'open', { get: () => isOpen });
  setOpen(open);
  return el;
}

/**
 * factList(items) → <dl>
 * Label and value pairs. items: [{ label, value }]; value is a Node, a string, a number or an array.
 * Falsy items and items with no value are left out.
 */
export function factList(items = []) {
  const shown = items.filter((item) => item && item.value !== null && item.value !== undefined && item.value !== '' && item.value !== false);
  return h('dl', { class: 'facts' }, shown.map((item) => h('div', { class: 'facts__row' },
    h('dt', { class: 'facts__label', text: item.label }),
    h('dd', { class: 'facts__value num' }, item.value))));
}

/**
 * barRow(bars, { label } = {}) → HTMLElement
 * A tiny row of bars with no axis: the number sits above each bar, an optional caption under it.
 * bars: [{ value, text?, caption?, align?, outlined? }]
 *   text     what to print above the bar (default: the value)
 *   caption  short words under the bar; align 'start' | 'center' | 'end' says which way a long caption runs
 *   outlined draws the bar as a dashed outline in its own wider column (a period that is not finished)
 * A value of 0 draws a stub. `label` is the text alternative: the row is one image to a screen reader.
 */
export function barRow(bars = [], { label } = {}) {
  const max = bars.reduce((top, bar) => Math.max(top, Number(bar.value) || 0), 0);
  return h('div', { class: 'bars', role: 'img', attrs: { 'aria-label': label } }, bars.map((bar) => {
    const value = Number(bar.value) || 0;
    const share = max > 0 ? Math.max(0, value) / max : 0;
    return h('div', { class: ['bars__col', bar.outlined && 'bars__col--outlined'], attrs: { 'aria-hidden': 'true' } },
      h('div', { class: 'bars__plot' },
        h('span', { class: 'bars__value num', text: bar.text !== undefined && bar.text !== null ? bar.text : String(value) }),
        h('span', { class: ['bars__bar', value <= 0 && 'bars__bar--zero'], style: { '--share': share.toFixed(3) } })),
      h('span', { class: ['bars__caption num', `bars__caption--${bar.align || 'center'}`], text: bar.caption || '' }));
  }));
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/**
 * banner({ tone = 'info', title, text, role = 'note', action }) → HTMLElement
 * tones: info | ok | warn | risk. Always an icon plus words. Use role 'alert' for a message that appears after an action.
 */
export function banner({ tone = 'info', title, text, role = 'note', action } = {}) {
  return h('div', { class: ['banner', `banner--${tone}`], role },
    icon(TONE_ICON[tone] || 'info'),
    h('div', { class: 'banner__body' },
      title && h('p', { class: 'banner__title', text: title }),
      text && h('p', { class: 'banner__text', text }),
      action && h('div', { class: 'banner__action' }, action)));
}

/**
 * emptyState({ icon = 'info', title, text, action, level = 2 }) → HTMLElement
 * `action` is a Node or an array of Nodes. `level` is the heading level of the title, 1 to 3 (1 when the screen has no other
 * heading, 3 inside a section that has its own h2).
 */
export function emptyState({ icon: iconName = 'info', title, text, action, level = 2 } = {}) {
  return h('div', { class: 'empty' },
    h('div', { class: 'empty__icon' }, icon(iconName, { size: 28 })),
    title && h(level === 1 ? 'h1' : level === 3 ? 'h3' : 'h2', { class: 'empty__title', text: title }),
    text && h('p', { class: 'empty__text', text }),
    action && h('div', { class: 'empty__action' }, action));
}

let toastTimer = null;

/** toast(message, { tone = 'neutral', ms = 2600 } = {}) — one toast at a time; tones: neutral | ok | warn | risk */
export function toast(message, { tone = 'neutral', ms = 2600 } = {}) {
  const root = overlayRoot();
  for (const old of root.querySelectorAll('.toast')) old.remove();
  if (toastTimer) clearTimeout(toastTimer);

  const el = h('div', { class: ['toast', `toast--${tone}`], role: tone === 'risk' ? 'alert' : 'status' },
    TONE_ICON[tone] && icon(TONE_ICON[tone]),
    h('span', { class: 'toast__text', text: message }));
  root.appendChild(el);
  toastTimer = setTimeout(() => { el.remove(); toastTimer = null; }, ms);
  return { close: () => el.remove() };
}

// ---------------------------------------------------------------------------
// Bottom sheet
// ---------------------------------------------------------------------------

let sheetCount = 0;

/**
 * openSheet({ title, content, actions, onClose }) → { close, element }
 * A bottom sheet in #overlay-root. Backdrop tap, the close button, Esc and a route change close it.
 * `content` and `actions` are Nodes, strings or arrays of them. onClose runs once, however it closes.
 */
export function openSheet({ title, content, actions, onClose } = {}) {
  const root = overlayRoot();
  const titleId = `sheet-title-${++sheetCount}`;
  const previousFocus = document.activeElement;
  let closed = false;

  function close(restoreFocus) {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('hashchange', onRouteChange);
    wrap.remove();
    if (!root.querySelector('.sheet-wrap')) document.documentElement.classList.remove('has-sheet');
    if (restoreFocus !== false && previousFocus && typeof previousFocus.focus === 'function' && document.contains(previousFocus)) {
      previousFocus.focus();
    }
    if (typeof onClose === 'function') onClose();
  }
  // A sheet never outlives the screen it was opened on (browser or Android Back).
  // The router has already moved focus to the new screen, so focus is left there.
  function onRouteChange() { close(false); }

  const hasActions = Array.isArray(actions) ? actions.some(Boolean) : Boolean(actions);
  const sheet = h('div', {
    class: 'sheet', role: 'dialog', tabindex: '-1',
    attrs: { 'aria-modal': 'true', 'aria-labelledby': titleId },
  },
    h('div', { class: 'sheet__head' },
      h('h2', { class: 'sheet__title', id: titleId, text: title }),
      iconButton('close', 'Close', { onClick: () => close() })),
    h('div', { class: 'sheet__content' }, content),
    hasActions && h('div', { class: 'sheet__actions' }, actions));

  const wrap = h('div', { class: 'sheet-wrap' },
    h('div', { class: 'sheet-backdrop', onClick: () => close() }),
    sheet);

  function onKey(event) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    // Keep focus inside the sheet.
    const focusable = Array.from(sheet.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, [tabindex="0"]'));
    if (!focusable.length) { event.preventDefault(); return; }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !sheet.contains(active))) { last.focus(); event.preventDefault(); }
    else if (!event.shiftKey && (active === last || !sheet.contains(active))) { first.focus(); event.preventDefault(); }
  }

  document.addEventListener('keydown', onKey, true);
  window.addEventListener('hashchange', onRouteChange);
  document.documentElement.classList.add('has-sheet');
  root.appendChild(wrap);
  sheet.focus();
  return { close: () => close(), element: sheet };
}

const CONFIRM_ARM_MS = 500;

/**
 * confirmSheet({ title, text, confirmLabel, cancelLabel = 'Cancel', tone = 'risk' }) → Promise<boolean>
 * Resolves true only when the confirm button is pressed. tone 'risk' gives a danger button.
 * The confirm button ignores presses for CONFIRM_ARM_MS after the sheet opens, so the second
 * tap of a double tap on the control underneath cannot confirm by accident.
 */

export function confirmSheet({ title, text, confirmLabel = 'OK', cancelLabel = 'Cancel', tone = 'risk' } = {}) {
  return new Promise((resolve) => {
    let answer = false;
    let armed = false;
    const armTimer = setTimeout(() => { armed = true; }, CONFIRM_ARM_MS);
    const sheet = openSheet({
      title,
      content: text && h('p', { class: 'sheet__text', text }),
      actions: [
        button(confirmLabel, {
          variant: tone === 'risk' ? 'danger' : 'primary', block: true,
          onClick: () => { if (!armed) return; answer = true; sheet.close(); },
        }),
        button(cancelLabel, { variant: 'secondary', block: true, onClick: () => sheet.close() }),
      ],
      onClose: () => { clearTimeout(armTimer); resolve(answer); },
    });
  });
}

/** confirmResetDemo() → Promise<boolean>. The one place the Reset-demo wording lives. */
export function confirmResetDemo() {
  return confirmSheet({
    title: 'Reset demo?',
    text: 'This signs you out and clears every order and cart made in this demo. The sample data stays the same.',
    confirmLabel: 'Reset demo',
    cancelLabel: 'Cancel',
    tone: 'risk',
  });
}
