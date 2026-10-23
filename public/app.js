const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DAYS_SHOWN = 14;
const SVG_NS = 'http://www.w3.org/2000/svg';

const state = { info: null, service: null, barber: null, date: null, time: null };
const $ = (sel) => document.querySelector(sel);

// ---------- helpers ----------

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (value !== false && value != null) node.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child != null) node.append(child);
  }
  return node;
}

function icon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

function avatar(barber) {
  if (barber.photo) return el('span', { class: 'avatar' }, el('img', { src: barber.photo, alt: '', loading: 'lazy' }));
  const initials = barber.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return el('span', { class: 'avatar', 'aria-hidden': 'true' }, initials);
}

const money = (value) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const weekdayOf = (date) => new Date(`${date}T12:00:00Z`).getUTCDay();
const shortDate = (date) => date.split('-').reverse().slice(0, 2).join('/');
const formatDate = (date) => `${WEEKDAYS[weekdayOf(date)]}, ${date.split('-').reverse().join('/')}`;
const addDays = (date, n) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const formatDuration = (min) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)}h${min % 60 ? String(min % 60).padStart(2, '0') : ''}`);

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error || 'Algo deu errado. Tente novamente.'), { status: res.status });
  return body;
}

function showError(node, message) {
  node.textContent = message;
  node.hidden = false;
}

// ---------- seções da página ----------

function renderPage() {
  const { shop, services, barbers, today } = state.info;
  document.querySelectorAll('[data-shop-name]').forEach((n) => (n.textContent = shop.name));
  document.querySelectorAll('[data-shop-address]').forEach((n) => (n.textContent = shop.address));
  $('#year').textContent = today.slice(0, 4);
  $('#whatsapp-link').href = `https://wa.me/${shop.whatsapp}`;

  const hour = new Date().getHours();
  $('#phone-greeting').textContent = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

  const combo = services.find((s) => s.id === 'corte-barba');
  document.querySelectorAll('[data-combo-price]').forEach((n) => (n.textContent = combo ? money(combo.price) : ''));
  document.querySelectorAll('[data-combo-duration]').forEach((n) => (n.textContent = combo ? formatDuration(combo.durationMinutes) : ''));

  $('#service-list').replaceChildren(...services.map((s) => el('article', { class: 'service-card' },
    el('span', { class: 'icon-tile' }, icon(s.icon || 'scissors')),
    el('h3', {}, s.name),
    el('p', {}, s.description),
    el('div', { class: 'service-meta' },
      el('span', {}, icon('clock'), formatDuration(s.durationMinutes)),
      el('strong', { class: 'price' }, money(s.price)),
    ),
    el('button', { class: 'btn btn-ghost btn-block', type: 'button', 'data-book-service': s.id }, 'Agendar'),
  )));

  $('#barber-list').replaceChildren(...barbers.map((b) => el('article', { class: 'barber-card' },
    avatar(b),
    el('h3', {}, b.name),
    el('p', {}, b.bio),
    el('div', { class: 'barber-days' }, b.workdays.map((d) => el('span', {}, WEEKDAYS_SHORT[d]))),
    el('button', { class: 'btn btn-primary btn-block', type: 'button', 'data-book-barber': b.id }, `Agendar com ${b.name}`),
  )));

  $('#hero-avatars').replaceChildren(...barbers.map(avatar));
  const names = barbers.map((b) => b.name);
  $('#hero-team').textContent = names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names.at(-1)}` : names[0];
  $('#phone-barbers').replaceChildren(...barbers.slice(0, 3).map((b) => el('span', { class: 'phone-barber' }, avatar(b), b.name)));

  const order = [2, 3, 4, 5, 6, 0, 1];
  const todayDay = weekdayOf(today);
  $('#hours').replaceChildren(...order.map((d) => {
    const intervals = shop.hours[d] || [];
    const text = intervals.length ? intervals.map((i) => `${i.start}–${i.end}`).join(' · ') : 'Fechado';
    return el('li', { class: d === todayDay ? 'today' : null }, el('span', {}, WEEKDAYS[d]), el('span', {}, text));
  }));

  showNextFreeSlot();
}

// Mostra no mockup do hero o próximo horário livre de verdade.
async function showNextFreeSlot() {
  const { today, shop, anyBarberId, services } = state.info;
  const target = $('#next-slot');
  for (let i = 0; i < 10; i++) {
    const date = addDays(today, i);
    if (!shop.hours[weekdayOf(date)]?.length) continue;
    try {
      const params = new URLSearchParams({ date, serviceId: services[0].id, barberId: anyBarberId });
      const { slots } = await api(`/api/availability?${params}`);
      if (slots.length) {
        const label = i === 0 ? 'hoje' : i === 1 ? 'amanhã' : `${WEEKDAYS_SHORT[weekdayOf(date)]}, ${shortDate(date)}`;
        target.textContent = `Próximo horário livre: ${label} às ${slots[0]}`;
        return;
      }
    } catch {
      break;
    }
  }
  target.textContent = 'Veja os horários livres na agenda';
}

// ---------- fluxo de agendamento ----------

function showStep(n, scroll = true) {
  document.querySelectorAll('[data-step]').forEach((s) => (s.hidden = Number(s.dataset.step) !== n));
  document.querySelectorAll('[data-step-indicator]').forEach((li) => {
    const i = Number(li.dataset.stepIndicator);
    li.classList.toggle('active', i === n);
    li.classList.toggle('done', i < n);
  });
  $('#booking-total').hidden = n === 5;
  updateTotal();
  if (scroll) $('.booking').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function updateTotal() {
  $('#total-price').textContent = state.service ? money(state.service.price) : money(0);
  const parts = [state.service?.name, state.barber?.name, state.date && state.time ? `${shortDate(state.date)} às ${state.time}` : null].filter(Boolean);
  $('#total-detail').textContent = parts.length ? parts.join(' · ') : 'Escolha um serviço';
}

function selectService(service) {
  state.service = service;
  state.time = null;
  renderServices();
  if (state.barber) {
    renderDays();
    showStep(3);
  } else {
    renderBarbers();
    showStep(2);
  }
}

function selectBarber(barber) {
  state.barber = barber;
  state.time = null;
  renderBarbers();
  if (state.service) {
    renderDays();
    showStep(3);
  } else {
    showStep(1);
  }
}

function renderServices() {
  $('#services').replaceChildren(...state.info.services.map((s) => el('button', {
    type: 'button',
    class: 'choice',
    role: 'radio',
    'aria-checked': String(state.service?.id === s.id),
    onclick: () => selectService(s),
  },
  el('span', { class: 'icon-tile' }, icon(s.icon || 'scissors')),
  el('span', { class: 'choice-text' }, el('strong', {}, s.name), el('small', {}, `${formatDuration(s.durationMinutes)} · ${s.description}`)),
  el('span', { class: 'choice-price' }, money(s.price)))));
}

function anyBarber() {
  return { id: state.info.anyBarberId, name: 'Qualquer um', bio: 'Primeiro horário livre' };
}

function renderBarbers() {
  $('#barbers').replaceChildren(...[anyBarber(), ...state.info.barbers].map((b) => el('button', {
    type: 'button',
    class: 'barber-option',
    role: 'radio',
    'aria-checked': String(state.barber?.id === b.id),
    onclick: () => selectBarber(b),
  },
  b.workdays ? avatar(b) : el('span', { class: 'avatar avatar-any', 'aria-hidden': 'true' }, icon('scissors')),
  el('strong', {}, b.name),
  el('small', {}, b.workdays ? b.workdays.map((d) => WEEKDAYS_SHORT[d]).join(' · ') : b.bio))));
}

function isOpen(date) {
  const day = weekdayOf(date);
  const open = state.info.shop.hours[day]?.length > 0;
  const works = state.barber.workdays ? state.barber.workdays.includes(day) : true;
  return open && works;
}

function dayLabel(date) {
  const { today } = state.info;
  if (date === today) return 'hoje';
  if (date === addDays(today, 1)) return 'amanhã';
  return WEEKDAYS_SHORT[weekdayOf(date)];
}

function renderDays(keepAdvancing = false) {
  const { today, lastDay } = state.info;
  const days = [];
  for (let i = 0; days.length < DAYS_SHOWN; i++) {
    const date = addDays(today, i);
    if (date > lastDay) break;
    days.push(date);
  }
  let autoPicked = keepAdvancing;
  if (!state.date || !days.includes(state.date) || !isOpen(state.date)) {
    state.date = days.find(isOpen) || null;
    autoPicked = true;
  }
  $('#days').replaceChildren(...days.map((date) => {
    const closed = !isOpen(date);
    return el('button', {
      type: 'button',
      class: 'day',
      role: 'radio',
      'aria-checked': String(state.date === date),
      disabled: closed,
      title: closed ? 'Fechado' : null,
      onclick: () => {
        state.date = date;
        state.time = null;
        renderDays();
        updateTotal();
      },
    },
    el('span', { class: 'day-week' }, dayLabel(date)),
    el('span', { class: 'day-num' }, date.slice(8)),
    el('span', { class: 'day-month' }, MONTHS_SHORT[Number(date.slice(5, 7)) - 1]));
  }));
  loadSlots({ days, autoAdvance: autoPicked });
}

let slotsRequest = 0;
// Com `autoAdvance`, um dia escolhido automaticamente que já está lotado
// (ex.: hoje à noite) dá lugar ao próximo dia aberto.
async function loadSlots({ days = [], autoAdvance = false } = {}) {
  const hint = $('#slots-hint');
  const container = $('#slots');
  container.replaceChildren();
  if (!state.date) {
    hint.textContent = 'Sem dias disponíveis para esse barbeiro nas próximas semanas.';
    return;
  }
  hint.textContent = 'Carregando horários…';
  const request = ++slotsRequest;
  try {
    const params = new URLSearchParams({ date: state.date, serviceId: state.service.id, barberId: state.barber.id });
    const { slots } = await api(`/api/availability?${params}`);
    if (request !== slotsRequest) return;
    if (!slots.length && autoAdvance) {
      const next = days.slice(days.indexOf(state.date) + 1).find(isOpen);
      if (next) {
        state.date = next;
        renderDays(true);
        return;
      }
    }
    hint.textContent = slots.length
      ? `${formatDate(state.date)} · ${slots.length} horário${slots.length > 1 ? 's' : ''} livre${slots.length > 1 ? 's' : ''}`
      : `${formatDate(state.date)} · agenda cheia. Tente outro dia.`;
    container.replaceChildren(...slots.map((time) => el('button', {
      type: 'button',
      class: 'slot',
      role: 'radio',
      'aria-checked': String(state.time === time),
      onclick: () => {
        state.time = time;
        renderSummary();
        showStep(4);
      },
    }, time)));
  } catch (err) {
    if (request === slotsRequest) hint.textContent = err.message;
  }
}

function renderSummary() {
  $('#summary').replaceChildren(
    el('p', {}, el('strong', {}, state.service.name), ` · ${money(state.service.price)} · ${formatDuration(state.service.durationMinutes)}`),
    el('p', {}, `${state.barber.name} · ${formatDate(state.date)} às ${state.time}`),
  );
}

function bookingDetails(booking) {
  return el('dl', { class: 'details' },
    el('dt', {}, 'Código'), el('dd', { class: 'code' }, booking.code),
    el('dt', {}, 'Serviço'), el('dd', {}, `${booking.serviceName} · ${money(booking.price)}`),
    el('dt', {}, 'Barbeiro'), el('dd', {}, booking.barberName),
    el('dt', {}, 'Quando'), el('dd', {}, `${formatDate(booking.date)} às ${booking.time}`),
    el('dt', {}, 'Situação'), el('dd', { class: `status status-${booking.status}` }, booking.status),
  );
}

function bookingActions(booking) {
  return el('div', { class: 'actions' },
    el('a', { class: 'btn btn-primary', href: `/api/bookings/${booking.code}.ics` }, icon('calendar'), 'Adicionar à agenda'),
    el('a', { class: 'btn btn-ghost', href: booking.whatsappLink, target: '_blank', rel: 'noopener' }, icon('whatsapp'), 'Enviar no WhatsApp'),
  );
}

function renderConfirmation(booking) {
  try { localStorage.setItem('ultimaReserva', booking.code); } catch {}
  $('#confirmation').replaceChildren(
    el('p', { class: 'muted' }, `Tudo certo, ${booking.name}! Guarde o código abaixo para consultar ou cancelar.`),
    bookingDetails(booking),
    bookingActions(booking),
  );
  $('#lookup-code').value = booking.code;
  showStep(5);
}

$('#booking-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const error = $('#form-error');
  const button = form.querySelector('button[type=submit]');
  error.hidden = true;
  const data = Object.fromEntries(new FormData(form));
  if (data.name.trim().length < 2) return showError(error, 'Informe seu nome.');
  if (data.phone.replace(/\D/g, '').length < 10) return showError(error, 'Informe um telefone com DDD.');

  button.disabled = true;
  button.textContent = 'Confirmando…';
  try {
    const booking = await api('/api/bookings', {
      method: 'POST',
      body: JSON.stringify({ ...data, serviceId: state.service.id, barberId: state.barber.id, date: state.date, time: state.time }),
    });
    form.reset();
    renderConfirmation(booking);
  } catch (err) {
    showError(error, err.message);
    if (err.status === 409) {
      state.time = null;
      setTimeout(() => { showStep(3); loadSlots(); }, 1500);
    }
  } finally {
    button.disabled = false;
    button.textContent = 'Confirmar agendamento';
  }
});

document.querySelectorAll('[data-back]').forEach((btn) => btn.addEventListener('click', () => {
  const step = Number(btn.dataset.back);
  if (step === 2) renderBarbers();
  showStep(step);
}));

$('#new-booking').addEventListener('click', () => {
  Object.assign(state, { service: null, barber: null, date: null, time: null });
  renderServices();
  showStep(1);
});

// Botões "Agendar" espalhados pela página pré-selecionam serviço ou barbeiro.
document.addEventListener('click', (event) => {
  const serviceBtn = event.target.closest('[data-book-service]');
  const barberBtn = event.target.closest('[data-book-barber]');
  if (!state.info || (!serviceBtn && !barberBtn)) return;
  state.date = null;
  if (serviceBtn) {
    const service = state.info.services.find((s) => s.id === serviceBtn.dataset.bookService);
    if (service) selectService(service);
  } else {
    const barber = state.info.barbers.find((b) => b.id === barberBtn.dataset.bookBarber);
    if (barber) selectBarber(barber);
  }
});

// ---------- minha reserva ----------

async function lookup(code) {
  const error = $('#lookup-error');
  const result = $('#lookup-result');
  error.hidden = true;
  result.replaceChildren();
  try {
    const booking = await api(`/api/bookings/${encodeURIComponent(code.trim().toUpperCase())}`);
    const children = [bookingDetails(booking)];
    if (booking.status === 'confirmado') children.push(bookingActions(booking), cancelForm(booking));
    result.replaceChildren(...children);
  } catch (err) {
    showError(error, err.message);
  }
}

function cancelForm(booking) {
  const msg = el('p', { class: 'error', role: 'alert', hidden: true });
  const form = el('form', { class: 'form inline-form cancel-form' },
    el('label', {}, 'Telefone usado no agendamento', el('input', { name: 'phone', type: 'tel', required: true })),
    el('button', { class: 'btn btn-danger', type: 'submit' }, 'Cancelar horário'),
  );
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!confirm('Cancelar este horário?')) return;
    try {
      await api(`/api/bookings/${booking.code}/cancel`, { method: 'POST', body: JSON.stringify({ phone: form.phone.value }) });
      lookup(booking.code);
    } catch (err) {
      showError(msg, err.message);
    }
  });
  return el('div', {}, form, msg);
}

$('#lookup-form').addEventListener('submit', (event) => {
  event.preventDefault();
  lookup(event.currentTarget.code.value);
});

// ---------- início ----------

async function init() {
  try {
    state.info = await api('/api/info');
  } catch {
    $('#services').replaceChildren(el('p', { class: 'error' }, 'Não foi possível carregar a agenda. Recarregue a página.'));
    return;
  }
  renderPage();
  renderServices();
  updateTotal();

  const params = new URLSearchParams(location.search);
  let saved = null;
  try { saved = localStorage.getItem('ultimaReserva'); } catch {}
  const code = params.get('codigo') || saved;
  if (code) {
    $('#lookup-code').value = code;
    if (params.get('codigo')) lookup(code);
  }
}

init();
