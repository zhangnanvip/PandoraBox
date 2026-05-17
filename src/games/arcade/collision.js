export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function rectFromCenter(point, w, h = w) {
  return { x: point.x - w / 2, y: point.y - h / 2, w, h };
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function withinDistance(a, b, maxDistance) {
  return distance(a, b) <= maxDistance;
}

export function circlesOverlap(a, b) {
  return distance(a, b) <= (a.r || a.radius || 0) + (b.r || b.radius || 0);
}

export function circleRectOverlap(circle, rect) {
  const nearest = {
    x: clamp(circle.x, rect.x, rect.x + rect.w),
    y: clamp(circle.y, rect.y, rect.y + rect.h)
  };
  return distance(circle, nearest) <= (circle.r || circle.radius || 0);
}

export function pointInRect(point, rect) {
  return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
}

export function gridKey(cell) {
  return `${cell.x},${cell.y}`;
}

export function sameGridCell(a, b) {
  return a.x === b.x && a.y === b.y;
}

export function gridCellInBounds(cell, columns, rows = columns) {
  return cell.x >= 0 && cell.y >= 0 && cell.x < columns && cell.y < rows;
}
