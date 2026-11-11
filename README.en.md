# Content Studio

[فارسی](README.md) · **English**

An Instagram content studio for your personal brand that runs on your own computer. Built for students of the Personal Branding course.

It takes you from an idea to a reel script, stories, carousels, edited video with Persian captions, and an analysis of your page's stats, all in one place. Every part reads your **Brand Core** first, so what it writes follows your voice, your audience and your red lines.

- **It runs on your own computer.** Your data (Brand Core, ideas, videos) stays there and is never uploaded anywhere.
- **The AI runs on your own Claude subscription** through Claude Code. No API key and no separate payment.
- **Free and open source.**

> **Language:** the studio's interface and the content it writes are in Persian. This page is an English guide to installing and using it.

## Tabs

The tab names below are followed by the Persian label you will see in the studio's menu.

| Tab | What it does |
|---|---|
| **Start** («شروع») | Setup steps, your progress, and a suggested weekly routine |
| **Dashboard** («داشبورد») | Overview, your next step, and a quick translation from a YouTube link |
| **Brand Core** («هسته‌ی برند») | A questionnaire about you, your audience, voice, content pillars, colours and logo. Every AI feature reads it before doing anything |
| **Advisor** («مشاور») | Chat with a personal-branding advisor that knows your Brand Core and your ideas; works with voice and microphone |
| **Idea Bank** («بانک ایده») | Save an idea as text, a link, a voice note or a file; get an analysis, web research, and a reel with six hooks, a caption and hashtags |
| **YouTube Translations** («ترجمه‌های یوتیوب») | Full Persian translations of English videos for you to read, with the best parts sent to the Idea Bank |
| **Reels Studio** («استودیو ریلز») | From a YouTube link to a reel idea and a script ready to record, with a teleprompter |
| **Video Editing** («تدوین ویدیو») | Cuts silences and fumbles, adds word-by-word Persian captions, graphics, a cover and a caption (Mac only for now) |
| **Story** («استوری») | Text → a 1080×1920 image in your brand colours and logo |
| **Carousel & Post** («کاروسل و پست») | Multi-slide posts, made by hand or with Claude |
| **Instagram Analytics** («تحلیل اینستاگرام») | Stats for your posts, reels, stories and audience, plus an AI analyst (optional; [how to connect](docs/instagram-connect.en.md)) |
| **Settings** («تنظیمات») | Your profile, the Claude model for each task, and your Gemini key |

Publishing is manual: you download what the studio makes and post it on Instagram yourself.

## What you need

- A **Mac** (macOS 13 or later) or **Windows 10/11**
- A **Claude Pro or Max subscription** ([claude.ai](https://claude.ai)). Every AI feature runs on it.
- A **free Gemini key** (recommended; used for voice notes, the advisor's voice, image generation and video transcripts). The **Start** page shows you where to get one.
- An internet connection for the AI features. The rest of the studio opens offline too.

## Install on Mac

1. Open **Terminal**: press `Cmd + Space`, type Terminal and press Enter.
2. Copy this whole line, paste it into Terminal and press Enter:

   ```bash
   curl -fsSL https://raw.githubusercontent.com/siavash-smf/personal-branding-studio/main/install-mac.sh | bash
   ```

   If it asks for your Mac password, type it and press Enter (nothing appears while you type; that is normal). The first install takes 5 to 15 minutes.
3. When it finishes, type `claude` in the same Terminal and press Enter. Sign in with your Claude account, then type `/exit`.
4. Double-click **Content Studio** on your Desktop. If your Mac says it can't be opened: right-click → Open → Open.

The studio opens in your browser (`http://127.0.0.1:7788`). Keep the Terminal window next to it open while you work.

**Video editing (optional):** about a 400 MB download, and it also installs Google Chrome:

```bash
~/content-studio/install-video-mac.sh
```

## Install on Windows

1. Open **PowerShell**: click Start, type PowerShell and press Enter.
2. Copy this whole line, paste it into PowerShell (right-click) and press Enter:

   ```powershell
   irm https://raw.githubusercontent.com/siavash-smf/personal-branding-studio/main/install-windows.ps1 | iex
   ```

   If Windows asks for permission to install programs, click Yes.
3. When it finishes, close the window and open a **new** PowerShell. Type `claude` and press Enter, sign in with your Claude account, then type `/exit`.
4. Double-click **Content Studio** on your Desktop.

The black window that opens next to your browser is the studio itself; keep it open while you work. The **Video Editing** tab is not available on Windows yet.

## First run

The studio opens on the **Start** page and walks you through it step by step:

1. Check your tools and test Claude
2. Introduce yourself (name, Instagram handle, what you do)
3. Add your Gemini key
4. Brand Core: at least the 12 required questions
5. Your first idea in the Idea Bank
6. Your first reel with «⚡ ساخت کامل» (Full build)
7. Your first story

Each tab also has a short guide at the top that explains what it does and how to use it.

## Your Claude usage limit

Every AI task uses up part of your own Claude subscription's usage limit. Every task defaults to **Sonnet 5.5**, which is fast and makes your limit last longer. In **Settings** you can switch any task to **Opus 5.5**; it is more precise, but on a Pro plan it uses up your limit quickly. If you hit the limit, wait a few hours or switch your tasks back to Sonnet.

## Updating

When a new version comes out:

- **Mac:** in the `content-studio` folder (in your home folder), double-click `update-mac.command`.
- **Windows:** in the `content-studio` folder, double-click `update-windows.bat`.

Then close the studio and open it again. Updating never touches your data.

## Your data and backups

All your data lives inside the studio folder (`~/content-studio` on Mac, `C:\Users\<your name>\content-studio` on Windows):

- `brand/`: your Brand Core, logo and images
- `data/`: ideas, reels, advisor chats, carousels, stories, videos and Instagram stats
- `modules/reels/output/`: translations and Reels Studio output
- `.env`: your Gemini key and Instagram token (never send this file to anyone)

To back up, copy `brand` and `data` somewhere safe.

## Troubleshooting

| Problem | Fix |
|---|---|
| The studio page won't open | The Terminal window (Mac) or the studio's black window (Windows) must stay open. Double-click Content Studio again, or open `http://127.0.0.1:7788` in your browser. |
| Claude doesn't answer | On the **Start** page, click «آزمایش Claude» (Test Claude). If you aren't signed in, type `claude` in Terminal or PowerShell and sign in. If you see a usage-limit message, wait a few hours or switch your tasks to Sonnet in **Settings**. |
| A YouTube transcript couldn't be fetched | The video must have captions. If it does, update yt-dlp by running the update script. |
| Voice notes or the advisor's voice don't work | Add your Gemini key in **Settings**. Voice notes can be up to about 5 to 8 minutes long. |
| Carousel image generation fails | Image generation is blocked on some free Gemini keys. Turn on Billing in Google AI Studio, or upload your own image. |
| Mac says Content Studio can't be opened | Right-click → Open → Open (first time only). |

## Customise the studio with Claude Code

The studio is yours. You can change or add anything you like without waiting for a new version. The code is simple (Python with no dependencies, JavaScript with no framework), and Claude Code finds a guide to its structure in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) ([English version](docs/DEVELOPMENT.en.md)).

1. Open Terminal (Mac) or PowerShell (Windows) and go into the studio folder:
   - Mac: `cd ~/content-studio`
   - Windows: `cd $HOME\content-studio`
2. Type `claude` and press Enter.
3. Say what you want, in Persian or English. A few examples:
   - "Make a new tab for a weekly content calendar where I can place Idea Bank ideas on the days of the week"
   - "Write ten hooks instead of six"
   - "Add a 'text on image' section to the reel editor"
   - "Switch the studio itself to light colours"
4. When it's done: if Claude changed Python files (`.py`), close the studio window and open it again. For any other change, refreshing the browser page is enough.

A few tips:

- **Before and after any big change, say "save the changes with git".** If something breaks, just say "go back to the previous version".
- **Your data is safe.** The `brand` and `data` folders and the `.env` file aren't part of the code, and changing the code doesn't delete them.
- **Put your content rules in Brand Core, not in the code.** Voice, red lines and calls to action belong there. Don't use the root `CLAUDE.md` file for programming notes either; the studio's content agents read it.
- **Customising uses your own Claude usage limit.** On a Pro plan, split big jobs into smaller parts.

### Getting a new version after you've customised

If you have changed the code, the update script may not be able to combine your changes with the new version on its own, and it will show a message. In that case, open Claude Code in the same folder and type:

> Pull the latest version of the studio from GitHub and merge it with my changes.

Claude keeps your changes and adds only what's new. If you'd rather not, you don't have to update at all; your own version keeps working as it is.

The Vazirmatn font is licensed under the SIL Open Font License (`app/fonts/OFL.txt`).
