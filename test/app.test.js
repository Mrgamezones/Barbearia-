import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app.js';
import { createBookingService } from '../src/bookings.js';
import { barbers, services, shop } from '../src/config.js';
import { createFileStore } from '../src/store.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const NOW = new Date('2026-10-27T11:00:00Z');
const DATE = '2026-10-28';

describe('API', () => {
  let server;
  let base;
  const sent = [];

  before(async () => {
    const bookings = createBookingService({ store: createFileStore(null), shop, services, barbers, clock: () => NOW });
    const handler = createApp({
      bookings,
      shop,
      services,
      barbers,
      publicDir: path.join(root, 'public'),
      adminPassword: 'segredo',
      notifier: (event, booking, message) => sent.push({ event, booking, message }),
    });
    server = http.createServer(handler);
    await new Promise((resolve) => server.listen(0, resolve));
    base = `http://localhost:${server.address().port}`;
  });

  after(() => server.close());

  const post = (url, body, headers = {}) =>
    fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

  it('serve a página e as informações', async () => {
    const page = await fetch(base + '/');
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Agende seu horário/);
    const info = await (await fetch(base + '/api/info')).json();
    assert.equal(info.today, '2026-10-27');
    assert.equal(info.services.length, services.length);
  });

  it('bloqueia path traversal', async () => {
    const res = await fetch(base + '/..%2fpackage.json');
    assert.equal(res.status, 404);
  });

  it('agenda, envia confirmação e permite consultar e cancelar', async () => {
    const res = await post('/api/bookings', {
      serviceId: 'corte', barberId: 'rafael', date: DATE, time: '09:00', name: 'Pedro Alves', phone: '11912345678',
    });
    assert.equal(res.status, 201);
    const booking = await res.json();
    assert.equal(booking.status, 'confirmado');
    assert.equal(booking.phone, undefined, 'telefone não deve vazar na resposta pública');
    assert.match(booking.whatsappLink, /^https:\/\/wa\.me\//);

    assert.equal(sent.at(-1).event, 'booking.confirmed');
    assert.match(sent.at(-1).message, new RegExp(booking.code));

    const slots = (await (await fetch(`${base}/api/availability?date=${DATE}&serviceId=corte&barberId=rafael`)).json()).slots;
    assert.ok(!slots.includes('09:00'));

    const again = await post('/api/bookings', {
      serviceId: 'corte', barberId: 'rafael', date: DATE, time: '09:00', name: 'Outro', phone: '11912345670',
    });
    assert.equal(again.status, 409);

    const ics = await fetch(`${base}/api/bookings/${booking.code}.ics`);
    assert.equal(ics.headers.get('content-type'), 'text/calendar; charset=utf-8');

    const cancel = await post(`/api/bookings/${booking.code}/cancel`, { phone: '11912345678' });
    assert.equal(cancel.status, 200);
    assert.equal((await cancel.json()).status, 'cancelado');
    assert.equal(sent.at(-1).event, 'booking.cancelled');
  });

  it('painel exige senha', async () => {
    assert.equal((await fetch(`${base}/api/admin/bookings?from=${DATE}`)).status, 401);
    const wrong = await fetch(`${base}/api/admin/bookings?from=${DATE}`, { headers: { authorization: 'Bearer errada' } });
    assert.equal(wrong.status, 401);
    const ok = await fetch(`${base}/api/admin/bookings?from=${DATE}`, { headers: { authorization: 'Bearer segredo' } });
    assert.equal(ok.status, 200);
    const { bookings } = await ok.json();
    assert.ok(bookings.length >= 1);
    assert.equal(bookings[0].phone, '11912345678');
  });

  it('rejeita JSON inválido', async () => {
    const res = await fetch(base + '/api/bookings', { method: 'POST', body: '{nope' });
    assert.equal(res.status, 400);
  });
});
