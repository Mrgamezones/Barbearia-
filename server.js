import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './src/app.js';
import { createBookingService } from './src/bookings.js';
import { barbers, services, shop } from './src/config.js';
import { createFileStore } from './src/store.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 3000;
const dataFile = process.env.DATA_FILE || path.join(root, 'data', 'bookings.json');

const store = createFileStore(dataFile);
const bookings = createBookingService({ store, shop, services, barbers });
const handler = createApp({
  bookings,
  shop,
  services,
  barbers,
  publicDir: path.join(root, 'public'),
  adminPassword: process.env.ADMIN_PASSWORD,
});

http.createServer(handler).listen(port, () => {
  console.log(`${shop.name} rodando em http://localhost:${port}`);
  if (!process.env.ADMIN_PASSWORD) console.log('Painel /admin desativado: defina ADMIN_PASSWORD para ativar.');
});
