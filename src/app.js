import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ANY_BARBER, BookingError } from './bookings.js';
import { calendarFile, cancellationMessage, confirmationMessage, notify, whatsappLink } from './notify.js';
import { addDays } from './time.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const MAX_BODY_BYTES = 10_000;

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new BookingError('Requisição muito grande.', 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new BookingError('JSON inválido.');
  }
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Dados que o próprio cliente vê sobre a reserva (sem telefone/e-mail).
function publicBooking(booking, shop) {
  return {
    code: booking.code,
    status: booking.status,
    serviceName: booking.serviceName,
    durationMinutes: booking.durationMinutes,
    price: booking.price,
    barberName: booking.barberName,
    date: booking.date,
    time: booking.time,
    name: booking.name.split(' ')[0],
    whatsappLink: whatsappLink(booking, shop),
  };
}

function serveStatic(res, publicDir, pathname) {
  const relative = pathname === '/' ? 'index.html' : pathname === '/admin' ? 'admin.html' : pathname.slice(1);
  const file = path.resolve(publicDir, relative);
  if (!file.startsWith(publicDir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Página não encontrada');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

export function createApp({ bookings, shop, services, barbers, publicDir, adminPassword, notifier = notify }) {
  publicDir = path.resolve(publicDir);

  function requireAdmin(req) {
    if (!adminPassword) throw new BookingError('Painel desativado: defina ADMIN_PASSWORD.', 503);
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token || !safeEqual(token, adminPassword)) throw new BookingError('Senha incorreta.', 401);
  }

  async function route(req, res, url) {
    const { pathname } = url;
    const method = req.method;

    if (method === 'GET' && pathname === '/api/info') {
      const today = bookings.now().date;
      return sendJson(res, 200, {
        shop: { name: shop.name, address: shop.address, whatsapp: shop.whatsapp, hours: shop.hours },
        services,
        barbers: barbers.map(({ id, name, bio, workdays }) => ({ id, name, bio, workdays })),
        anyBarberId: ANY_BARBER,
        today,
        lastDay: addDays(today, shop.maxDaysAhead),
      });
    }

    if (method === 'GET' && pathname === '/api/availability') {
      const slots = bookings.availability({
        date: url.searchParams.get('date'),
        serviceId: url.searchParams.get('serviceId'),
        barberId: url.searchParams.get('barberId'),
      });
      return sendJson(res, 200, { slots: [...slots.keys()] });
    }

    if (method === 'POST' && pathname === '/api/bookings') {
      const booking = bookings.create(await readJson(req));
      notifier('booking.confirmed', booking, confirmationMessage(booking, shop));
      return sendJson(res, 201, publicBooking(booking, shop));
    }

    const match = pathname.match(/^\/api\/bookings\/([A-Za-z0-9]{6})(\/cancel|\.ics)?$/);
    if (match) {
      const [, code, suffix] = match;
      if (method === 'GET' && !suffix) {
        const booking = bookings.find(code);
        if (!booking) throw new BookingError('Reserva não encontrada.', 404);
        return sendJson(res, 200, publicBooking(booking, shop));
      }
      if (method === 'GET' && suffix === '.ics') {
        const booking = bookings.find(code);
        if (!booking) throw new BookingError('Reserva não encontrada.', 404);
        res.writeHead(200, {
          'content-type': 'text/calendar; charset=utf-8',
          'content-disposition': `attachment; filename="barbearia-${booking.code}.ics"`,
        });
        return res.end(calendarFile(booking, shop));
      }
      if (method === 'POST' && suffix === '/cancel') {
        const { phone } = await readJson(req);
        const booking = bookings.cancel(code, phone);
        notifier('booking.cancelled', booking, cancellationMessage(booking, shop));
        return sendJson(res, 200, publicBooking(booking, shop));
      }
    }

    if (method === 'GET' && pathname === '/api/admin/bookings') {
      requireAdmin(req);
      const from = url.searchParams.get('from') || bookings.now().date;
      const to = url.searchParams.get('to') || from;
      return sendJson(res, 200, { bookings: bookings.list({ from, to }) });
    }

    if (method === 'POST' && pathname.startsWith('/api/admin/bookings/') && pathname.endsWith('/cancel')) {
      requireAdmin(req);
      const code = pathname.split('/')[4];
      const booking = bookings.find(code);
      if (!booking) throw new BookingError('Reserva não encontrada.', 404);
      const cancelled = bookings.cancel(code, booking.phone);
      notifier('booking.cancelled', cancelled, cancellationMessage(cancelled, shop));
      return sendJson(res, 200, { booking: cancelled });
    }

    if (pathname.startsWith('/api/')) throw new BookingError('Rota não encontrada.', 404);
    if (method !== 'GET' && method !== 'HEAD') throw new BookingError('Método não permitido.', 405);
    return serveStatic(res, publicDir, pathname);
  }

  return async function handler(req, res) {
    const url = new URL(req.url, 'http://localhost');
    try {
      await route(req, res, url);
    } catch (err) {
      if (err instanceof BookingError) return sendJson(res, err.status, { error: err.message });
      console.error(err);
      sendJson(res, 500, { error: 'Erro interno. Tente novamente.' });
    }
  };
}
