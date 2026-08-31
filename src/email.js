const DEFAULT_FROM = 'Chiptronic TravelOps <notificacoes@chiptronic.com.br>';

export async function sendEmail(env, { to, subject, html }) {
  if (!env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY não configurada — e-mail não enviado:', subject);
    return { skipped: true };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: DEFAULT_FROM,
      to: [to],
      subject,
      html,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error('Falha ao enviar e-mail via Resend:', res.status, text);
    return { ok: false, status: res.status, body: text };
  }

  return { ok: true, status: res.status, body: text };
}

export function resetPasswordEmail(env, resetUrl) {
  const base = String(env?.APP_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
  const finalUrl = resetUrl || `${base}/forgot.html`;

  return {
    subject: 'Redefinição de senha — Chiptronic TravelOps',
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;max-width:600px;margin:0 auto;">
        <h2 style="margin-bottom:12px;">Redefinição de senha</h2>
        <p>Você solicitou a redefinição de senha.</p>
        <p><a href="${finalUrl}" style="color:#2563eb;">Clique aqui para criar uma nova senha</a></p>
        <p>Este link expira em 1 hora. Se você não fez essa solicitação, ignore este e-mail.</p>
      </div>
    `,
  };
}
