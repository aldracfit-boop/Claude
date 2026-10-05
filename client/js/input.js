// Gestion de la souris et du clavier sur la scène de jeu.

import { TILE } from '../../shared/constants.js';
import { TOWER_LIST } from '../../shared/data/towers.js';
import { ABILITIES } from '../../shared/data/team.js';

export class Input {
  constructor(view) {
    this.view = view;
    this.canvas = view.hud.canvas;
    this.onMove = this.onMove.bind(this);
    this.onDown = this.onDown.bind(this);
    this.onKey = this.onKey.bind(this);
    this.onLeave = this.onLeave.bind(this);
    this.onContext = (e) => e.preventDefault();
    this.canvas.addEventListener('mousemove', this.onMove);
    this.canvas.addEventListener('mousedown', this.onDown);
    this.canvas.addEventListener('mouseleave', this.onLeave);
    this.canvas.addEventListener('contextmenu', this.onContext);
    window.addEventListener('keydown', this.onKey);
    this.gHeld = false;
    this.onKeyUp = (e) => {
      if (e.key && e.key.toLowerCase() === 'g') this.gHeld = false;
    };
    window.addEventListener('keyup', this.onKeyUp);
  }

  destroy() {
    this.canvas.removeEventListener('mousemove', this.onMove);
    this.canvas.removeEventListener('mousedown', this.onDown);
    this.canvas.removeEventListener('mouseleave', this.onLeave);
    this.canvas.removeEventListener('contextmenu', this.onContext);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  worldPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    return { ...this.view.renderer.toWorld(px, py), px, py };
  }

  onLeave() {
    const ui = this.view.ui;
    ui.hoverTile = null;
    ui.mouseWorld = null;
    ui.hoverTowerId = null;
    ui.hoverEnemyId = null;
    this.view.hud.tooltip(null);
  }

  onMove(e) {
    const ui = this.view.ui;
    const p = this.worldPos(e);
    ui.mouseWorld = p;
    const c = Math.floor(p.x / TILE);
    const r = Math.floor(p.y / TILE);
    ui.hoverTile = { c, r };
    const state = this.view.state;
    const t = state.towerAtTile(c, r);
    ui.hoverTowerId = t ? t.id : null;
    const en = t ? null : state.enemyAt(p.x, p.y);
    ui.hoverEnemyId = en ? en.id : null;
    let tip = null;
    if (en && !ui.placing && !ui.abilityTarget) {
      const d = en.def;
      tip = `<b>${esc(d.name)}</b>${d.boss ? ' · Boss' : d.miniboss ? ' · Mini-boss' : ''}<br>PV ${Math.ceil(en.hp)} / ${Math.ceil(en.max)}${en.ar ? ` · Armure ${en.ar}` : ''}<div class="d">${esc(d.desc)}</div>`;
    } else if (t && !ui.placing && !ui.moving && !ui.fusionSel) {
      const snap = state.snap;
      const owners = (t.os || [t.o]).map((o) => esc(snap.players[o]?.name || '?')).join(' & ');
      tip = `<b>${esc(this.view.towerName(t))}</b> · Niv. ${t.l}<br>DPS ${t.st.dps} · Portée ${t.st.range}<div class="d">${owners}</div>`;
    }
    this.view.hud.tooltip(tip, p.px, p.py);
  }

  onDown(e) {
    const v = this.view;
    const ui = v.ui;
    v.audioInit();
    const p = this.worldPos(e);
    if (e.button === 2) {
      v.cancelModes(true);
      return;
    }
    if (e.button === 1 || e.altKey || ui.pingMode || this.gHeld) {
      e.preventDefault();
      v.send({ a: 'ping', x: p.x, y: p.y, k: e.shiftKey ? 'danger' : 'here' });
      ui.pingMode = false;
      return;
    }
    if (e.button !== 0) return;
    const c = Math.floor(p.x / TILE);
    const r = Math.floor(p.y / TILE);
    if (ui.abilityTarget) {
      v.send({ a: 'ability', i: ui.abilityTarget.i, x: p.x, y: p.y });
      ui.abilityTarget = null;
      return;
    }
    if (ui.fusionSel) {
      const t = v.state.towerAtTile(c, r);
      if (t && ui.fusionSel.candidates.has(t.id)) v.toggleFusionPick(t.id);
      else v.cancelModes();
      return;
    }
    if (ui.placing) {
      if (ui.canPlaceAt(c, r)) {
        v.send({ a: 'place', tt: ui.placing, c, r });
        if (!e.shiftKey) ui.placing = null;
      } else {
        const t = v.state.towerAtTile(c, r);
        if (t) {
          ui.placing = null;
          v.select(t.id);
        } else v.audio('err');
      }
      return;
    }
    if (ui.moving) {
      if (ui.canPlaceAt(c, r)) v.send({ a: 'move', id: ui.moving, c, r });
      ui.moving = null;
      return;
    }
    const t = v.state.towerAtTile(c, r);
    if (t) {
      v.select(t.id);
      return;
    }
    const en = v.state.enemyAt(p.x, p.y, 8);
    if (en) {
      ui.selectedId = null;
      ui.selectedEnemyId = en.id;
      return;
    }
    ui.selectedId = null;
    ui.selectedEnemyId = null;
  }

  onKey(e) {
    const v = this.view;
    const ui = v.ui;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.ctrlKey || e.metaKey) return;
    v.audioInit();
    // chiffres : position physique (fonctionne aussi en AZERTY)
    const digit = /^Digit([1-9])$/.exec(e.code) || /^Numpad([1-9])$/.exec(e.code);
    if (digit) {
      const def = TOWER_LIST[+digit[1] - 1];
      if (def) {
        e.preventDefault();
        v.actions.place(def.id);
      }
      return;
    }
    const k = (e.key || '').toLowerCase();
    const ab = ABILITIES.findIndex((a) => a.key === k);
    if (ab >= 0) {
      e.preventDefault();
      v.actions.ability(ab);
      return;
    }
    switch (k) {
      case ' ':
      case 'spacebar':
        e.preventDefault();
        v.actions.ready();
        break;
      case 'escape':
        if (!v.cancelModes(true)) v.actions.menu();
        break;
      case 'f':
        if (ui.selectedId) v.actions.fuse(ui.selectedId);
        break;
      case 'm':
        if (ui.selectedId) v.actions.move(ui.selectedId);
        break;
      case 'c':
        if (ui.selectedId) v.cycleTarget(ui.selectedId);
        break;
      case 'delete':
      case 'backspace':
        if (ui.selectedId) {
          e.preventDefault();
          v.sellWithConfirm(ui.selectedId);
        }
        break;
      case 'g':
        this.gHeld = true;
        ui.pingMode = true;
        break;
      case 'tab':
        if (v.session.hotSeat) {
          e.preventDefault();
          v.actions.switchPlayer();
        }
        break;
      case 'p':
        v.actions.pause();
        break;
      case 'enter':
        if (v.hud.el.chatInput) {
          e.preventDefault();
          v.hud.el.chatInput.focus();
        }
        break;
      default:
        break;
    }
  }
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
