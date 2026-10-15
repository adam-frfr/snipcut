import sys
import os
os.environ["OPENCV_LOG_LEVEL"] = "SILENT"
os.environ["OPENCV_FFMPEG_LOGLEVEL"] = "-8"
import argparse
import json
import cv2
import numpy as np

try:
    cv2.utils.logging.setLogLevel(cv2.utils.logging.LOG_LEVEL_SILENT)
except Exception:
    pass

def run_tracking(video_path, start_time, duration, mode="auto-tracker"):
    if not os.path.exists(video_path):
        return {"status": "error", "error": f"Video file not found: {video_path}"}

    if mode == "blurred-fit":
        return {
            "status": "success",
            "mode": "blurred-fit",
            "filter_type": "filter_complex",
            "filter_value": "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:5[bg];[0:v]scale=1080:-1[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2",
            "summary": "Full 16:9 frame preserved with dynamic blurred background."
        }

    if mode == "split-screen":
        return {
            "status": "success",
            "mode": "split-screen",
            "filter_type": "filter_complex",
            "filter_value": "[0:v]crop=iw/2:ih:0:0,scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960[top];[0:v]crop=iw/2:ih:iw/2:0,scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960[bot];[top][bot]vstack=inputs=2",
            "summary": "Dual-subject split screen (top/bottom stacked) layout."
        }

    # Auto Reframe (AI Subject Tracking)
    model_path = os.path.join(os.path.dirname(__file__), "face_detection_yunet.onnx")
    detector = None
    if os.path.exists(model_path):
        try:
            detector = cv2.FaceDetectorYN.create(model_path, "", (320, 320))
        except Exception as e:
            sys.stderr.write(f"Warning: Failed to init FaceDetectorYN: {e}\n")

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return {
            "status": "success",
            "mode": "center",
            "filter_type": "vf",
            "filter_value": "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",
            "summary": "Standard center crop."
        }

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 1920
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 1080

    if detector:
        try:
            detector.setInputSize((width, height))
        except Exception:
            pass

    # Sample frames across clip duration (every 0.5s)
    sample_interval = 0.5
    num_samples = max(2, min(30, int(duration / sample_interval)))
    detected_centers = []

    for i in range(num_samples):
        timestamp = start_time + (i * duration / float(num_samples))
        frame_idx = int(timestamp * fps)
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
        ret, frame = cap.read()
        if not ret:
            continue

        if detector:
            try:
                _, faces = detector.detect(frame)
                if faces is not None and len(faces) > 0:
                    # Pick largest face by area (w * h)
                    best_face = max(faces, key=lambda f: f[2] * f[3])
                    fx, fy, fw, fh = best_face[0], best_face[1], best_face[2], best_face[3]
                    center_x = fx + (fw / 2.0)
                    detected_centers.append(float(center_x))
            except Exception:
                pass

    cap.release()

    # Calculate 9:16 crop window
    # For a 16:9 video of height H, 9:16 width is H * 9 / 16
    crop_w = int(height * 9.0 / 16.0)
    # Ensure crop_w is even
    if crop_w % 2 != 0:
        crop_w += 1
    crop_h = height
    max_x = max(0, width - crop_w)

    if detected_centers:
        # Use median to avoid outliers from occasional background faces
        median_center_x = float(np.median(detected_centers))
        ideal_crop_x = int(median_center_x - (crop_w / 2.0))
        clamped_crop_x = max(0, min(ideal_crop_x, max_x))

        return {
            "status": "success",
            "mode": "auto-tracker",
            "filter_type": "vf",
            "filter_value": f"crop={crop_w}:{crop_h}:{clamped_crop_x}:0,scale=1080:1920",
            "subject_center_x": round(median_center_x, 1),
            "crop_x": clamped_crop_x,
            "crop_w": crop_w,
            "crop_h": crop_h,
            "summary": f"AI Subject tracked at x={round(median_center_x, 1)}px. Centered 9:16 crop applied."
        }
    else:
        # Fallback to center crop
        center_x = max_x // 2
        return {
            "status": "success",
            "mode": "auto-tracker",
            "filter_type": "vf",
            "filter_value": f"crop={crop_w}:{crop_h}:{center_x}:0,scale=1080:1920",
            "subject_center_x": width // 2,
            "crop_x": center_x,
            "crop_w": crop_w,
            "crop_h": crop_h,
            "summary": "Centered 9:16 crop applied (no face detected)."
        }

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AI Subject Tracking and Reframing for 9:16 Shorts")
    parser.add_argument("--video", required=True, help="Input video path")
    parser.add_argument("--start", type=float, default=0.0, help="Clip start time in seconds")
    parser.add_argument("--duration", type=float, default=10.0, help="Clip duration in seconds")
    parser.add_argument("--mode", default="auto-tracker", choices=["auto-tracker", "split-screen", "blurred-fit", "center"], help="Reframe mode")

    args = parser.parse_args()
    result = run_tracking(args.video, args.start, args.duration, args.mode)
    print(json.dumps(result))
