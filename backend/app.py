from pathlib import Path
from uuid import uuid4

import cv2
from flask import Flask, request, jsonify
from flask_cors import CORS

from parse_floorplan import analyze_floorplan

app = Flask(__name__)
CORS(app)
UPLOAD_FOLDER = Path(__file__).resolve().parent.parent / "uploads"
UPLOAD_FOLDER.mkdir(exist_ok=True)
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024


@app.route("/upload", methods=["POST"])
def upload():
    file = request.files.get("file")
    if file is None or not file.filename:
        return jsonify(error="请先选择一张户型图。"), 400
    suffix = Path(file.filename).suffix.lower()
    if suffix not in {".png", ".jpg", ".jpeg", ".bmp", ".webp"}:
        return jsonify(error="请上传 PNG、JPG、BMP 或 WebP 图片。"), 400
    path = UPLOAD_FOLDER / f"{uuid4().hex}{suffix}"
    file.save(path)
    try:
        result = analyze_floorplan(path, Path(__file__).with_name("debug.png"))
    except (ValueError, cv2.error):
        path.unlink(missing_ok=True)
        return jsonify(error="图片无法识别，请换一张清晰的户型图。"), 400
    return jsonify(result)


@app.errorhandler(413)
def too_large(error):
    return jsonify(error="图片不能超过 20 MB。"), 413


if __name__ == "__main__":
    app.run(port=5000, debug=True)
