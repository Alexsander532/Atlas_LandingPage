const WAITLIST_SHEET_NAME = 'Lista de espera';
const WAITLIST_SECRET_PROPERTY = 'WAITLIST_SHARED_SECRET';

/**
 * Recebe um cadastro da função serverless da Vercel e adiciona uma linha
 * na aba "Lista de espera" da planilha vinculada a este script.
 */
function doPost(event) {
  try {
    const payload = JSON.parse(
      event && event.postData && event.postData.contents
        ? event.postData.contents
        : '{}'
    );

    const configuredSecret = PropertiesService
      .getScriptProperties()
      .getProperty(WAITLIST_SECRET_PROPERTY);

    if (!configuredSecret || payload.secret !== configuredSecret) {
      return jsonResponse({ ok: false, code: 'unauthorized' });
    }

    const email = normalizeEmail(payload.email);
    if (!payload.consent || !isValidEmail(email)) {
      return jsonResponse({ ok: false, code: 'invalid_payload' });
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(5000);

    try {
      const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = spreadsheet.getSheetByName(WAITLIST_SHEET_NAME);

      if (!sheet) {
        return jsonResponse({ ok: false, code: 'sheet_not_found' });
      }

      if (emailAlreadyRegistered(sheet, email)) {
        return jsonResponse({ ok: false, code: 'duplicate' });
      }

      const now = new Date();
      sheet.appendRow([
        email,
        now,
        now,
        String(payload.source || 'atlas-landing-page'),
      ]);

      return jsonResponse({ ok: true });
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    console.error(error);
    return jsonResponse({ ok: false, code: 'internal_error' });
  }
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email);
}

function emailAlreadyRegistered(sheet, email) {
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return false;
  }

  const emails = sheet
    .getRange(2, 1, lastRow - 1, 1)
    .getValues()
    .map(function(row) {
      return normalizeEmail(row[0]);
    });

  return emails.indexOf(email) !== -1;
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
