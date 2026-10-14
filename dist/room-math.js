'use strict';
// Geometry for the room preview (room.html). Pure functions, so Node tests can check them.
// A placement is {x, y, width, rotation}: the centre of the product in stage pixels, its drawn width,
// and its rotation in degrees, clockwise. The product's height is width * aspect (height / width of its image).
(() => {
  const MIN_WIDTH = 24;
  const MAX_ROOM_SIDE = 1600;
  const SNAP_DEGREES = 4;

  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const toRadians = (degrees) => (degrees * Math.PI) / 180;

  // A photo is scaled down to fit, never up, so a big phone photo stays quick to draw.
  function fitWithin(width, height, max = MAX_ROOM_SIDE) {
    const scale = Math.min(1, max / Math.max(width, height));
    return {width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale))};
  }

  const maxWidth = (stage) => Math.max(MIN_WIDTH, stage.width);

  function startPlacement(stage, aspect) {
    let width = stage.width * 0.28;
    if (width * aspect > stage.height * 0.4) width = (stage.height * 0.4) / aspect;
    return {x: stage.width / 2, y: stage.height / 2, width: clamp(width, MIN_WIDTH, maxWidth(stage)), rotation: 0};
  }

  function toLocal(point, placement) {
    const angle = -toRadians(placement.rotation);
    const dx = point.x - placement.x;
    const dy = point.y - placement.y;
    return {x: dx * Math.cos(angle) - dy * Math.sin(angle), y: dx * Math.sin(angle) + dy * Math.cos(angle)};
  }

  function toWorld(local, placement) {
    const angle = toRadians(placement.rotation);
    return {
      x: placement.x + local.x * Math.cos(angle) - local.y * Math.sin(angle),
      y: placement.y + local.x * Math.sin(angle) + local.y * Math.cos(angle),
    };
  }

  function hitItem(point, placement, aspect, pad = 12) {
    const local = toLocal(point, placement);
    return Math.abs(local.x) <= placement.width / 2 + pad && Math.abs(local.y) <= (placement.width * aspect) / 2 + pad;
  }

  // The resize handle sits on the bottom right corner. The rotate handle floats above the top edge.
  function handlePoints(placement, aspect, offset = 34) {
    const half = {x: placement.width / 2, y: (placement.width * aspect) / 2};
    return {
      resize: toWorld({x: half.x, y: half.y}, placement),
      rotate: toWorld({x: 0, y: -half.y - offset}, placement),
    };
  }

  function hitHandle(point, placement, aspect, radius = 18, offset = 34) {
    const points = handlePoints(placement, aspect, offset);
    for (const name of ['rotate', 'resize']) {
      if (Math.hypot(point.x - points[name].x, point.y - points[name].y) <= radius) return name;
    }
    return null;
  }

  function widthFromPointer(point, placement, aspect, stage) {
    const local = toLocal(point, placement);
    const width = (2 * Math.hypot(local.x, local.y)) / Math.hypot(1, aspect);
    return clamp(width, MIN_WIDTH, maxWidth(stage));
  }

  function normaliseAngle(degrees) {
    const wrapped = ((((degrees + 180) % 360) + 360) % 360) - 180;
    return wrapped === -180 ? 180 : wrapped;
  }

  function rotationFromPointer(point, placement, snap = true) {
    const degrees = normaliseAngle((Math.atan2(point.y - placement.y, point.x - placement.x) * 180) / Math.PI + 90);
    if (!snap) return degrees;
    for (const target of [0, 90, 180, -90]) {
      if (Math.abs(normaliseAngle(degrees - target)) <= SNAP_DEGREES) return normaliseAngle(target);
    }
    return degrees;
  }

  function moveTo(placement, point, stage) {
    return {...placement, x: clamp(point.x, 0, stage.width), y: clamp(point.y, 0, stage.height)};
  }

  // Keyboard control: arrows move, + and - resize, [ and ] rotate. Shift moves in bigger steps.
  function nudge(placement, key, {shift = false, stage} = {}) {
    const step = shift ? 20 : 4;
    const moves = {ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step]};
    if (moves[key]) return moveTo(placement, {x: placement.x + moves[key][0], y: placement.y + moves[key][1]}, stage);
    if (key === '+' || key === '=') return {...placement, width: clamp(placement.width * 1.05, MIN_WIDTH, maxWidth(stage))};
    if (key === '-' || key === '_') return {...placement, width: clamp(placement.width / 1.05, MIN_WIDTH, maxWidth(stage))};
    if (key === '[') return {...placement, rotation: normaliseAngle(placement.rotation - (shift ? 15 : 5))};
    if (key === ']') return {...placement, rotation: normaliseAngle(placement.rotation + (shift ? 15 : 5))};
    return null;
  }

  // Screen pixels (clientX, clientY inside the canvas's on-screen box) to stage pixels.
  function toStagePoint(clientX, clientY, rect, stage) {
    return {x: ((clientX - rect.left) * stage.width) / rect.width, y: ((clientY - rect.top) * stage.height) / rect.height};
  }

  const api = {MIN_WIDTH, MAX_ROOM_SIDE, clamp, toRadians, fitWithin, maxWidth, startPlacement, toLocal, toWorld, hitItem,
    handlePoints, hitHandle, widthFromPointer, normaliseAngle, rotationFromPointer, moveTo, nudge, toStagePoint};
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.FIRoomMath = api;
})();
