#!/usr/bin/env python3
"""
Interpolate the hero background video using FAL's RIFE model.
This doubles the frame count, allowing smoother slow-motion playback.
"""
import os
import sys
import fal_client
import urllib.request

# Force unbuffered output
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

# Video paths
INPUT_VIDEO = os.path.join(os.path.dirname(__file__), '..', 'public', 'hero-background-pingpong-seamless.mp4')
OUTPUT_VIDEO = os.path.join(os.path.dirname(__file__), '..', 'public', 'hero-background-interpolated.mp4')

def on_queue_update(update):
    if isinstance(update, fal_client.InProgress):
        for log in update.logs:
            print(f"[FAL] {log['message']}")

def main():
    print(f"Input video: {INPUT_VIDEO}")
    print(f"Output video: {OUTPUT_VIDEO}")
    
    # Check input exists
    if not os.path.exists(INPUT_VIDEO):
        print(f"Error: Input video not found at {INPUT_VIDEO}")
        sys.exit(1)
    
    # Upload video to FAL
    print("\nUploading video to FAL...")
    video_url = fal_client.upload_file(INPUT_VIDEO)
    print(f"Uploaded: {video_url}")
    
    # Run RIFE interpolation
    # num_frames=2 doubles the frame count (inserts 1 frame between each pair)
    print("\nRunning RIFE interpolation (this may take a few minutes)...")
    result = fal_client.subscribe(
        "fal-ai/rife/video",
        arguments={
            "video_url": video_url,
            "num_frames": 2,  # Double the frames
            "use_calculated_fps": True,
        },
        with_logs=True,
        on_queue_update=on_queue_update,
    )
    
    print(f"\nResult: {result}")
    
    # Download the interpolated video
    if result and 'video' in result and 'url' in result['video']:
        output_url = result['video']['url']
        print(f"\nDownloading interpolated video from: {output_url}")
        urllib.request.urlretrieve(output_url, OUTPUT_VIDEO)
        print(f"Saved to: {OUTPUT_VIDEO}")
        print("\nDone! Update HomePage.tsx to use 'hero-background-interpolated.mp4'")
    else:
        print("Error: No video URL in result")
        print(result)
        sys.exit(1)

if __name__ == "__main__":
    main()
