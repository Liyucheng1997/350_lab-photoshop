import { app } from '../core/app.js';
import { moveTool } from './transform.js';
import { rectMarqueeTool, ellipseMarqueeTool, lassoTool, polyLassoTool, magicWandTool } from './select.js';
import { cropTool } from './crop.js';
import { eyedropperTool } from './eyedropper.js';
import { brushTool, pencilTool, eraserTool, cloneTool } from './brush.js';
import { gradientTool, paintBucketTool } from './fill.js';
import { textTool } from './text.js';
import { rectShapeTool, ellipseShapeTool, polygonShapeTool, lineShapeTool } from './shape.js';
import { handTool, zoomTool } from './nav.js';

/** Toolbar slots, each a group of tools sharing a shortcut (like Photoshop's flyouts). */
export const TOOL_GROUPS = [
  [moveTool],
  [rectMarqueeTool, ellipseMarqueeTool],
  [lassoTool, polyLassoTool],
  [magicWandTool],
  [cropTool],
  [eyedropperTool],
  '-',
  [brushTool, pencilTool],
  [cloneTool],
  [eraserTool],
  [gradientTool, paintBucketTool],
  '-',
  [textTool],
  [rectShapeTool, ellipseShapeTool, polygonShapeTool, lineShapeTool],
  '-',
  [handTool],
  [zoomTool],
];

export function registerTools() {
  for (const g of TOOL_GROUPS) if (Array.isArray(g)) g.forEach((t) => app.registerTool(t));
}

/** Tool shortcuts: pressing the key selects the group's current tool; Shift+key cycles the group. */
const groupCurrent = new Map();
export function currentInGroup(group) {
  return groupCurrent.get(group) || group[0];
}
export function setGroupCurrent(tool) {
  const g = TOOL_GROUPS.find((gr) => Array.isArray(gr) && gr.includes(tool));
  if (g) groupCurrent.set(g, tool);
}

export function toolForKey(key, cycle) {
  const groups = TOOL_GROUPS.filter((g) => Array.isArray(g) && g[0].key === key);
  if (!groups.length) return null;
  const activeGroup = groups.find((g) => g.includes(app.tool));
  if (cycle && activeGroup && activeGroup.length > 1) {
    const i = activeGroup.indexOf(app.tool);
    return activeGroup[(i + 1) % activeGroup.length];
  }
  if (activeGroup) return app.tool;
  return currentInGroup(groups[0]);
}

app.on('tool', (t) => setGroupCurrent(t));
