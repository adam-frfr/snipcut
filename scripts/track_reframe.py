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

def build_dynamic_crop_expr(shots, max_x=1312):
    if not shots:
        return str(max_x // 2)
    if len(shots) == 1:
        return str(shots[0]["crop_x"])

    # Build nested if(lt(t, ...), ...) expression for FFmpeg
    expr = str(shots[-1]["crop_x"])
    for i in range(len(shots) - 2, -1, -1):
        curr = shots[i]
        nxt = shots[i + 1]
        t_start = round(float(curr["end"]), 2)
        # Pan duration between 0.3s and 0.8s
        gap = nxt["start"] - curr["end"] if nxt["start"] > curr["end"] else 0.5
        pan_dur = round(max(0.3, min(0.8, gap)), 2)
        t_pan_end = round(t_start + pan_dur, 2)
        x1 = curr["crop_x"]
        x2 = nxt["crop_x"]
        pan_expr = f"({x1}+({x2}-{x1})*(t-{t_start})/{pan_dur})"
        expr = f"if(lt(t,{t_start}),{x1},if(lt(t,{t_pan_end}),{pan_expr},{expr}))"
    return expr

def run_tracking(video_path, start_time, duration, mode="auto-tracker", ai_shots_json=None):
    if not os.path.exists(video_path):
        return {"status": "error", "error": f"Video file not found: {video_path}"}

    if mode == "blurred-fit":
        return {
            "status": "success",
            "mode": "blurred-fit",
            "isDynamic": False,
            "filter_type": "filter_complex",
            "filter_value": "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=22:5[bg];[0:v]scale=1080:-1[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2",
            "summary": "16:9 full frame preserved with cinematic blurred backdrop."
        }

    if mode == "split-screen":
        return {
            "status": "success",
            "mode": "split-screen",
            "isDynamic": False,
            "filter_type": "filter_complex",
            "filter_value": "[0:v]crop=iw/2:ih:0:0,scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960[top];[0:v]crop=iw/2:ih:iw/2:0,scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960[bot];[top][bot]vstack=inputs=2",
            "summary": "Dual-subject split screen: Top (Content/Speaker 1) and Bottom (Reaction/Speaker 2)."
        }

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
            "isDynamic": False,
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

    # 9:16 crop window
    crop_w = int(height * 9.0 / 16.0)
    if crop_w % 2 != 0:
        crop_w += 1
    crop_h = height
    max_x = max(0, width - crop_w)

    # Fast sampling every ~0.4s across clip duration
    sample_interval = 0.4
    num_samples = max(3, min(60, int(duration / sample_interval)))
    frame_step = max(1, int(fps * sample_interval))

    start_frame = int(start_time * fps)
    cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)

    time_samples = []

    for i in range(num_samples):
        current_t = i * sample_interval
        if current_t > duration:
            break

        ret, frame = cap.read()
        if not ret:
            break

        center_x = None
        if detector:
            try:
                _, faces = detector.detect(frame)
                if faces is not None and len(faces) > 0:
                    best_face = max(faces, key=lambda f: f[2] * f[3])
                    fx, fy, fw, fh = best_face[0], best_face[1], best_face[2], best_face[3]
                    center_x = float(fx + (fw / 2.0))
            except Exception:
                pass

        time_samples.append((round(current_t, 2), center_x))

        # Skip ahead frame_step - 1 frames
        for _ in range(frame_step - 1):
            if not cap.grab():
                break

    cap.release()

    # Identify continuous focus shots
    # Filter out None values or impute with nearest neighbor
    valid_samples = [(t, cx) for t, cx in time_samples if cx is not None]

    shots = []
    if not valid_samples:
        # No faces detected -> Single center shot
        center_crop_x = max_x // 2
        shots.append({
            "start": 0.0,
            "end": round(duration, 2),
            "position": "center",
            "subject_center_x": width // 2,
            "crop_x": center_crop_x,
            "label": "Center Stage (Auto)",
            "details": f"Main center window (x={center_crop_x}px)"
        })
    else:
        # Group samples into clusters if position shift is > 180px
        current_cluster = [valid_samples[0]]
        clusters = []

        for item in valid_samples[1:]:
            prev_cx = np.median([x[1] for x in current_cluster])
            if abs(item[1] - prev_cx) > 180:
                clusters.append(current_cluster)
                current_cluster = [item]
            else:
                current_cluster.append(item)
        if current_cluster:
            clusters.append(current_cluster)

        # Build shot list from clusters
        for i, cluster in enumerate(clusters):
            c_times = [c[0] for c in cluster]
            c_cxs = [c[1] for c in cluster]
            s_start = min(c_times)
            s_end = max(c_times)
            if i == 0:
                s_start = 0.0
            if i == len(clusters) - 1:
                s_end = round(duration, 2)

            median_cx = float(np.median(c_cxs))
            ideal_x = int(median_cx - (crop_w / 2.0))
            clamped_x = max(0, min(ideal_x, max_x))

            # Determine position label
            if median_cx < (width * 0.38):
                pos = "left"
                label = "Speaker Reaction (Left)"
            elif median_cx > (width * 0.62):
                pos = "right"
                label = "Guest / Screen (Right)"
            else:
                pos = "center"
                label = "Main Subject (Center)"

            details = f"Active focus on {pos} at x={round(median_cx, 1)}px ({s_start:.1f}s - {s_end:.1f}s)"

            shots.append({
                "start": round(s_start, 2),
                "end": round(s_end, 2),
                "position": pos,
                "subject_center_x": round(median_cx, 1),
                "crop_x": clamped_x,
                "label": label,
                "details": details
            })

    # Generate dynamic crop expression
    dynamic_x_expr = build_dynamic_crop_expr(shots, max_x)
    vf_value = f"crop={crop_w}:{crop_h}:'{dynamic_x_expr}':0,scale=1080:1920"

    # Human-readable summary
    shot_descs = [f"{s['label']} ({s['start']}s-{s['end']}s)" for s in shots]
    summary = f"Dynamic AI Reframe: {len(shots)} keyframed focus shot{'s' if len(shots) > 1 else ''} -> {', '.join(shot_descs)}"

    return {
        "status": "success",
        "mode": "auto-tracker",
        "isDynamic": len(shots) > 1,
        "shots": shots,
        "crop_w": crop_w,
        "crop_h": crop_h,
        "filter_type": "vf",
        "filter_value": vf_value,
        "summary": summary
    }

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AI Dynamic Subject Tracking & Reframing")
    parser.add_argument("--video", required=True, help="Input video path")
    parser.add_argument("--start", type=float, default=0.0, help="Clip start time in seconds")
    parser.add_argument("--duration", type=float, default=10.0, help="Clip duration in seconds")
    parser.add_argument("--mode", default="auto-tracker", choices=["auto-tracker", "split-screen", "blurred-fit", "center"], help="Reframe mode")

    args = parser.parse_args()
    result = run_tracking(args.video, args.start, args.duration, args.mode)
    print(json.dumps(result))
