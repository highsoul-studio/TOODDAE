// 画面上の枠 ({ x, y, width, height }) どうしの位置関係。
export const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

// 重なっている組み合わせの番号 ([i, j] の配列)。空なら全部離れている
export const overlappingPairs = (boxes) => boxes.flatMap((a, i) => boxes.slice(i + 1).map((b, k) => [i, i + 1 + k, overlaps(a, b)])).filter((p) => p[2]).map((p) => [p[0], p[1]]);
