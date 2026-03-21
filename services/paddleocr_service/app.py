from fastapi import FastAPI, UploadFile, File, HTTPException
from paddleocr import PaddleOCR
from PIL import Image
import io
import tempfile
import os

app = FastAPI(title="PaddleOCR Service")

ocr = PaddleOCR(
    use_angle_cls=True,
    lang="en"
)

@app.post("/ocr")
async def run_ocr(file: UploadFile = File(...)):
    try:
        content = await file.read()
        suffix = os.path.splitext(file.filename or "upload.jpg")[1] or ".jpg"

        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        result = ocr.ocr(tmp_path, cls=True)

        pages = []
        if result:
            page_index = 1
            tokens = []
            confidences = []

            for line in result[0] if isinstance(result[0], list) else result:
                if not line or len(line) < 2:
                    continue

                box = line[0]
                text_info = line[1]

                text = text_info[0] if len(text_info) > 0 else ""
                confidence = float(text_info[1]) if len(text_info) > 1 else 0.0

                tokens.append({
                    "text": text,
                    "confidence": confidence,
                    "bounding_poly": [
                        {"x": float(pt[0]), "y": float(pt[1])} for pt in box
                    ]
                })
                confidences.append(confidence)

            avg_conf = sum(confidences) / len(confidences) if confidences else 0.0

            pages.append({
                "page_number": page_index,
                "raw_text": " ".join([t["text"] for t in tokens]).strip(),
                "confidence": avg_conf,
                "tokens": tokens
            })

        try:
            os.remove(tmp_path)
        except Exception:
            pass

        return {
            "ok": True,
            "pages": pages
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))