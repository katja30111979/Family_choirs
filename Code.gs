// ============================================================
// Family Chores Web App - Google Apps Script Backend
// ============================================================

var SPREADSHEET_ID = ''; // Leave blank to auto-create on first run
var SS;

// ── Sheet names ──────────────────────────────────────────────
var SHEET_MEMBERS = 'Members';
var SHEET_CHORES  = 'Chores';
var SHEET_LOG     = 'CompletionLog';

// ─────────────────────────────────────────────────────────────
// WEB APP ENTRY POINT
// ─────────────────────────────────────────────────────────────
function doGet(e) {
  initSpreadsheet();
  return HtmlService
    .createTemplateFromFile('Index')
    .evaluate()
    .setTitle('✨ Family Chores ✨')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ─────────────────────────────────────────────────────────────
// INCLUDE HELPER  (used in HTML templates)
// ─────────────────────────────────────────────────────────────
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ─────────────────────────────────────────────────────────────
// SPREADSHEET INIT
// ─────────────────────────────────────────────────────────────
function initSpreadsheet() {
  var scriptProps = PropertiesService.getScriptProperties();
  var id = scriptProps.getProperty('SPREADSHEET_ID');

  if (id) {
    SS = SpreadsheetApp.openById(id);
  } else {
    SS = SpreadsheetApp.create('Family Chores Data');
    scriptProps.setProperty('SPREADSHEET_ID', SS.getId());
    _setupSheets();
  }
}

function _setupSheets() {
  // Members sheet: ID | Name | Avatar (emoji) | Color
  var mSheet = SS.getSheetByName(SHEET_MEMBERS) || SS.insertSheet(SHEET_MEMBERS);
  if (mSheet.getLastRow() === 0) {
    mSheet.appendRow(['ID', 'Name', 'Avatar', 'Color']);
    mSheet.getRange(1, 1, 1, 4).setFontWeight('bold');
  }

  // Chores sheet: ID | Title | Description | AssignedTo (MemberID or "pool") | Points | Status | DueDate | CreatedAt
  var cSheet = SS.getSheetByName(SHEET_CHORES) || SS.insertSheet(SHEET_CHORES);
  if (cSheet.getLastRow() === 0) {
    cSheet.appendRow(['ID', 'Title', 'Description', 'AssignedTo', 'Points', 'Status', 'DueDate', 'CreatedAt']);
    cSheet.getRange(1, 1, 1, 8).setFontWeight('bold');
  }

  // Completion log: ChoreID | MemberID | CompletedAt
  var lSheet = SS.getSheetByName(SHEET_LOG) || SS.insertSheet(SHEET_LOG);
  if (lSheet.getLastRow() === 0) {
    lSheet.appendRow(['ChoreID', 'MemberID', 'CompletedAt']);
    lSheet.getRange(1, 1, 1, 3).setFontWeight('bold');
  }

  // Remove default empty sheet if present
  var def = SS.getSheetByName('Sheet1');
  if (def) SS.deleteSheet(def);
}

// ─────────────────────────────────────────────────────────────
// MEMBER FUNCTIONS
// ─────────────────────────────────────────────────────────────
function getMembers() {
  initSpreadsheet();
  var sheet = SS.getSheetByName(SHEET_MEMBERS);
  var rows  = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];
  return rows.slice(1).map(function(r) {
    return { id: r[0], name: r[1], avatar: r[2], color: r[3] };
  });
}

function addMember(name, avatar, color) {
  initSpreadsheet();
  var sheet = SS.getSheetByName(SHEET_MEMBERS);
  var id    = 'M' + new Date().getTime();
  sheet.appendRow([id, _sanitize(name), _sanitize(avatar), _sanitize(color)]);
  return { success: true, id: id };
}

function deleteMember(id) {
  initSpreadsheet();
  _deleteRowById(SHEET_MEMBERS, id);
  return { success: true };
}

// ─────────────────────────────────────────────────────────────
// CHORE FUNCTIONS
// ─────────────────────────────────────────────────────────────
function getChores() {
  initSpreadsheet();
  var sheet = SS.getSheetByName(SHEET_CHORES);
  var rows  = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];
  return rows.slice(1).map(function(r) {
    return {
      id:         r[0],
      title:      r[1],
      description:r[2],
      assignedTo: r[3],  // MemberID or "pool"
      points:     r[4],
      status:     r[5],  // pending | done
      dueDate:    r[6] ? Utilities.formatDate(new Date(r[6]), Session.getScriptTimeZone(), 'yyyy-MM-dd') : '',
      createdAt:  r[7]
    };
  });
}

function addChore(title, description, assignedTo, points, dueDate) {
  initSpreadsheet();
  var sheet = SS.getSheetByName(SHEET_CHORES);
  var id    = 'C' + new Date().getTime();
  var due   = dueDate ? new Date(dueDate) : '';
  sheet.appendRow([
    id,
    _sanitize(title),
    _sanitize(description),
    _sanitize(assignedTo),
    parseInt(points) || 5,
    'pending',
    due,
    new Date()
  ]);
  return { success: true, id: id };
}

function updateChore(id, title, description, assignedTo, points, dueDate) {
  initSpreadsheet();
  var sheet = SS.getSheetByName(SHEET_CHORES);
  var rows  = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === id) {
      var due = dueDate ? new Date(dueDate) : '';
      sheet.getRange(i + 1, 2, 1, 5).setValues([[
        _sanitize(title),
        _sanitize(description),
        _sanitize(assignedTo),
        parseInt(points) || 5,
        due
      ]]);
      return { success: true };
    }
  }
  return { success: false, error: 'Chore not found' };
}

function deleteChore(id) {
  initSpreadsheet();
  _deleteRowById(SHEET_CHORES, id);
  return { success: true };
}

function completeChore(choreId, memberId) {
  initSpreadsheet();
  var cSheet = SS.getSheetByName(SHEET_CHORES);
  var rows   = cSheet.getDataRange().getValues();

  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === choreId) {
      // If pool chore, assign it to the member who completed it
      if (rows[i][3] === 'pool') {
        cSheet.getRange(i + 1, 4).setValue(_sanitize(memberId));
      }
      cSheet.getRange(i + 1, 6).setValue('done');
      break;
    }
  }

  var lSheet = SS.getSheetByName(SHEET_LOG);
  lSheet.appendRow([choreId, memberId, new Date()]);

  return { success: true };
}

function claimChore(choreId, memberId) {
  initSpreadsheet();
  var sheet = SS.getSheetByName(SHEET_CHORES);
  var rows  = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === choreId) {
      sheet.getRange(i + 1, 4).setValue(_sanitize(memberId));
      return { success: true };
    }
  }
  return { success: false, error: 'Chore not found' };
}

function getPoints() {
  initSpreadsheet();
  var chores  = getChores();
  var members = getMembers();
  var points  = {};

  members.forEach(function(m) { points[m.id] = 0; });

  chores.forEach(function(c) {
    if (c.status === 'done' && c.assignedTo !== 'pool' && points[c.assignedTo] !== undefined) {
      points[c.assignedTo] += (parseInt(c.points) || 0);
    }
  });

  return points;
}

// ─────────────────────────────────────────────────────────────
// CONVENIENCE WRAPPER  (single round-trip on page load)
// ─────────────────────────────────────────────────────────────
function getAllData() {
  initSpreadsheet();
  return {
    members: getMembers(),
    chores:  getChores(),
    points:  getPoints()
  };
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
function _deleteRowById(sheetName, id) {
  var sheet = SS.getSheetByName(sheetName);
  var rows  = sheet.getDataRange().getValues();
  for (var i = rows.length - 1; i >= 1; i--) {
    if (rows[i][0] === id) {
      sheet.deleteRow(i + 1);
      return;
    }
  }
}

// Basic sanitization to prevent formula injection in Sheets
function _sanitize(value) {
  if (typeof value !== 'string') return value;
  // Strip leading characters that could start a formula
  return value.replace(/^[=+\-@\t\r]/, '');
}
