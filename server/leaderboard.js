// Classement en ligne persistant (fichier JSON).

import fs from 'node:fs';
import path from 'node:path';

export class Leaderboard {
  constructor(file) {
    this.file = file;
    this.entries = [];
    this.saveT = null;
    try {
      const raw = fs.readFileSync(file, 'utf8');
      const data = JSON.parse(raw);
      if (Array.isArray(data)) this.entries = data.filter((e) => e && typeof e.wave === 'number').slice(0, 100);
    } catch {
      this.entries = [];
    }
  }

  add(entry) {
    this.entries.push(entry);
    this.entries.sort((a, b) => b.wave - a.wave || a.date - b.date);
    this.entries = this.entries.slice(0, 100);
    this.scheduleSave();
  }

  top(n) {
    return this.entries.filter((e) => e.mode === 'endless').slice(0, n);
  }

  scheduleSave() {
    clearTimeout(this.saveT);
    this.saveT = setTimeout(() => {
      fs.mkdir(path.dirname(this.file), { recursive: true }, () => {
        fs.writeFile(this.file, JSON.stringify(this.entries), () => {});
      });
    }, 1000);
  }
}
