"""Extract axis-aligned wall strips from clean raster floor plans."""
from pathlib import Path
import json

import cv2
import numpy as np


def analyze_floorplan(image_path, debug_path=None):
    # np.fromfile also supports Chinese filenames on Windows.
    image = cv2.imdecode(np.fromfile(image_path, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("无法读取图片，请上传 PNG 或 JPG 图片。")
    original_height, original_width = image.shape[:2]
    scale = min(1.0, 1600 / max(original_width, original_height))
    if scale < 1:
        image = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    # Neutral dark strokes: suppress colored room labels without erasing black walls.
    chroma = image.max(axis=2).astype(np.int16) - image.min(axis=2).astype(np.int16)
    binary = np.uint8((gray < 180) & (chroma < 90)) * 255
    connected = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    count, labels, stats, _ = cv2.connectedComponentsWithStats(connected)
    height, width = gray.shape

    # The architectural network covers a substantial two-dimensional region.
    # Dimension strings outside it are long but narrow, and must not become walls.
    candidates = [i for i in range(1, count)
                  if stats[i, cv2.CC_STAT_WIDTH] > width * 0.15
                  and stats[i, cv2.CC_STAT_HEIGHT] > height * 0.15]
    if candidates:
        main = max(candidates, key=lambda i: int(stats[i, cv2.CC_STAT_AREA]))
        x, y, w, h = map(int, stats[main, :4])
        structure = np.uint8(labels == main) * 255
        # Include detached long walls inside the main plan, but not text-sized blobs.
        for i in range(1, count):
            bx, by, bw, bh, area = map(int, stats[i])
            if (i != main and x <= bx and y <= by and bx + bw <= x + w
                    and by + bh <= y + h and max(bw, bh) >= min(w, h) * 0.18
                    and max(bw, bh) > min(bw, bh) * 4):
                structure[labels == i] = 255
    else:
        # Also support simple drawings with separated strokes, e.g. two sample walls.
        structure = connected
        points = cv2.findNonZero(structure)
        x, y, w, h = cv2.boundingRect(points) if points is not None else (0, 0, width, height)

    distance = cv2.distanceTransform(structure, cv2.DIST_L2, 5)
    core = distance[distance > 2]
    thickness = float(np.percentile(core, 85) * 2) if core.size else max(3, min(w, h) * 0.018)
    thickness = int(np.clip(round(thickness), 3, max(3, min(w, h) * 0.04)))
    min_length = max(20, round(min(w, h) * 0.045))
    bridge = max(3, round(thickness * 1.25))
    walls = []

    for horizontal in (True, False):
        # Opening isolates long directional strokes. Closing ACROSS those strokes
        # fills paired wall outlines without sealing gaps along a wall (doorways).
        along = (min_length, 1) if horizontal else (1, min_length)
        across = (1, bridge) if horizontal else (bridge, 1)
        mask = cv2.morphologyEx(structure, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, along))
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, across))
        _, strip_labels, strips, _ = cv2.connectedComponentsWithStats(mask)
        for label, (bx, by, bw, bh, area) in enumerate(strips[1:], 1):
            bx, by, bw, bh, area = map(int, (bx, by, bw, bh, area))
            length, depth = (bw, bh) if horizontal else (bh, bw)
            if length < min_length or length < depth * 2.5:
                continue
            local = strip_labels[by:by + bh, bx:bx + bw] == label
            support = local.sum(axis=0 if horizontal else 1)
            # A thin door leaf connecting two thick strips must not seal the opening.
            minimum_depth = max(1, round(thickness * 0.25)) if core.size else 1
            valid = support >= minimum_depth
            changes = np.diff(np.r_[False, valid, False].astype(np.int8))
            for start, stop in zip(np.flatnonzero(changes == 1), np.flatnonzero(changes == -1)):
                if stop - start < min_length:
                    continue
                rows, cols = np.where(local[:, start:stop] if horizontal else local[start:stop, :])
                center = float(np.median(rows if horizontal else cols))
                if horizontal:
                    ends = (bx + start, by + center, bx + stop - 1, by + center)
                else:
                    ends = (bx + center, by + start, bx + center, by + stop - 1)
                wall_depth = float(np.median(support[start:stop]))
                walls.append({
                    "id": f"w{len(walls) + 1}",
                    **dict(zip(("x1", "z1", "x2", "z2"), (round(v / scale, 2) for v in ends))),
                    "thickness": round(max(3, min(wall_depth, thickness * 1.5)) / scale, 2),
                })

    result = {
        "walls": walls,
        "image_size": {"width": original_width, "height": original_height},
        "bounds": {"x": round(x / scale, 2), "y": round(y / scale, 2),
                   "width": round(w / scale, 2), "height": round(h / scale, 2)},
    }
    if debug_path is not None:
        debug = image.copy()
        for wall in walls:
            a = tuple(round(wall[k] * scale) for k in ("x1", "z1"))
            b = tuple(round(wall[k] * scale) for k in ("x2", "z2"))
            cv2.line(debug, a, b, (40, 160, 245), max(2, round(wall["thickness"] * scale)), cv2.LINE_AA)
        debug = cv2.addWeighted(image, 0.5, debug, 0.5, 0)
        cv2.rectangle(debug, (x, y), (x + w - 1, y + h - 1), (180, 130, 30), 2)
        success, encoded = cv2.imencode(".png", debug)
        if success:
            encoded.tofile(str(debug_path))
    return result


def detect_walls(image_path):
    return analyze_floorplan(image_path, Path(__file__).with_name("debug.png"))["walls"]


if __name__ == "__main__":
    result = analyze_floorplan("floorplan.png", "debug.png")
    Path("walls.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(f"识别到 {len(result['walls'])} 段墙线")
