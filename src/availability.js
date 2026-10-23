import { toMinutes, fromMinutes, weekday } from './time.js';

function overlaps(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

// Horários livres de um barbeiro para um serviço numa data.
// `bookings` são as reservas ativas daquele barbeiro naquela data.
// `now` ({ date, minutes }) esconde horários que já passaram.
export function freeSlotsForBarber({ date, service, barber, bookings, shop, now }) {
  const day = weekday(date);
  if (!barber.workdays.includes(day)) return [];
  if (date < now.date) return [];

  const intervals = shop.hours[day] || [];
  const busy = bookings.map((b) => [toMinutes(b.time), toMinutes(b.time) + b.durationMinutes]);
  const earliest = date === now.date ? now.minutes + shop.minLeadMinutes : -Infinity;
  const slots = [];

  for (const interval of intervals) {
    const open = toMinutes(interval.start);
    const close = toMinutes(interval.end);
    for (let t = open; t + service.durationMinutes <= close; t += shop.slotStepMinutes) {
      if (t < earliest) continue;
      const end = t + service.durationMinutes;
      if (busy.some(([s, e]) => overlaps(t, end, s, e))) continue;
      slots.push(fromMinutes(t));
    }
  }
  return slots;
}

// Junta os horários livres de vários barbeiros: { 'HH:MM': [barberId, ...] }.
export function freeSlotsByTime({ date, service, barbers, bookingsFor, shop, now }) {
  const byTime = new Map();
  for (const barber of barbers) {
    const slots = freeSlotsForBarber({ date, service, barber, bookings: bookingsFor(barber.id), shop, now });
    for (const time of slots) {
      if (!byTime.has(time)) byTime.set(time, []);
      byTime.get(time).push(barber.id);
    }
  }
  return new Map([...byTime].sort(([a], [b]) => a.localeCompare(b)));
}
