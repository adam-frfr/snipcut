"""
Per-frame video effects that need computer vision (run by the effects pass).

  python frame_fx.py mask <input> <output.mp4> <ffmpeg>
      Person mask video (white = person) for background swap, text behind
      the speaker and the subject glow. PP-HumanSeg (OpenCV Zoo, Apache 2.0),
      smoothed over time so edges don't flicker.

  python frame_fx.py blur <input> <output.mp4> <ffmpeg> <others|all>
      The same video with faces blurred: everyone, or everyone except the
      main speaker (the biggest face). YuNet face detector.

Frames are read with OpenCV and written through an ffmpeg pipe (H.264).
Prints one JSON line with stats on stdout.
"""
import json
import os
import subprocess
import sys

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SEG_MODEL = os.path.join(HERE, "human_segmentation_pphumanseg_2023mar.onnx")
ERODE_K = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))



def make_face_detector(size, score=0.6):
    """YuNet that runs on this OpenCV: 2023 model (OpenCV >= 4.8), else the 2022 model (OpenCV 4.6)."""
    for name in ("face_detection_yunet.onnx", "face_detection_yunet_2022mar.onnx"):
        path = os.path.join(HERE, name)
        if not os.path.exists(path):
            continue
        try:
            # The 2022 model gives more false faces at the same score: be stricter.
            sc = max(score, 0.8) if "2022" in name else score
            d = cv2.FaceDetectorYN.create(path, "", size, sc, 0.3, 5000)
            d.detect(np.zeros((size[1], size[0], 3), np.uint8))
            return d
        except Exception:
            continue
    return None

def open_writer(ffmpeg, out_path, w, h, fps, pix_fmt):
    cmd = [
        ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
        "-f", "rawvideo", "-pix_fmt", pix_fmt, "-s", f"{w}x{h}", "-r", f"{fps:.3f}", "-i", "-",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", out_path,
    ]
    return subprocess.Popen(cmd, stdin=subprocess.PIPE)


def video_props(cap):
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    if not (1.0 <= fps <= 120.0):
        fps = 30.0
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    return fps, w, h


def segment_square(net, img):
    """Person probability (192x192) for a square image."""
    rgb = cv2.cvtColor(cv2.resize(img, (192, 192), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2RGB)
    blob = ((rgb.astype(np.float32) / 255.0) - 0.5) / 0.5
    blob = np.transpose(blob, (2, 0, 1))[np.newaxis, ...]
    net.setInput(blob)
    out_t = net.forward()[0]  # (2, 192, 192): background, person
    diff = out_t[1] - out_t[0]
    # Works for logits and for probabilities (diff in [-1, 1]).
    scale = 4.0 if np.abs(diff).max() <= 1.0001 else 1.0
    return 1.0 / (1.0 + np.exp(-diff * scale))


def parse_spans(arg):
    spans = []
    for part in (arg or "").split(","):
        if "-" in part:
            a, b = part.split("-", 1)
            try:
                spans.append((float(a), float(b)))
            except ValueError:
                pass
    return spans


def run_mask(inp, out, ffmpeg, spans=None):
    net = cv2.dnn.readNetFromONNX(SEG_MODEL)
    cap = cv2.VideoCapture(inp)
    if not cap.isOpened():
        raise RuntimeError("cannot open input")
    fps, w, h = video_props(cap)
    # Mask at half size (even dims); ffmpeg scales it back up and feathers it.
    mw, mh = max(2, (w // 2) // 2 * 2), max(2, (h // 2) // 2 * 2)
    writer = open_writer(ffmpeg, out, mw, mh, fps, "gray")
    prev = None
    frames = 0
    coverage = 0.0
    tops = []
    counted = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        # Whole frame at once: the model needs to see the whole body.
        m = cv2.resize(segment_square(net, frame).astype(np.float32), (mw, mh), interpolation=cv2.INTER_LINEAR)
        # Temporal smoothing: steadier edges, still follows movement.
        m = m if prev is None else 0.55 * m + 0.45 * prev
        prev = m
        # Firm core, soft edge (tight enough to drop stray background bits).
        mm = np.clip((m - 0.45) / 0.25, 0.0, 1.0)
        # The low-res model spills a little past the body: pull the edge in.
        mm = cv2.erode(mm, ERODE_K)
        t = frames / fps
        # Stats only on the talking-head shots (where the cut-out is used).
        in_span = not spans or any(a - 0.05 <= t <= b for a, b in spans)
        if in_span:
            coverage += float(mm.mean())
            counted += 1
        # Top of the person (head) over the first ~3 s: where a title can
        # sit so only its bottom edge goes behind the head.
        if in_span and len(tops) < 90:
            rows = np.where(mm.mean(axis=1) > 0.12)[0]
            if rows.size:
                tops.append(rows[0] / float(mh))
        writer.stdin.write((mm * 255).astype(np.uint8).tobytes())
        frames += 1
    cap.release()
    writer.stdin.close()
    writer.wait()
    head_top = float(np.median(tops)) if tops else None
    return {"frames": frames, "personCoverage": round(coverage / max(1, counted), 4), "headTop": head_top, "fps": fps}


def iou(a, b):
    ax2, ay2, bx2, by2 = a[0] + a[2], a[1] + a[3], b[0] + b[2], b[1] + b[3]
    iw = max(0, min(ax2, bx2) - max(a[0], b[0]))
    ih = max(0, min(ay2, by2) - max(a[1], b[1]))
    inter = iw * ih
    union = a[2] * a[3] + b[2] * b[3] - inter
    return inter / union if union > 0 else 0.0


def run_blur(inp, out, ffmpeg, mode):
    cap = cv2.VideoCapture(inp)
    if not cap.isOpened():
        raise RuntimeError("cannot open input")
    fps, w, h = video_props(cap)
    det_w = min(640, w)
    det_h = int(round(h * det_w / w))
    detector = make_face_detector((det_w, det_h))
    if detector is None:
        raise RuntimeError("no YuNet face model works with this OpenCV")
    s = w / det_w
    writer = open_writer(ffmpeg, out, w, h, fps, "bgr24")
    tracks = []  # [box, ttl]
    frames = 0
    blurred = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        # Detect on every other frame (faces barely move in 1/30 s).
        if frames % 2 == 0 or not tracks:
            small = cv2.resize(frame, (det_w, det_h))
            _, faces = detector.detect(small)
            boxes = []
            if faces is not None:
                for f in faces:
                    x, y, fw, fh = [float(v) * s for v in f[:4]]
                    boxes.append([x, y, fw, fh])
            # Keep faces for a few frames when detection blinks (no flicker).
            new_tracks = []
            for b in boxes:
                new_tracks.append([b, 8])
            for t in tracks:
                if not any(iou(t[0], b) > 0.3 for b in boxes) and t[1] > 1:
                    new_tracks.append([t[0], t[1] - 1])
            tracks = new_tracks
        targets = [t[0] for t in tracks]
        if mode == "others" and targets:
            main = max(targets, key=lambda b: b[2] * b[3])
            targets = [b for b in targets if b is not main and iou(b, main) < 0.3]
        for (x, y, fw, fh) in targets:
            pad_w, pad_h = fw * 0.3, fh * 0.35
            x0, y0 = int(max(0, x - pad_w)), int(max(0, y - pad_h))
            x1, y1 = int(min(w, x + fw + pad_w)), int(min(h, y + fh + pad_h))
            if x1 - x0 < 4 or y1 - y0 < 4:
                continue
            roi = frame[y0:y1, x0:x1]
            rw, rh = x1 - x0, y1 - y0
            # Heavy blur, fast: shrink a lot, enlarge, then soften the blocks.
            # ~8 px across whatever the face size: unrecognisable, not just soft.
            tw = 8
            th = max(2, int(round(tw * rh / float(rw))))
            tiny = cv2.resize(roi, (tw, th), interpolation=cv2.INTER_AREA)
            # Smooth (bicubic) upscale + a small blur hides the blocks cheaply.
            blur = cv2.GaussianBlur(cv2.resize(tiny, (rw, rh), interpolation=cv2.INTER_CUBIC), (21, 21), 0)
            mask = np.zeros((max(2, rh // 4), max(2, rw // 4)), np.uint8)
            cv2.ellipse(mask, (mask.shape[1] // 2, mask.shape[0] // 2), (mask.shape[1] // 2, mask.shape[0] // 2), 0, 0, 360, 255, -1)
            mask = cv2.resize(cv2.GaussianBlur(mask, (7, 7), 0), (rw, rh)).astype(np.float32)[..., None] / 255.0
            frame[y0:y1, x0:x1] = (blur * mask + roi * (1 - mask)).astype(np.uint8)
            blurred += 1
        writer.stdin.write(frame.tobytes())
        frames += 1
    cap.release()
    writer.stdin.close()
    writer.wait()
    return {"frames": frames, "facesBlurred": blurred, "fps": fps}


def main():
    if len(sys.argv) < 5:
        print(json.dumps({"ok": False, "error": "usage"}))
        return 2
    cmd, inp, out, ffmpeg = sys.argv[1:5]
    try:
        if cmd == "mask":
            stats = run_mask(inp, out, ffmpeg, parse_spans(sys.argv[5] if len(sys.argv) > 5 else ""))
        elif cmd == "blur":
            stats = run_blur(inp, out, ffmpeg, sys.argv[5] if len(sys.argv) > 5 else "others")
        else:
            raise RuntimeError("unknown command")
        ok = os.path.exists(out) and os.path.getsize(out) > 0 and stats["frames"] > 0
        print(json.dumps({"ok": ok, **stats}))
        return 0 if ok else 1
    except Exception as e:  # reported to the caller, never fatal for the clip
        print(json.dumps({"ok": False, "error": str(e)}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
