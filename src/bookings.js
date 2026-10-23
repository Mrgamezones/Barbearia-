import crypto from 'node:crypto';
import { freeSlotsByTime } from './availability.js';
import { addDays, isValidDate, isValidTime, nowInZone, toMinutes } from './time.js';

export const ANY_BARBER = 'qualquer';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class BookingError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function generateCode() {
  const bytes = crypto.randomBytes(6);
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

function normalizePhone(phone) {
  return String(phone ?? '').replace(/\D/g, '');
}

export function createBookingService({ store, shop, services, barbers, clock = () => new Date() }) {
  const now = () => nowInZone(shop.timezone, clock());

  function findService(id) {
    const service = services.find((s) => s.id === id);
    if (!service) throw new BookingError('Serviço inválido.');
    return service;
  }

  function resolveBarbers(barberId) {
    if (barberId === ANY_BARBER) return barbers;
    const barber = barbers.find((b) => b.id === barberId);
    if (!barber) throw new BookingError('Barbeiro inválido.');
    return [barber];
  }

  function activeBookings(date, barberId) {
    return store.bookings().filter((b) => b.status === 'confirmado' && b.date === date && b.barberId === barberId);
  }

  function checkDateWindow(date) {
    if (!isValidDate(date)) throw new BookingError('Data inválida.');
    const today = now().date;
    if (date < today || date > addDays(today, shop.maxDaysAhead)) {
      throw new BookingError(`Escolha uma data entre hoje e os próximos ${shop.maxDaysAhead} dias.`);
    }
  }

  function availability({ date, serviceId, barberId }) {
    const service = findService(serviceId);
    const candidates = resolveBarbers(barberId);
    checkDateWindow(date);
    return freeSlotsByTime({
      date,
      service,
      barbers: candidates,
      bookingsFor: (id) => activeBookings(date, id),
      shop,
      now: now(),
    });
  }

  function create(input) {
    const { serviceId, barberId, date, time } = input;
    const name = String(input.name ?? '').trim();
    const phone = normalizePhone(input.phone);
    const email = String(input.email ?? '').trim();

    if (name.length < 2 || name.length > 80) throw new BookingError('Informe seu nome.');
    if (phone.length < 10 || phone.length > 13) throw new BookingError('Informe um telefone com DDD.');
    if (email && (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      throw new BookingError('E-mail inválido.');
    }
    if (!isValidTime(time)) throw new BookingError('Horário inválido.');

    const service = findService(serviceId);
    const free = availability({ date, serviceId, barberId }).get(time);
    if (!free || free.length === 0) {
      throw new BookingError('Esse horário acabou de ser ocupado. Escolha outro, por favor.', 409);
    }

    // Em "qualquer barbeiro", fica com quem tem a agenda mais leve no dia.
    const chosenId = free
      .map((id) => ({ id, load: activeBookings(date, id).length }))
      .sort((a, b) => a.load - b.load)[0].id;
    const barber = barbers.find((b) => b.id === chosenId);

    let code;
    do code = generateCode();
    while (store.bookings().some((b) => b.code === code));

    return store.insert({
      code,
      status: 'confirmado',
      serviceId: service.id,
      serviceName: service.name,
      durationMinutes: service.durationMinutes,
      price: service.price,
      barberId: barber.id,
      barberName: barber.name,
      date,
      time,
      name,
      phone,
      email,
      createdAt: clock().toISOString(),
    });
  }

  function find(code) {
    return store.bookings().find((b) => b.code === String(code ?? '').toUpperCase()) || null;
  }

  function cancel(code, phone) {
    const booking = find(code);
    if (!booking || normalizePhone(phone) !== booking.phone) {
      throw new BookingError('Reserva não encontrada para esse código e telefone.', 404);
    }
    if (booking.status !== 'confirmado') throw new BookingError('Essa reserva já foi cancelada.', 409);
    const current = now();
    const isPast = booking.date < current.date || (booking.date === current.date && toMinutes(booking.time) <= current.minutes);
    if (isPast) throw new BookingError('Não é possível cancelar um horário que já passou.', 409);
    return store.update(booking.code, { status: 'cancelado', cancelledAt: clock().toISOString() });
  }

  function list({ from, to }) {
    return store
      .bookings()
      .filter((b) => (!from || b.date >= from) && (!to || b.date <= to))
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  }

  return { availability, create, find, cancel, list, now };
}
