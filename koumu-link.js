/* 工務ツール共通：Chatwork・スプレッドシート連携の設定
   設定は同じサイト（takeda-png.github.io）のツール間で共有されます。 */
(function () {
  "use strict";
  var KEY = "koumu-link-v1";
  function cfg() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function store(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function roomId(s) { return String(s || "").replace(/^.*rid/, "").replace(/[^0-9]/g, ""); }

  var CSS =
    ".kl-steps{margin:8px 0 12px;padding-left:20px;font-size:14px}.kl-steps li{margin:4px 0}" +
    ".kl-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin:12px 0}" +
    ".kl-grid label{display:block;font-size:13px;color:var(--sub)}.kl-grid input{display:block;width:100%;margin-top:4px}" +
    ".kl-st{display:inline-block;font-size:12px;padding:2px 8px;border-radius:999px;margin-left:8px;font-weight:600}" +
    ".kl-st.on{background:var(--soft);color:var(--main)}.kl-st.off{background:var(--bg);color:var(--sub);border:1px solid var(--line)}" +
    ".kl-msg{margin-top:10px;font-size:14px;border-radius:6px;padding:8px 12px}.kl-msg.ok{background:var(--soft)}" +
    ".kl-msg.ng{background:var(--red-soft,#fbe9e5);color:var(--red,#c2412d)}code{font-size:13px;background:var(--bg);padding:1px 5px;border-radius:4px}";

  function mount(el, onChange) {
    var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    var c = cfg();
    el.innerHTML =
      '<summary>Chatwork・スプレッドシート連携の設定<span class="kl-st" id="klState"></span></summary>' +
      '<p class="note">ページから直接Chatworkには送れないため、Googleスプレッドシートに付けた Apps Script を中継役にします。ChatworkのAPIトークンは Apps Script 側に保存するので、このページには残りません。設定は最初に1回だけです。</p>' +
      '<ol class="kl-steps">' +
      '<li>書き出し先の Google スプレッドシートを新しく作る</li>' +
      '<li>そのシートで「拡張機能 → Apps Script」を開き、最初からある中身を消して、下の「コードをコピー」で貼り付けて保存する</li>' +
      '<li>上の関数の選択で <code>初期設定</code> を選んで「実行」し、権限を許可する</li>' +
      '<li>左の歯車「プロジェクトの設定」→「スクリプト プロパティ」に2つ追加する：<br><code>CHATWORK_TOKEN</code> ＝ ChatworkのAPIトークン（Chatwork右上の名前 →「サービス連携」→「APIトークン」）<br><code>SECRET</code> ＝ 好きな合言葉（下の欄にも同じものを入れる）</li>' +
      '<li>右上「デプロイ → 新しいデプロイ」で種類を「ウェブアプリ」にし、次のユーザーとして実行＝自分、アクセスできるユーザー＝全員 にしてデプロイ。表示されたURLを下の「連携用URL」に貼る</li>' +
      '<li>ルームID（ChatworkのURLの <code>#!rid</code> の後ろの数字）を入れて「接続テスト」</li>' +
      '<li>毎朝の通知を使うときは、Apps Script で <code>毎朝の通知を設定する</code> を1回実行（期限が7日以内・過ぎた未完了のやることを、毎朝8時台に案件ごとのルームへ送ります）</li>' +
      '</ol>' +
      '<div class="btns"><button type="button" id="klCopy">コードをコピー</button><a href="apps-script.gs" target="_blank" rel="noopener" style="align-self:center;font-size:14px">コードを開く</a></div>' +
      '<div class="kl-grid">' +
      '<label>連携用URL（ウェブアプリのURL）<input id="klUrl" placeholder="https://script.google.com/macros/s/…/exec" value="' + esc(c.url) + '"></label>' +
      '<label>合言葉（SECRET と同じもの）<input id="klSecret" type="password" autocomplete="off" value="' + esc(c.secret) + '"></label>' +
      '<label>いつも送るルームID<input id="klRoom" inputmode="numeric" placeholder="例: 123456789" value="' + esc(c.room) + '"></label>' +
      '</div>' +
      '<div class="btns"><button type="button" class="pri" id="klTest">接続テスト（ルームにテスト送信）</button><button type="button" id="klClear">設定を消す</button></div>' +
      '<div id="klMsg"></div>' +
      '<p class="note">※ 送信者はAPIトークンの持ち主の名前になります。合言葉を知らない人は連携用URLから送れません。この設定はこのブラウザにだけ保存されます。</p>';
    var $ = function (id) { return document.getElementById(id); };
    function upd() {
      var x = cfg(); var on = !!(x.url && x.secret);
      $("klState").className = "kl-st " + (on ? "on" : "off"); $("klState").textContent = on ? "設定済み" : "未設定";
      if (onChange) onChange(on);
    }
    ["klUrl", "klSecret", "klRoom"].forEach(function (id) {
      $(id).addEventListener("change", function () {
        var x = cfg(); x.url = $("klUrl").value.trim(); x.secret = $("klSecret").value; x.room = roomId($("klRoom").value);
        $("klRoom").value = x.room; store(x); upd();
      });
    });
    $("klClear").addEventListener("click", function () { store({}); $("klUrl").value = ""; $("klSecret").value = ""; $("klRoom").value = ""; msg("設定を消しました。", true); upd(); });
    $("klCopy").addEventListener("click", function () {
      fetch("apps-script.gs", { cache: "no-store" }).then(function (r) { return r.text(); }).then(function (t) { return copyText(t); })
        .then(function () { msg("Apps Script のコードをコピーしました。Apps Script の画面に貼り付けてください。", true); })
        .catch(function () { msg("コピーできませんでした。「コードを開く」から全体を選んでコピーしてください。", false); });
    });
    $("klTest").addEventListener("click", function () {
      var x = cfg();
      if (!x.url || !x.secret) { msg("連携用URLと合言葉を入れてください。", false); return; }
      msg("確認しています…", true);
      post({ action: "test", room: x.room || "" }).then(function (r) {
        var s = r.message || "接続できました";
        if (x.room) s += r.chatwork && r.chatwork.ok ? "。Chatworkにテストを送りました。" : "。Chatworkへの送信は失敗：" + ((r.chatwork && r.chatwork.error) || "");
        else s += "。ルームIDが空なのでChatworkには送っていません。";
        msg(s, r.ok);
      }).catch(function (e) { msg(String(e.message || e), false); });
    });
    function msg(t, ok) { $("klMsg").innerHTML = '<div class="kl-msg ' + (ok ? "ok" : "ng") + '">' + esc(t) + "</div>"; }
    upd();
  }

  function copyText(t) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t);
    return new Promise(function (res, rej) {
      var ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy") ? res() : rej(); } catch (e) { rej(e); } ta.remove();
    });
  }

  function post(payload) {
    var x = cfg();
    if (!x.url || !x.secret) return Promise.reject(new Error("連携が未設定です。ページ下の「Chatwork・スプレッドシート連携の設定」を開いてください。"));
    if (!/^https:\/\//.test(x.url)) return Promise.reject(new Error("連携用URLは https:// で始まるURLを入れてください。"));
    var body = JSON.stringify(Object.assign({}, payload, { secret: x.secret }));
    return fetch(x.url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: body, redirect: "follow" })
      .then(function (r) { return r.text(); })
      .then(function (t) {
        try { return JSON.parse(t); }
        catch (e) { throw new Error("連携用URLから想定外の返事がありました。デプロイの「アクセスできるユーザー」が「全員」になっているか確認してください。"); }
      }, function () { throw new Error("連携用URLにつながりませんでした。URLが正しいか、デプロイ済みかを確認してください。"); });
  }

  window.KoumuLink = { mount: mount, post: post, cfg: cfg, roomId: roomId, ready: function () { var x = cfg(); return !!(x.url && x.secret); } };
})();
