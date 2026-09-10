const DEFAULT_FROM = 'Chiptronic TravelOps <notificacoes@chiptronic.com.br>';

export function resetPasswordEmail(env, resetUrl) {
  const appName = String(env?.APP_NAME || 'Chiptronic TravelOps');
  const href = String(resetUrl || '').trim();

  return {
    subject: 'Redefinir sua senha',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #111827;">
        <h2 style="margin-bottom: 16px;">${appName}</h2>
        <p>Recebemos uma solicitação para redefinir sua senha.</p>
        <p>Clique no botão abaixo para continuar:</p>
        <p>
          <a href="${href}" style="display: inline-block; padding: 12px 20px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">
            Redefinir senha
          </a>
        </p>
        <p>Se você não solicitou essa alteração, ignore este e-mail.</p>
        <p>Link válido por 1 hora.</p>
      </div>
    `,
  };
}

export async function sendEmail(env, { to, subject, html, text = '' }) {
  const recipient = String(to || '').trim();
  const subjectText = String(subject || 'Notificação');

  if (!recipient) {
    return { ok: false, skipped: true, reason: 'missing-recipient' };
  }

  if (!env?.RESEND_API_KEY) {
    console.log('[EMAIL] RESEND_API_KEY não configurado. E-mail ignorado localmente.');
    return { ok: false, skipped: true, reason: 'missing-api-key' };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM || DEFAULT_FROM,
      to: [recipient],
      subject: subjectText,
      html: html || `<p>${text || subjectText}</p>`,
      text: text || subjectText,
    }),
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    console.error('[EMAIL ERROR] Resend retornou erro:', response.status, payload);
    return { ok: false, status: response.status, payload };
  }

  return { ok: true, status: response.status, payload };
}
