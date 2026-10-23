import fs from 'node:fs';
import path from 'node:path';

// Armazenamento simples em arquivo JSON. As operações são síncronas, o que
// garante que verificar disponibilidade e gravar a reserva aconteçam sem
// intercalação com outra requisição.
export function createFileStore(file) {
  let data = { bookings: [] };
  if (file && fs.existsSync(file)) {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  function persist() {
    if (!file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
  }

  return {
    bookings() {
      return data.bookings;
    },
    insert(booking) {
      data.bookings.push(booking);
      persist();
      return booking;
    },
    update(code, changes) {
      const booking = data.bookings.find((b) => b.code === code);
      if (!booking) return null;
      Object.assign(booking, changes);
      persist();
      return booking;
    },
  };
}
