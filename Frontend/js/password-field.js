/**
 * Campo de senha com botão olho e indicadores de requisitos.
 */
export function initPasswordFields(root = document) {
  root.querySelectorAll('[data-password-field]').forEach((wrap) => {
    const input = wrap.querySelector('input[type="password"], input[data-password-input]');
    const toggle = wrap.querySelector('[data-password-toggle]');
    if (!input || !toggle || toggle.dataset.bound) return;
    toggle.dataset.bound = '1';

    toggle.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      toggle.textContent = show ? '🙈' : '👁';
      toggle.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
    });
  });
}

export function checkPasswordRules(password) {
  const pwd = String(password || '');
  return {
    length: pwd.length >= 8,
    letter: /[a-zA-Z]/.test(pwd),
    number: /[0-9]/.test(pwd),
  };
}

export function passwordRulesMet(password) {
  const rules = checkPasswordRules(password);
  return rules.length && rules.letter && rules.number;
}

export function bindPasswordRules(input, listEl) {
  if (!input || !listEl) return;

  const render = () => {
    const rules = checkPasswordRules(input.value);
    listEl.querySelector('[data-rule-length]')?.classList.toggle('ok', rules.length);
    listEl.querySelector('[data-rule-letter]')?.classList.toggle('ok', rules.letter);
    listEl.querySelector('[data-rule-number]')?.classList.toggle('ok', rules.number);
  };

  input.addEventListener('input', render);
  render();
}
