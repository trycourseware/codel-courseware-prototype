// Page controllers: sign-in, dashboard, programmes search, course pages, print copy, staff, reports, profile, help.
(function () {
  "use strict";
  const { el, icon, $, $$, store: S } = C;
  const DAY = 86400000;
  const who = (id) => C.userById[String(id).toLowerCase()] || { n: id, id };
  const tile = (l, v, s) => el("div", { class: "card pad tile" }, el("div", { class: "label", text: l }), el("div", { class: "v", text: v }), s ? el("div", { class: "small muted", text: s }) : null);
  const csvCell = (v) => { let t = String(v ?? ""); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return '"' + t.replace(/"/g, '""') + '"'; };
  const download = (name, text, type = "text/plain") => { const a = el("a", { href: URL.createObjectURL(new Blob([text], { type })), download: name }); document.body.append(a); a.click(); a.remove(); };

  // ------------------------------------------------------------------ sign in
  function loginPage() {
    const box = $("#lbox"), u = C.me(), next = C.Q.get("next");
    const safeNext = next && /^[a-z0-9-]+\.html(\?[\w=&%.:-]*)?(#[\w-]*)?$/i.test(next) ? next : null;
    const dest = (x) => safeNext || (x.r === "s" ? "dashboard.html" : "staff.html");
    if (u) {
      box.append(el("h2", { text: "You are signed in" }), el("p", { class: "muted small", text: `${u.n} · ${C.roleName(u)} · ${u.id}` }),
        el("div", { class: "btns mt" }, el("a", { class: "btn", href: dest(u), text: "Continue" }), el("button", { class: "btn sec", onclick: () => { S.del("session"); location.reload(); }, text: "Sign in as someone else" })));
      return;
    }
    const id = el("input", { class: "input", id: "ix", autocomplete: "username", inputmode: "text", placeholder: "e.g. 9925010001 or STF-T001", "aria-describedby": "lerr" });
    const pw = el("input", { class: "input", id: "pw", type: "password", autocomplete: "current-password", "aria-describedby": "lerr" });
    const show = el("button", { type: "button", class: "btn ghost sm", "aria-pressed": "false", text: "Show", onclick: () => { const on = pw.type === "password"; pw.type = on ? "text" : "password"; show.textContent = on ? "Hide" : "Show"; show.setAttribute("aria-pressed", String(on)); } });
    const err = el("div", { class: "lerr", id: "lerr", role: "alert" });
    let fails = 0;
    const form = el("form", { class: "stack", novalidate: true, onsubmit: (e) => {
      e.preventDefault(); err.textContent = "";
      if (!id.value.trim() || !pw.value) { err.textContent = "Enter your index number (or staff ID) and your password."; return; }
      const r = C.signIn(id.value, pw.value);
      if (!r.ok) { fails++; err.textContent = r.msg + (fails >= 3 ? " After several attempts, contact the helpdesk to reset your password." : ""); pw.select(); return; }
      location.href = dest(r.user);
    } },
      el("div", { class: "field" }, el("label", { for: "ix", text: "Index number or staff ID" }), id),
      el("div", { class: "field" }, el("label", { for: "pw", text: "Password" }), el("div", { class: "pwrow" }, pw, show)), err,
      el("button", { class: "btn block", type: "submit" }, icon("shield"), "Sign in"));
    const quick = (uid, label, sub) => el("button", { type: "button", class: "qbtn", onclick: () => { C.signInAs(uid); C.log(who(uid), "signin-demo"); location.href = dest(who(uid)); } }, el("b", { text: label }), el("span", { class: "tiny muted", text: sub }));
    const t = C.users.find((x) => x.r === "t" && C.enrol(who("9925010001")).current.some((s) => x.cs.includes(s)));
    box.append(el("h2", { text: "Sign in" }), el("div", { class: "muted small", text: "College for Distance and e-Learning" }), el("div", { class: "mt" }, form),
      el("div", { class: "or", text: "or explore without a password" }),
      el("div", { class: "qgrid2" }, quick("9925010001", "Sample student", "Ama Owusu · B.Ed. Junior High L200"), t ? quick(t.id, "Sample tutor", t.n) : null),
      el("div", { class: "btns between mt" }, el("button", { type: "button", class: "btn ghost sm", "data-toast": "Password resets are handled by the UEW identity service. In this prototype the helpdesk can look up any account.", text: "Forgot password?" }),
        el("a", { class: "btn ghost sm", href: "help.html", text: "Need help?" })),
      el("div", { class: "login-warn", role: "note", text: "This is a prototype, not the official UEW sign-in. Use only the demonstration accounts; never enter your real UEW password here." }),
      el("div", { class: "lfoot" }, el("span", {}, icon("flag", "i sm"), " Test accounts and passwords are in the private workbook shared with the demonstrators."),
        el("span", { text: "Prototype: sign-in is checked in this browser only. Nothing is sent anywhere." })));
    setTimeout(() => id.focus(), 50);
  }

  // ------------------------------------------------------------------ programmes search
  function programmesPage() {
    const q = $("#q"); if (!q) return;
    const res = $("#results"), all = Object.values(C.D.courses);
    const run = () => {
      const v = q.value.trim().toLowerCase(); res.replaceChildren();
      if (v.length < 2) { res.style.display = "none"; return; }
      const hits = all.filter((c) => c.code.toLowerCase().includes(v) || c.title.toLowerCase().includes(v)).slice(0, 40);
      res.style.display = "flex";
      if (!hits.length) { res.append(el("div", { class: "pad small muted", text: `No courses match “${q.value}”.` })); return; }
      hits.forEach((c) => res.append(el("a", { href: "course-" + c.slug + ".html" }, el("span", { class: "cd", text: c.code }),
        el("span", { class: "tt" }, c.title, el("span", { class: "tiny muted", style: { display: "block" }, text: [...new Set(c.offerings.map((o) => C.prog(o.p).short))].join(", ") })), icon("chev", "i go"))));
    };
    q.addEventListener("input", run);
    if (location.hash === "#search") setTimeout(() => q.focus(), 50);
  }

  // ------------------------------------------------------------------ dashboard
  function courseCard(u, slug, retro) {
    const c = C.course(slug), p = C.progress(slug, u), off = C.offline(slug, u);
    const b = el("div", { class: "body" }, el("h3", { text: c.title }));
    if (retro) b.append(el("div", { class: "meta" }, el("span", { text: p ? p + "% read · notes kept" : "Notes and bookmarks kept" }), el("span", { class: "pill grey" }, icon("lock", "i sm"), "Read-only")));
    else b.append(el("div", { class: "bar" }, el("i", { style: { width: Math.max(p, 2) + "%" } })),
      el("div", { class: "meta" }, el("span", { text: p ? p + "% read" : "Not started" }), off ? el("span", { class: "pill ok" }, icon("check", "i sm"), "Offline ready") : el("span", { class: "pill grey" }, icon("dl", "i sm"), "Online only")));
    return el("a", { class: "card cc" + (retro ? " retro" : ""), href: retro ? `reader.html?c=${slug}` : `course-${slug}.html` }, el("div", { class: "top2" }, el("div", { class: "code", text: c.code })), b);
  }
  function dashboardPage() {
    const u = C.requireUser(), main = $("#main");
    if (C.isStaff(u)) { location.replace("staff.html"); return; }
    const e = C.enrol(u), ud = C.ud(u);
    const P = e.P, L = e.L;
    const first = u.n.split(" ")[0];
    const cont = Object.entries(ud.get("pos", {})).filter(([s]) => e.current.includes(s)).sort((a, b) => (ud.get("prog", {})[b[0]] || 0) - (ud.get("prog", {})[a[0]] || 0))[0];
    const left = el("div", { class: "stack0" });
    left.append(el("div", { class: "banner" }, icon("cal", "i lg"), el("div", {}, el("b", { text: "Semester 1, 2026/2027. " }), `You are registered for ${e.current.length} courses. Read online, download for offline study, or print a personal copy at your own cost.`)));
    if (cont) left.append(el("a", { class: "card pad contcard", href: `reader.html?c=${cont[0]}` }, icon("book", "i lg"), el("div", {}, el("div", { class: "label", text: "Continue reading" }), el("b", { text: `${C.course(cont[0]).code} ${C.course(cont[0]).title}` }), el("div", { class: "small muted", text: `Page ${cont[1]} · ${C.progress(cont[0], u)}% read` })), icon("chev", "i go")));
    left.append(el("div", { class: "sech" }, el("h2", { text: "Current semester" }), el("span", { class: "muted small", text: "Full access" })), el("div", { class: "grid g-courses" }, ...e.current.map((s) => courseCard(u, s))));
    left.append(el("div", { class: "sech" }, el("h2", { text: "Earlier courses" }), e.retro.length ? el("span", { class: "pill" }, icon("eye", "i sm"), "Read-only until 30 April 2027") : el("span", { class: "muted small", text: "None: this is the first level of your programme." })));
    if (e.retro.length) left.append(el("div", { class: "grid g-courses" }, ...e.retro.map((s) => courseCard(u, s, true))));

    const side = el("aside", { class: "stack" });
    // upcoming: exams, meetings, tutorial
    const items = [];
    if (C.examList) C.examList(e.current).forEach((x) => { const s = (S.get("examsubs:" + x.id, {})[u.id] || {}); if (s.status === "submitted") return; const st = C.examState(x); if (st === "open") items.push([x.opens, "Exam open", `${x.title}: ${C.course(x.course).code}`, `Closes ${C.fmtTime(x.closes)}`, `exam.html?e=${x.id}`, true]); else if (st === "upcoming") items.push([x.opens, "Exam", `${x.title}: ${C.course(x.course).code}`, `Opens ${C.fmtTime(x.opens)}`, "exams.html"]); });
    if (C.groups) C.groups().filter((g) => g.members.includes(u.id)).forEach((g) => g.meetings.filter((m) => m.at > Date.now()).forEach((m) => items.push([m.at, "Study group", m.title, `${C.fmtTime(m.at)} · ${g.name}`, `group.html?g=${g.id}#meet`])));
    const nextTue = new Date(); nextTue.setDate(nextTue.getDate() + ((9 - nextTue.getDay()) % 7 || 7)); nextTue.setHours(18, 0, 0, 0);
    items.push([nextTue.getTime(), "Live tutorial", C.course(e.current[0]).code, `${C.fmtTime(nextTue.getTime())} · online, recording posted`, `course-${e.current[0]}.html`]);
    const hot = items.filter((x) => x[5]), rest = items.filter((x) => !x[5]).sort((a, b) => a[0] - b[0]);
    const shown = [...hot.slice(0, 2), ...rest.slice(0, 4)];
    const up = el("div", { class: "card pad" }, el("h3", { text: "Coming up" }), hot.length > 2 ? el("a", { class: "small", href: "exams.html", text: `${hot.length} online exams are open now · see all` }) : null, ...shown.map(([at, k, t, s, href, hot]) =>
      el("a", { class: "uprow" + (hot ? " hot" : ""), href }, el("div", { class: "d" }, el("b", { text: new Date(at).getDate() }), el("small", { text: new Date(at).toLocaleDateString("en-GB", { month: "short" }).toUpperCase() })),
        el("div", {}, el("div", { class: "tiny label", text: k }), el("b", { text: t }), el("div", { class: "muted small", text: s })))));
    side.append(up);
    // quizzes summary
    if (C.quizzesFor) {
      const qs = e.current.flatMap((s) => C.quizzesFor(s)), done = qs.filter((q) => C.quizStats(u, q.id).n);
      side.append(el("div", { class: "card pad" }, el("h3", {}, icon("quiz"), " Quizzes"), el("p", { class: "small", text: `${done.length} of ${qs.length} practice quizzes completed.` }), el("div", { class: "bar mt" }, el("i", { style: { width: (qs.length ? done.length / qs.length * 100 : 0) + "%" } })), el("a", { class: "btn sec sm mt", href: "quizzes.html", text: "Open quizzes" })));
    }
    // groups
    if (C.groups) {
      const all = C.groups(), mine = all.filter((g) => g.members.includes(u.id)), inv = all.filter((g) => g.invites.includes(u.id));
      side.append(el("div", { class: "card pad" }, el("h3", {}, icon("users"), " Study groups"),
        inv.length ? el("div", { class: "banner flat mt" }, icon("bell"), el("div", { class: "small" }, el("b", { text: `${inv.length} invitation${inv.length > 1 ? "s" : ""}. ` }), el("a", { href: "groups.html", text: "View" }))) : null,
        ...mine.slice(0, 3).map((g) => el("a", { class: "grow-link", href: "group.html?g=" + g.id }, el("span", { class: "gav sm", text: g.name.split(" ").map((x) => x[0]).slice(0, 2).join("") }), el("span", { text: g.name }))),
        el("a", { class: "btn sec sm mt", href: "groups.html", text: mine.length ? "All my groups" : "Create or join a group" })));
    }
    side.append(el("div", { class: "card pad aicard" }, el("h3", {}, icon("spark"), " AI study assistant"),
      el("p", { class: "small muted", text: C.aiSubscribed && C.aiSubscribed(u) ? "Your subscription is active. Ask about any of your course books; every answer shows the page it used." : "Explanations, summaries and practice from your approved course books and past questions, with page references. Optional paid service." }),
      el("a", { class: "btn sec sm", href: "ai.html", text: C.aiSubscribed && C.aiSubscribed(u) ? "Open the assistant" : "Learn more" })));
    main.append(el("div", { class: "crumb" }, "Dashboard"), el("h1", { text: `Welcome back, ${first}` }),
      el("div", { class: "muted" }, el("a", { href: `programme-${P.slug}.html`, text: P.name }), ` · Level ${L.level}${e.option ? " · " + e.option : ""} · ${C.centre(u.c)} study centre · ${u.id}`),
      el("div", { class: "two" }, left, side));
  }

  // ------------------------------------------------------------------ course page (static shell enhanced here)
  function coursePage() {
    const slug = document.body.dataset.slug, c = C.course(slug), u = C.me(), acc = C.access(slug, u);
    const st = $("#cstatus");
    if (st) {
      const lab = C.accessLabel[acc];
      st.replaceChildren(el("span", { class: "pill " + (acc === "full" || acc === "staff" ? "ok" : acc === "retro" ? "" : "grey") }, icon(acc === "preview" ? "lock" : acc === "retro" ? "eye" : "check", "i sm"), u ? lab : "Sign in for full access"));
    }
    const p = C.progress(slug, u);
    const pb = $("#cprog"); if (pb) { pb.style.width = Math.max(p, 2) + "%"; $("#cprogt").textContent = u ? `${p}% read · bookmarks and notes are saved to your account` : "Sign in to track your reading"; }
    const ed = S.get("edition:" + slug, null); if (ed && $("#cedition")) $("#cedition").textContent = `Edition ${ed.n} · updated ${C.fmt(ed.at)}${ed.note ? ": " + ed.note : ""}`;
    const dl = $("#cdl");
    if (dl) {
      if (C.offline(slug, u)) { dl.replaceChildren(icon("check"), "Offline ready"); }
      dl.addEventListener("click", () => {
        if (acc !== "full" && acc !== "staff") return C.say(acc === "retro" ? "Not available during retrospective access: read online only." : u ? "Downloading is for students registered for this course." : "Sign in to download.");
        const d = C.ud(u).get("dl", {}); d[slug] = Date.now(); C.ud(u).set("dl", d); C.log(u, "download", { c: slug }); dl.replaceChildren(icon("check"), "Offline ready"); C.say("Downloaded for offline reading, watermarked with your index number.");
      });
    }
    const pr = $("#cprint"); if (pr && acc !== "full" && acc !== "staff") { pr.classList.add("dis"); pr.addEventListener("click", (e) => { e.preventDefault(); C.say(acc === "retro" ? "Not available during retrospective access." : "Printing is for students registered for this course."); }); }
    const rep = $("#creport"); if (rep) rep.addEventListener("click", async () => {
      if (!u) return C.say("Sign in to report an error.");
      const pg = el("input", { class: "input", type: "number", min: 1, "aria-label": "Page" }), tx = el("textarea", { class: "input ta", rows: 4, "aria-label": "What is wrong?" });
      const r = await C.modal({ title: "Report an error in the course book", body: el("div", { class: "stack" }, el("div", { class: "field" }, el("label", { text: "Page (if known)" }), pg), el("div", { class: "field" }, el("label", { text: "What is wrong?" }), tx)),
        actions: [{ label: "Cancel", cls: "ghost", id: null }, { label: "Send to the course team", value: () => (tx.value.trim() ? true : (C.say("Describe the error."), false)) }] });
      if (!r) return; const ref = "CB-" + (C.hashNum(slug + Date.now()) % 90000 + 10000);
      const all = S.get("errata", []); all.push({ ref, slug, by: u.id, page: +pg.value || null, text: tx.value.trim(), at: Date.now(), status: "open" }); S.set("errata", all); C.say("Thank you. Reference " + ref + ".");
    });
    const team = $("#cteam");
    if (team) { const ts = C.tutorsFor(slug); team.replaceChildren(...(ts.length ? ts : []).slice(0, 3).map((t) => el("div", { class: "person" }, el("div", { class: "avatar", text: t.n.split(" ").map((x) => x[0]).join("").slice(0, 2) }), el("div", {}, el("b", { text: t.n }), el("div", { class: "muted small", text: C.roleName(t) + " · replies within 2 working days" }))))); }
    const disc = $("#cdisc");
    if (disc) {
      if (acc === "full" || acc === "retro" || acc === "staff") {
        const f = C.forum(slug).slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.posts[b.posts.length - 1].at - a.posts[a.posts.length - 1].at).slice(0, 4);
        disc.replaceChildren(...f.map((t) => el("a", { class: "trow sm", href: `forum.html?c=${slug}&t=${t.id}` }, el("div", { class: "tt" }, el("b", { text: t.title }), el("div", { class: "tiny muted", text: `${t.posts.length - 1} replies · ${C.ago(t.posts[t.posts.length - 1].at)}` })))));
      } else disc.replaceChildren(el("p", { class: "small muted", text: "Open to students registered for this course this semester." }));
    }
    const ann = $("#cann");
    if (ann) { const a = S.get("announce:" + slug, []).slice(-3).reverse(); if (a.length) ann.replaceChildren(el("div", { class: "banner" }, icon("bell", "i lg"), el("div", { class: "small" }, ...a.map((x) => el("div", {}, el("b", { text: C.fmt(x.at) + ": " }), x.text, el("span", { class: "tiny muted", text: " · " + who(x.by).n })))))); }
    const ex = $("#cexams");
    if (ex && C.examList) { const xs = C.examList([slug]).filter((x) => C.examState(x) !== "closed"); ex.replaceChildren(...xs.map((x) => el("a", { class: "act", href: acc === "staff" ? `exam.html?e=${x.id}&preview=1` : acc === "full" ? (C.examState(x) === "open" ? `exam.html?e=${x.id}` : "exams.html") : "#" }, el("div", { class: "ic v" }, icon(acc === "staff" ? "eye" : "timer")), el("div", { class: "t" }, el("b", { text: (acc === "staff" ? "Preview: " : "") + x.title }), el("span", { text: `${x.dur} min · ${C.examState(x) === "open" ? "open until " + C.fmtTime(x.closes) : "opens " + C.fmtTime(x.opens)}` })), icon("chev", "i go")))); }
    $$("[data-quiz]").forEach((a) => { const q = C.quizById ? C.quizById(a.dataset.quiz) : null; const s = q && u ? C.quizStats(u, q.id) : null; if (s && s.n) a.querySelector(".t span").textContent = `Best score ${s.best}% · ${s.n} attempt${s.n > 1 ? "s" : ""}`; });
  }

  // ------------------------------------------------------------------ print copy (watermarked)
  function printPage() {
    const u = C.requireUser(), main = $("#main"), slug = C.Q.get("c"), id = C.Q.get("id");
    const rec = slug && (C.ud(u).get("prints", {})[slug] || []).find((x) => x.id === id);
    if (rec && !["full", "staff"].includes(C.access(slug, u))) { main.append(el("div", { class: "wrap" }, el("h1", { text: "Printing is not available" }), el("p", { text: "This course book is read-only for you now, so copies cannot be printed." }), el("a", { class: "btn", href: `reader.html?c=${slug}`, text: "Back to the book" }))); return; }
    if (!rec) { main.append(el("div", { class: "wrap" }, el("h1", { text: "Print copy not found" }), el("p", { text: "Create a print copy from the course book reader." }), el("a", { class: "btn", href: slug ? `reader.html?c=${slug}` : "dashboard.html", text: "Back" }))); return; }
    const c = C.course(slug), when = C.fmtTime(rec.at);
    main.append(el("div", { class: "printbar noprint" }, el("a", { class: "btn ghost sm", href: `reader.html?c=${slug}` }, icon("back"), "Back to the book"),
      el("div", { class: "small", text: `Copy ${rec.id} · Units ${rec.units.join(", ")} · watermarked for ${u.n} (${u.id})` }), el("button", { class: "btn sm", onclick: () => window.print() }, icon("print"), "Print now")));
    const host = el("div", { class: "pcopy" }); main.append(host);
    C.loadBook(slug).then((B) => {
      const blocks = {}; B.units.forEach((un) => un.blocks.forEach((b) => (blocks[b.id] = b)));
      B.pages.filter((P) => P.kind === "text" && rec.units.includes(P.unit)).forEach((P) => {
        const pg = el("section", { class: "ppage" }, el("div", { class: "wm", "aria-hidden": "true", text: `${u.n.toUpperCase()} · ${u.id} · PERSONAL STUDY COPY` }),
          el("div", { class: "ph2" }, el("span", { text: `${c.code} ${c.title}` }), el("span", { text: `Unit ${P.unit}` })));
        if (P.opener) pg.append(el("div", { class: "u", text: "UNIT " + P.unit }), el("h2", { text: B.units[P.unit - 1].title }));
        P.blocks.forEach((bid) => { const b = blocks[bid]; pg.append(b.t === "h" ? el("h3", { text: b.x }) : b.t === "ul" ? el("ul", {}, ...b.items.map((x) => el("li", { text: x }))) : el("p", { class: b.t === "callout" ? "callout" : "", text: b.x })); });
        pg.append(el("div", { class: "pf" }, el("span", { text: `${u.n} · ${u.id} · ${when} · copy ${rec.id}` }), el("span", { text: "p. " + P.n })));
        host.append(pg);
      });
      host.prepend(el("section", { class: "ppage cov" }, C.cover(c, "big"), el("p", { class: "small", text: `Personal study copy for ${u.n}, index number ${u.id}. Printed at the student’s own cost. Reproduction or sale is prohibited.` }), el("p", { class: "tiny muted", text: `Copy ID ${rec.id} · ${when} · recorded in the CODeL print log` })));
    });
  }

  // ------------------------------------------------------------------ staff home
  function staffPage() {
    const u = C.requireUser(), main = $("#main");
    if (!C.isStaff(u)) { location.replace("dashboard.html"); return; }
    main.append(el("div", { class: "crumb" }, "Staff home"), el("h1", { text: `Welcome, ${u.n.split(" ")[0]}` }), el("div", { class: "muted", text: `${C.roleName(u)} · ${u.id}${u.c ? " · " + C.centre(u.c) + " study centre" : ""}${u.prog ? " · " + C.prog(u.prog).name : ""}` }));
    if (u.r === "t" || u.r === "c") tutorView(u, main);
    if (u.r === "w") main.append(el("div", { class: "sech" }, el("h2", { text: "My course books" })),
      el("p", { class: "small muted", text: "As a course book author you prepare new editions. In the Moodle version you edit a draft edition and submit it to the course coordinator, who reviews and publishes it; students are notified." }),
      el("div", { class: "clist" }, ...u.cs.map((s) => el("a", { href: `reader.html?c=${s}` }, el("span", { class: "cd", text: C.course(s).code }), el("span", { class: "tt", text: C.course(s).title }), icon("chev", "i go")))));
    if (u.r === "sc") centreView(u, main);
    if (u.r === "h") helpdeskView(u, main);
    if (u.r === "a") { main.append(el("div", { class: "tiles mt" }, tile("Students", C.users.filter((x) => x.r === "s").length, "demo accounts"), tile("Staff", C.users.filter((x) => x.r !== "s").length, "tutors, coordinators, support"), tile("Course books", Object.keys(C.D.courses).length), tile("Study centres", C.D.centres.length)),
      el("div", { class: "btns mt" }, el("a", { class: "btn", href: "admin.html" }, icon("chart"), "Reports and user directory"), el("a", { class: "btn sec", href: "exams.html" }, icon("clock"), "Online exams"))); helpdeskView(u, main); }
  }
  function tutorView(u, main) {
    const cs = u.cs;
    const flagged = [];
    cs.forEach((s) => (S.get("forum:" + s, []) || []).forEach((t) => t.posts.forEach((p) => { if (p.flags && p.flags.length && !p.hidden) flagged.push({ s, t, p }); })));
    const rows = cs.map((s) => { const c = C.course(s), r = C.roster(s).length, ed = S.get("edition:" + s, null);
      return el("tr", {}, el("td", {}, el("a", { href: `course-${s}.html` }, el("b", { text: c.code })), el("div", { class: "small", text: c.title })), el("td", { class: "n", text: r }), el("td", { class: "n", text: ed ? ed.n : 1 }),
        el("td", {}, el("div", { class: "btns" }, el("a", { class: "btn sec sm", href: `forum.html?c=${s}` }, icon("chat", "i sm"), "Forum"), el("a", { class: "btn sec sm", href: `exams.html?c=${s}` }, icon("clock", "i sm"), "Exams"),
          el("a", { class: "btn ghost sm", href: `quizzes.html?c=${s}` }, "Quizzes"), el("button", { class: "btn ghost sm", onclick: () => announce(u, s) }, icon("bell", "i sm"), "Announce"),
          u.r === "c" ? el("button", { class: "btn ghost sm", onclick: () => publishEdition(u, s) }, icon("upload", "i sm"), "New edition") : null))); });
    main.append(el("div", { class: "tiles mt" }, tile("My courses", cs.length), tile("Students registered", new Set(cs.flatMap((s) => C.roster(s).map((x) => x.id))).size, "this semester"), tile("Reported posts", flagged.length, "waiting for you"), tile("Error reports", S.get("errata", []).filter((x) => cs.includes(x.slug) && x.status === "open").length, "on course books")));
    main.append(el("div", { class: "sech", id: "moderation" }, el("h2", { text: "Moderation" })), flagged.length ? el("div", { class: "stack" }, ...flagged.map(({ s, t, p }) => el("div", { class: "card pad" },
      el("div", { class: "small muted", text: `${C.course(s).code} · ${t.title} · ${who(p.by).n} · ${C.fmtTime(p.at)}` }), el("p", { text: p.text }), el("div", { class: "pills" }, ...p.flags.map((f) => el("span", { class: "pill red", text: f.reason }))),
      el("div", { class: "btns mt" }, el("a", { class: "btn sec sm", href: `forum.html?c=${s}&t=${t.id}#${p.id}`, text: "Open thread" }),
        el("button", { class: "btn sm red", onclick: () => modPost(s, t.id, p.id, "hide"), text: "Hide post" }), el("button", { class: "btn ghost sm", onclick: () => modPost(s, t.id, p.id, "dismiss"), text: "Dismiss reports" })))))
      : el("p", { class: "small muted", text: "No reported posts. Students can report posts from any discussion." }));
    const errs = S.get("errata", []).filter((x) => cs.includes(x.slug));
    if (errs.length) main.append(el("div", { class: "sech" }, el("h2", { text: "Course-book error reports" })), el("div", { class: "stack" }, ...errs.map((x) => el("div", { class: "card pad" }, el("div", { class: "small muted", text: `${x.ref} · ${C.course(x.slug).code}${x.page ? " · p. " + x.page : ""} · ${who(x.by).n} · ${C.fmtTime(x.at)}` }), el("p", { text: x.text }),
      el("div", { class: "btns" }, x.page ? el("a", { class: "btn sec sm", href: `reader.html?c=${x.slug}&p=${x.page}`, text: "Open page" }) : null, x.status === "open" ? el("button", { class: "btn sm", onclick: () => { const a = S.get("errata", []); a.find((y) => y.ref === x.ref).status = "fixed"; S.set("errata", a); location.reload(); }, text: "Mark as fixed" }) : el("span", { class: "pill ok", text: "Fixed" }))))));
    main.append(el("div", { class: "sech" }, el("h2", { text: "My courses" })), el("div", { class: "tablewrap card" }, el("table", { class: "t" }, el("tr", {}, ...["Course", "Students", "Edition", ""].map((h) => el("th", { text: h }))), ...rows)));
  }
  function modPost(s, tid, pid, what) {
    const f = S.get("forum:" + s, []), t = f.find((x) => x.id === tid), p = t && t.posts.find((x) => x.id === pid); if (!p) return;
    if (what === "hide") p.hidden = true; p.flags = []; S.set("forum:" + s, f); C.say(what === "hide" ? "Post hidden." : "Reports dismissed."); setTimeout(() => location.reload(), 400);
  }
  async function announce(u, s) {
    const tx = el("textarea", { class: "input ta", rows: 3, "aria-label": "Announcement" });
    const r = await C.modal({ title: "Announcement to " + C.course(s).code, body: el("div", { class: "stack" }, el("p", { class: "small muted", text: `Sent to the ${C.roster(s).length} registered students as a notification.` }), tx), actions: [{ label: "Cancel", cls: "ghost", id: null }, { label: "Send", value: () => tx.value.trim() || (C.say("Write the announcement."), false) }] });
    if (!r) return; const a = S.get("announce:" + s, []); a.push({ id: C.uid("a"), by: u.id, text: r, at: Date.now() }); S.set("announce:" + s, a); C.say("Announcement sent.");
  }
  async function publishEdition(u, s) {
    const cur = S.get("edition:" + s, null), n = (cur ? cur.n : 1) + 1;
    const tx = el("input", { class: "input", placeholder: "e.g. Corrected worked example in Unit 2", "aria-label": "What changed" });
    const r = await C.modal({ title: `Publish edition ${n} of ${C.course(s).code}`, body: el("div", { class: "stack" }, el("p", { class: "small", text: "Students see the new edition at once. Their bookmarks, highlights and notes are kept; any on changed pages are flagged for them to check." }), el("div", { class: "field" }, el("label", { text: "What changed" }), tx)),
      actions: [{ label: "Cancel", cls: "ghost", id: null }, { label: "Publish", value: () => tx.value.trim() || "Corrections" }] });
    if (!r) return; S.set("edition:" + s, { n, at: Date.now(), note: r, by: u.id }); C.say(`Edition ${n} published. Students are notified.`); setTimeout(() => location.reload(), 500);
  }
  function centreView(u, main) {
    const st = C.users.filter((x) => x.r === "s" && x.c === u.c);
    const byP = {}; st.forEach((x) => (byP[x.p] = (byP[x.p] || 0) + 1));
    const act = S.get("activity", []).filter((a) => st.some((x) => x.id === a.id));
    main.append(el("div", { class: "tiles mt" }, tile("Students at this centre", st.length), tile("Programmes", Object.keys(byP).length), tile("Female", Math.round(st.filter((x) => x.g === "F").length / Math.max(1, st.length) * 100) + "%"), tile("Activity on this device", act.length, "sign-ins, downloads, quizzes")),
      el("div", { class: "sech" }, el("h2", { text: "Students by programme" })), el("div", { class: "card pad" }, ...Object.entries(byP).sort((a, b) => b[1] - a[1]).map(([p, n]) => el("div", { class: "hrow" }, el("span", { text: C.prog(p).short }), el("span", { class: "hb", style: { width: Math.max(6, n / st.length * 300) + "px" } }), el("b", { text: n })))));
    main.append(el("div", { class: "sech" }, el("h2", { text: "Student list" })), directory(st, 25));
  }
  function helpdeskView(u, main) {
    const q = el("input", { class: "input", type: "search", placeholder: "Index number, staff ID or name", "aria-label": "Look up an account" });
    const out = el("div", { class: "stack" });
    main.append(el("div", { class: "sech" }, el("h2", { text: "Account lookup" })), el("div", { class: "toolbar" }, q), out);
    q.addEventListener("input", () => {
      const v = q.value.trim().toLowerCase(); out.replaceChildren(); if (v.length < 3) return;
      C.users.filter((x) => x.id.toLowerCase().includes(v) || x.n.toLowerCase().includes(v)).slice(0, 8).forEach((x) => out.append(accountCard(x)));
    });
    const tickets = S.get("tickets", []);
    main.append(el("div", { class: "sech" }, el("h2", { text: "Helpdesk tickets" }), el("span", { class: "small muted", text: tickets.filter((t) => t.status === "open").length + " open" })),
      tickets.length ? el("div", { class: "stack" }, ...tickets.slice().reverse().map((t) => el("div", { class: "card pad" }, el("div", { class: "small muted", text: `${t.ref} · ${who(t.by).n} (${t.by}) · ${t.topic} · ${C.fmtTime(t.at)}` }), el("p", { text: t.text }),
        t.reply ? el("p", { class: "small" }, el("b", { text: "Reply: " }), t.reply) : null,
        t.status === "open" ? el("button", { class: "btn sm", onclick: async () => { const tx = el("textarea", { class: "input ta", rows: 3 }); const r = await C.modal({ title: "Reply and resolve " + t.ref, body: tx, actions: [{ label: "Cancel", cls: "ghost", id: null }, { label: "Send reply", value: () => tx.value.trim() || false }] }); if (!r) return; const all = S.get("tickets", []); const x = all.find((y) => y.ref === t.ref); x.reply = r; x.status = "resolved"; x.by2 = u.id; S.set("tickets", all); location.reload(); } }, "Reply and resolve") : el("span", { class: "pill ok", text: "Resolved" }))))
        : el("p", { class: "small muted", text: "No tickets yet. Students open tickets from the Help page." }));
  }
  function accountCard(x) {
    const e = C.enrol(x), ud = C.ud(x), prints = Object.values(ud.get("prints", {})).reduce((a, b) => a + b.length, 0), sub = ud.get("aiSub", null);
    const last = S.get("activity", []).filter((a) => a.id === x.id).slice(-1)[0];
    return el("div", { class: "card pad" }, el("div", { class: "btns between" }, el("div", {}, el("h3", { text: x.n }), el("div", { class: "small muted", text: `${x.id} · ${C.roleName(x)}${x.c ? " · " + C.centre(x.c) : ""}` })),
      el("div", { class: "btns" }, el("button", { class: "btn sec sm", "data-toast": "In the live service this sends a password-reset link to the student’s registered phone and email.", text: "Send reset link" }),
        el("button", { class: "btn ghost sm", onclick: async () => { if (await C.confirm("Clear this account’s reading data?", "Removes bookmarks, highlights, notes, quiz attempts, downloads and AI chats stored on this device for " + x.n + ". The print record and AI subscription are kept.", "Clear", "red")) { ud.resetReading(); C.say("Cleared."); } }, text: "Clear reading data" }))),
      x.r === "s" ? el("div", { class: "small mt" }, el("div", { text: `${C.prog(x.p).name} · Level ${x.l}${e.option ? " · " + e.option : ""}` }),
        el("div", { text: `Current courses: ${e.current.map((s) => C.course(s).code).join(", ")}` }), el("div", { text: `Read-only courses: ${e.retro.map((s) => C.course(s).code).join(", ") || "none"}` }),
        el("div", { text: `Prints this semester: ${prints} · AI subscription: ${sub && sub.until > Date.now() ? "active until " + C.fmt(sub.until) : "none"} · last activity: ${last ? last.what + ", " + C.ago(last.at) : "none on this device"}` })) : el("div", { class: "small mt", text: x.cs ? `Courses: ${x.cs.map((s) => C.course(s).code).join(", ")}` : "" }));
  }
  function directory(list, per = 50) {
    const q = el("input", { class: "input", type: "search", placeholder: "Filter by name, index number or programme", "aria-label": "Filter" });
    const tb = el("tbody"), more = el("button", { class: "btn sec sm", text: "Show more" });
    let n = per;
    const draw = () => {
      const v = q.value.trim().toLowerCase();
      const rows = list.filter((x) => !v || x.id.toLowerCase().includes(v) || x.n.toLowerCase().includes(v) || (x.p && C.prog(x.p).short.toLowerCase().includes(v)) || C.roleName(x).toLowerCase().includes(v));
      tb.replaceChildren(...rows.slice(0, n).map((x) => el("tr", {}, el("td", {}, el("b", { text: x.n }), el("div", { class: "tiny muted", text: x.id })), el("td", { text: C.roleName(x) }), el("td", { text: x.p ? `${C.prog(x.p).short} L${x.l}` : x.cs ? x.cs.length + " courses" : "–" }), el("td", { text: x.c ? C.centre(x.c) : "–" }))));
      more.hidden = rows.length <= n; more.textContent = `Show more (${rows.length - n} left)`;
    };
    q.addEventListener("input", () => { n = per; draw(); }); more.addEventListener("click", () => { n += per; draw(); }); draw();
    return el("div", { class: "stack" }, q, el("div", { class: "tablewrap card" }, el("table", { class: "t" }, el("thead", {}, el("tr", {}, ...["Name", "Role", "Programme", "Centre"].map((h) => el("th", { text: h })))), tb)), more);
  }

  // ------------------------------------------------------------------ reports (admin, helpdesk, coordinators)
  function adminPage() {
    const u = C.requireUser(), main = $("#main");
    if (!["a", "h", "sc", "c"].includes(u.r)) { main.append(el("h1", { text: "Reports" }), el("p", { text: "Reports are available to administrators, coordinators and the helpdesk." })); return; }
    const st = C.users.filter((x) => x.r === "s"), act = S.get("activity", []), plog = S.get("printlog", []);
    const count = (k) => act.filter((a) => a.what === k).length;
    main.append(el("div", { class: "crumb" }, el("a", { href: "staff.html", text: "Staff home" }), " / Reports"), el("h1", { text: "Courseware operations, Semester 1 2026/2027" }),
      el("p", { class: "muted small", text: "Programme and course counts come from the September 2026 course list. Accounts are fictional demo users; activity figures are what has happened in this browser." }),
      el("div", { class: "tiles mt" }, tile("Programmes", C.D.programmes.length), tile("Course books", Object.keys(C.D.courses).length), tile("Students", st.length, "demo accounts"), tile("Study centres", C.D.centres.length)),
      el("div", { class: "tiles mt" }, tile("Sign-ins", count("signin") + count("signin-demo"), "on this device"), tile("Downloads", count("download")), tile("Quiz attempts", count("quiz")), tile("AI questions", count("ai"))));
    const byC = C.D.centres.map(([id, name, reg]) => [name, reg, st.filter((x) => x.c === id).length]).sort((a, b) => b[2] - a[2]), mx = Math.max(...byC.map((x) => x[2]));
    main.append(el("div", { class: "two" }, el("div", { class: "card pad" }, el("h2", { text: "Students by study centre" }), el("p", { class: "tiny muted", text: "Winneba, Enchi and Pusiga appear in UEW sources; other centres are illustrative for the prototype." }),
      ...byC.map(([n, r, k]) => el("div", { class: "hrow" }, el("span", {}, n, el("span", { class: "tiny muted", text: " · " + r })), el("span", { class: "hb", style: { width: Math.max(4, k / mx * 260) + "px" } }), el("b", { text: k })))),
      el("div", { class: "card pad" }, el("h2", { text: "Students by programme" }), ...C.D.programmes.map((p) => [p, st.filter((x) => x.p === p.slug).length]).sort((a, b) => b[1] - a[1]).map(([p, k]) => el("div", { class: "hrow" }, el("a", { href: `programme-${p.slug}.html`, text: p.short }), el("span", { class: "hb", style: { width: Math.max(4, k / 200 * 200) + "px" } }), el("b", { text: k }))))));
    main.append(el("div", { class: "sech" }, el("h2", { text: "Print log" }), el("span", { class: "small muted", text: plog.length + " copies" })),
      plog.length ? el("div", { class: "tablewrap card" }, el("table", { class: "t" }, el("tr", {}, ...["Copy ID", "Student", "Course", "Units", "When"].map((h) => el("th", { text: h }))), ...plog.slice().reverse().map((p) => el("tr", {}, el("td", { text: p.id }), el("td", { text: `${who(p.user).n} · ${p.user}` }), el("td", { text: C.course(p.c).code }), el("td", { text: p.units.join(", ") }), el("td", { text: C.fmtTime(p.at) })))))
        : el("p", { class: "small muted", text: "No copies printed on this device yet." }));
    main.append(el("div", { class: "sech" }, el("h2", { text: "Recent activity" })), act.length ? el("div", { class: "tablewrap card" }, el("table", { class: "t" }, el("tr", {}, ...["When", "Account", "Action", "Detail"].map((h) => el("th", { text: h }))), ...act.slice(-25).reverse().map((a) => el("tr", {}, el("td", { text: C.fmtTime(a.at) }), el("td", { text: `${who(a.id).n} · ${a.id}` }), el("td", { text: a.what }), el("td", { text: a.c ? C.course(a.c)?.code || "" : a.q || a.e || a.plan || "" })))))
      : el("p", { class: "small muted", text: "No activity yet." }));
    main.append(el("div", { class: "sech" }, el("h2", { text: "Data checks" })), el("div", { class: "card pad" }, el("p", { class: "small muted", text: `${C.D.dupes.length} course codes in the September 2026 list are used for more than one title and need confirmation:` }),
      el("div", { class: "pills mt" }, ...C.D.dupes.map((d) => el("a", { class: "pill red", href: `course-${d.toLowerCase()}.html`, text: d })))));
    if (u.r === "a" || u.r === "h") main.append(el("div", { class: "sech" }, el("h2", { text: "User directory" }), el("button", { class: "btn sec sm", onclick: () => download("codel-demo-users.csv", ["id,name,role,programme,level,centre"].concat(C.users.map((x) => [x.id, x.n, C.roleName(x), x.p ? C.prog(x.p).short : "", x.l || "", x.c ? C.centre(x.c) : ""].map(csvCell).join(","))).join("\n"), "text/csv") }, icon("dl"), "Export CSV (no passwords)")), directory(C.users));
  }

  // ------------------------------------------------------------------ profile
  function profilePage() {
    const u = C.requireUser(), main = $("#main"), ud = C.ud(u), prefs = ud.get("readerPrefs", { view: "scroll", size: 1, dark: false });
    const e = C.enrol(u);
    const view = el("select", { class: "input", "aria-label": "Default reading view" }, el("option", { value: "scroll", text: "Scroll view" }), el("option", { value: "flip", text: "Flip-book view" })); view.value = prefs.view;
    view.addEventListener("change", () => { prefs.view = view.value; ud.set("readerPrefs", prefs); C.say("Saved."); });
    const all = ud.all(), notes = Object.keys(all).filter((k) => k.startsWith("notes:")).reduce((a, k) => a + all[k].length, 0), bms = Object.keys(all).filter((k) => k.startsWith("bm:")).reduce((a, k) => a + all[k].length, 0), hls = Object.keys(all).filter((k) => k.startsWith("hl:")).reduce((a, k) => a + all[k].length, 0);
    main.append(el("div", { class: "crumb" }, el("a", { href: u.r === "s" ? "dashboard.html" : "staff.html", text: "Home" }), " / My profile"), el("h1", { text: "My profile and settings" }),
      el("div", { class: "two" }, el("div", { class: "stack" },
        el("div", { class: "card pad" }, el("div", { class: "gtop" }, el("div", { class: "avatar lg", text: u.n.split(" ").map((x) => x[0]).join("").slice(0, 2) }), el("div", {}, el("h2", { text: u.n }), el("div", { class: "small muted", text: `${C.roleName(u)} · ${u.id}` }))),
          u.r === "s" ? el("dl", { class: "dl mt" }, el("dt", { text: "Programme" }), el("dd", { text: e.P.name }), el("dt", { text: "Level" }), el("dd", { text: e.L.level + (e.option ? " · " + e.option : "") }), el("dt", { text: "Study centre" }), el("dd", { text: C.centre(u.c) }),
            el("dt", { text: "Courses" }), el("dd", { text: `${e.current.length} this semester, ${e.retro.length} read-only` })) : null),
        el("div", { class: "card pad" }, el("h3", { text: "Reading" }), el("div", { class: "field mt" }, el("label", { text: "Default reading view" }), view),
          el("p", { class: "small muted mt", text: `You have ${bms} bookmarks, ${hls} highlights and ${notes} notes across your course books.` })),
        el("div", { class: "card pad" }, el("h3", { text: "Demo data on this device" }), el("p", { class: "small muted", text: "Everything in this prototype is stored in this browser only. Use these buttons to start a demonstration afresh." }),
          el("div", { class: "btns mt" }, el("button", { class: "btn sec", onclick: async () => { if (await C.confirm("Reset my data?", "Removes your bookmarks, highlights, notes, quiz attempts, practice answers, downloads, reading positions and AI chats on this device. Your print record and AI subscription are kept.", "Reset", "red")) { ud.resetReading(); C.say("Your data were reset."); setTimeout(() => location.reload(), 500); } } }, "Reset my data"),
            el("button", { class: "btn ghost red-t", onclick: async () => { if (await C.confirm("Reset the whole demo?", "Removes all users’ data on this device: forums, groups, exams, announcements and activity. You will be signed out.", "Reset everything", "red")) { S.keys("").forEach((k) => S.del(k)); location.href = "login.html"; } } }, "Reset the whole demo")))),
        el("aside", { class: "stack" }, el("div", { class: "card pad" }, el("h3", { text: "Privacy" }), el("p", { class: "small muted", text: "In the live service, study data stay in the University’s Moodle, and AI requests go through a University server. Your name and index number appear on downloaded and printed copies." })),
          el("button", { class: "btn sec", onclick: () => C.signOut() }, icon("back"), "Sign out"))));
  }

  // ------------------------------------------------------------------ help
  function helpPage() {
    const u = C.me();
    const btn = $("#ticket"); if (!btn) return;
    btn.removeAttribute("data-toast");
    btn.addEventListener("click", async () => {
      if (!u) return C.say("Sign in to open a ticket, or call the helpdesk.");
      const topic = el("select", { class: "input", "aria-label": "Topic" }, ...["Cannot see a course", "Course book will not open or download", "Printing", "Password or sign-in", "Online exam", "AI subscription or payment", "Other"].map((x) => el("option", { text: x })));
      const tx = el("textarea", { class: "input ta", rows: 4, "aria-label": "Describe the problem" });
      const r = await C.modal({ title: "Open a helpdesk ticket", body: el("div", { class: "stack" }, el("div", { class: "field" }, el("label", { text: "Topic" }), topic), el("div", { class: "field" }, el("label", { text: "What happened?" }), tx)),
        actions: [{ label: "Cancel", cls: "ghost", id: null }, { label: "Open ticket", value: () => tx.value.trim() || (C.say("Describe the problem."), false) }] });
      if (!r) return; const ref = "HD-" + (C.hashNum(u.id + Date.now()) % 90000 + 10000);
      const all = S.get("tickets", []); all.push({ ref, by: u.id, topic: topic.value, text: r, at: Date.now(), status: "open" }); S.set("tickets", all); C.say("Ticket opened. Reference " + ref + "."); drawMine();
    });
    const mine = $("#mytickets");
    const drawMine = () => { if (!mine || !u) return; const t = S.get("tickets", []).filter((x) => x.by === u.id); mine.replaceChildren(...(t.length ? [el("h3", { text: "My tickets" }), ...t.slice().reverse().map((x) => el("div", { class: "small mt" }, el("b", { text: `${x.ref} · ${x.topic} · ` }), el("span", { class: "pill " + (x.status === "open" ? "" : "ok"), text: x.status }), x.reply ? el("div", { class: "muted", text: "Reply: " + x.reply }) : null))] : [])); };
    drawMine();
  }

  // ------------------------------------------------------------------ overview page: signed-in hint
  function indexPage() {
    const u = C.me(), h = $("#who"); if (!h || !u) return;
    h.replaceChildren(el("div", { class: "banner flat" }, icon("user", "i lg"), el("div", { class: "small" }, "Signed in as ", el("b", { text: u.n }), ` (${C.roleName(u)}). `, el("a", { href: u.r === "s" ? "dashboard.html" : "staff.html", text: "Go to your home page" }))));
  }

  C.ready(() => {
    const p = C.page;
    try {
      if (p === "login") loginPage(); else if (p === "programmes") programmesPage(); else if (p === "dashboard") dashboardPage(); else if (p === "course") coursePage();
      else if (p === "print") printPage(); else if (p === "staff") staffPage(); else if (p === "admin") adminPage(); else if (p === "profile") profilePage(); else if (p === "help") helpPage(); else if (p === "index") indexPage();
    } catch (e) { if (e.message !== "redirect") throw e; }
  });
})();
