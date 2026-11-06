# Bundled vision models

All from [OpenCV Zoo](https://github.com/opencv/opencv_zoo), run with OpenCV's DNN module (no extra installs).

| File | Used for | License |
|---|---|---|
| `face_detection_yunet.onnx` | Face tracking (`track_reframe.py`), face blur (`frame_fx.py`) on OpenCV 4.8+ | MIT |
| `face_detection_yunet_2022mar.onnx` | The same, on OpenCV 4.6 (Debian / the Docker image) — the newer model can't run there | MIT |
| `human_segmentation_pphumanseg_2023mar.onnx` | Person cut-out: background swap, title behind the speaker, subject glow (`frame_fx.py`) | Apache 2.0 |

Both scripts pick the face model that actually runs on the installed OpenCV.
