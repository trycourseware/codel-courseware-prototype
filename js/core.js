// CODeL Courseware prototype: shared core (session, storage, enrolment, UI helpers, top bar, notifications).
// Everything runs in the browser. Data are stored in this device's localStorage; nothing is sent anywhere.
(function () {
  "use strict";
  const D = window.CODEL, USERS = window.CODEL_USERS || [];
  const C = (window.C = { D, users: USERS });
  const NS = "codel:v1:";
  const byId = (C.userById = {});
  USERS.forEach((u) => (byId[u.id.toLowerCase()] = u));
  const Q = (C.Q = new URLSearchParams(location.search));
  const PAGE = (C.page = document.body.dataset.page || "");

  // ------------------------------------------------------------ DOM helpers
  C.$ = (s, r = document) => r.querySelector(s);
  C.$$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const el = (C.el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else if (k === "style" && typeof v === "object") Object.assign(n.style, v);
      else n.setAttribute(k, v === true ? "" : v);
    }
    kids.flat(Infinity).forEach((k) => { if (k != null && k !== false) n.append(k instanceof Node ? k : document.createTextNode(String(k))); });
    return n;
  });
  const icon = (C.icon = (name, cls = "i") => {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("class", cls); s.setAttribute("aria-hidden", "true");
    const u = document.createElementNS("http://www.w3.org/2000/svg", "use");
    u.setAttribute("href", "#" + name); s.append(u); return s;
  });
  C.hashNum = (s) => { let x = 2166136261; for (const ch of String(s)) { x ^= ch.charCodeAt(0); x = Math.imul(x, 16777619); } return x >>> 0; };
  C.uid = (p = "id") => p + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  C.fmt = (ts, opt = { day: "numeric", month: "short", year: "numeric" }) => new Date(ts).toLocaleDateString("en-GB", opt);
  C.fmtTime = (ts) => new Date(ts).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  C.ago = (ts) => {
    const s = (Date.now() - ts) / 1000;
    if (s < 60) return "just now"; if (s < 3600) return Math.floor(s / 60) + " min ago";
    if (s < 86400) return Math.floor(s / 3600) + " h ago"; if (s < 86400 * 30) return Math.floor(s / 86400) + " days ago";
    return C.fmt(ts);
  };
  C.escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // ------------------------------------------------------------ storage
  const S = (C.store = {
    get(k, d) { try { const v = localStorage.getItem(NS + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(NS + k, JSON.stringify(v)); } catch (e) { C.say("This browser is not saving data (private mode or storage full)."); } },
    del(k) { try { localStorage.removeItem(NS + k); } catch (e) { } },
    keys(prefix) { const out = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(NS + prefix)) out.push(k.slice(NS.length)); } } catch (e) { } return out; },
  });

  // ------------------------------------------------------------ session
  C.me = () => { const s = S.get("session", null); return s && byId[s.id.toLowerCase()] ? byId[s.id.toLowerCase()] : null; };
  C.signIn = (id, pw) => {
    const u = byId[String(id).trim().toLowerCase()];
    if (!u) return { ok: false, msg: "No account uses that index number or staff ID." };
    if (window.sha256(`codel:${u.id.toLowerCase()}:${pw}`) !== u.h) return { ok: false, msg: "The password is not correct. Check capital letters and try again." };
    S.set("session", { id: u.id, at: Date.now() });
    C.log(u, "signin");
    return { ok: true, user: u };
  };
  C.signInAs = (id) => { S.set("session", { id, at: Date.now() }); };
  C.signOut = () => { S.del("session"); location.href = "login.html"; };
  C.isStaff = (u) => u && u.r !== "s";
  C.roleName = (u) => ({ s: "Student", t: "Tutor", c: "Course coordinator", sc: "Study-centre coordinator", h: "Helpdesk officer", a: "Administrator" })[u.r];
  C.requireUser = () => {
    const u = C.me();
    if (!u) { location.replace("login.html?next=" + encodeURIComponent(location.pathname.split("/").pop() + location.search)); throw new Error("redirect"); }
    return u;
  };

  // per-user data (bookmarks, notes, progress, quiz attempts...)
  C.ud = (u = C.me()) => {
    const key = "user:" + (u ? u.id : "guest");
    return {
      get(path, d) { const o = S.get(key, {}); return o[path] === undefined ? d : o[path]; },
      set(path, v) { const o = S.get(key, {}); o[path] = v; S.set(key, o); },
      all() { return S.get(key, {}); },
      reset() { S.del(key); },
    };
  };
  C.log = (u, what, extra = {}) => { const l = S.get("activity", []); l.push({ id: u.id, what, at: Date.now(), ...extra }); S.set("activity", l.slice(-2000)); };

  // ------------------------------------------------------------ enrolment & access
  C.prog = (slug) => D.programmes.find((p) => p.slug === slug);
  C.course = (slug) => D.courses[slug];
  C.centre = (id) => { const c = D.centres.find((x) => x[0] === id); return c ? c[1] : ""; };
  C.enrol = (u) => {
    if (!u || u.r !== "s") return { current: [], retro: [] };
    const P = C.prog(u.p), L = P.levels.find((l) => l.level === u.l) || P.levels[0];
    const oi = Math.min(u.o || 0, L.options.length - 1);
    const current = [...L.options[0].courses, ...(oi > 0 ? L.options[oi].courses : [])];
    const prev = P.levels[P.levels.indexOf(L) - 1];
    let retro = [];
    if (prev) { const same = prev.options.findIndex((o) => o.name === L.options[oi].name); retro = [...prev.options[0].courses, ...(same > 0 ? prev.options[same].courses : [])]; }
    retro = retro.filter((s) => !current.includes(s));
    return { current: [...new Set(current)], retro: [...new Set(retro)], P, L, option: oi > 0 ? L.options[oi].name : "" };
  };
  C.access = (slug, u = C.me()) => {
    if (!u) return "preview";
    if (u.r !== "s") return "staff";
    const e = C.enrol(u);
    if (e.current.includes(slug)) return "full";
    if (e.retro.includes(slug)) return "retro";
    return "preview";
  };
  C.accessLabel = { full: "Full access", retro: "Read-only until 30 April 2027", preview: "Preview: Unit 1 only", staff: "Staff access" };
  // students registered this semester for a course (for forums, groups, tutor lists)
  let _rost = null;
  C.roster = (slug) => {
    if (!_rost) {
      _rost = {};
      USERS.filter((u) => u.r === "s").forEach((u) => C.enrol(u).current.forEach((s) => (_rost[s] = _rost[s] || []).push(u)));
    }
    return _rost[slug] || [];
  };
  C.tutorsFor = (slug) => USERS.filter((u) => (u.r === "t" || u.r === "c") && (u.cs || []).includes(slug));
  C.staffCourses = (u) => (u.r === "t" || u.r === "c" ? u.cs : Object.keys(D.courses));

  // reading progress stored by the reader
  C.progress = (slug, u = C.me()) => (u ? C.ud(u).get("prog", {})[slug] || 0 : 0);
  C.offline = (slug, u = C.me()) => (u ? !!C.ud(u).get("dl", {})[slug] : false);

  // books are loaded on demand from books/<slug>.js (works from file:// and on GitHub Pages)
  window.CODEL_BOOKS = window.CODEL_BOOKS || {};
  C.loadBook = (slug) => new Promise((res, rej) => {
    if (window.CODEL_BOOKS[slug]) return res(window.CODEL_BOOKS[slug]);
    const s = document.createElement("script");
    s.src = "books/" + slug + ".js";
    s.onload = () => (window.CODEL_BOOKS[slug] ? res(window.CODEL_BOOKS[slug]) : rej(new Error("Book not found")));
    s.onerror = () => rej(new Error("Could not load the course book"));
    document.head.append(s);
  });

  // ------------------------------------------------------------ uniform book cover
  C.cover = (c, cls = "") => el("div", { class: "cover " + cls, "aria-label": "Course book cover" },
    el("small", { text: "CODeL COURSE BOOK" }), el("span", { class: "ct", text: c.title }), el("span", { class: "cc2", text: c.code }), el("i"));

  // ------------------------------------------------------------ toast & modal
  const toast = el("div", { class: "pt-toast", role: "status", "aria-live": "polite" });
  document.body.append(toast);
  let tt;
  C.say = (msg, ms = 3000) => { toast.textContent = msg; toast.classList.add("show"); clearTimeout(tt); tt = setTimeout(() => toast.classList.remove("show"), ms); };
  document.addEventListener("click", (e) => { const t = e.target.closest("[data-toast]"); if (t) { e.preventDefault(); C.say(t.getAttribute("data-toast")); } });

  C.modal = ({ title, body, actions = [], wide = false, onOpen }) => new Promise((resolve) => {
    const ov = el("div", { class: "ov open", role: "dialog", "aria-modal": "true" });
    const box = el("div", { class: "mbox" + (wide ? " wide" : "") });
    const close = (v) => { ov.remove(); document.removeEventListener("keydown", esc); resolve(v); };
    const esc = (e) => { if (e.key === "Escape") close(null); };
    document.addEventListener("keydown", esc);
    ov.addEventListener("click", (e) => { if (e.target === ov) close(null); });
    const acts = el("div", { class: "btns mact" });
    actions.forEach((a) => acts.append(el("button", {
      class: "btn " + (a.cls || ""), type: "button", text: a.label,
      onclick: () => { const v = a.value ? a.value(box) : a.id; if (v === false) return; close(v); },
    })));
    box.append(el("div", { class: "mhead" }, el("h2", { text: title }), el("button", { class: "icon-btn dark", "aria-label": "Close", onclick: () => close(null) }, icon("x"))),
      el("div", { class: "mbody" }, body), actions.length ? acts : null);
    ov.append(box); document.body.append(ov);
    const f = box.querySelector("input,textarea,select,button.btn"); if (f) setTimeout(() => f.focus(), 30);
    if (onOpen) onOpen(box, close);
  });
  C.confirm = (title, text, yes = "Yes", cls = "") => C.modal({ title, body: el("p", { text }), actions: [{ label: "Cancel", cls: "ghost", id: false }, { label: yes, id: true, cls }] });

  // ------------------------------------------------------------ notifications
  C.notifications = (u = C.me()) => {
    if (!u) return [];
    const out = [];
    const seen = new Set(C.ud(u).get("notifRead", []));
    const push = (id, text, href, at) => out.push({ id, text, href, at, read: seen.has(id) });
    const now = Date.now(), day = 86400000;
    if (u.r === "s") {
      const e = C.enrol(u);
      push("n-welcome", "Your course books for Semester 1, 2026/2027 are ready to read or download.", "dashboard.html", now - 3 * day);
      if (e.current[0]) push("n-tut-" + e.current[0], `Live tutorial for ${C.course(e.current[0]).code} on Tuesday at 18:00.`, `course-${e.current[0]}.html`, now - day);
      (C.examList ? C.examList(e.current) : []).filter((x) => x.opens <= now && x.closes > now && !((S.get("examsubs:" + x.id, {})[u.id] || {}).status === "submitted")).slice(0, 3)
        .forEach((x) => push("n-exam-" + x.id, `Online exam open: ${x.title} (${C.course(x.course).code}), closes ${C.fmtTime(x.closes)}.`, "exams.html", x.opens));
      e.current.forEach((s) => (S.get("announce:" + s, []) || []).forEach((a) => push("n-ann-" + a.id, `${C.course(s).code}: ${a.text}`, `course-${s}.html`, a.at)));
      e.current.forEach((s) => { const ed = S.get("edition:" + s, null); if (ed) push("n-ed-" + s + ed.n, `${C.course(s).code}: edition ${ed.n} of the course book has been published.`, `course-${s}.html`, ed.at); });
      (S.get("groups", []) || []).filter((g) => (g.invites || []).includes(u.id)).forEach((g) => push("n-inv-" + g.id, `You were invited to the study group “${g.name}”.`, `group.html?g=${g.id}`, g.created));
      Object.keys(D.courses).forEach((s) => (S.get("forum:" + s, []) || []).forEach((t) => {
        if (t.by === u.id) t.posts.slice(1).filter((p) => p.by !== u.id).forEach((p) => push("n-rep-" + p.id, `${C.userById[p.by.toLowerCase()]?.n || "Someone"} replied to your post “${t.title}”.`, `forum.html?c=${s}&t=${t.id}`, p.at));
      }));
    } else {
      push("n-staff", "Welcome to the staff view of the CODeL Courseware prototype.", "staff.html", now - 2 * day);
      if (u.r === "t" || u.r === "c") {
        const flagged = u.cs.reduce((a, s) => a + (S.get("forum:" + s, []) || []).reduce((b, t) => b + t.posts.filter((p) => p.flags && p.flags.length && !p.hidden).length, 0), 0);
        if (flagged) push("n-flag-" + flagged, `${flagged} reported post(s) are waiting for moderation in your courses.`, "staff.html#moderation", now);
      }
    }
    return out.sort((a, b) => b.at - a.at);
  };

  // ------------------------------------------------------------ top bar
  C.nav = (u) => {
    if (!u) return [["index.html", "Overview", "home"], ["programmes.html", "Programmes", "grid"], ["help.html", "Help", "help"]];
    if (u.r === "s") return [["dashboard.html", "Dashboard", "home"], ["quizzes.html", "Quizzes", "quiz"], ["exams.html", "Exams", "clock"], ["pastq.html", "Past questions", "archive"],
      ["groups.html", "Study groups", "users"], ["ai.html", "AI assistant", "spark"], ["programmes.html", "Programmes", "grid"], ["help.html", "Help", "help"]];
    const n = [["staff.html", "Staff home", "home"]];
    if (u.r === "t" || u.r === "c" || u.r === "a") n.push(["exams.html", "Exams", "clock"], ["pastq.html", "Past questions", "archive"]);
    if (u.r === "a" || u.r === "h" || u.r === "sc" || u.r === "c") n.push(["admin.html", "Reports", "chart"]);
    n.push(["programmes.html", "Programmes", "grid"], ["help.html", "Help", "help"]);
    return n;
  };
  function topbar() {
    const host = C.$("header.top"); if (!host) return;
    const u = C.me(), here = location.pathname.split("/").pop() || "index.html";
    const items = C.nav(u);
    const activeFor = (href) => here === href || (href === "programmes.html" && /^(programme-|course-|forum)/.test(here)) || (href === "dashboard.html" && here === "reader.html")
      || (href === "groups.html" && here === "group.html") || (href === "exams.html" && here === "exam.html") || (href === "quizzes.html" && here === "quiz.html");
    const links = C.$("nav.links", host), mnav = C.$(".mnav", host);
    links.replaceChildren(...items.map(([h, t]) => el("a", { href: h, class: activeFor(h) ? "on" : "" }, t)));
    mnav.replaceChildren(...items.map(([h, t, ic]) => el("a", { href: h, class: activeFor(h) ? "on" : "" }, icon(ic), t)));
    if (u) mnav.append(el("a", { href: "profile.html" }, icon("user"), "My profile"), el("a", { href: "#", onclick: (e) => { e.preventDefault(); C.signOut(); } }, icon("back"), "Sign out"));
    else mnav.append(el("a", { href: "login.html" }, icon("shield"), "Sign in"));
    const right = C.$(".right", host); right.replaceChildren();
    right.append(el("a", { class: "icon-btn", href: "programmes.html#search", "aria-label": "Search courses" }, icon("search", "i lg")));
    if (u) {
      const notes = C.notifications(u), unread = notes.filter((n) => !n.read).length;
      const bell = el("button", { class: "icon-btn" + (unread ? " dot" : ""), "aria-label": `Notifications (${unread} unread)`, "aria-haspopup": "true" }, icon("bell", "i lg"));
      const pop = el("div", { class: "pop", role: "menu" });
      const fill = () => {
        const list = C.notifications(u);
        pop.replaceChildren(el("div", { class: "pophead" }, el("b", { text: "Notifications" }),
          el("button", { class: "btn ghost sm", text: "Mark all read", onclick: (e) => { e.stopPropagation(); C.ud(u).set("notifRead", list.map((n) => n.id)); bell.classList.remove("dot"); fill(); } })),
          ...(list.length ? list.slice(0, 12).map((n) => el("a", { href: n.href, class: "popitem" + (n.read ? "" : " unread"), onclick: () => { const r = new Set(C.ud(u).get("notifRead", [])); r.add(n.id); C.ud(u).set("notifRead", [...r]); } },
            el("span", { text: n.text }), el("small", { text: C.ago(n.at) }))) : [el("p", { class: "small muted pad", text: "No notifications." })]));
      };
      bell.addEventListener("click", (e) => { e.stopPropagation(); fill(); pop.classList.toggle("open"); am.classList.remove("open"); });
      const av = el("button", { class: "avatar", "aria-label": `Account menu for ${u.n}`, text: u.n.split(" ").map((x) => x[0]).slice(0, 2).join("") });
      const am = el("div", { class: "pop narrow", role: "menu" },
        el("div", { class: "pophead" }, el("div", {}, el("b", { text: u.n }), el("div", { class: "tiny muted", text: `${C.roleName(u)} · ${u.id}` }))),
        el("a", { class: "popitem", href: "profile.html" }, "My profile and settings"),
        u.r === "s" ? el("a", { class: "popitem", href: "ai.html#settings" }, "AI assistant settings") : null,
        el("a", { class: "popitem", href: "#", onclick: (e) => { e.preventDefault(); C.signOut(); } }, "Sign out"));
      av.addEventListener("click", (e) => { e.stopPropagation(); am.classList.toggle("open"); pop.classList.remove("open"); });
      document.addEventListener("click", () => { pop.classList.remove("open"); am.classList.remove("open"); });
      pop.addEventListener("click", (e) => e.stopPropagation()); am.addEventListener("click", (e) => e.stopPropagation());
      right.append(el("div", { class: "popwrap" }, bell, pop), el("div", { class: "popwrap" }, av, am));
    } else {
      right.append(el("a", { class: "btn red sm", href: "login.html", text: "Sign in" }));
    }
    const brand = C.$(".brand", host); if (brand) brand.href = u ? (u.r === "s" ? "dashboard.html" : "staff.html") : "index.html";
    const mb = C.$("[data-menu]", host);
    mb.addEventListener("click", () => { const o = mnav.classList.toggle("open"); mb.setAttribute("aria-expanded", o); });
  }

  // ------------------------------------------------------------ prototype navigator
  function protobar() {
    const here = (location.pathname.split("/").pop() || "index.html") + location.search;
    const S2 = D.screens;
    let idx = S2.findIndex(([u]) => u === here);
    if (idx < 0) idx = S2.findIndex(([u]) => u.split("?")[0] === here.split("?")[0]);
    const bar = el("div", { class: "pt-bar" }, el("span", { class: "d" }), el("span", { class: "lb", text: "Prototype · not a live service" }));
    const bS = el("button", { type: "button", text: "Screens", "aria-expanded": "false" });
    const bN = el("button", { type: "button", text: "Next ›" });
    const menu = el("div", { class: "pt-menu", role: "menu" }, ...S2.map(([u, t], i) => el("a", { href: u, class: i === idx ? "cur" : "", text: t })));
    bS.addEventListener("click", (e) => { e.stopPropagation(); bS.setAttribute("aria-expanded", menu.classList.toggle("open")); });
    bN.addEventListener("click", () => { location.href = S2[(idx + 1) % S2.length][0]; });
    document.addEventListener("click", () => menu.classList.remove("open"));
    bar.append(bS, bN); document.body.append(bar, menu);
  }

  C.ready = (fn) => {
    const run = () => { try { fn(); } catch (e) { if (e && e.message === "redirect") return; console.error(e); } };
    document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", run) : run();
  };
  C.ready(() => { topbar(); if (document.body.dataset.proto !== "off") protobar(); });
})();
