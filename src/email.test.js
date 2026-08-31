import test from 'node:test';
import assert from 'node:assert/strict';

import { resetPasswordEmail } from './email.js';

test('reset password email includes a reset link and safe message', () => {
  const payload = resetPasswordEmail({ APP_URL: 'https://travelops.example.com' }, 'https://travelops.example.com/forgot.html?token=abc123');

  assert.match(payload.subject, /Redefinição de senha/i);
  assert.match(payload.html, /https:\/\/travelops.example.com\/forgot.html\?token=abc123/);
  assert.match(payload.html, /criar uma nova senha/i);
});
