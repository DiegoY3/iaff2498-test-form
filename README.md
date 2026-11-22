# IAFF Local 2498 — TEST FORM (temporary)

This is a temporary test copy of the Local 2498 Toxic Exposure Form, published so the Send to Local 2498 email path can be tried with a personal Gmail account.

It is **not** the official form. The title is **TEST FORM** on the web page, in the fillable PDF, and in the email subject. When testing is finished, delete this GitHub repository (and the test Apps Script project).

## What is here

- The test web form (this folder is the GitHub Pages site)
- `assets/IAFF_Local_2498_TEST_FORM.pdf` — the blank fillable PDF the form fills
- `apps_script/Code.gs` and `apps_script/SETUP.md` — paste the script into a Google Apps Script project under the personal Gmail you want to test with, then put the `/exec` URL into `assets/app.js`

`APPS_SCRIPT_URL` / `emailConfig.url` is left empty until that deployment is done. `SHARED_KEY` starts as the placeholder `SHARED_KEY_HERE` in both `assets/app.js` and `Code.gs`.
