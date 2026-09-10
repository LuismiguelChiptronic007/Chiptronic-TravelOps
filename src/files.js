import { Hono } from 'hono';
import { requireUser } from './auth.js';
import { assertAllowedFile, err, fileKey, hasFileStorage, json } from './helpers.js';
import { fetchTripFull } from './trip_utils.js';

export const files = new Hono();

files.get('/files/*', async (c) => {
  if (!hasFileStorage(c.env)) return err('Armazenamento de arquivos não disponível.', 503);
  const key = c.req.path.replace(/^\/api\/files\//, '');
  if (!key) return err('Arquivo não encontrado.', 404);

  const obj = await c.env.FILES.get(key);
  if (!obj) return err('Arquivo não encontrado.', 404);

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('Cache-Control', 'private, max-age=3600');
  return new Response(obj.body, { headers });
});

export const tripFiles = new Hono();
tripFiles.use('*', requireUser);

tripFiles.post('/:id/expenses', async (c) => {
  const id = Number(c.req.param('id'));
  const userId = c.get('userId');
  const trip = await c.env.DB.prepare('SELECT * FROM trips WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first();
  if (!trip) return err('Viagem não encontrada.', 404);
  if (trip.status === 'completed') return err('Viagem concluída não aceita novas despesas.');

  const contentType = c.req.header('content-type') || '';
  let description = '';
  let amount = 0;
  let receipt_key = null;

  if (contentType.includes('multipart/form-data')) {
    const form = await c.req.formData();
    description = String(form.get('description') || '').trim();
    amount = Number(form.get('amount') || 0);
    const file = form.get('receipt');
    if (file && typeof file === 'object' && file.size > 0) {
      if (!hasFileStorage(c.env)) return err('Upload de comprovantes indisponível: R2 não configurado.', 503);
      const mime = assertAllowedFile(file);
      receipt_key = fileKey(`receipts/${id}`, file.name || 'receipt.bin');
      await c.env.FILES.put(receipt_key, file.stream(), {
        httpMetadata: { contentType: mime },
      });
    }
  } else {
    let body;
    try {
      body = await c.req.json();
    } catch {
      return err('JSON inválido.');
    }
    description = String(body.description || '').trim();
    amount = Number(body.amount || 0);
  }

  if (!description) return err('Informe a descrição da despesa.');
  if (Number.isNaN(amount) || amount < 0) return err('Valor da despesa inválido.');

  await c.env.DB.prepare(
    'INSERT INTO expenses (trip_id, description, amount, receipt_key) VALUES (?, ?, ?, ?)'
  )
    .bind(id, description, amount, receipt_key)
    .run();

  return json({ success: true, trip: await fetchTripFull(c.env.DB, id, userId) }, 201);
});

tripFiles.delete('/:id/expenses/:expenseId', async (c) => {
  const id = Number(c.req.param('id'));
  const expenseId = Number(c.req.param('expenseId'));
  const userId = c.get('userId');

  const trip = await c.env.DB.prepare('SELECT * FROM trips WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first();
  if (!trip) return err('Viagem não encontrada.', 404);
  if (trip.status === 'completed') return err('Viagem concluída é somente leitura.');

  const exp = await c.env.DB.prepare('SELECT * FROM expenses WHERE id = ? AND trip_id = ?')
    .bind(expenseId, id)
    .first();
  if (!exp) return err('Despesa não encontrada.', 404);

  if (exp.receipt_key && hasFileStorage(c.env)) {
    try {
      await c.env.FILES.delete(exp.receipt_key);
    } catch {
      /* ignore */
    }
  }
  await c.env.DB.prepare('DELETE FROM expenses WHERE id = ?').bind(expenseId).run();
  return json({ success: true, trip: await fetchTripFull(c.env.DB, id, userId) });
});

tripFiles.post('/:id/attachments', async (c) => {
  if (!hasFileStorage(c.env)) return err('Upload de anexos indisponível: R2 não configurado.', 503);
  const id = Number(c.req.param('id'));
  const userId = c.get('userId');
  const trip = await c.env.DB.prepare('SELECT * FROM trips WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first();
  if (!trip) return err('Viagem não encontrada.', 404);
  if (trip.status === 'completed') return err('Viagem concluída não aceita novos anexos.');

  const form = await c.req.formData();
  const file = form.get('file');
  if (!file || typeof file !== 'object' || !file.size) {
    return err('Envie um arquivo.');
  }

  const mime = assertAllowedFile(file);
  const original_name = file.name || 'arquivo';
  const stored_key = fileKey(`attachments/${id}`, original_name);

  await c.env.FILES.put(stored_key, file.stream(), {
    httpMetadata: { contentType: mime },
  });

  await c.env.DB.prepare(
    'INSERT INTO attachments (trip_id, original_name, stored_key, mime_type) VALUES (?, ?, ?, ?)'
  )
    .bind(id, original_name, stored_key, mime)
    .run();

  return json({ success: true, trip: await fetchTripFull(c.env.DB, id, userId) }, 201);
});

tripFiles.delete('/:id/attachments/:attId', async (c) => {
  const id = Number(c.req.param('id'));
  const attId = Number(c.req.param('attId'));
  const userId = c.get('userId');

  const trip = await c.env.DB.prepare('SELECT * FROM trips WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first();
  if (!trip) return err('Viagem não encontrada.', 404);
  if (trip.status === 'completed') return err('Viagem concluída é somente leitura.');

  const att = await c.env.DB.prepare('SELECT * FROM attachments WHERE id = ? AND trip_id = ?')
    .bind(attId, id)
    .first();
  if (!att) return err('Anexo não encontrado.', 404);

  if (hasFileStorage(c.env)) {
    try {
      await c.env.FILES.delete(att.stored_key);
    } catch {
      /* ignore */
    }
  }
  await c.env.DB.prepare('DELETE FROM attachments WHERE id = ?').bind(attId).run();
  return json({ success: true, trip: await fetchTripFull(c.env.DB, id, userId) });
});
