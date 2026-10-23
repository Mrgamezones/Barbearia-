// Dados da barbearia. Edite este arquivo para alterar serviços, barbeiros e horários.

export const shop = {
  name: 'Barbearia do Lucas',
  timezone: 'America/Sao_Paulo',
  address: 'Rua Exemplo, 123 — Centro',
  // Número do WhatsApp da barbearia com DDI + DDD, só dígitos (ex.: 5511999999999).
  whatsapp: process.env.SHOP_WHATSAPP || '5511999999999',
  // Intervalo entre horários exibidos (minutos).
  slotStepMinutes: 30,
  // Antecedência mínima para agendar (minutos).
  minLeadMinutes: 30,
  // Até quantos dias à frente o cliente pode agendar.
  maxDaysAhead: 30,
  // Horário de funcionamento por dia da semana (0 = domingo ... 6 = sábado).
  // Cada dia é uma lista de intervalos; dias sem intervalos ficam fechados.
  hours: {
    0: [],
    1: [],
    2: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '19:00' }],
    3: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '19:00' }],
    4: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '19:00' }],
    5: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '20:00' }],
    6: [{ start: '08:00', end: '17:00' }],
  },
};

// `icon`: scissors, beard, combo, child, razor ou drop.
export const services = [
  { id: 'corte', icon: 'scissors', name: 'Corte', description: 'Corte na máquina e tesoura, com lavagem.', durationMinutes: 30, price: 45 },
  { id: 'barba', icon: 'beard', name: 'Barba', description: 'Barba com toalha quente e navalha.', durationMinutes: 30, price: 35 },
  { id: 'corte-barba', icon: 'combo', name: 'Corte + Barba', description: 'O combo completo.', durationMinutes: 60, price: 70 },
  { id: 'infantil', icon: 'child', name: 'Corte infantil', description: 'Para crianças até 12 anos.', durationMinutes: 30, price: 35 },
  { id: 'sobrancelha', icon: 'razor', name: 'Sobrancelha', description: 'Acabamento na navalha.', durationMinutes: 15, price: 20 },
  { id: 'platinado', icon: 'drop', name: 'Platinado / Luzes', description: 'Descoloração e tonalização.', durationMinutes: 120, price: 150 },
];

// `photo` (opcional): caminho de uma foto em public/, ex.: 'img/lucas.jpg'.
// Sem foto, o site mostra as iniciais do barbeiro.
export const barbers = [
  { id: 'lucas', name: 'Lucas', bio: 'Dono da casa. Especialista em degradê.', workdays: [2, 3, 4, 5, 6] },
  { id: 'rafael', name: 'Rafael', bio: 'Barba e navalha são com ele.', workdays: [2, 3, 4, 5, 6] },
  { id: 'diego', name: 'Diego', bio: 'Cortes modernos e coloração.', workdays: [3, 4, 5, 6] },
];
