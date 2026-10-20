import boundary from './vietnam-boundary.json' with { type: 'json' };

type Point = readonly number[];
type Ring = readonly Point[];
type Polygon = readonly Ring[];
const polygons = boundary.features.flatMap((feature) => feature.geometry.coordinates) as Polygon[];

function onSegment(point: Point, a: Point, b: Point) {
  const [x, y] = point as [number, number],
    [ax, ay] = a as [number, number],
    [bx, by] = b as [number, number];
  const cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax);
  return (
    Math.abs(cross) < 1e-12 &&
    x >= Math.min(ax, bx) &&
    x <= Math.max(ax, bx) &&
    y >= Math.min(ay, by) &&
    y <= Math.max(ay, by)
  );
}
function inRing(point: Point, ring: Ring) {
  let inside = false;
  const [x, y] = point as [number, number];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!,
      b = ring[j]!;
    if (onSegment(point, a, b)) return true;
    const [ax, ay] = a as [number, number],
      [bx, by] = b as [number, number];
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

/** Offline ADM0 polygon test; country text and SerpApi's regional hint are never proof. */
export function isVietnamCoordinate(coordinates: { latitude: number; longitude: number }) {
  if (!Number.isFinite(coordinates.latitude) || !Number.isFinite(coordinates.longitude))
    return false;
  const point = [coordinates.longitude, coordinates.latitude];
  return polygons.some(
    (polygon) =>
      polygon.length &&
      inRing(point, polygon[0]!) &&
      !polygon.slice(1).some((hole) => inRing(point, hole)),
  );
}
