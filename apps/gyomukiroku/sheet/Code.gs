/**
 * 声の業務記録 → Googleスプレッドシート連携（Google Apps Script）
 *
 * 使い方：
 *  1. 記録を集めるスプレッドシートで「拡張機能」→「Apps Script」を開く
 *  2. このファイルの中身を全部貼りつけ、下の COMPANY_CODE を自分で決めた会社コードに変える
 *  3. 「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」
 *     実行するユーザー：自分 ／ アクセスできるユーザー：全員 → 「デプロイ」→ 承認
 *  4. 表示された「ウェブアプリのURL」を apps/config.js の GD_SHEET.url に入れる
 *  5. ドライバーはアプリの「設定」で、同じ会社コードを入れる
 *
 * 料金はかかりません（Googleの無料枠で動きます）。
 */

// ドライバーがアプリの「設定」に入れる会社コード（合言葉）。必ず変えてください。
const COMPANY_CODE = 'ここに会社コード';

const DAY_SHEET = '業務記録';
const DAY_HEAD = ['日付', '運転者', '車両番号', '営業所', '開始時刻', '開始地点', '終了時刻', '終了地点', '休憩', '走行距離km', '主な経過地点', '開始メーター', '終了メーター', '入力した内容', '最終更新', '端末ID'];
const DAY_KEY_COL = 16; // 端末ID|日付 で1日1行にまとめる

const ACC_SHEET = '事故記録';
const ACC_HEAD = ['保存日時', '運転者', '車両番号', '営業所', '発生日時', '場所', '事故の概要', '原因', '再発防止策', '死傷者', '記録ID'];
const ACC_KEY_COL = 11;

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const d = JSON.parse(e.postData.contents);
    if (COMPANY_CODE === 'ここに会社コード') return out_({ ok: false, error: 'code_not_set' });
    if (String(d.code || '') !== COMPANY_CODE) return out_({ ok: false, error: 'bad_code' });
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const p = d.profile || {};
    if (d.kind === 'day') {
      const s = d.summary || {};
      const row = [
        d.date, p.name, p.car, p.office,
        s.start, s.startPlace, s.end, s.endPlace, s.breaks, s.distance, s.waypoints, s.odoStart, s.odoEnd,
        (d.events || []).map(function (ev) { return ev.time + ' ' + ev.label + (ev.detail ? '（' + ev.detail + '）' : ''); }).join('\n'),
        d.updatedAt, d.device + '|' + d.date,
      ];
      upsert_(sheet_(ss, DAY_SHEET, DAY_HEAD), DAY_KEY_COL, d.device + '|' + d.date, row);
    } else if (d.kind === 'accident') {
      const a = d.accident || {};
      const row = [a.savedAt, p.name, p.car, p.office, a.when, a.where, a.what, a.why, a.fix, a.hurt, a.id];
      upsert_(sheet_(ss, ACC_SHEET, ACC_HEAD), ACC_KEY_COL, a.id, row);
    } else {
      return out_({ ok: false, error: 'bad_kind' });
    }
    return out_({ ok: true });
  } catch (err) {
    return out_({ ok: false, error: 'server', detail: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// ブラウザでURLを開いた時の動作確認用
function doGet() {
  return out_({ ok: true, app: 'gyomu-kiroku', codeSet: COMPANY_CODE !== 'ここに会社コード' });
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function sheet_(ss, name, head) {
  let s = ss.getSheetByName(name);
  if (!s) {
    s = ss.insertSheet(name);
    s.appendRow(head);
    s.setFrozenRows(1);
    s.getRange(1, 1, 1, head.length).setFontWeight('bold').setBackground('#fbf0d9');
  }
  return s;
}

// 「=」などで始まる文字を数式として扱わせない
function safe_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return v;
  const t = String(v).slice(0, 5000);
  return /^[=+\-@]/.test(t) ? "'" + t : t;
}

function upsert_(s, keyCol, key, row) {
  const values = row.map(safe_);
  const last = s.getLastRow();
  if (last > 1) {
    const keys = s.getRange(2, keyCol, last - 1, 1).getValues();
    for (let i = 0; i < keys.length; i++) {
      if (keys[i][0] === key) {
        s.getRange(i + 2, 1, 1, values.length).setValues([values]);
        return;
      }
    }
  }
  s.appendRow(values);
}
