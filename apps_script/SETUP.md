# Temporary test setup

This copy is for a short personal-Gmail test of the email button. It is not the official Local 2498 form. When the test is done, delete the GitHub repo and the Apps Script project.

In this test site the web form settings are in `assets/app.js` (not `assets/app.js`). Leave `url` empty until you paste the Apps Script `/exec` URL after the steps below. The `key` value must match `SHARED_KEY` in `Code.gs` (both start as `SHARED_KEY_HERE` — replace them with the same phrase when you deploy).

# Set up “Send to Local 2498” email

These steps let the Local’s own Gmail receive filled Toxic Exposure Forms from the web form. You only do this once. Members never type an email address.

You will need:

- Access to the Local’s Gmail account (the one that should *send* the forms, usually the union office account)
- The union email address that should *receive* the forms (often the same account)
- About 15 minutes

The daily sending limit on a regular (free) Gmail account is about **100 emails per day**. That is usually enough for a local. Google Workspace accounts have a higher limit.

---

## 1. Open the Local’s Gmail

1. Sign in to the Local’s Gmail account in your web browser (not a personal account, unless that *is* the union account).
2. Stay signed in for the rest of these steps.

## 2. Start a new Apps Script project

1. In the same browser, go to: https://script.google.com
2. If Google asks you to choose an account, pick the Local’s Gmail.
3. Click **New project** (or **+ New project**).
4. At the top left, click the project name (it may say “Untitled project”) and rename it to something like **Local 2498 Toxic Exposure Form mailer**. Click **Rename**.

## 3. Paste the script

1. In the editor you will see a file called `Code.gs` with some sample code already in it. Select all of that sample code and delete it.
2. Open the `Code.gs` file that came with this form (it is in the `apps_script` folder).
3. Select all of its contents, copy, and paste into the empty editor window.
4. Click the **Save** icon (or press Ctrl+S / Command+S).

## 4. Set the union email and the shared key

Near the top of the script you will see two lines:

```
var RECIPIENT = 'UNION_EMAIL_HERE';
var SHARED_KEY = 'SHARED_KEY_HERE';
```

1. Replace `UNION_EMAIL_HERE` with the email address that should receive the forms, still inside the quotes. Example:

   `var RECIPIENT = 'local2498@gmail.com';`

2. Replace `SHARED_KEY_HERE` with a short password-like phrase, still inside the quotes. Make one up (letters and numbers, no spaces is easiest). Example:

   `var SHARED_KEY = 'BlueShift2498Forms';`

   This is only a light deterrent, not a lock. You will paste this same value into the web form’s settings in a later step.

3. Click **Save** again.

## 5. Deploy the web app

1. At the top right, click **Deploy**, then **New deployment**.
2. Next to “Select type,” click the gear icon and choose **Web app**.
3. Fill in the boxes as follows:
   - **Description:** optional, for example `Toxic Exposure Form mailer`.
   - **Execute as:** **Me** (the Local’s Gmail account).
   - **Who has access:** **Anyone**.
     (This does not let the public read the Local’s Gmail. It only lets the web form *send* a form to the script. The script then emails the PDF to RECIPIENT.)
4. Click **Deploy**.

## 6. Authorize the script (first time only)

Google will ask you to approve the script so it can send email as the Local’s account.

1. Click **Authorize access**.
2. Choose the Local’s Gmail account.
3. You will likely see a warning that says **Google hasn’t verified this app**. That is normal for a script the Local created itself.
4. Click **Advanced**, then click **Go to Local 2498 Toxic Exposure Form mailer (unsafe)** (the name will match whatever you typed in step 2).
5. Click **Allow**.

## 7. Copy the web app URL

1. After it deploys, you will see a **Web app** URL that ends in `/exec`.
2. Click **Copy** next to that URL.
3. Send that URL, and the **SHARED_KEY** you chose in step 4, to Diego so he can paste them into the web form settings (`APPS_SCRIPT_URL` and `SHARED_KEY` at the top of `assets/app.js`).

   If you are pasting them yourself: open `assets/app.js`, find these two lines near the top, and put the URL and key inside the quotes:

   ```
   const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/...../exec';
   const SHARED_KEY = 'BlueShift2498Forms';
   ```

   The key in the script and the key in the web form must match exactly.

4. Click **Done**.

You can test the URL by pasting it into a browser address bar and visiting it. You should see a short message that the mailer is running.

## 8. If you change the script later

If you edit `Code.gs` after it is already deployed, a regular Save is **not** enough for the live form to use the new code. Do this so the URL stays the same:

1. Click **Deploy**, then **Manage deployments**.
2. Click the pencil (edit) icon on the existing Web app deployment.
3. Under **Version**, choose **New version**.
4. Click **Deploy**.

Do **not** click “New deployment” again unless you want a brand-new URL (you would then have to update the web form).

---

## If something goes wrong

- **Members see “Email sending isn’t set up yet.”** The web form does not have the `/exec` URL yet. Finish step 7, or ask Diego to paste it in.
- **Members see “Unauthorized” or a send failure.** The SHARED_KEY in the script and in `app.js` do not match, or the script was edited but not redeployed as a new version (see step 8).
- **Google quota errors after many forms in one day.** A free Gmail account can send about 100 emails per day. Wait until the next day, or consider a Google Workspace account for a higher limit. Members can still use **Save Exposure Form** and deliver the PDF to the office.
- **You changed RECIPIENT or SHARED_KEY and nothing happened.** Redeploy a new version (step 8). The URL can stay the same.
