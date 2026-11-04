// Создаёт доверенный локальный сертификат через mkcert для ПК и телефона в той же Wi‑Fi сети.
// Запуск: npm run certs   (нужен установленный mkcert, см. README)
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { networkInterfaces } from 'node:os';

const ips = Object.values(networkInterfaces())
  .flat()
  .filter((n) => n && n.family === 'IPv4' && !n.internal)
  .map((n) => n.address);

mkdirSync('certs', { recursive: true });
const hosts = ['localhost', '127.0.0.1', ...ips];
console.log('Сертификат для:', hosts.join(', '));
try {
  execFileSync('mkcert', ['-install'], { stdio: 'inherit' });
  execFileSync('mkcert', ['-key-file', 'certs/key.pem', '-cert-file', 'certs/cert.pem', ...hosts], { stdio: 'inherit' });
  const caroot = execFileSync('mkcert', ['-CAROOT']).toString().trim();
  console.log('\nГотово. Корневой сертификат для телефона лежит здесь:\n  ' + caroot + '\n(файл rootCA.pem, установи его на телефон по инструкции в README)');
} catch {
  console.error('\nНе нашёл mkcert. Установи его (README, раздел «Телефон») и запусти команду ещё раз.');
  process.exit(1);
}
