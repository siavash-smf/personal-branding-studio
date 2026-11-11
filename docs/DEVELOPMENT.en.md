# Development guide

[فارسی](DEVELOPMENT.md) · **English**

For anyone who wants to change the studio or add a new tab, with Claude Code or by hand. You don't need this for everyday use.

## Structure

- **Server:** `app/server.py` is a simple HTTP server built on Python's standard library (no pip dependencies) that listens on `127.0.0.1:7788`. Each module has two functions, `handle_get(p, q)` and `handle_post(p, body)`, and the server asks them in turn.
- **Page:** `app/index.html` loads every JS and CSS file. There is no framework and no build step. `app.js` holds navigation and the shared helpers (`$`, `api`, `post`, `toast`, `md`), and `go(sec)` switches tabs.
- **Tabs:** the `MODULES` list in `server.py`. A new tab = one row in `MODULES` + one `view…` in `go()` inside `app.js` + its short guide in `GUIDES` inside `app/onboarding.js` (the guide is placed under the page's `.page-head` automatically).
- **Settings and personalisation:** `app/settings.py`. The profile (name, handle, what they do) lives in `data/settings.json`; the keys (`GEMINI_API_KEY`, `INSTAGRAM_TOKEN`) live in `.env`. Any prompt that needs the studio owner's name reads it from `settings.owner_line()`; no name is ever written into the code.
- **Models:** `app/ai_models.py`. Each task has a key, and the user picks Sonnet or Opus for it in the «تنظیمات» (Settings) tab. The full model ID is always passed to `--model`.

| File | What it does |
|---|---|
| `brand.py`, `brand_schema.py`, `brand.js` | Brand Core questionnaire → `brand/brand-core.md` |
| `server.py` (Idea Bank part), `reel_editor.py`, `reel-editor.js` | Idea Bank, its steps and the reel editor |
| `translate.py`, `translate.js` | Full translation of a YouTube video |
| `advisor.py`, `advisor.js` | Advisor (a Claude Code session with `--resume`, voice through Gemini TTS) |
| `story.py`, `story.js` | Text stories (rendered on a canvas in the browser) |
| `carousel.py`, `carousel.js` | Carousels (rendered with the story.js text engine) |
| `instagram.py`, `instagram.js` | Instagram analytics through the Instagram API (read-only) |
| `video*.py`, `video.js` | Video editing (Mac only; HyperFrames in `modules/video`) |
| `voice.py` | Voice-note transcription with Gemini |
| `settings.py`, `onboarding.js` | Start page, Settings, the per-tab guides |

## Claude Code from inside the studio

Every AI task runs `claude -p` on the user's own subscription. A few rules:

- Send long prompts through **stdin**, not as an argument; the Windows command line holds at most 32,000 characters.
- Tasks that must not read this repo's `CLAUDE.md` (translation, carousel, advisor) run with a temporary `cwd` outside the folder and with `--safe-mode`, and the Brand Core goes inside the prompt itself.
- `settings.prepare_env()` sets `ENABLE_CLAUDEAI_MCP_SERVERS=false` when the server starts. Without it, the connectors on the user's account pour into the prompt and calls fail with "Prompt is too long".
- The advisor must **never** have `Read` or `Grep` in `--allowedTools`; an explicit allow opens every path to reading, even `.env`. `--restricted` and `--add-dir` limit access to the knowledge folder.

## Windows

- On Windows, `server.py` re-launches itself with `python -X utf8` so Persian text isn't garbled.
- `os.killpg`, `ps` and Swift are only on Mac code paths (video editing and cleaning up the advisor's orphaned processes) and never run on Windows.
- On Windows, the «تدوین ویدیو» (Video Editing) tab shows a "Mac only for now" message (`viewVideoMacOnly`).

## Data

Everything that belongs to the user is in `.gitignore` (`data/`, `brand/`, `modules/reels/output/`, `.env`), so `git pull` never touches it. Every write to `data/ideas.json` goes through `settings.IDEAS_LOCK`.

## After every change

- `.py` files: the studio has to be closed and opened again (the server reads Python code only at startup).
- `.js`, `.css` and `.html` files: every request reads them from disk, so refreshing the browser is enough.
- Write programming notes in this guide (`docs/DEVELOPMENT.md`), not in the root `CLAUDE.md`. The studio's content agents (idea analysis, reel builder, Reels Studio, analyst) run in the studio folder and read that file.
- Don't write the user's name, page or brand into the code; read them from `settings.owner_line()` and the Brand Core, so the code works with any profile.

## Getting a new version onto a customised copy

This repo is cloned from `https://github.com/siavash-smf/personal-branding-studio` (`origin`). When the user asks you to merge the new version with their own changes:

1. Commit the current changes (`git add -A` is safe; the data and `.env` are in `.gitignore`).
2. `git pull --no-rebase origin main`.
3. If there are conflicts, keep both sides: preserve the user's customisation and bring the new change in alongside it. If you truly can't have both, ask the user.
4. Make sure it starts with `python3 -m py_compile app/*.py` and one run of the studio on another port (below), then tell the user to close the studio and open it again.

## Testing

Run it on a copy of the studio on another port, so your real data isn't touched:

```bash
STUDIO_NO_BROWSER=1 python3 app/server.py 7799
```
