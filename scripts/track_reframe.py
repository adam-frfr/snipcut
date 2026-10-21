import sys
import os

os.environ["OPENCV_LOG_LEVEL"] = "SILENT"
os.environ["OPENCV_FFMPEG_LOGLEVEL"] = "-8"
import argparse
import json
import math

import cv2
import numpy as np

try:
    cv2.utils.logging.setLogLevel(cv2.utils.logging.LOG_LEVEL_SILENT)
except Exception:
    pass

SAMPLE_DT = 0.25  # dense sampling: 4 observations per second
TARGET_W, TARGET_H = 1080, 1920


# ---------------------------------------------------------------------------
# Camera model: a velocity/acceleration-limited spring that chases a desired
# framing. This is what separates a "virtual camera" from keyframe jumps:
# small subject movement is absorbed (dead zone), big moves become eased
# pans that accelerate and decelerate instead of snapping or sliding linearly.
# ---------------------------------------------------------------------------
class VirtualCamera:
    def __init__(self, start_x, max_x, crop_w):
        self.x = float(start_x)
        self.v = 0.0
        self.max_x = float(max_x)
        self.crop_w = float(crop_w)
        self.base_speed = 0.8 * crop_w  # px/s while following
        self.pan_speed = 1.9 * crop_w  # px/s during a deliberate speaker switch
        self.max_accel = 5.0 * crop_w  # px/s^2

    def step(self, desired_x, dt, panning=False, snap=False):
        if snap:
            self.x = float(np.clip(desired_x, 0, self.max_x))
            self.v = 0.0
            return self.x
        err = float(desired_x) - self.x
        dead = 0.07 * self.crop_w
        if abs(err) < dead and not panning:
            target_v = 0.0
        else:
            speed_cap = self.pan_speed if panning else self.base_speed
            # Arrive behaviour: slow down as we approach so pans ease out.
            target_v = float(np.clip(err * 2.8, -speed_cap, speed_cap))
        dv = float(np.clip(target_v - self.v, -self.max_accel * dt, self.max_accel * dt))
        self.v += dv
        self.x = float(np.clip(self.x + self.v * dt, 0, self.max_x))
        if self.x in (0.0, self.max_x):
            self.v = 0.0
        return self.x


def _chain_expr(keys, fallback_x):
    """Right-nested if-chain over keys [(t, x)] with a constant fallback."""
    expr = str(int(round(fallback_x)))
    for i in range(len(keys) - 2, -1, -1):
        t0, x0 = keys[i]
        t1, x1 = keys[i + 1]
        dt = max(0.01, t1 - t0)
        expr = f"if(lt(t,{t1:.2f}),{int(round(x0))}+{int(round(x1 - x0))}*(t-{t0:.2f})/{dt:.2f},{expr})"
    return expr


def _rdp(points, epsilon):
    """Ramer-Douglas-Peucker simplification of a (t, x) path."""
    if len(points) <= 2:
        return points
    (t0, x0), (t1, x1) = points[0], points[-1]
    span_t, span_x = (t1 - t0) or 1e-6, (x1 - x0)
    worst, worst_i = -1.0, -1
    for i in range(1, len(points) - 1):
        ti, xi = points[i]
        frac = (ti - t0) / span_t
        expected = x0 + span_x * frac
        err = abs(xi - expected)
        if err > worst:
            worst, worst_i = err, i
    if worst > epsilon:
        left = _rdp(points[: worst_i + 1], epsilon)
        right = _rdp(points[worst_i:], epsilon)
        return left[:-1] + right
    return [points[0], points[-1]]


def build_path_expr(keyframes, last_t):
    """keyframes: [(t, x)] -> ffmpeg expression for the camera path.

    A flat right-nested if per keyframe explodes past ffmpeg's expression
    parser limits on long/moving clips (~150 keys failed to parse), so the
    path is first simplified (RDP, ~5px tolerance) and then emitted as a
    shallow tree: an outer chain over time-groups, each an inner chain of
    at most ~14 keys."""
    if not keyframes:
        return "0"
    if len(keyframes) == 1:
        return str(int(round(keyframes[0][1])))
    keys = _rdp([(float(t), float(x)) for t, x in keyframes], 5.0)
    GROUP = 14
    if len(keys) <= GROUP + 2:
        return _chain_expr(keys, keys[-1][1])
    groups = [keys[i : i + GROUP + 1] for i in range(0, len(keys) - 1, GROUP)]
    group_exprs = [(g[-1][0], _chain_expr(g, g[-1][1])) for g in groups]
    expr = group_exprs[-1][1]
    for i in range(len(group_exprs) - 2, -1, -1):
        t_end, g_expr = group_exprs[i]
        expr = f"if(lt(t,{t_end:.2f}),{g_expr},{expr})"
    return expr


class Track:
    _next_id = 0

    def __init__(self, face, t):
        self.id = Track._next_id
        Track._next_id += 1
        self.samples = []  # (t, cx, cy, w, h, mouth_energy)
        self.last_face = face
        self.last_t = t
        self.activity = 0.0  # EMA of mouth motion * size weight
        self.speaking_time = 0.0
        self.append(face, t, 0.0)

    def append(self, face, t, mouth_energy):
        cx = face["x"] + face["w"] / 2.0
        cy = face["y"] + face["h"] / 2.0
        # Landmarks on tiny faces jitter constantly, which reads as fake
        # mouth motion; only trust mouth energy as the face gets bigger.
        reliability = min(1.0, face["w"] / 60.0)
        mouth_energy = mouth_energy * reliability
        self.samples.append((t, cx, cy, face["w"], face["h"], mouth_energy))
        size_weight = math.sqrt(max(1.0, face["w"] * face["h"])) / 100.0
        self.activity = 0.65 * self.activity + 0.35 * mouth_energy * size_weight
        self.last_face = face
        self.last_t = t

    @property
    def median_cx(self):
        return float(np.median([s[1] for s in self.samples]))

    @property
    def mean_area(self):
        return float(np.mean([s[3] * s[4] for s in self.samples]))


def mouth_energy(prev_face, face):
    """Mouth-corner motion between two observations of the same face,
    normalized by face width. YuNet landmarks: mouth corners are the last
    two landmark pairs; their midpoint/width jitter rises sharply when the
    person is talking."""
    if prev_face is None:
        return 0.0
    try:
        pm = np.array(prev_face["mouth_mid"], dtype=np.float64)
        cm = np.array(face["mouth_mid"], dtype=np.float64)
        move = float(np.linalg.norm(cm - pm)) / max(1.0, face["w"])
        width_change = abs(face["mouth_w"] - prev_face["mouth_w"]) / max(1.0, face["w"])
        return min(1.5, move * 3.0 + width_change * 4.0)
    except Exception:
        return 0.0


def detect_faces(detector, frame, min_face=18):
    _, faces = detector.detect(frame)
    out = []
    if faces is None:
        return out
    for f in faces:
        x, y, w, h = float(f[0]), float(f[1]), float(f[2]), float(f[3])
        if w < min_face or h < min_face:
            continue
        # YuNet row: [x, y, w, h, re, le, nose, mouth_r, mouth_l, score]
        try:
            mr = (float(f[10]), float(f[11]))
            ml = (float(f[12]), float(f[13]))
            mouth_mid = ((mr[0] + ml[0]) / 2.0, (mr[1] + ml[1]) / 2.0)
            mouth_w = float(np.linalg.norm(np.array(mr) - np.array(ml)))
        except Exception:
            mouth_mid = (x + w / 2.0, y + h * 0.8)
            mouth_w = w * 0.35
        out.append({"x": x, "y": y, "w": w, "h": h, "mouth_mid": mouth_mid, "mouth_w": mouth_w})
    return out


def run_tracking(video_path, start_time, duration, mode="auto-tracker", ai_shots_json=None, words=None):
    if not os.path.exists(video_path):
        return {"status": "error", "error": f"Video file not found: {video_path}"}

    if mode == "blurred-fit":
        return {
            "status": "success",
            "mode": "blurred-fit",
            "isDynamic": False,
            "filter_type": "filter_complex",
            "filter_value": "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=22:5[bg];[0:v]scale=1080:-1[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2",
            "summary": "16:9 full frame preserved with cinematic blurred backdrop.",
        }

    if mode == "split-screen":
        return {
            "status": "success",
            "mode": "split-screen",
            "isDynamic": False,
            "filter_type": "filter_complex",
            "filter_value": "[0:v]crop=iw/2:ih:0:0,scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960[top];[0:v]crop=iw/2:ih:iw/2:0,scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960[bot];[top][bot]vstack=inputs=2",
            "summary": "Dual-subject split screen: Top (Content/Speaker 1) and Bottom (Reaction/Speaker 2).",
        }

    model_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "face_detection_yunet.onnx")
    detector = None
    if os.path.exists(model_path):
        try:
            # YuNet's default score threshold (0.9) discards distant/soft
            # faces entirely; 0.6 keeps small lecture/podcast faces while
            # the tracker stage filters out transient false positives.
            detector = cv2.FaceDetectorYN.create(model_path, "", (320, 320), 0.6, 0.3, 5000)
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
            "summary": "Standard center crop.",
        }

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 1920
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 1080
    if detector:
        try:
            detector.setInputSize((width, height))
        except Exception:
            pass

    # 9:16 crop window fitted inside the source
    crop_w = int(height * 9.0 / 16.0)
    crop_h = height
    if crop_w > width:  # portrait/square source: fit by width instead
        crop_w = width
        crop_h = int(width * 16.0 / 9.0)
    if crop_w % 2:
        crop_w -= 1
    if crop_h % 2:
        crop_h -= 1
    max_x = max(0, width - crop_w)
    max_y = max(0, height - crop_h)

    # Speech gate from Whisper word timings (absolute seconds in the source)
    speech_spans = []
    if words:
        for w in words:
            try:
                speech_spans.append((float(w["start"]), float(w["end"])))
            except Exception:
                continue

    def in_speech(t_abs):
        if not speech_spans:
            return True  # no timings: don't gate
        return any(s - 0.05 <= t_abs <= e + 0.05 for s, e in speech_spans)

    Track._next_id = 0
    tracks = []
    num_samples = max(4, int(duration / SAMPLE_DT) + 1)
    frame_step = max(1, int(round(fps * SAMPLE_DT)))
    cap.set(cv2.CAP_PROP_POS_FRAMES, int(start_time * fps))

    observations = []  # per sample: {t, faces, cut, motion_centroid, motion_energy}
    prev_gray_small = None
    prev_hist = None

    for i in range(num_samples):
        t = i * SAMPLE_DT
        if t > duration:
            break
        ret, frame = cap.read()
        if not ret:
            break

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        small = cv2.resize(gray, (96, 54))
        hist = cv2.calcHist([small], [0], None, [32], [0, 256])
        hist = cv2.normalize(hist, hist).flatten()
        cut = False
        if prev_hist is not None:
            corr = float(np.corrcoef(prev_hist, hist)[0, 1])
            cut = corr < 0.55
        prev_hist = hist

        motion_centroid, motion_energy = None, 0.0
        if prev_gray_small is not None:
            diff = cv2.absdiff(small, prev_gray_small)
            _, diff = cv2.threshold(diff, 22, 255, cv2.THRESH_BINARY)
            m = cv2.moments(diff)
            motion_energy = float(np.count_nonzero(diff)) / diff.size
            if m["m00"] > 0 and motion_energy > 0.01:
                motion_centroid = (
                    (m["m10"] / m["m00"]) / 96.0 * width,
                    (m["m01"] / m["m00"]) / 54.0 * height,
                )
        prev_gray_small = small

        faces = []
        if detector:
            try:
                faces = detect_faces(detector, frame, min_face=max(14, int(width * 0.028)))
                if not faces and width <= 960:
                    # Small faces vanish at native resolution: retry once on a
                    # 2x upscale and map the boxes back to source coordinates.
                    big = cv2.resize(frame, (width * 2, height * 2), interpolation=cv2.INTER_CUBIC)
                    detector.setInputSize((width * 2, height * 2))
                    try:
                        faces = detect_faces(detector, big, min_face=max(20, int(width * 0.05)))
                        for f in faces:
                            f["x"] /= 2.0
                            f["y"] /= 2.0
                            f["w"] /= 2.0
                            f["h"] /= 2.0
                            f["mouth_mid"] = (f["mouth_mid"][0] / 2.0, f["mouth_mid"][1] / 2.0)
                            f["mouth_w"] /= 2.0
                    finally:
                        detector.setInputSize((width, height))
            except Exception:
                faces = []

        # --- identity tracking: greedy nearest-centre assignment -----------
        # On a scene cut the same person teleports and changes size, so
        # position stops being evidence: match on size similarity alone.
        is_cut = prev_hist is not None and cut
        unmatched = list(faces)
        live_tracks = [tr for tr in tracks if t - tr.last_t <= SAMPLE_DT * 2.5]
        for tr in sorted(live_tracks, key=lambda tr: -tr.mean_area):
            if not unmatched:
                break
            pcx = tr.last_face["x"] + tr.last_face["w"] / 2.0
            pcy = tr.last_face["y"] + tr.last_face["h"] / 2.0

            def cost(f):
                cx = f["x"] + f["w"] / 2.0
                cy = f["y"] + f["h"] / 2.0
                dist = math.hypot(cx - pcx, cy - pcy) / max(1.0, tr.last_face["w"])
                size_delta = abs(f["w"] - tr.last_face["w"]) / max(1.0, tr.last_face["w"])
                if is_cut:
                    return size_delta
                return dist + 0.5 * size_delta

            best = min(unmatched, key=cost)
            if cost(best) < (0.9 if is_cut else 1.1):
                energy = mouth_energy(tr.last_face, best) if in_speech(start_time + t) else 0.0
                tr.append(best, t, energy)
                if energy > 0.12:
                    tr.speaking_time += SAMPLE_DT
                unmatched.remove(best)
        for f in unmatched:
            tracks.append(Track(f, t))
        if len(tracks) > 16:
            # Prune stale micro-tracks first; never drop a track seen just now.
            stale = [tr for tr in tracks if t - tr.last_t > 2.0 and len(tr.samples) < 3]
            stale.sort(key=lambda tr: len(tr.samples))
            for tr in stale:
                if len(tracks) <= 16:
                    break
                tracks.remove(tr)
            if len(tracks) > 16:
                tracks.sort(key=lambda tr: (tr.last_t, len(tr.samples)), reverse=True)
                tracks = tracks[:16]

        observations.append({"t": round(t, 2), "cut": cut, "motion_centroid": motion_centroid, "motion_energy": motion_energy})

        for _ in range(frame_step - 1):
            if not cap.grab():
                break

    cap.release()

    if os.environ.get("TRACK_DEBUG"):
        for tr in tracks:
            sys.stderr.write(
                f"track {tr.id}: samples={len(tr.samples)} span={tr.samples[0][0] if tr.samples else '-'}..{tr.samples[-1][0] if tr.samples else '-'} speaking={tr.speaking_time:.1f} area={tr.mean_area:.0f}\n"
            )
        sys.stderr.write(f"observations={len(observations)} faces_seen={sum(1 for o in observations)}\n")

    # Discard one-frame wonders unless they're all we have
    solid = [tr for tr in tracks if len(tr.samples) >= max(3, num_samples * 0.12)]
    if not solid and tracks:
        solid = [max(tracks, key=lambda tr: len(tr.samples))]
    tracks = solid

    # --- decide focus per sample -------------------------------------------
    # Pick a PRIMARY subject per scene segment and stick to them. Choosing
    # "the most active face" per-sample gets hijacked by audience faces and
    # background movement in wide shots; a real reframe system commits to a
    # subject per shot. Primary score favours tracks that actually speak,
    # are on screen a lot, and are prominent.
    cut_set = {obs["t"] for obs in observations if obs["cut"]}
    segments = []  # (t_start, t_end)
    seg_start = 0.0
    for obs in observations:
        if obs["cut"] and obs["t"] > seg_start + 0.5:
            segments.append((seg_start, obs["t"]))
            seg_start = obs["t"]
    segments.append((seg_start, duration))

    def track_in_segment(tr, t0, t1):
        return [s for s in tr.samples if t0 - 0.01 <= s[0] <= t1 + 0.01]

    segment_primary = {}
    for (t0, t1) in segments:
        best, best_score = None, -1.0
        for tr in tracks:
            ss = track_in_segment(tr, t0, t1)
            if not ss:
                continue
            presence = len(ss) * SAMPLE_DT
            speaking = sum(SAMPLE_DT for s in ss if s[5] > 0.12)
            score = speaking * 2.0 + presence + math.sqrt(tr.mean_area) / 40.0
            if score > best_score:
                best, best_score = tr, score
        segment_primary[(t0, t1)] = best

    def primary_for(t):
        for (t0, t1), tr in segment_primary.items():
            if t0 - 0.01 <= t <= t1 + 0.01:
                return tr
        return None

    def nearest_sample(tr, t, tol):
        if tr is None or not tr.samples:
            return None
        s = min(tr.samples, key=lambda s: abs(s[0] - t))
        return s if abs(s[0] - t) <= tol else None

    raw_focus = []  # (t, cx, cy, track_id or None)
    last_face_t = -10.0
    for obs in observations:
        t = obs["t"]
        primary = primary_for(t)
        s = nearest_sample(primary, t, SAMPLE_DT * 2.2)
        if s is not None:
            last_face_t = t
            raw_focus.append((t, s[1], s[2], primary.id))
            continue
        # Primary briefly missing: use another present face from this segment
        present = []
        for tr in tracks:
            ps = nearest_sample(tr, t, SAMPLE_DT * 1.6)
            if ps is not None:
                present.append((tr, ps))
        if present and (t - last_face_t) <= 2.0:
            chosen = max(present, key=lambda ps: ps[0].mean_area)
            raw_focus.append((t, chosen[1][1], chosen[1][2], chosen[0].id))
            continue
        if obs["motion_centroid"] is not None and obs["motion_energy"] > 0.03 and (t - last_face_t) > 1.5:
            raw_focus.append((t, obs["motion_centroid"][0], obs["motion_centroid"][1], None))
        elif raw_focus:
            raw_focus.append((t, raw_focus[-1][1], raw_focus[-1][2], raw_focus[-1][3]))
        else:
            raw_focus.append((t, width / 2.0, height / 2.0, None))

    # Median-of-3 kills single-sample detection spikes; the EMA (tau ~0.45s)
    # then gives the camera a target that glides instead of twitching.
    focus = []
    alpha = 1.0 - math.exp(-SAMPLE_DT / 0.45)
    sm_x = sm_y = None
    for i, (t, cx, cy, tid) in enumerate(raw_focus):
        window = [raw_focus[j][1] for j in range(max(0, i - 1), min(len(raw_focus), i + 2))]
        med_x = float(np.median(window))
        window_y = [raw_focus[j][2] for j in range(max(0, i - 1), min(len(raw_focus), i + 2))]
        med_y = float(np.median(window_y))
        if sm_x is None:
            sm_x, sm_y = med_x, med_y
        else:
            sm_x += alpha * (med_x - sm_x)
            sm_y += alpha * (med_y - sm_y)
        focus.append((t, sm_x, sm_y, tid))

    # --- run the virtual camera ---------------------------------------------
    cut_times = {obs["t"] for obs in observations if obs["cut"]}
    start_cx = focus[0][1] if focus else width / 2.0
    cam = VirtualCamera(np.clip(start_cx - crop_w / 2.0, 0, max_x), max_x, crop_w)
    cam_y = VirtualCamera(np.clip((focus[0][2] if focus else height / 2.0) - crop_h * 0.38, 0, max_y), max_y, crop_h) if max_y > 0 else None

    keyframes = []
    keyframes_y = []
    prev_track = focus[0][3] if focus else None
    prev_cx = focus[0][1] if focus else width / 2.0
    pan_until = -1.0
    for idx, (t, cx, cy, tid) in enumerate(focus):
        if tid is not None and prev_track is not None and tid != prev_track:
            pan_until = t + 1.1  # deliberate switch: allow the faster pan profile briefly
        if tid is not None:
            prev_track = tid
        desired_x = np.clip(cx - crop_w / 2.0, 0, max_x)
        snap = any(abs(t - ct) < SAMPLE_DT * 0.6 for ct in cut_times)
        # Histogram correlation misses cuts between similar-looking angles of
        # the same room; a focus teleport with a track change is a cut too.
        if tid is not None and focus[idx - 1][3] is not None and tid != focus[idx - 1][3] and abs(cx - prev_cx) > 0.9 * crop_w:
            snap = True
        prev_cx = cx
        x = cam.step(desired_x, SAMPLE_DT, panning=(t <= pan_until), snap=snap)
        keyframes.append((t, x))
        if cam_y is not None:
            desired_y = np.clip(cy - crop_h * 0.38, 0, max_y)
            y = cam_y.step(desired_y, SAMPLE_DT, panning=(t <= pan_until), snap=snap)
            keyframes_y.append((t, y))

    # Thin keyframes: keep points where direction/value changes meaningfully
    def thin(keys, tol=3.5):
        if len(keys) <= 2:
            return keys
        out = [keys[0]]
        for i in range(1, len(keys) - 1):
            if abs(keys[i][1] - out[-1][1]) >= tol or abs(keys[i][1] - keys[i + 1][1]) >= tol:
                out.append(keys[i])
        out.append(keys[-1])
        return out

    keys_x = thin(keyframes)
    expr_x = build_path_expr(keys_x, duration)
    if cam_y is not None:
        keys_y = thin(keyframes_y)
        expr_y = build_path_expr(keys_y, duration)
    else:
        expr_y = "0"

    vf_value = f"crop={crop_w}:{crop_h}:'{expr_x}':'{expr_y}',scale=1080:1920"

    # Shots for the editor UI: contiguous runs of the same focus track
    shots = []
    run_start = 0.0
    run_tid = focus[0][3] if focus else None
    run_cx = focus[0][1] if focus else width / 2.0
    for (t, cx, cy, tid) in focus[1:]:
        if tid != run_tid:
            shots.append({"start": round(run_start, 2), "end": round(t, 2), "track": run_tid, "subject_center_x": round(run_cx, 1), "crop_x": int(np.clip(run_cx - crop_w / 2, 0, max_x))})
            run_start, run_tid, run_cx = t, tid, cx
    if focus:
        shots.append({"start": round(run_start, 2), "end": round(duration, 2), "track": run_tid, "subject_center_x": round(run_cx, 1), "crop_x": int(np.clip(run_cx - crop_w / 2, 0, max_x))})
    display_no = {}
    for tr in sorted(tracks, key=lambda tr: tr.samples[0][0] if tr.samples else 0):
        display_no[tr.id] = len(display_no) + 1
    for s in shots:
        cxv = s["subject_center_x"]
        s["position"] = "left" if cxv < width * 0.38 else "right" if cxv > width * 0.62 else "center"
        s["label"] = "Motion subject" if s["track"] is None else f"Speaker {display_no.get(s['track'], s['track'] + 1)} ({s['position']})"
        s["details"] = f"Tracked focus {s['start']:.1f}s-{s['end']:.1f}s"

    # Layout suggestion: two real speakers, both talk, too far apart for one frame
    layout_suggestion = None
    if len(tracks) >= 2:
        talkers = [tr for tr in tracks if tr.speaking_time >= duration * 0.15]
        if len(talkers) >= 2:
            spread = abs(talkers[0].median_cx - talkers[1].median_cx)
            if spread > crop_w * 0.92:
                layout_suggestion = "split-screen"

    travelled = sum(abs(keys_x[i + 1][1] - keys_x[i][1]) for i in range(len(keys_x) - 1)) if len(keys_x) > 1 else 0
    if os.environ.get("TRACK_DEBUG"):
        rev = 0
        last_dir = 0
        for i in range(1, len(keys_x)):
            d = keys_x[i][1] - keys_x[i - 1][1]
            if abs(d) > 1:
                s = 1 if d > 0 else -1
                if last_dir and s != last_dir:
                    rev += 1
                last_dir = s
        sys.stderr.write(f"camera: keys={len(keys_x)} travelled={travelled:.0f} reversals={rev} range={min(k[1] for k in keys_x):.0f}..{max(k[1] for k in keys_x):.0f} max_x={max_x}\n")
        sys.stderr.write("path: " + " ".join(f"{k[0]:.0f}:{k[1]:.0f}" for k in keys_x[::6]) + "\n")
    summary = (
        f"Premium tracking v2: {len(tracks)} subject(s), {len(shots)} focus segment(s), "
        f"camera travelled {int(travelled)}px with eased pans"
        + (f"; layout suggestion: {layout_suggestion}" if layout_suggestion else "")
    )

    return {
        "status": "success",
        "mode": "auto-tracker",
        "version": 2,
        "isDynamic": len(keys_x) > 1,
        "shots": shots,
        "speakers": len(tracks),
        "layoutSuggestion": layout_suggestion,
        "crop_w": crop_w,
        "crop_h": crop_h,
        "filter_type": "vf",
        "filter_value": vf_value,
        "summary": summary,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Premium subject tracking & reframing (v2)")
    parser.add_argument("--video", required=True)
    parser.add_argument("--start", type=float, default=0.0)
    parser.add_argument("--duration", type=float, default=10.0)
    parser.add_argument("--mode", default="auto-tracker", choices=["auto-tracker", "split-screen", "blurred-fit", "center"])
    parser.add_argument("--words", default=None, help="Path to JSON [{start,end}] word timings (absolute seconds)")

    args = parser.parse_args()
    words = None
    if args.words and os.path.exists(args.words):
        try:
            words = json.load(open(args.words))
        except Exception:
            words = None
    result = run_tracking(args.video, args.start, args.duration, args.mode, words=words)
    print(json.dumps(result))
