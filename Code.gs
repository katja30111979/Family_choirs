// ============================================================
// Family Chores Web App - Google Apps Script Backend
// ============================================================

var SPREADSHEET_ID   = '1Z6k0LseFQwsxp8IaV3zZ3aG3sx8EA9Bqhz6qSM7m4aM';
var SS;

// ── Sheet names ──────────────────────────────────────────────
var SHEET_MEMBERS    = 'Members';
var SHEET_CHORES     = 'Chores';
var SHEET_LOG        = 'CompletionLog';
var SHEET_REWARDS    = 'Rewards';
var SHEET_REDEMPTION = 'RedemptionLog';

// ─────────────────────────────────────────────────────────────
// WEB APP ENTRY POINT
// ─────────────────────────────────────────────────────────────
function doGet(e) {
  initSpreadsheet();
  return HtmlService
    .createTemplateFromFile('Index')
    .evaluate()
    .setTitle('🍂 Family Chores 🍂')
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
  if (SS) return;
  SS = SpreadsheetApp.openById(SPREADSHEET_ID);
  _setupSheets();
}

function _setupSheets() {
  // Members sheet: ID | Name | Avatar | Color
  var mSheet = SS.getSheetByName(SHEET_MEMBERS);
  if (!mSheet) {
    mSheet = SS.insertSheet(SHEET_MEMBERS);
    mSheet.appendRow(['ID', 'Name', 'Avatar', 'Color']);
    mSheet.getRange(1, 1, 1, 4).setFontWeight('bold');
  }

  // Chores sheet: ID | Title | Description | AssignedTo | Points | Status | DueDate | CreatedAt | Type | Recurrence
  var cSheet = SS.getSheetByName(SHEET_CHORES);
  if (!cSheet) {
    cSheet = SS.insertSheet(SHEET_CHORES);
    cSheet.appendRow(['ID','Title','Description','AssignedTo','Points','Status','DueDate','CreatedAt','Type','Recurrence']);
    cSheet.getRange(1, 1, 1, 10).setFontWeight('bold');
  } else {
    // Add Type and Recurrence columns to existing sheet if missing
    var lastCol = cSheet.getLastColumn();
    if (lastCol < 9)  { cSheet.getRange(1, 9).setValue('Type').setFontWeight('bold'); }
    if (lastCol < 10) { cSheet.getRange(1, 10).setValue('Recurrence').setFontWeight('bold'); }

    // Back-fill Type, Recurrence defaults and migrate legacy 'pool' values to 'general'
    var numRows = cSheet.getLastRow();
    if (numRows > 1) {
      for (var r = 2; r <= numRows; r++) {
        var assignedTo = cSheet.getRange(r, 4).getValue();
        var typeVal    = cSheet.getRange(r, 9).getValue();
        var recVal     = cSheet.getRange(r, 10).getValue();

        // Migrate legacy 'pool' assignedTo value to 'general'
        if (assignedTo === 'pool') {
          cSheet.getRange(r, 4).setValue('general');
          assignedTo = 'general';
        }

        // Back-fill Type if empty
        if (!typeVal) {
          cSheet.getRange(r, 9).setValue(assignedTo === 'general' ? 'general' : 'individual');
        }

        // Back-fill Recurrence if empty
        if (!recVal) {
          cSheet.getRange(r, 10).setValue('once');
        }
      }
    }
  }

  // Completion log: ChoreID | MemberID | CompletedAt
  var lSheet = SS.getSheetByName(SHEET_LOG);
  if (!lSheet) {
    lSheet = SS.insertSheet(SHEET_LOG);
    lSheet.appendRow(['ChoreID', 'MemberID', 'CompletedAt']);
    lSheet.getRange(1, 1, 1, 3).setFontWeight('bold');
  }

  // Rewards sheet: ID | Title | Description | PointsRequired | CreatedAt
  var rSheet = SS.getSheetByName(SHEET_REWARDS);
  if (!rSheet) {
    rSheet = SS.insertSheet(SHEET_REWARDS);
    rSheet.appendRow(['ID', 'Title', 'Description', 'PointsRequired', 'CreatedAt']);
    rSheet.getRange(1, 1, 1, 5).setFontWeight('bold');
  }

  // Redemption log: RewardID | MemberID | RedeemedAt
  var rdSheet = SS.getSheetByName(SHEET_REDEMPTION);
  if (!rdSheet) {
    rdSheet = SS.insertSheet(SHEET_REDEMPTION);
    rdSheet.appendRow(['RewardID', 'MemberID', 'RedeemedAt']);
    rdSheet.getRange(1, 1, 1, 3).setFontWeight('bold');
  }
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

function updateMember(id, name, color) {
  initSpreadsheet();
  var sheet = SS.getSheetByName(SHEET_MEMBERS);
  var rows  = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === id) {
      sheet.getRange(i + 1, 2).setValue(_sanitize(name));
      sheet.getRange(i + 1, 4).setValue(_sanitize(color));
      return { success: true };
    }
  }
  return { success: false, error: 'Member not found' };
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
    var assignedTo = r[3] || 'general';
    if (assignedTo === 'pool') assignedTo = 'general'; // migrate old "pool" to "general"
    var type = r[8] || (assignedTo === 'general' ? 'general' : 'individual');
    return {
      id:          r[0],
      title:       r[1],
      description: r[2],
      assignedTo:  assignedTo,
      points:      r[4],
      status:      r[5] || 'pending',
      dueDate:     r[6] ? Utilities.formatDate(new Date(r[6]), Session.getScriptTimeZone(), 'yyyy-MM-dd') : '',
      createdAt:   r[7],
      type:        type,
      recurrence:  r[9] || 'once'
    };
  });
}

function addChore(title, description, assignedTo, points, dueDate, type, recurrence) {
  initSpreadsheet();
  var sheet     = SS.getSheetByName(SHEET_CHORES);
  var id        = 'C' + new Date().getTime();
  var due       = dueDate ? new Date(dueDate) : '';
  var choreType = type || (assignedTo === 'general' ? 'general' : 'individual');
  var choreRec  = recurrence || 'once';
  sheet.appendRow([
    id,
    _sanitize(title),
    _sanitize(description),
    _sanitize(assignedTo),
    parseInt(points) || 5,
    'pending',
    due,
    new Date(),
    choreType,
    choreRec
  ]);
  return { success: true, id: id };
}

function updateChore(id, title, description, assignedTo, points, dueDate, type, recurrence) {
  initSpreadsheet();
  var sheet = SS.getSheetByName(SHEET_CHORES);
  var rows  = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === id) {
      var due       = dueDate ? new Date(dueDate) : '';
      var choreType = type || (assignedTo === 'general' ? 'general' : 'individual');
      var choreRec  = recurrence || 'once';
      sheet.getRange(i + 1, 2).setValue(_sanitize(title));
      sheet.getRange(i + 1, 3).setValue(_sanitize(description));
      sheet.getRange(i + 1, 4).setValue(_sanitize(assignedTo));
      sheet.getRange(i + 1, 5).setValue(parseInt(points) || 5);
      sheet.getRange(i + 1, 7).setValue(due);
      sheet.getRange(i + 1, 9).setValue(choreType);
      sheet.getRange(i + 1, 10).setValue(choreRec);
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
      var recurrence = rows[i][9] || 'once';
      // If general chore being completed, assign to the completing member
      if (rows[i][3] === 'general') {
        cSheet.getRange(i + 1, 4).setValue(_sanitize(memberId));
      }
      if (recurrence === 'permanent') {
        // Log completion but keep chore active (reset to pending)
        // Status stays 'pending' so it reappears for next time
      } else {
        cSheet.getRange(i + 1, 6).setValue('done');
      }
      break;
    }
  }

  // Always log the completion so points accumulate
  var lSheet = SS.getSheetByName(SHEET_LOG);
  lSheet.appendRow([choreId, memberId, new Date()]);

  return { success: true };
}

function claimChore(choreId, memberId, recurrence) {
  initSpreadsheet();
  var sheet = SS.getSheetByName(SHEET_CHORES);
  var rows  = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === choreId) {
      sheet.getRange(i + 1, 4).setValue(_sanitize(memberId));
      if (recurrence) {
        sheet.getRange(i + 1, 10).setValue(_sanitize(recurrence));
      }
      return { success: true };
    }
  }
  return { success: false, error: 'Chore not found' };
}

// Points are calculated from the CompletionLog so permanent chores accumulate correctly
function getPoints() {
  initSpreadsheet();
  var members = getMembers();
  var chores  = getChores();
  var points  = {};

  members.forEach(function(m) { points[m.id] = 0; });

  // Build lookup: choreId -> points value
  var chorePoints = {};
  chores.forEach(function(c) { chorePoints[c.id] = parseInt(c.points) || 0; });

  var lSheet  = SS.getSheetByName(SHEET_LOG);
  var logRows = lSheet.getDataRange().getValues();
  if (logRows.length > 1) {
    logRows.slice(1).forEach(function(r) {
      var choreId  = r[0];
      var memberId = r[1];
      if (points[memberId] !== undefined && chorePoints[choreId] !== undefined) {
        points[memberId] += chorePoints[choreId];
      }
    });
  }

  return points;
}

// ─────────────────────────────────────────────────────────────
// REWARD FUNCTIONS
// ─────────────────────────────────────────────────────────────
function getRewards() {
  initSpreadsheet();
  var sheet = SS.getSheetByName(SHEET_REWARDS);
  var rows  = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];
  return rows.slice(1).map(function(r) {
    return {
      id:             r[0],
      title:          r[1],
      description:    r[2],
      pointsRequired: parseInt(r[3]) || 50,
      createdAt:      r[4]
    };
  });
}

function addReward(title, description, pointsRequired) {
  initSpreadsheet();
  var sheet = SS.getSheetByName(SHEET_REWARDS);
  var id    = 'R' + new Date().getTime();
  sheet.appendRow([id, _sanitize(title), _sanitize(description), parseInt(pointsRequired) || 50, new Date()]);
  return { success: true, id: id };
}

function deleteReward(id) {
  initSpreadsheet();
  _deleteRowById(SHEET_REWARDS, id);
  return { success: true };
}

function redeemReward(rewardId, memberId) {
  initSpreadsheet();
  var rewards = getRewards();
  var reward  = null;
  for (var i = 0; i < rewards.length; i++) {
    if (rewards[i].id === rewardId) { reward = rewards[i]; break; }
  }
  if (!reward) return { success: false, error: 'Reward not found' };

  var points = getPoints();
  if (points[memberId] === undefined) {
    return { success: false, error: 'Member not found' };
  }
  if (points[memberId] < reward.pointsRequired) {
    return { success: false, error: 'Not enough points to redeem this reward' };
  }

  var rdSheet = SS.getSheetByName(SHEET_REDEMPTION);
  rdSheet.appendRow([rewardId, memberId, new Date()]);
  return { success: true };
}

function getRedemptions() {
  initSpreadsheet();
  var sheet = SS.getSheetByName(SHEET_REDEMPTION);
  var rows  = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];
  return rows.slice(1).map(function(r) {
    return { rewardId: r[0], memberId: r[1], redeemedAt: r[2] };
  });
}

// ─────────────────────────────────────────────────────────────
// CONVENIENCE WRAPPER  (single round-trip on page load)
// ─────────────────────────────────────────────────────────────
function getAllData() {
  initSpreadsheet();
  return {
    members:      getMembers(),
    chores:       getChores(),
    points:       getPoints(),
    rewards:      getRewards(),
    redemptions:  getRedemptions()
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
  return value.replace(/^[=+\-@\t\r]/, '');
}
