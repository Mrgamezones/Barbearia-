const $ = (sel) => document.querySelector(sel);
let password = sessionStorageGet();
let today = null;

function sessionStorageGet() {
  try { return sessionStorage.getItem('adminPassword'); } catch { return null; }
}
function sessionStorageSet(value) {
  try {
    if (value) sessionStorage.setItem('adminPassword', value);
    else sessionStorage.removeItem('adminPassword');
  } catch {}
}

const addDays = (date, n) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const formatDate = (date) => date.split('-').reverse().join('/');
const money = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function api(path, options = {}) {
  const res = await fetch(path, { ...options, headers: { authorization: `Bearer ${password}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error || 'Erro'), { status: res.status });
  return body;
}

function cell(text) {
  const td = document.createElement('td');
  td.textContent = text;
  return td;
}

async function load() {
  const from = $('#from').value;
  const to = $('#to').value || from;
  const { bookings } = await api(`/api/admin/bookings?from=${from}&to=${to}`);
  const active = bookings.filter((b) => b.status === 'confirmado');
  $('#stats').innerHTML = '';
  for (const [label, value] of [['Agendamentos', active.length], ['Cancelados', bookings.length - active.length], ['Previsto', money(active.reduce((s, b) => s + b.price, 0))]]) {
    const span = document.createElement('span');
    span.append(`${label}: `);
    const strong = document.createElement('strong');
    strong.textContent = value;
    span.append(strong);
    $('#stats').append(span);
  }
  $('#rows').replaceChildren(...bookings.map((b) => {
    const tr = document.createElement('tr');
    tr.className = b.status;
    const phone = document.createElement('td');
    const link = document.createElement('a');
    link.href = `https://wa.me/${b.phone.length <= 11 ? `55${b.phone}` : b.phone}`;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = b.phone;
    phone.append(link);
    const action = document.createElement('td');
    if (b.status === 'confirmado') {
      const btn = document.createElement('button');
      btn.className = 'btn btn-link';
      btn.textContent = 'Cancelar';
      btn.onclick = async () => {
        if (!confirm(`Cancelar ${b.name} às ${b.time}?`)) return;
        try {
          await api(`/api/admin/bookings/${b.code}/cancel`, { method: 'POST' });
          load();
        } catch (err) {
          alert(err.message);
        }
      };
      action.append(btn);
    } else {
      action.textContent = 'cancelado';
    }
    tr.append(cell(formatDate(b.date)), cell(b.time), cell(b.barberName), cell(b.serviceName), cell(b.name), phone, cell(b.code), action);
    return tr;
  }));
  $('#empty').hidden = bookings.length > 0;
}

async function enter() {
  try {
    if (!today) today = (await (await fetch('/api/info')).json()).today;
    if (!$('#from').value) {
      $('#from').value = today;
      $('#to').value = today;
    }
    await load();
    sessionStorageSet(password);
    $('#login').hidden = true;
    $('#panel').hidden = false;
  } catch (err) {
    sessionStorageSet(null);
    const error = $('#login-error');
    error.textContent = err.message;
    error.hidden = false;
  }
}

$('#login-form').addEventListener('submit', (event) => {
  event.preventDefault();
  password = event.currentTarget.password.value;
  enter();
});
$('#from').addEventListener('change', () => {
  if ($('#to').value < $('#from').value) $('#to').value = $('#from').value;
  load();
});
$('#to').addEventListener('change', load);
$('#today').addEventListener('click', () => {
  $('#from').value = today;
  $('#to').value = today;
  load();
});
$('#week').addEventListener('click', () => {
  $('#from').value = today;
  $('#to').value = addDays(today, 6);
  load();
});
$('#logout').addEventListener('click', () => {
  sessionStorageSet(null);
  location.reload();
});

if (password) enter();
