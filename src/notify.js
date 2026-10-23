import { zonedToUtc } from './time.js';

function formatDateBR(date) {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}

export function confirmationMessage(booking, shop) {
  return [
    `Olá, ${booking.name}! Seu horário na ${shop.name} está confirmado.`,
    `${booking.serviceName} com ${booking.barberName}`,
    `${formatDateBR(booking.date)} às ${booking.time}`,
    `Código da reserva: ${booking.code}`,
    `Endereço: ${shop.address}`,
  ].join('\n');
}

export function whatsappLink(booking, shop) {
  const text = `Olá! Acabei de agendar ${booking.serviceName} com ${booking.barberName} em ${formatDateBR(booking.date)} às ${booking.time}. Código: ${booking.code}`;
  return `https://wa.me/${shop.whatsapp}?text=${encodeURIComponent(text)}`;
}

function icsDate(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function icsEscape(text) {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export function calendarFile(booking, shop) {
  const start = zonedToUtc(booking.date, booking.time, shop.timezone);
  const end = new Date(start.getTime() + booking.durationMinutes * 60_000);
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${icsEscape(shop.name)}//Agendamento//PT`,
    'BEGIN:VEVENT',
    `UID:${booking.code}@barbearia`,
    `DTSTAMP:${icsDate(new Date(booking.createdAt))}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(`${booking.serviceName} — ${shop.name}`)}`,
    `DESCRIPTION:${icsEscape(`Com ${booking.barberName}. Código: ${booking.code}`)}`,
    `LOCATION:${icsEscape(shop.address)}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

export function cancellationMessage(booking, shop) {
  return `Olá, ${booking.name}. Seu horário de ${formatDateBR(booking.date)} às ${booking.time} na ${shop.name} foi cancelado. Código: ${booking.code}`;
}

// Envia avisos automáticos. Sem NOTIFY_WEBHOOK_URL, apenas registra no log.
// Com o webhook configurado (Zapier, Make, n8n, API de WhatsApp/e-mail...),
// ele recebe um POST com a reserva e a mensagem pronta para encaminhar ao cliente.
export async function notify(event, booking, message, { webhookUrl = process.env.NOTIFY_WEBHOOK_URL, log = console } = {}) {
  if (!webhookUrl) {
    log.info(`[${event}] ${booking.code} → ${booking.phone}\n${message}`);
    return;
  }
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event, booking, message }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) log.error(`[${event}] webhook respondeu ${res.status} para ${booking.code}`);
  } catch (err) {
    log.error(`[${event}] falha ao chamar webhook para ${booking.code}: ${err.message}`);
  }
}
