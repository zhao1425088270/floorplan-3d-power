import tempfile
import unittest
from pathlib import Path

import cv2
import numpy as np

from parse_floorplan import analyze_floorplan


class WallDetectionTests(unittest.TestCase):
    def analyze(self, image):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "中文户型图.png"
            cv2.imencode(".png", image)[1].tofile(str(path))
            return analyze_floorplan(path)

    def test_connected_walls_keep_partition_and_exclude_dimensions(self):
        image = np.full((700, 800, 3), 255, np.uint8)
        cv2.rectangle(image, (120, 130), (650, 600), (0, 0, 0), 12)
        cv2.line(image, (390, 130), (390, 600), (0, 0, 0), 12)
        cv2.line(image, (70, 80), (730, 80), (0, 0, 0), 2)
        cv2.line(image, (70, 80), (70, 660), (0, 0, 0), 2)
        result = self.analyze(image)
        walls = result['walls']
        self.assertGreaterEqual(len(walls), 5)
        self.assertTrue(any(abs(w['x1'] - 390) < 8 and abs(w['x2'] - 390) < 8
                            and abs(w['z2'] - w['z1']) > 400 for w in walls))
        self.assertTrue(all(min(w['x1'], w['x2']) > 100 and min(w['z1'], w['z2']) > 110 for w in walls))

    def test_door_gap_is_not_joined_by_thin_door_leaf(self):
        image = np.full((700, 800, 3), 255, np.uint8)
        cv2.rectangle(image, (120, 130), (650, 600), (0, 0, 0), 12)
        cv2.line(image, (390, 130), (390, 320), (0, 0, 0), 12)
        cv2.line(image, (390, 420), (390, 600), (0, 0, 0), 12)
        cv2.line(image, (390, 320), (390, 420), (0, 0, 0), 1)
        walls = self.analyze(image)['walls']
        partitions = [w for w in walls if abs(w['x1']-390) < 8 and abs(w['x2']-390) < 8]
        self.assertEqual(len(partitions), 2)
        self.assertFalse(any(min(w['z1'], w['z2']) < 370 < max(w['z1'], w['z2']) for w in partitions))

    def test_blank_has_no_walls(self):
        self.assertEqual(self.analyze(np.full((500, 600, 3), 255, np.uint8))['walls'], [])

    def test_paired_thin_partition_becomes_one_wall(self):
        image = np.full((700, 800, 3), 255, np.uint8)
        cv2.rectangle(image, (120, 130), (650, 600), (0, 0, 0), 14)
        cv2.line(image, (384, 130), (384, 600), (0, 0, 0), 1)
        cv2.line(image, (396, 130), (396, 600), (0, 0, 0), 1)
        walls = self.analyze(image)['walls']
        partitions = [w for w in walls if abs(w['x1']-390) < 12 and abs(w['x2']-390) < 12]
        self.assertEqual(len(partitions), 1)
        self.assertGreater(partitions[0]['thickness'], 8)

    def test_invalid_image_gives_clear_error(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'invalid.png'
            path.write_bytes(b'not an image')
            with self.assertRaises(ValueError):
                analyze_floorplan(path)


if __name__ == '__main__':
    unittest.main()
