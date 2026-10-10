// Login. Any non-empty username and password signs in (demo).

import { getData } from '../data.js';
import { getStore } from '../store.js';
import { formatDate } from '../dates.js';
import { h, icon, card, button, banner, textField, demoTag } from '../components/ui.js';

export function render(container) {
  const data = getData();
  const { config, demoDate } = data;

  const username = textField({ label: 'Username', name: 'username', autocomplete: 'username', icon: 'user' });
  const password = textField({ label: 'Password', name: 'password', type: 'password', autocomplete: 'current-password', icon: 'lock' });
  const rep = config.rep || {};
  const message = h('div', { class: 'login__message', id: 'login-message' });

  function showError(text) {
    message.replaceChildren(banner({ tone: 'risk', text, role: 'alert' }));
  }

  function onSubmit(event) {
    event.preventDefault();
    const noUser = username.input.value.trim() === '';
    const noPass = password.input.value.trim() === '';
    username.setInvalid(noUser, message.id);
    password.setInvalid(noPass, message.id);

    if (noUser || noPass) {
      showError(noUser && noPass ? 'Enter a username and a password.'
        : noUser ? 'Enter a username.' : 'Enter a password.');
      (noUser ? username : password).input.focus();
      return;
    }

    message.replaceChildren();
    getStore().dispatch({ type: 'session/login', repName: rep.name });
    location.hash = '#/home';
  }

  const clearInvalid = (field) => () => field.setInvalid(false);
  username.input.addEventListener('input', clearInvalid(username));
  password.input.addEventListener('input', clearInvalid(password));

  container.append(
    h('div', { class: 'screen login' },
      h('div', { class: 'login__brand' },
        h('div', { class: 'login__name-row' },
          h('h1', { class: 'login__name', text: 'GT App' }),
          demoTag('Demo')),
        config.region && h('p', { class: 'login__region' }, icon('route', { size: 16 }), h('span', { text: config.region }))),

      card({ class: 'login__date' },
        icon('calendar', { size: 24 }),
        h('div', { class: 'login__date-text' },
          h('span', { class: 'login__date-label', text: 'Demo date' }),
          h('span', { class: 'login__date-value num', text: formatDate(demoDate, 'long') }))),

      h('form', { class: 'login__form', attrs: { novalidate: true, 'aria-label': 'Sign in' }, onSubmit },
        username,
        password,
        message,
        button('Sign in', { type: 'submit', block: true })),

      h('p', { class: 'login__help', text: 'Any username and password works in this demo.' })),
  );
}
