import { cpSync, mkdirSync } from 'node:fs';
mkdirSync('public/mathlive', { recursive: true });
cpSync('node_modules/mathlive/fonts', 'public/mathlive/fonts', { recursive: true });
cpSync('node_modules/mathlive/mathlive-fonts.css', 'public/mathlive/mathlive-fonts.css');
cpSync('node_modules/mathlive/mathlive-static.css', 'public/mathlive/mathlive-static.css');
cpSync('assets/icon.svg', 'public/icon.svg');
