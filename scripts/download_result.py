#!/usr/bin/env python3
"""Try to get the interpolated video result from FAL."""
import os
import sys
import urllib.request

sys.stdout.reconfigure(line_buffering=True)

# The uploaded video URL from the log
VIDEO_URL = "https://v3b.fal.media/files/b/0a862d14/NTawbrudOivZ14YxRYVI2_hero-background-pingpong-seamless.mp4"
OUTPUT = "/Users/peteromalley/Documents/reigh/public/hero-background-interpolated.mp4"

import fal_client

def on_queue_update(update):
    if isinstance(update, fal_client.InProgress):
        for log in update.logs:
            print(f"[FAL] {log['message']}")

print("Re-running RIFE with already-uploaded video...")
print(f"Video URL: {VIDEO_URL}")

result = fal_client.subscribe(
    "fal-ai/rife/video",
    arguments={
        "video_url": VIDEO_URL,
        "num_frames": 2,
        "use_calculated_fps": True,
    },
    with_logs=True,
    on_queue_update=on_queue_update,
)

print(f"\nResult: {result}")

if result and 'video' in result and 'url' in result['video']:
    output_url = result['video']['url']
    print(f"\nDownloading from: {output_url}")
    urllib.request.urlretrieve(output_url, OUTPUT)
    print(f"Saved to: {OUTPUT}")
else:
    print("No video URL in result")

