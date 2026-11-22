/**
 * IAFF Local 2498 — TEST FORM mailer (temporary personal-Gmail test)
 *
 * Deploy as a Web App (Execute as: Me, Who has access: Anyone).
 * Set RECIPIENT and SHARED_KEY below before deploying.
 *
 * The SHARED_KEY is only a light deterrent (the web form also has it).
 * It is not a secret login and does not make this a private endpoint.
 */

var RECIPIENT = 'UNION_EMAIL_HERE';
var SHARED_KEY = 'SHARED_KEY_HERE';
var MAX_PDF_BYTES = 10 * 1024 * 1024; // ~10 MB

function doGet() {
  return ContentService
    .createTextOutput('Local 2498 TEST FORM mailer is running.')
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    return jsonOutput_(handlePost_(e));
  } catch (err) {
    return jsonOutput_({
      ok: false,
      error: String(err && err.message ? err.message : err)
    });
  }
}

function handlePost_(e) {
  if (!e || !e.postData || e.postData.contents == null || e.postData.contents === '') {
    throw new Error('Empty request.');
  }

  var payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (parseErr) {
    throw new Error('Request was not valid JSON.');
  }
  if (!payload || typeof payload !== 'object') {
    throw new Error('Request was not valid JSON.');
  }

  // Honeypot: pretend success and do not send.
  if (String(payload.honeypot || payload.website || '').trim() !== '') {
    return { ok: true };
  }

  if (!SHARED_KEY || SHARED_KEY === 'SHARED_KEY_HERE') {
    throw new Error('Mailer is not configured (SHARED_KEY).');
  }
  if (String(payload.sharedKey || '') !== SHARED_KEY) {
    throw new Error('Unauthorized.');
  }

  if (!RECIPIENT || RECIPIENT === 'UNION_EMAIL_HERE' || RECIPIENT.indexOf('@') === -1) {
    throw new Error('Mailer is not configured (RECIPIENT).');
  }

  var fullName = cleanText_(payload.fullName, 200);
  var encounterDate = cleanText_(payload.encounterDate, 40);
  var filename = safeFilename_(payload.filename);
  var pdfBase64 = String(payload.pdfBase64 || '').replace(/\s+/g, '');

  if (!fullName) {
    throw new Error('Full name is required.');
  }
  if (!encounterDate) {
    throw new Error('Encounter date is required.');
  }
  if (!pdfBase64) {
    throw new Error('The PDF is missing.');
  }

  // Base64 expands size by ~4/3; reject oversized payloads early.
  if (pdfBase64.length > Math.floor(MAX_PDF_BYTES * 1.4) + 1024) {
    throw new Error('The PDF is too large to email (limit 10 MB).');
  }

  var pdfBytes;
  try {
    pdfBytes = Utilities.base64Decode(pdfBase64);
  } catch (decodeErr) {
    throw new Error('The PDF could not be decoded.');
  }
  if (!pdfBytes || pdfBytes.length < 8) {
    throw new Error('The PDF could not be decoded.');
  }
  if (pdfBytes.length > MAX_PDF_BYTES) {
    throw new Error('The PDF is too large to email (limit 10 MB).');
  }

  var subject = 'TEST FORM - ' + fullName + ' - ' + encounterDate;
  var body = buildBody_(payload, fullName, encounterDate);
  var blob = Utilities.newBlob(pdfBytes, 'application/pdf', filename);

  MailApp.sendEmail({
    to: RECIPIENT,
    subject: subject,
    body: body,
    attachments: [blob],
    name: 'IAFF Local 2498 TEST'
  });

  return { ok: true };
}

function buildBody_(payload, fullName, encounterDate) {
  var lines = [];
  lines.push('A TEST FORM was submitted from the Local 2498 test web form.');
  lines.push('');
  lines.push('Full name: ' + fullName);
  lines.push('IAFF Member #: ' + cleanText_(payload.memberNumber, 40));
  lines.push("Today's date: " + cleanText_(payload.todaysDate, 40));
  lines.push('Encounter date: ' + encounterDate);
  lines.push('Encounter time: ' + cleanText_(payload.encounterTime, 40));
  lines.push('Station: ' + cleanText_(payload.station, 40));
  lines.push('Shift: ' + cleanText_(payload.shift, 40));
  lines.push('Telephone: ' + cleanText_(payload.telephone, 40));
  lines.push('Email: ' + cleanText_(payload.email, 120));
  lines.push('NFIRS Incident #: ' + cleanText_(payload.nfirsIncidentNumber, 40));
  lines.push('Injury Report #: ' + cleanText_(payload.injuryReportNumber, 40));
  lines.push('Incident address: ' + cleanText_(payload.incidentAddress, 300));
  lines.push('Total time exposed: ' + cleanText_(payload.totalTimeExposed, 40));
  lines.push("Workers' comp claim date: " + cleanText_(payload.wcClaimDate, 40));
  lines.push('Hospital/Physician: ' + cleanText_(payload.hospitalPhysician, 200));
  lines.push('');
  lines.push("The filled PDF is attached. Please file it with the member's record.");
  return lines.join('\n');
}

function cleanText_(value, maxLen) {
  var text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  if (maxLen && text.length > maxLen) {
    text = text.substring(0, maxLen);
  }
  return text;
}

function safeFilename_(value) {
  var name = String(value == null ? '' : value).replace(/[/\\?%*:|"<>]/g, '').trim();
  if (!name) {
    name = 'IAFF_Local_2498_Toxic_Exposure_Form.pdf';
  }
  if (!/\.pdf$/i.test(name)) {
    name += '.pdf';
  }
  if (name.length > 150) {
    name = name.substring(0, 146) + '.pdf';
  }
  return name;
}

function jsonOutput_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
