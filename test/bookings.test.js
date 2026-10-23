import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ANY_BARBER, BookingError, createBookingService } from '../src/bookings.js';
import { barbers, services, shop } from '../src/config.js';
import { calendarFile } from '../src/notify.js';
import { createFileStore } from '../src/store.js';
import { nowInZone, zonedToUtc } from '../src/time.js';

// Terça-feira, 27/10/2026, 08:00 em São Paulo (UTC-3).
const NOW = new Date('2026-10-27T11:00:00Z');
const TUESDAY = '2026-10-27';
const WEDNESDAY = '2026-10-28';
const MONDAY = '2026-11-02';

function setup(clock = () => NOW) {
  return createBookingService({ store: createFileStore(null), shop, services, barbers, clock });
}

const customer = { name: 'João Silva', phone: '(11) 98765-4321' };

describe('disponibilidade', () => {
  it('lista horários dentro do expediente, sem o almoço', () => {
    const slots = [...setup().availability({ date: WEDNESDAY, serviceId: 'corte', barberId: 'lucas' }).keys()];
    assert.equal(slots[0], '09:00');
    assert.equal(slots.at(-1), '18:30');
    assert.ok(slots.includes('11:30'));
    assert.ok(!slots.includes('12:00'));
    assert.ok(!slots.includes('12:30'));
  });

  it('serviço longo não invade o almoço nem o fechamento', () => {
    const slots = [...setup().availability({ date: WEDNESDAY, serviceId: 'corte-barba', barberId: 'lucas' }).keys()];
    assert.ok(slots.includes('11:00'));
    assert.ok(!slots.includes('11:30'));
    assert.equal(slots.at(-1), '18:00');
  });

  it('dia fechado e barbeiro de folga não têm horários', () => {
    const svc = setup();
    assert.equal(svc.availability({ date: MONDAY, serviceId: 'corte', barberId: ANY_BARBER }).size, 0);
    assert.equal(svc.availability({ date: TUESDAY, serviceId: 'corte', barberId: 'diego' }).size, 0);
  });

  it('esconde horários que já passaram hoje, respeitando a antecedência', () => {
    const at1015 = () => new Date('2026-10-27T13:15:00Z');
    const slots = [...setup(at1015).availability({ date: TUESDAY, serviceId: 'corte', barberId: 'lucas' }).keys()];
    assert.equal(slots[0], '11:00');
  });

  it('recusa datas passadas ou longe demais', () => {
    const svc = setup();
    assert.throws(() => svc.availability({ date: '2026-10-26', serviceId: 'corte', barberId: 'lucas' }), BookingError);
    assert.throws(() => svc.availability({ date: '2027-01-30', serviceId: 'corte', barberId: 'lucas' }), BookingError);
    assert.throws(() => svc.availability({ date: '2026-02-30', serviceId: 'corte', barberId: 'lucas' }), BookingError);
  });
});

describe('agendamento', () => {
  it('confirma automaticamente e ocupa o horário', () => {
    const svc = setup();
    const booking = svc.create({ ...customer, serviceId: 'corte-barba', barberId: 'lucas', date: WEDNESDAY, time: '14:00' });
    assert.equal(booking.status, 'confirmado');
    assert.match(booking.code, /^[A-Z2-9]{6}$/);
    assert.equal(booking.phone, '11987654321');

    const slots = [...svc.availability({ date: WEDNESDAY, serviceId: 'corte', barberId: 'lucas' }).keys()];
    assert.ok(slots.includes('13:30'));
    assert.ok(!slots.includes('14:00'));
    assert.ok(!slots.includes('14:30'));
    assert.ok(slots.includes('15:00'));
  });

  it('não permite dois agendamentos sobrepostos para o mesmo barbeiro', () => {
    const svc = setup();
    svc.create({ ...customer, serviceId: 'corte-barba', barberId: 'lucas', date: WEDNESDAY, time: '14:00' });
    assert.throws(
      () => svc.create({ ...customer, serviceId: 'corte', barberId: 'lucas', date: WEDNESDAY, time: '14:30' }),
      (err) => err instanceof BookingError && err.status === 409,
    );
    // Outro barbeiro no mesmo horário pode.
    svc.create({ ...customer, serviceId: 'corte', barberId: 'rafael', date: WEDNESDAY, time: '14:30' });
  });

  it('"qualquer barbeiro" distribui entre quem está livre', () => {
    const svc = setup();
    const picked = new Set();
    for (let i = 0; i < 3; i++) {
      picked.add(svc.create({ ...customer, serviceId: 'corte', barberId: ANY_BARBER, date: WEDNESDAY, time: '10:00' }).barberId);
    }
    assert.deepEqual([...picked].sort(), ['diego', 'lucas', 'rafael']);
    assert.ok(!svc.availability({ date: WEDNESDAY, serviceId: 'corte', barberId: ANY_BARBER }).has('10:00'));
  });

  it('valida os dados do cliente', () => {
    const svc = setup();
    const base = { serviceId: 'corte', barberId: 'lucas', date: WEDNESDAY, time: '10:00' };
    assert.throws(() => svc.create({ ...base, name: 'J', phone: customer.phone }), /nome/);
    assert.throws(() => svc.create({ ...base, name: customer.name, phone: '1234' }), /telefone/);
    assert.throws(() => svc.create({ ...base, ...customer, email: 'invalido' }), /E-mail/);
    assert.throws(() => svc.create({ ...customer, ...base, time: '10:15' }), /ocupado/);
  });

  it('cancelamento exige o telefone e libera o horário', () => {
    const svc = setup();
    const booking = svc.create({ ...customer, serviceId: 'corte', barberId: 'lucas', date: WEDNESDAY, time: '10:00' });
    assert.throws(() => svc.cancel(booking.code, '11999999999'), (err) => err.status === 404);
    svc.cancel(booking.code.toLowerCase(), '11 98765-4321');
    assert.equal(svc.find(booking.code).status, 'cancelado');
    assert.ok(svc.availability({ date: WEDNESDAY, serviceId: 'corte', barberId: 'lucas' }).has('10:00'));
    assert.throws(() => svc.cancel(booking.code, customer.phone), (err) => err.status === 409);
  });
});

describe('fuso horário e agenda', () => {
  it('converte horário de São Paulo para UTC', () => {
    assert.equal(zonedToUtc('2026-10-28', '14:00', 'America/Sao_Paulo').toISOString(), '2026-10-28T17:00:00.000Z');
    assert.deepEqual(nowInZone('America/Sao_Paulo', NOW), { date: TUESDAY, minutes: 8 * 60 });
  });

  it('gera arquivo .ics com início e fim corretos', () => {
    const booking = setup().create({ ...customer, serviceId: 'corte-barba', barberId: 'lucas', date: WEDNESDAY, time: '14:00' });
    const ics = calendarFile(booking, shop);
    assert.match(ics, /DTSTART:20261028T170000Z/);
    assert.match(ics, /DTEND:20261028T180000Z/);
  });
});
