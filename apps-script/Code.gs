// Sales Navigator 미팅 기록 → 구글 시트
// 구글 시트의 [확장 프로그램 > Apps Script]에 붙여넣고 웹 앱으로 배포한다.
//
// 1) 네비게이터를 이 웹 앱이 직접 띄우는 방식 (Google Workspace 조직 계정, 여러 명이 함께 쓰기)
//    index.html(npm run build:gas 결과)도 함께 올리고, 실행 사용자 '웹 앱에 액세스하는 사용자',
//    액세스 권한 '조직 내 사용자'로 배포한다. 이 시트를 편집 권한으로 공유받은 사람만 저장할 수 있고,
//    저장한 사람의 이메일이 '작성자' 열에 들어간다. 헬스체크·리뉴얼 기록은 각각 '헬스체크'·'리뉴얼' 탭에 쌓인다.
//    웹 앱 주소를 브라우저(Chrome·Edge 등)에서 열면 네비게이터가 뜨고, 저장하면 이 시트에 바로 쓴다.
// 2) HTML 파일(sales-navigator.html)에서 이 시트로 보내는 방식 (개인 Gmail 계정)
//    액세스 권한 '모든 사용자'로 배포하고, 웹 앱 주소(.../exec)를 네비게이터에 붙여넣는다.
//    주소를 아는 사람은 시트에 줄을 추가할 수 있다 (시트 내용은 읽을 수 없다).

// 페이지별 기록 시트(탭). 화면이 보낸 이름이 이 목록에 없으면 첫 번째 탭에 쓴다.
var SHEETS = ['헬스체크', '리뉴얼'];

function sheetName_(name) {
  return SHEETS.indexOf(name) >= 0 ? name : SHEETS[0];
}

// 웹 앱 주소를 열면 네비게이터 화면(index.html)을 보여 준다. ?api=1 은 HTML 파일의 [연결] 확인용.
function doGet(e) {
  if (e && e.parameter && e.parameter.api) return json_(sheetInfo_());
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Red Hat 솔루션 영업 네비게이터')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function sheetInfo_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return { ok: true, app: 'sales-navigator', name: ss.getName(), url: ss.getUrl() };
}

// 아래 두 함수는 웹 앱 화면에서 google.script.run 으로 부른다.
function getSheetInfo() {
  return friendly_(function () {
    var info = sheetInfo_();
    return { name: info.name, url: info.url, user: userEmail_() };
  });
}

function saveRecord(body) {
  return friendly_(function () {
    return withLock_(function () {
      return appendRecord_(SpreadsheetApp.getActiveSpreadsheet(), body && body.sheet, body && body.columns, body && body.cells);
    });
  });
}

// 시트를 공유받지 못한 사람에게는 알아들을 수 있는 말로 알려 준다
function friendly_(fn) {
  try {
    return fn();
  } catch (err) {
    var msg = String((err && err.message) || err);
    if (/permission|권한|access/i.test(msg)) {
      throw new Error('이 구글 시트에 편집 권한이 없습니다. 시트 주인에게 편집 권한으로 공유해 달라고 요청해 주세요.');
    }
    throw err;
  }
}

// 지금 웹 앱을 쓰는 사람의 이메일 (실행 사용자가 '웹 앱에 액세스하는 사용자'일 때 채워진다)
function userEmail_() {
  try {
    return Session.getActiveUser().getEmail() || '';
  } catch (err) {
    return '';
  }
}

// HTML 파일에서 보내는 미팅 기록 한 줄 추가. 본문: { columns: string[], cells: { 열이름: 값 } }
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var row = withLock_(function () {
      return appendRecord_(SpreadsheetApp.getActiveSpreadsheet(), body.sheet, body.columns, body.cells);
    });
    return json_({ ok: true, row: row });
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function appendRecord_(ss, sheetName, columns, cells) {
  if (!Array.isArray(columns) || !cells || typeof cells !== 'object') throw new Error('잘못된 요청입니다.');
  if (!String(cells['고객사명'] || '').trim()) throw new Error('고객사명을 입력해 주세요.');

  // 작성자는 화면이 보낸 값이 아니라 구글 로그인 계정으로 채운다
  cells = Object.assign({}, cells, { '작성자': userEmail_() });
  columns = columns.filter(function (c) { return c !== '작성자'; }).concat(['작성자']); // 작성자는 맨 뒤

  var name = sheetName_(sheetName);
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  var lastCol = sheet.getLastColumn();
  var header = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String) : [];

  // 머리글에 없는 열은 오른쪽에 붙인다 (예전 줄은 그대로 둔다)
  var added = columns.filter(function (c) { return header.indexOf(c) === -1; });
  if (added.length) {
    header = header.concat(added);
    var head = sheet.getRange(1, 1, 1, header.length);
    head.setValues([header]);
    head.setFontWeight('bold').setFontColor('#ffffff').setBackground('#cc0000');
    sheet.setFrozenRows(1);
    sheet.setFrozenColumns(2);
  }

  // 작성자 열이 맨 뒤가 아니면 (예전 탭, 나중에 붙은 열) 데이터째 맨 뒤로 옮긴다
  var ai = header.indexOf('작성자');
  if (ai >= 0 && ai !== header.length - 1) {
    sheet.moveColumns(sheet.getRange(1, ai + 1, 1, 1), header.length + 1);
    header.splice(ai, 1);
    header.push('작성자');
  }

  var values = header.map(function (name) {
    return Object.prototype.hasOwnProperty.call(cells, name) ? safe_(cells[name]) : '';
  });
  var r = Math.max(sheet.getLastRow(), 1) + 1;
  sheet.getRange(r, 1, 1, header.length).setValues([values]);
  return r;
}

// =, +, -, @ 로 시작하는 글자는 수식으로 해석되지 않도록 글자로 저장한다
function safe_(v) {
  if (typeof v === 'number') return v;
  var s = String(v == null ? '' : v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
