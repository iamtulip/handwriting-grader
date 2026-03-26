#services/paddle_ocr_service.py
from fastapi import FastAPI
from pydantic import BaseModel
from paddleocr import PaddleOCR
import base64
import numpy as np
import cv2

app = FastAPI()
ocr = PaddleOCR(use_angle_cls=True, lang='en')

class OCRRequest(BaseModel):
    image_base64: str

@app.post("/ocr/paddle")
def paddle_ocr(req: OCRRequest):
    image_bytes = base64.b64decode(req.image_base64)
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)

    result = ocr.ocr(img, cls=True)

    texts = []
    confs = []

    for page in result:
        if not page:
          continue
        for line in page:
            txt = line[1][0]
            conf = float(line[1][1])
            texts.append(txt)
            confs.append(conf)

    text = " ".join(texts).strip()
    confidence = sum(confs) / len(confs) if confs else 0.0

    return {
        "text": text,
        "confidence": confidence
    }