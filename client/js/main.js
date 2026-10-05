// Point d'entrée du client.

import { App } from './app.js';

const app = new App(document.getElementById('app'));
app.start();

// Accès de débogage depuis la console.
window.tdf = app;
