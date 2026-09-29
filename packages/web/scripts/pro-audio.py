"""PA-03: deterministic offline audio conversion; FFmpeg 6.1.1 in Docker."""
import subprocess

def encode(source, target):
    codec = ['-c:a', 'libvorbis', '-q:a', '4', '-serial_offset', '0'] if target.suffix == '.ogg' else ['-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart']
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(source),
                    '-map_metadata', '-1', '-map_metadata:s:a', '-1', '-ac', '1', '-ar', '44100',
                    '-flags', '+bitexact', '-fflags', '+bitexact', *codec, str(target)], check=True)
