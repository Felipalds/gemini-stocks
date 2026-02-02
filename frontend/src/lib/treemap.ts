/**
 * Squarified treemap layout algorithm.
 * Takes items with values and a container rectangle, returns positioned rectangles.
 */

export interface TreemapItem {
  id: string;
  value: number;
}

export interface TreemapRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  value: number;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function worstAspectRatio(row: number[], length: number, totalArea: number): number {
  const rowSum = row.reduce((a, b) => a + b, 0);
  if (rowSum === 0) return Infinity;
  const rowMax = Math.max(...row);
  const rowMin = Math.min(...row);
  const s2 = rowSum * rowSum;
  const l2 = length * length;
  return Math.max((l2 * rowMax) / s2, s2 / (l2 * rowMin));
}

function layoutRow(row: number[], ids: string[], rect: Rect, isHorizontal: boolean): { rects: TreemapRect[]; remaining: Rect } {
  const rowSum = row.reduce((a, b) => a + b, 0);
  const rects: TreemapRect[] = [];

  if (isHorizontal) {
    const rowWidth = rowSum / rect.height;
    let y = rect.y;
    for (let i = 0; i < row.length; i++) {
      const h = row[i] / rowWidth;
      rects.push({ id: ids[i], x: rect.x, y, width: rowWidth, height: h, value: row[i] });
      y += h;
    }
    return {
      rects,
      remaining: { x: rect.x + rowWidth, y: rect.y, width: rect.width - rowWidth, height: rect.height },
    };
  } else {
    const rowHeight = rowSum / rect.width;
    let x = rect.x;
    for (let i = 0; i < row.length; i++) {
      const w = row[i] / rowHeight;
      rects.push({ id: ids[i], x, y: rect.y, width: w, height: rowHeight, value: row[i] });
      x += w;
    }
    return {
      rects,
      remaining: { x: rect.x, y: rect.y + rowHeight, width: rect.width, height: rect.height - rowHeight },
    };
  }
}

export function squarify(items: TreemapItem[], containerWidth: number, containerHeight: number): TreemapRect[] {
  if (items.length === 0) return [];

  const totalValue = items.reduce((s, i) => s + i.value, 0);
  if (totalValue === 0) return [];

  const totalArea = containerWidth * containerHeight;

  // Normalize values to areas
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const areas = sorted.map((i) => (i.value / totalValue) * totalArea);
  const ids = sorted.map((i) => i.id);

  const result: TreemapRect[] = [];
  let rect: Rect = { x: 0, y: 0, width: containerWidth, height: containerHeight };
  let index = 0;

  while (index < areas.length) {
    const isHorizontal = rect.width < rect.height;
    const length = isHorizontal ? rect.height : rect.width;

    const row: number[] = [];
    const rowIds: string[] = [];

    row.push(areas[index]);
    rowIds.push(ids[index]);
    let worst = worstAspectRatio(row, length, totalArea);
    index++;

    while (index < areas.length) {
      const newRow = [...row, areas[index]];
      const newWorst = worstAspectRatio(newRow, length, totalArea);
      if (newWorst > worst) break;
      row.push(areas[index]);
      rowIds.push(ids[index]);
      worst = newWorst;
      index++;
    }

    const { rects, remaining } = layoutRow(row, rowIds, rect, isHorizontal);
    result.push(...rects);
    rect = remaining;
  }

  return result;
}
