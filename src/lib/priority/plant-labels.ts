export type LabelBounds = { left: number; right: number; top: number; bottom: number };

/** Fit between existing labels instead of trying only a few fixed vertical rows. */
export function chooseCalloutLeader(x: number, y: number, halfWidth: number, height: number, width: number, viewportHeight: number, preferred: number, occupied: LabelBounds[]) {
  const candidates = [preferred, 24, 62, 106, 150, 194, 238, y-height-82,
    ...occupied.flatMap(box => [y-box.top+6, y-height-box.bottom-6])];
  return candidates.find(length => {
    if (length < 12) return false;
    const box = { left: x-halfWidth, right: x+halfWidth, top: y-length-height, bottom: y-length };
    return box.left >= 4 && box.right <= width-4 && box.top >= 82 && box.bottom < viewportHeight-58 &&
      !occupied.some(other => box.left < other.right && box.right > other.left && box.top < other.bottom+5 && box.bottom+5 > other.top);
  });
}
