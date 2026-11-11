# Connecting the studio to Instagram

[فارسی](instagram-connect.md) · **English**

This guide walks you through getting an "access token" from Meta and entering it in the studio's «تحلیل اینستاگرام» (Instagram Analytics) tab. A token is a key that lets the studio read your page's stats without you giving it your Instagram password. This is Meta's own official route.

- **Time:** about 20 minutes
- **Where:** a browser on your computer (the Meta dashboard and the invite page don't fully work on a phone)
- **Cost:** free
- **Optional:** the rest of the studio works fully without this connection.

The studio only **reads**: stats for your posts, reels, stories and audience. It never publishes or deletes anything and never touches your DMs.

The studio's own buttons and messages are in Persian, so each one is written below with its Persian label first and an English translation in parentheses. Meta sometimes renames or moves its buttons a little; if a page looks different from this guide, look for the closest option, or take a screenshot of that page and ask in the class group.

## Before you start

1. Your Instagram page must be a **professional** account (Business or Creator). If it's still personal, in the Instagram app go to: `Settings and activity` → `Account type and tools` → `Switch to professional account`.
2. You need a Facebook account; you sign in to the Meta dashboard with it.

## Step 1: Developer account

Go to [developers.facebook.com](https://developers.facebook.com/) and log in with your Facebook account. If it's your first time, click `Get Started` and finish the sign-up (Meta verifies your email and phone number).

## Step 2: Create an app

Go to [developers.facebook.com/apps/creation](https://developers.facebook.com/apps/creation/) and fill in the pages in order (click `Next` after each one):

1. `App details`: type a name, for example "Maryam Studio", and enter your email. The words Instagram, IG, Facebook and Meta must not appear in the name.
2. `Use cases`: choose `Manage messaging & content on Instagram`.
3. `Business`: if you have a business portfolio, choose it; if not, create one right there under your own name. It doesn't need to be verified.
4. Continue through `Requirements` and `Overview`, and finally click `Go to dashboard`.

## Step 3: The app's Instagram settings

In the app dashboard: `Use cases` → the `Customize` button next to `Manage messaging & content on Instagram` → `API setup with Instagram login`. Steps 4 to 7 all happen on this page.

## Step 4: Permissions

These two permissions are all the studio needs:

| Permission | What for |
|---|---|
| `instagram_business_basic` | Page name, follower count, list of posts |
| `instagram_business_manage_insights` | Stats for posts, reels, stories and audience |

If they aren't in the list, click `Go to permissions and features` and click `Add` next to each one. If Meta adds other permissions on its own, that's fine.

> **Finish this step before you create the token.** A token only gets the permissions that were active at the moment it was created.

## Step 5: Add your page as a tester

In the `Generate access tokens` section, click `Add account`. On the page that opens, choose `Instagram Tester`, type your Instagram username **without the @** and click `Add`. An invite is sent to your page; until you accept it (next step), you can't create a token.

## Step 6: Accept the invite

In a browser on your computer, open [instagram.com/accounts/manage_access](https://www.instagram.com/accounts/manage_access/) and log in with the same page. Open the `Tester Invites` tab and click `Accept` next to your app's name. If the invite hasn't arrived yet, wait a minute or two and refresh the page.

## Step 7: Create the token

Go back to the `API setup with Instagram login` page and refresh it. Your username now appears under `Generate access tokens`.

1. Click `Generate token` next to your username.
2. An Instagram login window opens; log in and accept the permissions. If the window doesn't open, your browser has blocked the pop-up; allow pop-ups for this site and click again.
3. The token (a long string that usually starts with `IG`) is shown. If it asks you to tick `I understand`, tick it, and copy the **whole** token. If you closed the window without copying it, click `Generate token` again.

## Step 8: Enter the token in the studio

In the studio, go to the «تحلیل اینستاگرام» (Instagram Analytics) tab, paste the token into the «اتصال اینستاگرام» (Connect Instagram) box and click «اتصال» (Connect). If your username appears, the connection works. The first sync starts on its own and takes a few minutes, depending on how many posts you have.

## Looking after your token

- **A token is like a password.** It's saved only on your own computer, in the `.env` file in the studio folder. Never send it to anyone in a chat, an email or a screenshot.
- **It's valid for 60 days**, and the studio renews it on its own every few days while it's open. If you haven't opened the studio for a long time and it expires, repeat step 7 and put the new token in with the «تعویض توکن» (Change token) button in «تحلیل اینستاگرام» (Instagram Analytics).
- **If you think it has leaked:** at [instagram.com/accounts/manage_access](https://www.instagram.com/accounts/manage_access/), `Remove` the app in the `Active` tab, then create a new token.
- **Business Verification is not needed.**

## Syncing

- Instagram keeps **story** stats for only 24 hours. Click «همگام‌سازی» (Sync) once a day so your stories get recorded.
- Daily account stats are fetched up to 90 days back. Instagram accepts a limited number of requests per hour; if the first sync shows a «سقف درخواست» (request limit) message, sync again an hour later to finish it.

## If you get stuck

| Problem | Fix |
|---|---|
| Meta won't accept the app name | Remove the words Instagram, IG, Facebook and Meta from the name. |
| I can't find Manage messaging & content on Instagram | Scroll to the bottom of the Use cases list. If you already created the app with a different option, create a new app; it's free. |
| My page doesn't appear after Add account | The tester invite hasn't been accepted yet; do step 6 and refresh the page. |
| The Tester Invites tab is empty | Check the username you typed in step 5, and make sure you're logged in to instagram.com with that same page. |
| The studio says «این شبیه توکن اینستاگرام نیست» (this doesn't look like an Instagram token) | The token was copied incompletely; copy all of it again, start to end, with no extra spaces. |
| The studio says «اینستاگرام این توکن را قبول نکرد» (Instagram didn't accept this token) | The token has expired, or you added permissions after creating it; create a new token in step 7. |
| Instagram won't allow the connection | The page must be a professional account (see "Before you start"). |
| Some numbers are empty | Some stats are only given for pages with over 100 followers or for posts that are a few days old. Sync again in a few days. |
