// Переименовывает собранный файл в game.html, чтобы его было легко найти.
import { renameSync } from 'node:fs';
renameSync('dist-single/index.html', 'dist-single/game.html');
console.log('Готово: dist-single/game.html — открой двойным кликом.');
