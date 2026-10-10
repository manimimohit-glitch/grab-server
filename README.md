# Grab — YouTube downloader backend

Local FastAPI + yt-dlp server for `youtube-downloader.html`.

## Setup

```powershell
cd C:\Users\hp\LOVE\grab-server
pip install -r requirements.txt
# ffmpeg is required for audio (mp3/m4a/wav) and for muxing mp4
winget install ffmpeg        # Windows
# brew install ffmpeg        # macOS
ffmpeg -version              # verify
```

## Run

```powershell
uvicorn app:app --port 8000 --reload
# health check
curl http://127.0.0.1:8000/health
```

Keep it running, then open `C:\Users\hp\LOVE\youtube-downloader.html` by double-clicking —
the page auto-detects the server at `http://127.0.0.1:8000` and switches to real downloads.
If the server is not running, the page falls back to title/thumbnail preview + demo file.

## API

- `GET /health` — `{ok, ffmpeg}`
- `GET /api/info?url=...` — `{id, kind, title, channel, thumbnail, url}`
- `GET /api/grab?url=...&fmt=mp4-720` — file download (`Content-Disposition: attachment`)

Formats: `mp4-1080` `mp4-720` `mp4-480` `mp4-360` `mp3-320` `mp3-128` `m4a-128` `wav`
Kinds: `video` `shorts` `music` (auto-detected from URL).

## Notes

- CORS is `*` so `file://` works.
- Files are cached in the OS temp dir (`grab/`). Re-grab of the same `id+fmt` is instant.
- Respect creators — only save content you have the right to keep.
