import os
import sys
import json
import subprocess
import cv2

print("=== Running track_reframe.py Seeking & Crop Path Test ===")

test_video = os.path.join(os.getcwd(), "data", "test_50s_speech.mp4")
if not os.path.exists(test_video):
    print(f"Error: {test_video} does not exist")
    sys.exit(1)

start_time = 30.0
duration = 10.0

# 1. First directly verify OpenCV seeking on this video at 30s
cap = cv2.VideoCapture(test_video)
fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
start_frame = int(start_time * fps)
cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
actual_pos_msec = cap.get(cv2.CAP_PROP_POS_MSEC)
actual_frame = cap.get(cv2.CAP_PROP_POS_FRAMES)
print(f"Direct OpenCV seeking verification: target_start={start_time}s ({start_frame} frames) -> actual_pos_msec={actual_pos_msec:.1f}ms, actual_frame={actual_frame}")
assert actual_pos_msec >= 29000, f"Expected pos_msec >= 29000, got {actual_pos_msec}"
cap.release()

# 2. Run track_reframe.py on clip starting at 30s
cmd = [
    sys.executable,
    os.path.join(os.getcwd(), "scripts", "track_reframe.py"),
    "--video", test_video,
    "--start", str(start_time),
    "--duration", str(duration),
    "--mode", "auto-tracker"
]

print(f"\nExecuting: {' '.join(cmd)}")
proc = subprocess.run(cmd, capture_output=True, text=True)

if proc.returncode != 0:
    print(f"FAILED with returncode {proc.returncode}")
    print("Stderr:", proc.stderr)
    sys.exit(1)

# Parse JSON result (last line)
json_line = proc.stdout.strip().split("\n")[-1]
result = json.loads(json_line)

print("\n--- Track & Reframe Results ---")
print("Status:", result.get("status"))
print("Mode:", result.get("mode"))
print("Summary:", result.get("summary"))
print("Filter type:", result.get("filter_type"))
print("Filter value:", result.get("filter_value"))

shots = result.get("shots", [])
print(f"\nNumber of focus shots analyzed: {len(shots)}")
for i, shot in enumerate(shots):
    print(f"  Shot #{i+1}: range=[{shot.get('start')}s - {shot.get('end')}s], crop_x={shot.get('crop_x')}, pos={shot.get('position')}, label='{shot.get('label')}'")

assert result.get("status") == "success", "track_reframe.py status must be success"
assert len(shots) > 0, "Must have generated at least 1 shot"
first_shot = shots[0]
assert first_shot.get("start") == 0.0, "First shot start time in normalized clip timeline must be 0.0s"
assert first_shot.get("end") <= duration + 0.1, f"Shot end should be within clip duration {duration}s"

print("\nALL TRACK_REFRAME TESTS PASSED!\n")
