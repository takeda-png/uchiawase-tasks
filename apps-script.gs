/**
 * 工務ツール連携（工程表メーカー・打合せタスク逆算）
 * スプレッドシートの「拡張機能 → Apps Script」に貼り付けて使います。
 *
 * 最初に1回だけ：
 *   1) 下の「初期設定」関数を実行し、権限を許可する
 *   2) 「プロジェクトの設定 → スクリプト プロパティ」に次の2つを入れる
 *        CHATWORK_TOKEN … ChatworkのAPIトークン
 *        SECRET         … 合言葉（ツールの連携設定と同じものを入れる）
 *   3) 「デプロイ → 新しいデプロイ → ウェブアプリ」
 *        次のユーザーとして実行：自分 ／ アクセスできるユーザー：全員
 *      で表示されたURLを、ツールの「連携用URL」に貼る
 *   4) 毎朝の通知を使うときは「毎朝の通知を設定する」関数を1回実行する
 */

var SHEET_TASKS = 'やること';
var SHEET_SCHEDULE = '工程表';
var NOTIFY_HOUR = 8;      // 毎朝の通知の時刻
var NOTIFY_DAYS = 7;      // 何日先までの期限を知らせるか

function doPost(e) {
  var p;
  try { p = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: '送られた内容を読み取れませんでした' }); }
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('SECRET');
  if (!secret) return out_({ ok: false, error: 'スクリプト プロパティに SECRET（合言葉）が入っていません' });
  if (p.secret !== secret) return out_({ ok: false, error: '合言葉が違います' });

  var res = { ok: true };
  try {
    if (p.action === 'test') {
      res.message = '接続できました（' + SpreadsheetApp.getActiveSpreadsheet().getName() + '）';
      if (p.room) res.chatwork = sendChatwork_(p.room, '[info][title]接続テスト[/title]工務ツールからの接続テストです。[/info]');
    }
    if (p.sheet) res.sheet = writeRows_(p.sheet.name, p.sheet.header, p.sheet.rows, p.sheet.caseName);
    if (p.chatwork) res.chatwork = sendChatwork_(p.chatwork.room, p.chatwork.body);
  } catch (err) {
    res.ok = false; res.error = String(err && err.message || err);
  }
  if ((res.chatwork && !res.chatwork.ok) || (res.sheet && !res.sheet.ok)) res.ok = false;
  return out_(res);
}

function doGet() {
  return out_({ ok: true, message: '工務ツール連携は動いています（送信はツールから行います）' });
}

/** 同じ案件の行を消してから、新しい行を書き足す */
function writeRows_(name, header, rows, caseName) {
  if (name !== SHEET_TASKS && name !== SHEET_SCHEDULE) return { ok: false, error: 'シート名が想定外です' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.appendRow(header);
    sh.getRange(1, 1, 1, header.length).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  var last = sh.getLastRow();
  if (last > 1) {
    var col = sh.getRange(2, 1, last - 1, 1).getValues();
    for (var i = col.length - 1; i >= 0; i--) {
      if (String(col[i][0]) === String(caseName)) sh.deleteRow(i + 2);
    }
  }
  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  return { ok: true, rows: rows.length, url: ss.getUrl() + '#gid=' + sh.getSheetId() };
}

function sendChatwork_(room, body) {
  var token = PropertiesService.getScriptProperties().getProperty('CHATWORK_TOKEN');
  if (!token) return { ok: false, error: 'スクリプト プロパティに CHATWORK_TOKEN が入っていません' };
  room = String(room || '').replace(/[^0-9]/g, '');
  if (!room) return { ok: false, error: 'ChatworkのルームIDが空です' };
  var r = UrlFetchApp.fetch('https://api.chatwork.com/v2/rooms/' + room + '/messages', {
    method: 'post',
    headers: { 'X-ChatWorkToken': token },
    payload: { body: body },
    muteHttpExceptions: true
  });
  var code = r.getResponseCode();
  if (code === 200) return { ok: true };
  return { ok: false, error: 'Chatworkへの送信に失敗しました（' + code + '）' + r.getContentText().slice(0, 200) };
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/** 毎朝、期限が近い・過ぎた未完了のやることを、案件ごとのルームへ送る */
function morningNotify() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TASKS);
  if (!sh || sh.getLastRow() < 2) return;
  var v = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  var h = v[0];
  var ix = function (n) { return h.indexOf(n); };
  var cCase = ix('案件'), cDue = ix('期限'), cTask = ix('やること'), cWho = ix('担当'), cDone = ix('完了'), cRoom = ix('通知先ルーム');
  if (cCase < 0 || cDue < 0 || cTask < 0 || cRoom < 0) return;
  var tz = Session.getScriptTimeZone();
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var groups = {};
  for (var i = 1; i < v.length; i++) {
    var r = v[i];
    if (cDone >= 0 && String(r[cDone]).trim()) continue;
    var room = String(r[cRoom]).replace(/[^0-9]/g, '');
    if (!room) continue;
    var due = r[cDue] instanceof Date ? new Date(r[cDue]) : new Date(String(r[cDue]).replace(/-/g, '/'));
    if (isNaN(due)) continue;
    due.setHours(0, 0, 0, 0);
    var n = Math.round((due - today) / 864e5);
    if (n > NOTIFY_DAYS) continue;
    var key = room + '|' + r[cCase];
    (groups[key] = groups[key] || { room: room, name: r[cCase], items: [] }).items.push({ n: n, due: due, t: r[cTask], w: cWho >= 0 ? r[cWho] : '' });
  }
  Object.keys(groups).forEach(function (k) {
    var g = groups[k];
    g.items.sort(function (a, b) { return a.due - b.due; });
    var lines = g.items.map(function (x) {
      var d = Utilities.formatDate(x.due, tz, 'M/d');
      var tag = x.n < 0 ? '（' + (-x.n) + '日過ぎ）' : x.n === 0 ? '（今日）' : '（あと' + x.n + '日）';
      return '・' + d + ' ' + x.t + ' ／' + (x.w || '担当未定') + tag;
    });
    sendChatwork_(g.room, '[info][title]' + g.name + '：' + NOTIFY_DAYS + '日以内のやること[/title]' + lines.join('\n') + '[/info]');
  });
}

/** 最初に1回実行して、権限を許可する */
function 初期設定() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  UrlFetchApp.fetch('https://api.chatwork.com/v2/me', { muteHttpExceptions: true });
  Logger.log('準備できました：' + ss.getName() + '。スクリプト プロパティに CHATWORK_TOKEN と SECRET を入れてください。');
}

/** 毎朝の通知を設定する（何回実行しても1つだけになる） */
function 毎朝の通知を設定する() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'morningNotify') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('morningNotify').timeBased().everyDays(1).atHour(NOTIFY_HOUR).create();
  Logger.log('毎朝' + NOTIFY_HOUR + '時台に通知します。');
}

/** 毎朝の通知をやめる */
function 毎朝の通知をやめる() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'morningNotify') ScriptApp.deleteTrigger(t);
  });
}
