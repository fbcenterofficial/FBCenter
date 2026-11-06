/* Hangmania web: Classic, Killer and the Daily Word, with the same rules, scoring, word lists
   and accounts as the app (same Supabase project). */
(function () {
  "use strict";

  var SB = "https://oljmcclpwibavpwqqsgs.supabase.co";
  var KEY = "sb_publishable_Px_foIgpEtf3J8RoPF2iiA_A7JtCNVw";

  // AdSense. Left empty, no ad code is loaded at all. client: "ca-pub-…", bannerSlot: the
  // number of a display ad unit. Premium players never get ads.
  var ADS = { client: "", bannerSlot: "" };

  var LANGS = ["en", "ro", "fr", "es", "de", "it", "pt"]; // same column order as daily.js
  var LEVELS = { Easy: [0, 0.1], Medium: [0.1, 0.3], Hard: [0.3, 0.6], Expert: [0.6, 1] };
  var STEP = { Easy: 0, Medium: 1, Hard: 2, Expert: 3 };
  var MAX_LEN = 14, MAX_WRONG = 6;
  var KEYS = {
    de: ["QWERTZUIOP", "ASDFGHJKL", "YXCVBNM"],
    fr: ["AZERTYUIOP", "QSDFGHJKLM", "WXCVBN"],
    _: ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"]
  };

  var $ = function (id) { return document.getElementById(id); };
  function store(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
    } catch (e) { return null; }
  }
  function fmt(s) { var a = arguments; return String(s).replace(/\{(\d)\}/g, function (_, i) { return a[+i + 1]; }); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function dayKey(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function addDays(d, n) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; }

  // ── Language ──────────────────────────────────────────────────────────────
  var lang = (function () {
    var q = (location.search.match(/[?&]lang=([a-z]{2})/) || [])[1];
    var nav = (navigator.language || "en").slice(0, 2).toLowerCase();
    return [q, store("hm_lang"), nav, "en"].filter(function (x) { return x && LANGS.indexOf(x) >= 0; })[0];
  })();
  function t(k) { return (I18N[lang] && I18N[lang][k]) || I18N.en[k] || k; }

  // Accented letters count as their plain letter, like TextUtils.BaseLetter in the app.
  function base(c) {
    if (c === "Œ" || c === "œ") return "O";
    if (c === "Æ" || c === "æ") return "A";
    if (c === "ß") return "S";
    var d = c.normalize("NFD");
    for (var i = 0; i < d.length; i++) if (!/\p{Mn}/u.test(d[i])) return d[i].toUpperCase();
    return c.toUpperCase();
  }
  function typeable(w) {
    for (var i = 0; i < w.length; i++) { var b = base(w[i]); if (b < "A" || b > "Z" || b.length !== 1) return false; }
    return true;
  }

  // ── Words ─────────────────────────────────────────────────────────────────
  var wordCache = {};
  function loadWords() {
    var l = lang;
    if (wordCache[l]) return Promise.resolve(wordCache[l]);
    return fetch("words/" + l + ".txt").then(function (r) {
      if (!r.ok) throw new Error("words");
      return r.text();
    }).then(function (txt) {
      var all = txt.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
      wordCache[l] = all;
      return all;
    });
  }
  // A level is a slice of the frequency-ordered list (WordListService.GetWordsForDifficultyAsync).
  function levelWords(all, level) {
    var L = LEVELS[level] || LEVELS.Easy;
    var from = Math.floor(all.length * L[0]), to = Math.floor(all.length * L[1]);
    return all.slice(from, to).filter(function (w) { return w.length <= MAX_LEN && typeable(w); });
  }

  // The app picks the daily concept with .NET's seeded System.Random(yyyyMMdd).Next(count);
  // this is the same algorithm, so web and app show the same word on the same day.
  function netRandomNext(seed, max) {
    var MBIG = 2147483647, a = new Array(56).fill(0);
    var mj = 161803398 - Math.abs(seed), mk = 1, i, k;
    a[55] = mj;
    for (i = 1; i < 55; i++) { var ii = (21 * i) % 55; a[ii] = mk; mk = mj - mk; if (mk < 0) mk += MBIG; mj = a[ii]; }
    for (k = 1; k < 5; k++) for (i = 1; i < 56; i++) { var n = i + 30; if (n >= 55) n -= 55; a[i] -= a[1 + n]; if (a[i] < 0) a[i] += MBIG; }
    var r = a[1] - a[22]; if (r === MBIG) r--; if (r < 0) r += MBIG;
    return Math.floor(r * (1.0 / MBIG) * max);
  }
  function dailyWord(d) {
    var seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    return DAILY_WORDS[netRandomNext(seed, DAILY_WORDS.length)][LANGS.indexOf(lang)];
  }

  // ── Account (Supabase) ────────────────────────────────────────────────────
  var S = null;
  try { S = JSON.parse(store("hm_session") || "null"); } catch (e) { S = null; }
  function saveS() { store("hm_session", S ? JSON.stringify(S) : null); }

  function api(method, path, body, opts) {
    opts = opts || {};
    var token = opts.anon ? null : (S && S.access);
    var h = { "apikey": KEY, "Content-Type": "application/json", "Authorization": "Bearer " + (token || KEY) };
    if (opts.prefer) h.Prefer = opts.prefer;
    return fetch(SB + path, { method: method, headers: h, body: body == null ? undefined : JSON.stringify(body) })
      .then(function (r) {
        if (r.status === 401 && token && !opts.retried) {
          return refresh().then(function (ok) {
            if (!ok) throw new Error("auth");
            opts.retried = true;
            return api(method, path, body, opts);
          });
        }
        return r.text().then(function (txt) {
          var data = null;
          try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = txt; }
          if (!r.ok) { var err = new Error("http " + r.status); err.status = r.status; err.data = data; throw err; }
          return data;
        });
      });
  }
  function rpc(name, body) { return api("POST", "/rest/v1/rpc/" + name, body || {}); }
  function authCall(url, body) {
    return fetch(url, { method: "POST", headers: { "apikey": KEY, "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) {
        return r.text().then(function (txt) {
          var d = {};
          try { d = JSON.parse(txt) || {}; } catch (e) { d = {}; }
          return { ok: r.ok, status: r.status, data: d };
        });
      });
  }

  var refreshing = null;
  function refresh() {
    if (!S || !S.refresh) return Promise.resolve(false);
    if (refreshing) return refreshing;
    refreshing = authCall(SB + "/auth/v1/token?grant_type=refresh_token", { refresh_token: S.refresh })
      .then(function (res) {
        refreshing = null;
        if (res.ok && res.data.access_token) {
          S.access = res.data.access_token;
          S.refresh = res.data.refresh_token || S.refresh;
          saveS();
          return true;
        }
        if (res.status >= 400 && res.status < 500) { S = null; saveS(); renderAccount(); }
        return false;
      })
      .catch(function () { refreshing = null; return false; });
    return refreshing;
  }

  function loadProfile() {
    if (!S) return Promise.resolve();
    return rpc("get_my_profile").then(function (rows) {
      var u = rows && rows[0];
      if (!u) return;
      S.username = u.Username || S.username;
      S.premium = !!u.Premium;
      S.score = u.Score | 0;
      S.streak = u.Streak | 0;
      if (u.Email) S.email = String(u.Email).trim().toLowerCase();
      saveS();
    }).catch(function () { });
  }

  function startSession(d) {
    S = {
      access: d.access_token, refresh: d.refresh_token,
      email: ((d.user && d.user.email) || "").toLowerCase(),
      username: "", premium: false, score: 0, streak: 0
    };
    saveS();
    return loadProfile().then(function () {
      renderHome();
      renderAccount();
      updateAds();
    });
  }

  function authError(data, fallback) {
    var code = data && (data.error_code || data.code);
    var key = {
      invalid_credentials: "errInvalid", user_already_exists: "errEmailRegistered", email_exists: "errEmailRegistered",
      weak_password: "errWeakPassword", over_request_rate_limit: "errRate", over_email_send_rate_limit: "errRate",
      otp_expired: "errCode", email_not_confirmed: "errVerifyFirst", username_login_unavailable: "errUsernameLogin"
    }[code];
    return new Error(key || fallback || "errGeneric");
  }

  function signIn(id, pw) {
    id = id.trim();
    var call = id.indexOf("@") >= 0
      ? authCall(SB + "/auth/v1/token?grant_type=password", { email: id.toLowerCase(), password: pw })
      : authCall(SB + "/functions/v1/sign-in-username", { username: id, password: pw })
          .catch(function () { return { ok: false, data: { error_code: "username_login_unavailable" } }; });
    return call.then(function (res) {
      if (!res.ok || !res.data.access_token) throw authError(res.data, "errInvalid");
      return startSession(res.data);
    });
  }

  var pending = null; // { email, username } while waiting for the signup code
  function signUp(user, email, pw) {
    user = user.trim(); email = email.trim().toLowerCase();
    return api("GET", "/rest/v1/Users?Username=eq." + encodeURIComponent(user) + "&select=Username&limit=1", null, { anon: true })
      .then(function (rows) {
        if (rows && rows.length) throw new Error("errUsernameTaken");
        return authCall(SB + "/auth/v1/signup", { email: email, password: pw, data: { username: user } });
      })
      .then(function (res) {
        if (!res.ok) throw authError(res.data);
        if (res.data.access_token) return startSession(res.data).then(function () { return "done"; });
        pending = { email: email, username: user };
        return "code";
      });
  }
  function verifyCode(code) {
    return authCall(SB + "/auth/v1/verify", { type: "signup", email: pending.email, token: code.trim() })
      .then(function (res) {
        if (!res.ok || !res.data.access_token) throw authError(res.data, "errCode");
        return startSession(res.data);
      });
  }
  function logout() {
    if (S && S.access) fetch(SB + "/auth/v1/logout", { method: "POST", headers: { "apikey": KEY, "Authorization": "Bearer " + S.access } }).catch(function () { });
    S = null; saveS();
    renderHome(); renderAccount(); loadLeaderboard();
  }

  // ── Guest progress (this browser only) ────────────────────────────────────
  function guestScore() { return parseInt(store("hm_guest_score") || "0", 10) || 0; }
  function guestAdd(n) { store("hm_guest_score", String(Math.max(0, guestScore() + n))); }
  function guestDaily(d) { return store("hm_daily_" + dayKey(d)); } // "1" won, "0" lost, null not played
  function streakFrom(wonByDay) {
    var today = new Date(), cur = wonByDay[dayKey(today)] !== undefined ? today : addDays(today, -1), n = 0;
    while (wonByDay[dayKey(cur)] === true) { n++; cur = addDays(cur, -1); }
    return n;
  }
  function guestStreak() {
    var map = {}, d = new Date();
    for (var i = 0; i < 400; i++) {
      var v = guestDaily(addDays(d, -i));
      if (v !== null) map[dayKey(addDays(d, -i))] = v === "1";
    }
    return streakFrom(map);
  }

  // ── Daily Word: played today? ─────────────────────────────────────────────
  var dailyPlayedToday = null; // true / false / null (unknown yet)
  function checkDailyPlayed() {
    var today = new Date();
    if (!S) { dailyPlayedToday = guestDaily(today) !== null; return Promise.resolve(dailyPlayedToday); }
    return api("GET", "/rest/v1/DailyCompletions?Email=eq." + encodeURIComponent(S.email) + "&WordDate=eq." + dayKey(today) + "&select=WordDate&limit=1")
      .then(function (rows) { dailyPlayedToday = !!(rows && rows.length); return dailyPlayedToday; })
      .catch(function () { dailyPlayedToday = null; return null; });
  }

  // Marks today done first; points are only paid once that's saved (as in DailyWordPage).
  function completeDaily(won) {
    var today = new Date(), key = dayKey(today);
    if (!S) {
      store("hm_daily_" + key, won ? "1" : "0");
      return Promise.resolve({ ok: true, streak: guestStreak(), unlocked: [] });
    }
    return api("POST", "/rest/v1/DailyCompletions?on_conflict=Email,WordDate", { Email: S.email, WordDate: key, Won: won },
      { prefer: "resolution=merge-duplicates,return=minimal" })
      .then(function () { return api("GET", "/rest/v1/DailyCompletions?Email=eq." + encodeURIComponent(S.email) + "&select=WordDate,Won"); })
      .then(function (rows) {
        var map = {};
        (rows || []).forEach(function (r) { var k = String(r.WordDate).slice(0, 10); map[k] = map[k] === true || !!r.Won; });
        var streak = streakFrom(map);
        return rpc("update_daily_streak", { p_streak: streak, p_last_daily_date: key }).then(function (un) {
          S.streak = streak; saveS();
          return { ok: true, streak: streak, unlocked: Array.isArray(un) ? un : [] };
        });
      })
      .catch(function () { return { ok: false }; });
  }

  // ── Saving a finished round ───────────────────────────────────────────────
  function unlock(code) {
    return rpc("unlock_achievement", { p_code: code }).then(function (r) { return r === true ? [code] : []; }).catch(function () { return []; });
  }
  // The achievements only visible at the moment of a win (Game.CheckWinBonusAchievementsAsync).
  function winBonusAchievements(g) {
    var codes = [], h = new Date().getHours();
    if (g.mode !== "killer") {
      if (g.wrong === 0) codes.push("clean_sheet");
      if (g.wrong === 5) codes.push("comeback_kid");
    }
    if (h >= 0 && h < 4) codes.push("night_owl");
    if (h >= 5 && h < 8) codes.push("early_bird");
    if (g.mode === "classic" && g.level === "Expert") codes.push("no_help_needed"); // no hints on the web
    return Promise.all(codes.map(unlock)).then(function (lists) { return [].concat.apply([], lists); });
  }

  function saveRound(g, won, total, extraUnlocked) {
    if (!S) {
      if (won && total) guestAdd(total);
      renderHome();
      return;
    }
    var mode = g.mode, diff = mode === "daily" ? null : g.level;
    (won && total ? rpc("update_score", { p_delta: total }) : Promise.resolve())
      .then(function () { return rpc("record_game_result", { p_won: won, p_mode: mode, p_pack_name: null, p_difficulty: diff }); })
      .then(function (un) {
        var list = (Array.isArray(un) ? un : []).concat(extraUnlocked || []);
        return won ? winBonusAchievements(g).then(function (x) { return list.concat(x); }) : list;
      })
      .then(function (list) {
        if (won && total) { S.score = (S.score || 0) + total; saveS(); toast(fmt(t("savedFmt"), total)); }
        if (list.length) setTimeout(function () { toast(t("achievement")); }, won && total ? 2600 : 0);
        renderHome();
      })
      .catch(function () { toast(t("saveFailed")); });
  }

  // ── Ads ───────────────────────────────────────────────────────────────────
  var adsLoaded = false, adsBlocked = false, roundsDone = 0;
  function adsOn() { return !!ADS.client && !(S && S.premium); }
  function updateAds() {
    document.body.classList.toggle("no-ads", !adsOn());
    var slot = $("adHome");
    if (!adsOn()) { slot.innerHTML = ""; return; }
    if (!adsLoaded) {
      adsLoaded = true;
      window.adsbygoogle = window.adsbygoogle || [];
      window.adBreak = window.adConfig = function (o) { window.adsbygoogle.push(o); };
      var s = document.createElement("script");
      s.async = true; s.crossOrigin = "anonymous";
      s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(ADS.client);
      s.onerror = function () { adsBlocked = true; };
      document.head.appendChild(s);
      window.adConfig({ preloadAdBreaks: "on", sound: "off" });
    }
    if (ADS.bannerSlot && !slot.firstChild) {
      slot.innerHTML = '<ins class="adsbygoogle" style="display:block" data-ad-client="' + esc(ADS.client) +
        '" data-ad-slot="' + esc(ADS.bannerSlot) + '" data-ad-format="auto" data-full-width-responsive="true"></ins>';
      try { window.adsbygoogle.push({}); } catch (e) { }
    }
  }
  // Every third finished round, an ad between rounds (AdSense for games, "next" placement).
  function betweenRounds(next) {
    roundsDone++;
    if (!adsOn() || adsBlocked || roundsDone % 3 !== 0) { next(); return; }
    var done = false, started = false;
    function go() { if (!done) { done = true; next(); } }
    try {
      window.adBreak({ type: "next", name: "round_end", beforeAd: function () { started = true; }, adBreakDone: go });
    } catch (e) { go(); return; }
    setTimeout(function () { if (!started) go(); }, 1500);
  }

  // ── Game ──────────────────────────────────────────────────────────────────
  var G = null;

  function revealedAt(i) { return G.guessed.indexOf(base(G.word[i])) >= 0; }
  function allRevealed() { for (var i = 0; i < G.word.length; i++) if (!revealedAt(i)) return false; return true; }

  function startGame(mode, level) {
    G = { mode: mode, level: level, word: "", guessed: [], wrong: 0, score: 0, delta: 0, over: true };
    $("gMode").textContent = mode === "daily" ? t("daily") : (mode === "killer" ? t("killer") : t("classic")) + " · " + t(level + "Label");
    $("streakStat").hidden = mode !== "daily";
    $("gStreak").textContent = S ? (S.streak | 0) : guestStreak();
    $("gPlayed").hidden = true;
    $("gWord").textContent = "";
    $("gGuessed").textContent = "";
    $("kb").hidden = false;
    $("typeHint").hidden = false;
    renderStats();

    if (mode === "daily") {
      var word = dailyWord(new Date());
      checkDailyPlayed().then(function (played) {
        if (!G || G.mode !== "daily") return;
        if (played) { showDailyPlayed(); return; }
        begin(word);
      });
      return;
    }
    loadWords().then(function (all) {
      if (!G || G.mode !== mode) return;
      var ws = levelWords(all, level);
      begin(ws.length ? ws[Math.floor(Math.random() * ws.length)] : "HANGMAN");
    }).catch(function () { toast(t("errGeneric")); go(""); });
  }

  function begin(word) {
    G.word = word; G.over = false; G.guessed = []; G.wrong = 0; G.score = 0; G.delta = 0;
    if (G.mode !== "killer") G.guessed.push(base(word[0])); // first letter free, except in Killer
    buildKeyboard();
    renderGame();
  }

  function showDailyPlayed() {
    $("kb").hidden = true;
    $("typeHint").hidden = true;
    $("gWord").textContent = "";
    $("gImg").src = "img/hangman0.png";
    var p = $("gPlayed");
    p.hidden = false;
    p.innerHTML = esc(t("dailyPlayedMsg")) + '<br><b id="countdown"></b>';
    tickCountdown();
  }
  var cdTimer = null;
  function tickCountdown() {
    clearTimeout(cdTimer);
    var el = $("countdown");
    if (!el) return;
    var now = new Date(), next = addDays(now, 1), s = Math.max(0, Math.floor((next - now) / 1000));
    el.textContent = fmt(t("dailyNext"), pad(Math.floor(s / 3600)) + ":" + pad(Math.floor(s % 3600 / 60)) + ":" + pad(s % 60));
    cdTimer = setTimeout(tickCountdown, 1000);
  }

  function buildKeyboard() {
    var kb = $("kb");
    kb.innerHTML = "";
    (KEYS[lang] || KEYS._).forEach(function (r) {
      var row = document.createElement("div");
      row.className = "row";
      r.split("").forEach(function (ch) {
        var b = document.createElement("button");
        b.className = "key"; b.textContent = ch; b.id = "k" + ch; b.type = "button";
        b.addEventListener("click", function () { guess(ch); });
        row.appendChild(b);
      });
      kb.appendChild(row);
    });
  }

  function renderStats() {
    $("gScore").textContent = G ? G.score : 0;
    $("gWrong").textContent = (G ? G.wrong : 0) + "/" + MAX_WRONG;
  }

  function renderGame() {
    renderStats();
    $("gImg").src = "img/hangman" + Math.min(G.wrong, 6) + ".png";
    var shown = "";
    for (var i = 0; i < G.word.length; i++) shown += revealedAt(i) || G.over ? G.word[i] : "_";
    var w = $("gWord");
    w.textContent = shown;
    var n = G.word.length;
    w.style.fontSize = (n <= 6 ? 40 : n <= 8 ? 34 : n <= 10 ? 28 : n <= 12 ? 24 : 20) + "px";
    $("gGuessed").textContent = G.guessed.length ? t("GuessedPrefix") + G.guessed.slice().sort().join(", ") : t("GuessedNone");
    G.guessed.forEach(function (c) {
      var k = $("k" + c);
      if (!k) return;
      var inWord = G.word.split("").some(function (x) { return base(x) === c; });
      k.className = "key " + (inWord ? "hit" : "miss");
      k.disabled = true;
    });
  }

  function shake() { var b = $("board"); b.classList.remove("shake"); void b.offsetWidth; b.classList.add("shake"); }

  // Same points as the app: Classic +5 per letter / −2, Daily +10 / −5, Killer +3 per miss / −1.
  function guess(L) {
    if (!G || G.over || !G.word) return;
    if (G.guessed.indexOf(L) >= 0) { var k = $("k" + L); if (k) { k.classList.remove("shake"); void k.offsetWidth; k.classList.add("shake"); } return; }
    G.guessed.push(L);
    var hits = 0, d;
    for (var i = 0; i < G.word.length; i++) if (base(G.word[i]) === L) hits++;
    if (G.mode === "killer") {
      if (hits === 0) { d = 3; G.wrong++; } else { d = -1; shake(); }
    } else if (hits) {
      d = (G.mode === "daily" ? 10 : 5) * hits;
    } else {
      d = G.mode === "daily" ? -5 : -2; G.wrong++; shake();
    }
    G.score = Math.max(0, G.score + d);
    G.delta += d;
    renderGame();
    checkEnd();
  }

  function checkEnd() {
    var full = allRevealed(), won, lost;
    if (G.mode === "killer") { won = G.wrong >= MAX_WRONG; lost = !won && full; }
    else { won = full; lost = !won && G.wrong >= MAX_WRONG; }
    if (!won && !lost) return;
    G.over = true;
    finish(won);
  }

  function finish(won) {
    var g = G;
    if (g.mode === "daily") {
      var attempt = function (n) {
        return completeDaily(won).then(function (res) {
          return res.ok || n >= 2 ? res : new Promise(function (ok) { setTimeout(ok, 1500); }).then(function () { return attempt(n + 1); });
        });
      };
      attempt(0).then(function (res) {
        // Not saved: no points, and the day stays playable (reload to try again).
        if (!res.ok) { toast(t("saveFailed")); return; }
        var total = 0;
        if (won) { g.score += 50; total = g.delta + 50; }
        $("gStreak").textContent = res.streak;
        dailyPlayedToday = true;
        renderGame();
        saveRound(g, won, total, res.unlocked);
        setTimeout(function () { showResult(g, won); }, 450);
      });
      return;
    }
    var total = 0;
    if (won) {
      var bonus = g.mode === "killer" ? 5 + 5 * STEP[g.level] : 20 + 10 * STEP[g.level];
      g.score += bonus;
      total = g.delta + bonus;
    }
    renderGame();
    saveRound(g, won, total);
    setTimeout(function () { showResult(g, won); }, 450);
  }

  function showResult(g, won) {
    var title = g.mode === "killer" ? (won ? t("KillerWinTitle") : t("KillerLoseTitle"))
                                    : (won ? t("CongratulationsTitle") : t("GameOverTitle"));
    $("rTitle").textContent = title + (won ? " 🎉" : " 💀");
    $("rWord").textContent = fmt(t("GameOverMsg"), g.word);
    $("rScore").textContent = fmt(t("ScorePtsFormat"), g.score);
    $("rAgain").hidden = g.mode === "daily";
    $("rAgain").textContent = t("NewGame");
    $("rHome").textContent = t("GoHome");
    $("result").hidden = false;
    $("rAgain").focus();
  }
  $("rAgain").addEventListener("click", function () {
    $("result").hidden = true;
    betweenRounds(function () { startGame(G.mode, G.level); });
  });
  $("rHome").addEventListener("click", function () {
    $("result").hidden = true;
    betweenRounds(function () { go(""); });
  });

  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!$("auth").hidden) return;
    if (!$("result").hidden) {
      if (e.key === "Enter") { e.preventDefault(); ($("rAgain").hidden ? $("rHome") : $("rAgain")).click(); }
      return;
    }
    if ($("game").hidden || !G || G.over || e.key.length !== 1) return;
    var L = base(e.key);
    if (L >= "A" && L <= "Z" && L.length === 1) { e.preventDefault(); guess(L); }
  });

  // ── Screens ───────────────────────────────────────────────────────────────
  function show(id) {
    ["home", "diff", "game"].forEach(function (v) { $(v).hidden = v !== id; });
    window.scrollTo(0, 0);
  }
  // The browser history only ever holds two entries for the game: the home screen and the screen
  // open now (difficulty or a game). Moving between screens replaces the second one, so the
  // browser's Back always leads straight home, and from there straight back to the site.
  function go(hash) {
    hash = hash.replace("#", "");
    var cur = location.hash.replace("#", ""), base = location.pathname + location.search;
    if (hash === cur) { route(); return; }
    if (hash === "") {
      if (history.state && history.state.hm) { history.back(); return; } // popstate → route()
      history.replaceState(null, "", base);
    } else if (cur === "") {
      history.pushState({ hm: 1 }, "", base + "#" + hash);
    } else {
      history.replaceState(history.state, "", base + "#" + hash);
    }
    route();
  }
  function route() {
    clearTimeout(cdTimer);
    $("result").hidden = true;
    var h = location.hash.replace("#", "").split("/");
    if ((h[0] === "classic" || h[0] === "killer") && LEVELS[h[1]]) { show("game"); startGame(h[0], h[1]); }
    else if (h[0] === "classic" || h[0] === "killer") { G = null; renderDiff(h[0]); show("diff"); }
    else if (h[0] === "daily") { show("game"); startGame("daily", null); }
    else { G = null; show("home"); renderHome(); }
  }
  window.addEventListener("popstate", route);
  document.querySelectorAll("[data-back]").forEach(function (b) {
    b.addEventListener("click", function () {
      var h = location.hash.replace("#", "").split("/");
      go(h.length > 1 ? h[0] : "");
    });
  });
  document.querySelectorAll("[data-go]").forEach(function (b) {
    b.addEventListener("click", function () { go(b.getAttribute("data-go")); });
  });
  $("brand").addEventListener("click", function (e) { e.preventDefault(); go(""); });

  var diffMode = "classic";
  function renderDiff(mode) {
    diffMode = mode;
    $("diffTitle").textContent = mode === "killer" ? t("KillerModeHeader") : t("ChooseDifficultyTitle");
    $("diffSub").textContent = t("ChooseDifficultySubtitle");
    document.querySelectorAll(".level").forEach(function (b) {
      var l = b.getAttribute("data-level");
      b.querySelector("b").textContent = t(l + "Label");
      b.querySelector("small").textContent = t(l + "WordsHint");
    });
  }
  document.querySelectorAll(".level").forEach(function (b) {
    b.addEventListener("click", function () { go(diffMode + "/" + b.getAttribute("data-level")); });
  });

  // ── Home ──────────────────────────────────────────────────────────────────
  function renderHome() {
    var p = $("player");
    if (S) {
      p.innerHTML = "<span><b>" + esc(S.username || S.email) + "</b>" + (S.premium ? "<br>" + esc(t("premiumThanks")) : "") +
        '</span><span class="pts">' + esc(fmt(t("pointsFmt"), S.score | 0)) + "</span>";
    } else {
      p.innerHTML = "<span><b>" + esc(t("guest")) + " · " + esc(fmt(t("pointsFmt"), guestScore())) + "</b><br>" +
        esc(t("guestNote")) + '</span><button type="button" id="pLogin">' + esc(t("login")) + "</button>";
      $("pLogin").addEventListener("click", function () { openAuth("fLogin"); });
    }
    var streak = S ? (S.streak | 0) : guestStreak();
    var tag = dailyPlayedToday ? t("dailyDone") : (streak > 0 ? fmt(t("streakFmt"), streak) : "");
    $("dailyTag").textContent = tag;
  }

  function loadLeaderboard() {
    $("lbCard").hidden = !S;
    if (!S) return;
    api("GET", "/rest/v1/Users?select=Username,Score,Premium&HiddenFromLeaderboard=eq.false&order=Score.desc&limit=10", null, { anon: true })
      .then(function (rows) {
        var me = S && S.username;
        $("lbList").innerHTML = (rows && rows.length) ? rows.map(function (r, i) {
          return '<li class="' + (r.Username === me ? "me" : "") + '"><span class="rk">' + (i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1) +
            '</span><span class="nm">' + esc(r.Username) + (r.Premium ? " ⭐" : "") + '</span><span class="sc">' + (r.Score | 0) + "</span></li>";
        }).join("") : '<li class="empty">' + esc(t("lbEmpty")) + "</li>";
      })
      .catch(function () { });
  }

  // ── Account dialog ────────────────────────────────────────────────────────
  function openAuth(form) {
    ["fLogin", "fSignup", "fCode", "fMe"].forEach(function (f) { $(f).hidden = f !== form; });
    document.querySelectorAll("#auth .err").forEach(function (e) { e.hidden = true; });
    if (form === "fMe") {
      $("meName").textContent = S.username || S.email;
      $("meInfo").textContent = fmt(t("pointsFmt"), S.score | 0) + (S.premium ? " · " + t("premiumThanks") : "");
    }
    if (form === "fCode") $("codeSent").textContent = fmt(t("codeSentFmt"), pending ? pending.email : "");
    $("auth").hidden = false;
    var first = $(form).querySelector("input");
    if (first) setTimeout(function () { first.focus(); }, 50);
  }
  function closeAuth() { $("auth").hidden = true; }
  $("authClose").addEventListener("click", closeAuth);
  $("auth").addEventListener("click", function (e) { if (e.target === $("auth")) closeAuth(); });
  $("acct").addEventListener("click", function () { openAuth(S ? "fMe" : "fLogin"); });
  $("logout").addEventListener("click", function () { logout(); closeAuth(); });
  document.querySelectorAll("[data-swap]").forEach(function (a) {
    a.addEventListener("click", function (e) { e.preventDefault(); openAuth(a.getAttribute("data-swap")); });
  });

  function handleForm(id, run) {
    var f = $(id);
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var err = f.querySelector(".err"), btn = f.querySelector("button[type=submit]");
      var vals = {};
      Array.prototype.forEach.call(f.querySelectorAll("input"), function (i) { vals[i.name] = i.value; });
      if (Object.keys(vals).some(function (k) { return !vals[k].trim(); })) { err.textContent = t("errFields"); err.hidden = false; return; }
      err.hidden = true; btn.disabled = true;
      run(vals).then(function () { btn.disabled = false; }, function (ex) {
        btn.disabled = false;
        err.textContent = t(I18N.en[ex && ex.message] ? ex.message : "errGeneric");
        err.hidden = false;
      });
    });
  }
  handleForm("fLogin", function (v) {
    return signIn(v.id, v.pw).then(function () { closeAuth(); afterLogin(); });
  });
  handleForm("fSignup", function (v) {
    return signUp(v.user, v.email, v.pw).then(function (r) {
      if (r === "code") openAuth("fCode"); else { closeAuth(); afterLogin(); }
    });
  });
  handleForm("fCode", function (v) {
    return verifyCode(v.code).then(function () { closeAuth(); afterLogin(); });
  });
  function afterLogin() {
    dailyPlayedToday = null;
    checkDailyPlayed().then(renderHome);
    loadLeaderboard();
    if (G && G.mode === "daily") route();
  }

  function renderAccount() {
    $("acct").textContent = S ? (S.username || t("login")) : t("login");
  }

  // ── Toast ─────────────────────────────────────────────────────────────────
  var toastTimer = null;
  function toast(msg) {
    var el = $("toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2500);
  }

  // ── Texts ─────────────────────────────────────────────────────────────────
  function applyTexts() {
    document.documentElement.lang = lang;
    $("tagline").textContent = t("tagline");
    $("mClassic").textContent = t("classic");
    $("mKiller").textContent = t("killer");
    $("mDaily").textContent = t("daily");
    // The app's "Classic — guess the word…" texts, without the mode name in front.
    var desc = function (k) { var s = t(k).replace(/^[^—]*—\s*/, ""); return s.charAt(0).toUpperCase() + s.slice(1); };
    $("mClassicDesc").textContent = desc("GameModeClassicDesc");
    $("mKillerDesc").textContent = desc("GameModeKillerDesc");
    $("mDailyDesc").textContent = desc("GameModeDailyDesc");
    $("lbTitle").textContent = "🏆 " + t("LeaderboardTitle");
    $("getApp").textContent = t("getApp");
    $("getAppDesc").textContent = t("getAppDesc");
    $("aboutLink").textContent = t("aboutGame");
    $("aboutLink").href = (lang === "en" ? "" : "/" + lang) + "/hangmania/";
    var legal = lang === "en" ? "/hangman-privacy-policy/" : "/" + lang + "/hangman-privacy-policy/";
    $("fPrivacy").textContent = t("privacy");
    $("fPrivacy").href = legal;
    $("fTerms").textContent = t("terms");
    $("fTerms").href = legal + "terms-of-service.html";
    document.querySelectorAll(".legal a").forEach(function (el, i) { el.href = legal + (i === 0 ? "terms-of-service.html" : ""); });
    $("gSave").textContent = t("YouMustSavePrefix") + "Hangmania";
    $("capScore").textContent = t("score");
    $("capWrong").textContent = t("wrong");
    $("capStreak").textContent = t("streak");
    $("typeHint").textContent = t("typeHint");
    document.querySelectorAll("[data-t]").forEach(function (el) { el.textContent = t(el.getAttribute("data-t")); });
    document.querySelectorAll("[data-ph]").forEach(function (el) { el.placeholder = t(el.getAttribute("data-ph")); });
    renderAccount();
  }

  var sel = $("lang");
  LANGS.forEach(function (l) {
    var o = document.createElement("option");
    o.value = l; o.textContent = I18N[l].langName;
    sel.appendChild(o);
  });
  sel.value = lang;
  sel.addEventListener("change", function () {
    lang = sel.value;
    store("hm_lang", lang);
    applyTexts();
    route(); // a game in progress restarts in the new language
  });

  // ── Start ─────────────────────────────────────────────────────────────────
  applyTexts();
  route();
  loadLeaderboard();
  (S ? refresh().then(loadProfile) : Promise.resolve()).then(function () {
    renderAccount();
    updateAds();
    return checkDailyPlayed();
  }).then(renderHome);
})();
