const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const DAYS_SHOWN = 14;

const state = { info: null, service: null, barber: null, date: null, time: null };
const $ = (sel) => document.querySelector(sel);

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

const money = (value) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const weekdayOf = (date) => new Date(`${date}T12:00:00Z`).getUTCDay();
const formatDate = (date) => {
  const [y, m, d] = date.split('-');
  return `${WEEKDAYS[weekdayOf(date)]}, ${d}/${m}/${y}`;
};
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

function showStep(n) {
  document.querySelectorAll('[data-step]').forEach((s) => (s.hidden = Number(s.dataset.step) !== n));
  document.querySelectorAll('[data-step-indicator]').forEach((li) => {
    const i = Number(li.dataset.stepIndicator);
    li.classList.toggle('active', i === n);
    li.classList.toggle('done', i < n);
  });
  $('#agendar').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function option({ title, meta, description, selected, onclick }) {
  return el('button', { type: 'button', class: 'option', role: 'radio', 'aria-checked': String(selected), onclick },
    el('span', { class: 'option-title' }, title),
    meta ? el('span', { class: 'option-meta' }, meta) : null,
    description ? el('span', { class: 'option-desc' }, description) : null,
  );
}

function renderServices() {
  $('#services').replaceChildren(...state.info.services.map((s) => option({
    title: s.name,
    meta: `${money(s.price)} · ${formatDuration(s.durationMinutes)}`,
    description: s.description,
    selected: state.service?.id === s.id,
    onclick: () => {
      state.service = s;
      state.time = null;
      renderServices();
      renderBarbers();
      showStep(2);
    },
  })));
}

function renderBarbers() {
  const any = { id: state.info.anyBarberId, name: 'Qualquer barbeiro', bio: 'O primeiro horário livre, com quem estiver disponível.' };
  $('#barbers').replaceChildren(...[any, ...state.info.barbers].map((b) => option({
    title: b.name,
    description: b.bio,
    meta: b.workdays ? b.workdays.map((d) => WEEKDAYS_SHORT[d]).join(' · ') : null,
    selected: state.barber?.id === b.id,
    onclick: () => {
      state.barber = b;
      state.time = null;
      renderBarbers();
      renderDays();
      showStep(3);
    },
  })));
}

function isOpen(date) {
  const day = weekdayOf(date);
  const open = state.info.shop.hours[day]?.length > 0;
  const works = state.barber.workdays ? state.barber.workdays.includes(day) : true;
  return open && works;
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
    const [, m, d] = date.split('-');
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
      },
    },
    el('span', { class: 'day-week' }, i18nDay(date, today)),
    el('span', { class: 'day-num' }, d),
    el('span', { class: 'day-month' }, `/${m}`));
  }));
  loadSlots({ days, autoAdvance: autoPicked });
}

function i18nDay(date, today) {
  if (date === today) return 'hoje';
  if (date === addDays(today, 1)) return 'amanhã';
  return WEEKDAYS_SHORT[weekdayOf(date)];
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
      ? `${formatDate(state.date)} — ${slots.length} horário${slots.length > 1 ? 's' : ''} livre${slots.length > 1 ? 's' : ''}`
      : `${formatDate(state.date)} — agenda cheia. Tente outro dia.`;
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
    el('a', { class: 'btn btn-primary', href: `/api/bookings/${booking.code}.ics` }, 'Adicionar à agenda'),
    el('a', { class: 'btn btn-ghost', href: booking.whatsappLink, target: '_blank', rel: 'noopener' }, 'Enviar no WhatsApp'),
  );
}

function renderConfirmation(booking) {
  try { localStorage.setItem('ultimaReserva', booking.code); } catch {}
  $('#confirmation').replaceChildren(
    el('p', {}, `Tudo certo, ${booking.name}! Guarde o código abaixo para consultar ou cancelar.`),
    bookingDetails(booking),
    bookingActions(booking),
  );
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

function showError(node, message) {
  node.textContent = message;
  node.hidden = false;
}

document.querySelectorAll('[data-back]').forEach((btn) => btn.addEventListener('click', () => showStep(Number(btn.dataset.back))));

$('#new-booking').addEventListener('click', () => {
  Object.assign(state, { service: null, barber: null, date: null, time: null });
  renderServices();
  showStep(1);
});

async function lookup(code) {
  const error = $('#lookup-error');
  const result = $('#lookup-result');
  error.hidden = true;
  result.replaceChildren();
  try {
    const booking = await api(`/api/bookings/${encodeURIComponent(code.trim().toUpperCase())}`);
    const children = [bookingDetails(booking)];
    if (booking.status === 'confirmado') {
      children.push(bookingActions(booking), cancelForm(booking));
    }
    result.replaceChildren(...children);
  } catch (err) {
    showError(error, err.message);
  }
}

function cancelForm(booking) {
  const msg = el('p', { class: 'error', role: 'alert', hidden: true });
  const form = el('form', { class: 'inline-form cancel-form' },
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

function renderInfo() {
  const { shop } = state.info;
  document.querySelectorAll('[data-shop-name]').forEach((n) => (n.textContent = shop.name));
  document.querySelectorAll('[data-shop-address]').forEach((n) => (n.textContent = shop.address));
  const order = [2, 3, 4, 5, 6, 0, 1];
  $('#hours').replaceChildren(...order.map((d) => {
    const intervals = shop.hours[d] || [];
    const text = intervals.length ? intervals.map((i) => `${i.start}–${i.end}`).join(' e ') : 'Fechado';
    return el('li', {}, el('span', {}, WEEKDAYS[d]), el('span', {}, text));
  }));
}

async function init() {
  try {
    state.info = await api('/api/info');
  } catch {
    $('#services').replaceChildren(el('p', { class: 'error' }, 'Não foi possível carregar a agenda. Recarregue a página.'));
    return;
  }
  renderInfo();
  renderServices();
  const params = new URLSearchParams(location.search);
  let saved = null;
  try { saved = localStorage.getItem('ultimaReserva'); } catch {}
  const code = params.get('codigo') || saved;
  if (code) {
    $('#lookup-form').code.value = code;
    if (params.get('codigo')) lookup(code);
  }
}

init();
