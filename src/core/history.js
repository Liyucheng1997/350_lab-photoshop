export const MAX_HISTORY = 60;

/** Linear list of document snapshots. `index` points at the current state. */
export class History {
  constructor() {
    this.states = [];
    this.index = -1;
  }

  push(name, snapshot, icon) {
    this.states.length = this.index + 1;
    this.states.push({ name, snapshot, icon, time: Date.now() });
    if (this.states.length > MAX_HISTORY) this.states.splice(1, this.states.length - MAX_HISTORY);
    this.index = this.states.length - 1;
  }

  get current() {
    return this.states[this.index];
  }

  get canUndo() {
    return this.index > 0;
  }

  get canRedo() {
    return this.index < this.states.length - 1;
  }

  undo() {
    if (!this.canUndo) return null;
    this.index--;
    return this.current;
  }

  redo() {
    if (!this.canRedo) return null;
    this.index++;
    return this.current;
  }

  jump(i) {
    if (i < 0 || i >= this.states.length) return null;
    this.index = i;
    return this.current;
  }
}
