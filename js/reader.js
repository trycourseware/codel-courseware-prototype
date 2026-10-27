// E-book reader: scroll view + flip-book view, bookmarks, highlights, notes, search, read aloud, download, print, AI panel.
(function () {
  "use strict";
  if (document.body.dataset.page !== "reader") return;
  const { el, icon, $, $$ } = C;
  const u = C.me();
  const slug = C.course(C.Q.get("c")) ? C.Q.get("c") : Object.keys(C.D.courses)[0];
  const course = C.course(slug);
  const access = C.access(slug, u);                       // full | retro | preview | register | staff
  const limited = access === "preview" || access === "register";    // Unit 1 only
  const canDownload = access === "full" || access === "staff";
  const canPrint = canDownload;
  const canAI = access === "full" || access === "staff";
  const ud = C.ud(u);
  const prefs = ud.get("readerPrefs", { view: "scroll", size: 1, dark: false });
  const SCALES = [0.85, 1, 1.15, 1.3, 1.5, 1.75];            // text sizes (index kept in prefs.ts)
  const HC = [["yellow", "Yellow"], ["green", "Green"], ["blue", "Blue"], ["pink", "Pink"], ["orange", "Orange"]];
  if (!(prefs.ts >= 0 && prefs.ts < SCALES.length)) prefs.ts = 1;
  if (!HC.some((c) => c[0] === prefs.hc)) prefs.hc = "yellow";
  const savePrefs = () => { if (u) ud.set("readerPrefs", prefs); };
  const clip = (t, n) => (t.length > n ? t.slice(0, n).replace(/\s+\S*$/, "") + "…" : t);
  const K = (k) => k + ":" + slug;                        // per-course keys inside the user record
  // wording that differs between the prototype (defaults) and a real installation (C.text, set by the Moodle adapter)
  const T = (k, d) => (C.text && k in C.text ? C.text[k] : d);
  let BOOK = null, page = 1, view = C.Q.get("view") || prefs.view, speaking = false;
  // pages with nothing on them, and the order of the pages that are shown (see shownFrom)
  let EMPTY = new Set(), SEQ = [], POS = new Map();

  // ---------------------------------------------------------------- data helpers
  const blocks = {};                                     // id -> block
  const pageBlocks = (n) => (BOOK.pages[n - 1] && BOOK.pages[n - 1].blocks) || [];
  const allowedPage = (n) => { const P = BOOK.pages[n - 1]; if (!P) return false; return !limited || n <= 3 || P.unit === 1 || P.kind === "end"; };
  // not registered for this semester: the rest of the book opens once OSIS shows the registration. "I have registered"
  // asks the server to check; the student can report a registration the check does not find.
  let regBusy = false;
  function registerDialog() {
    if (access !== "register") return C.say("That page is locked in preview.");
    const msg = el("p", { class: "small", id: "regmsg" });
    const note = el("textarea", { class: "input", rows: 2, placeholder: "Optional: your note to the office (e.g. the date you registered)", style: { display: "none" } });
    const body = el("div", { class: "stack" },
      el("p", { text: T("registerText", "You have not registered for this semester in OSIS, so this course book opens up to the end of Unit 1. Register, then press \"I have registered\" and the rest of the book unlocks.") }),
      msg, note);
    return C.modal({ title: T("registerTitle", "Register to read on"), body, actions: [
      // (the dialog stays open while the server answers: the handlers return false and show the answer in it)
      { id: "check", label: "I have registered", cls: "primary", value: (box) => {
        if (regBusy) return false;
        regBusy = true; msg.textContent = "Checking your registration…";
        C.regcheck().then((r) => {
          msg.textContent = r.message || "";
          if (r.result === "registered") { msg.textContent += " Opening the book…"; setTimeout(() => location.reload(), 1800); return; }
          if (r.result === "unregistered") { note.style.display = ""; const rb = box.querySelector("[data-report]"); if (rb) rb.style.display = ""; }
        }).catch((e) => { msg.textContent = "The check could not be made: " + (e.message || "please try again."); }).finally(() => { regBusy = false; });
        return false;
      } },
      { id: "report", label: "I have registered, but it is not recognised: report to the office", cls: "", value: (box) => {
        const rb = box.querySelector("[data-report]");
        if (rb) rb.disabled = true;
        C.regreport(note.value).then(() => { msg.textContent = "Reported to the CODeL office. They will check your registration and reply to you."; note.style.display = "none"; if (rb) rb.style.display = "none"; })
          .catch((e) => { msg.textContent = "The report could not be sent: " + (e.message || "please try again."); if (rb) rb.disabled = false; });
        return false;
      } },
      { id: "close", label: "Close", cls: "ghost" },
    ], onOpen: (box) => { const rb = [...box.querySelectorAll(".mact .btn")].find((b) => /report/.test(b.textContent)); if (rb) { rb.dataset.report = "1"; rb.style.display = "none"; } } });
  }
  const unitOfPage = (n) => BOOK.pages[n - 1] && BOOK.pages[n - 1].unit;
  const pageLabel = (n) => {
    const P = BOOK.pages[n - 1];
    if (!P) return "";
    if (P.kind === "cover") return "Cover"; if (P.kind === "title") return "Title page"; if (P.kind === "contents") return "Contents"; if (P.kind === "end") return "End of book";
    const firstHead = P.blocks.map((b) => blocks[b]).find((b) => b.t === "h");
    return `Unit ${P.unit}${firstHead ? " · " + firstHead.x : ""}`;
  };
  const list = (k) => ud.get(K(k), []);
  const save = (k, v) => ud.set(K(k), v);

  // ---------------------------------------------------------------- shell
  const root = el("div", { class: "reader-root" + (prefs.dark ? " night" : "") });
  document.body.prepend(root);
  // on-screen watermark: the student's name and index number, faint and diagonal, repeated over every page, so a
  // screenshot or photograph of the book shows whose copy it was (as the print copies do). It is a background picture:
  // it cannot be selected, copied or found by search, and clicks, selection and highlights pass through it. Staff
  // (authors, reviewers, tutors) read without it.
  if (u && access !== "staff") {
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);
    const tile = (fill) => "url(\"data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="360" height="200">`
      + `<text x="180" y="100" text-anchor="middle" dominant-baseline="middle" transform="rotate(-24 180 100)" font-family="Segoe UI,Arial,sans-serif" `
      + `font-size="15" font-weight="600" fill="${fill}">${esc(u.n + " · " + u.id)}</text></svg>`) + "\")";
    root.classList.add("wm");
    root.style.setProperty("--wm", tile("rgba(29,47,111,0.10)"));
    root.style.setProperty("--wm-night", tile("rgba(255,255,255,0.10)"));
  }
  const banner = T("draftBanner", "") ? el("div", { class: "banner warn flat" }, icon("pen", "i lg"), el("div", { class: "small" }, el("b", { text: T("draftBanner", "") })))
    : access === "retro" ? el("div", { class: "banner warn flat" }, icon("eye", "i lg"), el("div", { class: "small" }, el("b", { text: T("retroBanner", "Retrospective access: read-only until 30 April 2027. ") }), "Your bookmarks, highlights and notes are kept. Downloading, printing and the AI assistant are not available in this period."))
    : access === "register" ? el("div", { class: "banner warn flat" }, icon("lock", "i lg"), el("div", { class: "small" }, el("b", { text: "Unit 1 only. " }), "You have not registered for this semester. ", el("a", { href: "#", text: "I have registered", onclick: (e) => { e.preventDefault(); registerDialog(); } })))
    : access === "preview" ? el("div", { class: "banner warn flat" }, icon("lock", "i lg"), el("div", { class: "small" }, el("b", { text: "Preview. " }), u ? "You are not registered for this course this semester, so only Unit 1 is available." : "Sign in to read the full course book. Only Unit 1 is available in preview."))
      : null;
  const back = el("a", { class: "tb", href: C.link(access === "retro" ? "home" : "course", { c: slug }), "aria-label": "Back" }, icon("back", "i lg"));
  const tocBtn = el("button", { class: "tb", "aria-label": "Contents, bookmarks and notes", "aria-expanded": "false" }, icon("list", "i lg"));
  const title = el("div", { class: "t" }, el("span", { text: course.title }), el("small", { id: "rsub", text: course.code }));
  const seg = el("div", { class: "vseg", role: "group", "aria-label": "Reading view" },
    el("button", { "data-v": "scroll", title: "Scroll view" }, icon("scroll"), el("span", { class: "txt", text: "Scroll" })),
    el("button", { "data-v": "flip", title: "Flip-book view" }, icon("book"), el("span", { class: "txt", text: "Flip" })));
  const bmBtn = el("button", { class: "tb", "aria-label": "Bookmark this page", "aria-pressed": "false" }, icon("mark"));
  const noteBtn = el("button", { class: "tb note-tb", "aria-label": "Add a note to this page" }, icon("note"));
  const sizeBtn = el("button", { class: "tb hide-sm", "aria-label": "Text size" }, icon("text"));
  const darkBtn = el("button", { class: "tb hide-sm", "aria-label": "Night mode", "aria-pressed": String(!!prefs.dark) }, icon("sun"));
  const speakBtn = el("button", { class: "tb hide-sm", "aria-label": "Read aloud", "aria-pressed": "false" }, icon("head"));
  const dlBtn = el("button", { class: "tb lab" + (canDownload ? "" : " off"), "aria-label": "Download for offline reading" }, icon(canDownload ? "dl" : "lock"), el("span", { class: "txt", text: "Download" }));
  const prBtn = el("button", { class: "tb lab" + (canPrint ? "" : " off"), "aria-label": "Print a study copy" }, icon(canPrint ? "print" : "lock"), el("span", { class: "txt", text: "Print" }));
  const fsBtn = el("button", { class: "tb hide-sm", "aria-label": "Full screen (F)", "aria-pressed": "false", title: "Full screen (F)" }, icon("full"));
  const more = el("button", { class: "tb show-sm", "aria-label": "More options" }, icon("more"));
  const bar = el("div", { class: "rbar" }, back, tocBtn, title, seg, bmBtn, noteBtn, sizeBtn, darkBtn, speakBtn, fsBtn, dlBtn, prBtn, more);

  // side panel with tabs
  const tabs = [["c", "Contents"], ["b", "Bookmarks"], ["n", "Notes"], ["s", "Search"], ["a", "Ask AI"]];
  const panel = el("aside", { class: "rpanel", "aria-label": "Reader panel" });
  const tabbar = el("div", { class: "seg", role: "tablist" }, ...tabs.map(([k, t]) => el("button", { role: "tab", "data-tab": k, text: t })));
  const pbody = el("div", { class: "pbody" });
  panel.append(el("div", { class: "phead" }, tabbar, el("button", { class: "icon-btn dark show-sm", "aria-label": "Close panel", onclick: () => togglePanel(false) }, icon("x"))), pbody);
  const stage = el("main", { class: "rstage", tabindex: "-1" });
  const foot = el("div", { class: "rfoot" });
  const slider = el("input", { type: "range", min: 1, max: 1, value: 1, "aria-label": "Page" });
  const pgInfo = el("span", { class: "pginfo" });
  const prevB = el("button", { class: "tb", "aria-label": "Previous page" }, icon("back"));
  const nextB = el("button", { class: "tb", "aria-label": "Next page" }, icon("chev"));
  const lic = el("span", { class: "lic" }, icon("user", "i sm"), u ? `Licensed to ${u.n} · ${u.id}` : "Preview copy");
  foot.append(prevB, pgInfo, slider, nextB, lic);
  root.append(...(banner ? [banner] : []), bar, el("div", { class: "rbody" }, panel, stage), foot);
  const selbar = el("div", { class: "selbar", role: "toolbar", "aria-label": "Highlight, bookmark, note, ask AI or read aloud" },
    el("div", { class: "hdots" }, ...HC.map(([c, n]) => el("button", { class: "hdot c-" + c, "data-act": "hl", "data-c": c, "aria-label": "Highlight in " + n.toLowerCase(), title: "Highlight in " + n.toLowerCase() }))),
    el("button", { "data-act": "bm", title: "Bookmark this passage" }, icon("mark"), el("span", { text: "Bookmark" })),
    el("button", { "data-act": "note", title: "Attach a note" }, icon("note"), el("span", { text: "Note" })),
    canAI ? el("button", { "data-act": "ask", title: "Discuss this passage with the AI assistant" }, icon("spark"), el("span", { text: "Ask AI" })) : null,
    el("button", { "data-act": "read", title: "Read the selection aloud" }, icon("head"), el("span", { text: "Read aloud" })),
    el("button", { "data-act": "rm", class: "rm", title: "Remove this highlight" }, icon("trash"), el("span", { text: "Remove" })));
  const tpop = el("div", { class: "tpop", role: "dialog", "aria-label": "Text size" });
  document.body.append(selbar, tpop);

  // ---------------------------------------------------------------- panel
  let curTab = "c", aiCtx = null, bmSort = "page", hlFilter = "";
  let askPq = C.Q.get("pq");                            // a past question to ask the assistant about once (link from Past questions)
  function togglePanel(open) {
    panel.classList.toggle("open", open); tocBtn.setAttribute("aria-expanded", String(open));
    if (BOOK && view === "flip") setTimeout(renderFlip, 0);
  }
  tocBtn.addEventListener("click", () => togglePanel(!panel.classList.contains("open")));
  tabbar.addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) showTab(b.dataset.tab); });
  function showTab(k) {
    curTab = k;
    $$("[data-tab]", tabbar).forEach((b) => { b.classList.toggle("on", b.dataset.tab === k); b.setAttribute("aria-selected", String(b.dataset.tab === k)); });
    pbody.replaceChildren();
    if (k === "c") {
      pbody.append(...[[1, "Cover"], [2, "Title page"], [3, "Contents"]].map(([p, t]) => item(t, "p. " + p, () => go(p))),
        ...BOOK.units.map((un) => item(`Unit ${un.n} · ${un.title}`, "p. " + un.page + (allowedPage(un.page) ? "" : " · locked"), () => go(un.page), !allowedPage(un.page))));
    } else if (k === "b") {
      const bms = list("bm");
      const sort = el("select", { class: "input sm", "aria-label": "Sort bookmarks" }, el("option", { value: "page", text: "By page" }), el("option", { value: "new", text: "Newest first" })); sort.value = bmSort;
      sort.addEventListener("change", () => { bmSort = sort.value; showTab("b"); });
      pbody.append(el("div", { class: "btns pad0" }, el("button", { class: "btn sec sm", onclick: () => nameBookmark() }, icon("mark"), "Bookmark this page…"), bms.length > 1 ? sort : null));
      if (!bms.length) pbody.append(el("p", { class: "small muted pad", text: "No bookmarks yet. Bookmark a page with the ribbon button, or select a passage and choose Bookmark. You can name every bookmark." }));
      bms.sort((x, y) => (bmSort === "new" ? y.at - x.at : x.p - y.p || x.at - y.at)).forEach((b) => pbody.append(el("div", { class: "bm" },
        el("a", { href: "#", onclick: (e) => { e.preventDefault(); go(b.p); if (b.bid) flash(b.bid); if (innerWidth < 1000) togglePanel(false); } },
          el("b", { text: b.label }), b.quote ? el("q", { class: "bq", text: clip(b.full || b.quote, 110) }) : null, el("span", { text: `p. ${b.p} · ${b.bid ? "passage" : "page"} · ${C.fmt(b.at)}` })),
        el("button", { class: "icon-btn dark sm", "aria-label": "Rename bookmark", onclick: () => nameBookmark(b) }, icon("pen")),
        el("button", { class: "icon-btn dark sm", "aria-label": "Remove bookmark", onclick: () => { save("bm", list("bm").filter((x) => x.id !== b.id)); showTab("b"); refresh(); C.say("Bookmark removed."); } }, icon("x")))));
    } else if (k === "n") {
      const notes = list("notes"), hls = list("hl");
      pbody.append(el("div", { class: "btns pad0" },
        el("button", { class: "btn sec sm", onclick: () => addNote() }, icon("note"), "New note"),
        el("button", { class: "btn ghost sm", onclick: exportNotes }, icon("dl"), "Export")));
      pbody.append(el("div", { class: "label pad0", text: `Notes (${notes.length})` }));
      if (!notes.length) pbody.append(el("p", { class: "small muted pad", text: "No notes yet. Select some text and choose Add note, or use the note button in the toolbar." }));
      notes.sort((a, b) => a.p - b.p).forEach((n) => {
        const it = el("div", { class: "bm note-item" },
          el("b", { text: `p. ${n.p} · ${C.fmt(n.upd || n.at)}` }), n.quote ? el("q", { text: clip(n.full || n.quote, 140) }) : null, el("span", { class: "ntext", text: n.text }),
          el("div", { class: "btns" }, el("button", { class: "btn ghost sm", onclick: () => go(n.p), text: "Go to page" }),
            el("button", { class: "btn ghost sm", onclick: () => addNote(n), text: "Edit" }),
            el("button", { class: "btn ghost sm red-t", onclick: () => { save("notes", list("notes").filter((x) => x.id !== n.id)); showTab("n"); refresh(); C.say("Note deleted."); }, text: "Delete" })));
        pbody.append(it);
      });
      const groups = hlGroups();
      pbody.append(el("div", { class: "label pad0", text: `Highlights (${groups.length})` }));
      if (groups.length) pbody.append(el("div", { class: "hfilter", role: "group", "aria-label": "Filter highlights by colour" },
        el("button", { class: "pill" + (hlFilter ? " grey" : ""), onclick: () => { hlFilter = ""; showTab("n"); }, text: "All" }),
        ...HC.filter(([c]) => groups.some((g) => g.color === c)).map(([c, n]) => el("button", { class: "pill" + (hlFilter === c ? "" : " grey"), onclick: () => { hlFilter = c; showTab("n"); } }, el("i", { class: "sw c-" + c }), n))));
      groups.filter((g) => !hlFilter || g.color === hlFilter).sort((x, y) => x.p - y.p).forEach((g) => pbody.append(el("div", { class: "bm hl-item" },
        el("a", { href: "#", onclick: (e) => { e.preventDefault(); go(g.p); flash(g.bid); if (innerWidth < 1000) togglePanel(false); } }, el("b", {}, el("i", { class: "sw c-" + g.color }), " “" + clip(g.text, 120) + "”"), el("span", { text: `p. ${g.p} · ${(HC.find((c) => c[0] === g.color) || HC[0])[1]} · ${C.fmt(g.at)}` })),
        el("button", { class: "icon-btn dark sm", "aria-label": "Remove highlight", onclick: () => { removeHl(g.gid); showTab("n"); C.say("Highlight removed."); } }, icon("x")))));
    } else if (k === "s") {
      const q = el("input", { class: "input", type: "search", placeholder: "Search this book", "aria-label": "Search this book" });
      const res = el("div", { class: "sres" });
      q.addEventListener("input", () => {
        const v = q.value.trim().toLowerCase(); res.replaceChildren();
        if (v.length < 2) return;
        const hits = Object.values(blocks).filter((b) => allowedPage(b.p) && (b.x || (b.items || []).join(" ")).toLowerCase().includes(v)).slice(0, 40);
        res.append(el("div", { class: "tiny muted pad0", text: `${hits.length} result${hits.length === 1 ? "" : "s"}` }));
        hits.forEach((b) => {
          const t = b.x || (b.items || []).join(" "); const i = t.toLowerCase().indexOf(v);
          const snip = (i > 30 ? "…" : "") + t.slice(Math.max(0, i - 30), i + v.length + 50) + "…";
          res.append(item(snip, `p. ${b.p} · Unit ${b.id.match(/u(\d+)/)[1]}`, () => { go(b.p); flash(b.id); showHit(b, v); }, !allowedPage(b.p)));
        });
      });
      pbody.append(q, res); setTimeout(() => q.focus(), 30);
    } else if (k === "a") {
      if (!canAI) { pbody.append(el("p", { class: "small muted pad", text: access === "retro" ? "The AI assistant is closed during retrospective access." : "The AI assistant is available to students registered for this course." })); return; }
      const box = el("div", { class: "aibox" }); pbody.append(box);
      C.mountAssistant && C.mountAssistant(box, { slug, compact: true, context: aiCtx, pq: askPq, onClearContext: () => { aiCtx = null; } });
      askPq = null;
    }
  }
  function item(t, sub, onGo, locked, onDel) {
    return el("div", { class: "bm" + (locked ? " locked" : "") },
      el("a", { href: "#", onclick: (e) => { e.preventDefault(); if (locked) return C.say("This part of the book is locked in preview."); onGo(); if (innerWidth < 1000) togglePanel(false); } }, el("b", { text: t }), el("span", { text: sub })),
      onDel ? el("button", { class: "icon-btn dark sm", "aria-label": "Remove", onclick: onDel }, icon("x")) : null);
  }

  // ---------------------------------------------------------------- block rendering
  // a piece of a paragraph: text with its marks (f: b bold, i italics, u underlined, d subscript, p superscript), or a
  // symbol or formula a printed module has as a picture, at the size of the text
  const MARK = { b: "strong", i: "em", u: "u", d: "sub", p: "sup" };
  const marked = (node, f) => { for (const k of f || "") if (MARK[k]) node = el(MARK[k], {}, node); return node; };
  // a formula (MathML, typed from the module): only its own elements and attributes are kept
  const MATHTAGS = new Set(["math", "mrow", "mi", "mn", "mo", "mtext", "mspace", "mfrac", "msup", "msub", "msubsup", "munder", "mover", "munderover", "msqrt", "mroot",
    "mtable", "mtr", "mtd", "mstyle", "mpadded", "menclose", "mfenced", "ms", "mphantom", "semantics", "annotation"]);
  const formula = (m) => {
    const doc = new DOMParser().parseFromString("<!doctype html><body>" + m, "text/html"), root = doc.body.querySelector("math");
    if (!root) return document.createTextNode("");
    const walk = (n) => { for (const c of [...n.childNodes]) {
      if (c.nodeType === 1) { if (!MATHTAGS.has(c.localName)) { n.removeChild(c); continue; } for (const a of [...c.attributes]) if (/^on|^xlink|href|src/i.test(a.name)) c.removeAttribute(a.name); walk(c); }
      else if (c.nodeType !== 3) n.removeChild(c); } };
    walk(root); const span = el("span", { class: "eq" }); span.append(document.adoptNode(root)); return span;
  };
  const piece = (s) => s.src ? el("img", { class: "inl", src: s.src, alt: "", loading: "lazy", style: { height: (s.h || 1) * 1.05 + "em" } })
    : s.m ? formula(s.m) : s.x === "\n" ? el("br") : marked(document.createTextNode(s.x), s.f);
  const NUM = /^\(?-?(GH\s?[¢₵]\s?)?\d[\d,.\s]*\)?%?$/, YEAR = /^(19|20)\d\d$/;      // (a year in an account's date column is not an amount)
  function blockEl(b) {
    let n;
    if (b.t === "h") n = el("h3", { text: b.x });
    else if (b.t === "p" && b.inl) n = el("p", {}, ...b.inl.map(piece));
    else if (b.t === "p") n = el("p", { text: b.x });
    else if (b.t === "ul") n = el("ul", {}, ...b.items.map((x, i) => b.inls && b.inls[i] ? el("li", {}, ...b.inls[i].map(piece)) : el("li", { text: x })));
    // bold lines, tables and pictures of books imported from Word (the prototype's sample books have none)
    else if (b.t === "sub") n = el("h4", { class: "bsub", text: b.x });
    // lines set out in columns in a printed PDF (accounts, statements): columns without rules, amounts to the right; an
    // account with its name over it, the line between its debit and credit sides and the rules under its totals
    else if (b.t === "table") n = el("div", { class: "btable" + (b.cols ? " cols" : "") + (b.split ? " acct" : "") + (b.rule === "top" ? " topline" : "") },
      el("table", {}, b.cap ? el("caption", { text: b.cap }) : null, ...b.rows.map((r, i) => el("tr", {}, ...r.map((c, j) => {
        const mk = (b.marks || {})[i + "," + j];
        const cls = [b.cols && j > 0 && NUM.test(c.trim()) && !YEAR.test(c.trim()) ? "num" : "", mk ? "rl-" + mk : "", b.split && j === b.split - 1 ? "lend" : ""].filter(Boolean).join(" ");
        return el(i === 0 && b.head ? "th" : "td", { class: cls || null }, marked(document.createTextNode(c), (b.fmt || {})[i + "," + j]));
      })))));
    else if (b.t === "img") n = el("figure", { class: "bimg" }, el("img", { src: b.src, alt: b.alt || "", loading: "lazy" }));
    // a page of the book as printed (the picture is the page; its text is behind it for the AI and search)
    else if (b.t === "page") {
      // the page box grows with the text size (--ts) and scrolls sideways inside the figure when it is wider than the column
      // until the picture has arrived (slow connections), the box shows grey lines where the text will be
      const img = el("img", { alt: "Page " + (b.p || "") + " as printed", loading: "lazy", width: b.w || null, height: b.h || null });
      const box = el("div", { class: "pbox ld" }, img);
      const done = () => box.classList.remove("ld");
      img.addEventListener("load", done); img.addEventListener("error", done);
      img.src = b.src;
      if (img.complete && img.naturalWidth) done();
      n = el("figure", { class: "bpage" }, box);
      if (b.lines && b.lines.length && b.w && b.h) {
        // the text layer: each printed line as invisible text at its place on the picture (as a searchable PDF does), so
        // the page can be selected, searched and highlighted; a space after each line keeps the words apart in selections
        const layer = el("div", { class: "textlayer" });
        b.lines.forEach(([x, y, w, h, t]) => { layer.append(el("span", { "data-w": w, style: { left: x * 100 + "%", top: y * 100 + "%", fontSize: (h * b.h / b.w * 100).toFixed(3) + "cqw" }, text: t }), document.createTextNode(" ")); });
        box.append(layer); fitLayer(box);
      }
    }
    else n = el("div", { class: "callout" }, icon("quiz"), el("span", { text: b.x }), el("a", { href: C.link("quizzes", { c: slug }), class: "tiny", text: " Open quizzes" }));
    n.dataset.bid = b.id; n.id = "b-" + b.id;
    return n;
  }
  function pageContent(n) {
    const P = BOOK.pages[n - 1], wrap = el("div", { class: "pcontent" });
    if (!allowedPage(n)) { wrap.append(el("div", { class: "locked-page" }, icon("lock", "i lg"), el("p", { text: access === "register" ? "Register for this semester to read on." : "This page is not available in preview." }), access === "register" ? el("button", { class: "btn sm", type: "button", text: "I have registered", onclick: registerDialog }) : null)); return wrap; }
    if (P.kind === "cover") wrap.append(C.cover(course, "big"));
    else if (P.kind === "title") wrap.append(el("div", { class: "titlepage" },
      el("div", { class: "label", text: "College for Distance and e-Learning" }), el("h2", { text: course.title }), el("p", { class: "muted", text: course.code + " · Edition " + BOOK.edition + T("editionNote", " (sample)") }),
      el("p", { class: "small", text: "Offered in: " + [...new Set(course.offerings.map((o) => C.prog(o.p).short))].join(", ") }),
      ratingLine(),
      el("p", { class: "small muted lic2", text: u ? `Licensed to ${u.n} · ${u.id}. For personal study only.` : "Preview copy." }),
      T("sampleNote", true) ? el("p", { class: "tiny muted", text: "Sample text for the prototype. The approved course book appears here." }) : null));
    else if (P.kind === "contents") wrap.append(el("h2", { text: "Contents" }), el("ol", { class: "contents" }, ...BOOK.units.map((un) =>
      el("li", {}, el("a", { href: "#", onclick: (e) => { e.preventDefault(); go(un.page); } }, el("span", { text: `Unit ${un.n}  ${un.title}` }), el("span", { class: "dots" }), el("span", { text: un.page }))))));
    else if (P.kind === "end") wrap.append(el("div", { class: "titlepage" }, el("h2", { text: "End of the course book" }),
      el("p", { text: "Take the self-checks in Quizzes, practise with past questions and join the course discussion." }),
      el("div", { class: "btns" }, el("a", { class: "btn sec sm", href: C.link("quizzes", { c: slug }), text: "Quizzes" }), el("a", { class: "btn sec sm", href: C.link("pastq", { c: slug }), text: "Past questions" })),
      rateBox()));
    else {
      if (P.opener) { const un = BOOK.units[P.unit - 1]; wrap.append(el("div", { class: "u", text: `UNIT ${un.n}` }), el("h2", { text: un.title })); }
      P.blocks.forEach((id) => wrap.append(blockEl(blocks[id])));
    }
    applyAnnotations(wrap, n);
    return wrap;
  }

  // Highlights, passage bookmarks and note quotes are stored as {bid, off, text} and re-applied by wrapping text in the block.
  function markText(root, text, cls, attrs = {}, off = null) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = []; let full = "";
    while (walker.nextNode()) { nodes.push([walker.currentNode, full.length]); full += walker.currentNode.nodeValue; }
    const i = off != null && full.substr(off, text.length) === text ? off : full.indexOf(text); if (i < 0) return [];
    const end = i + text.length, made = [];
    for (const [node, start] of nodes) {
      const s = Math.max(i, start), e = Math.min(end, start + node.nodeValue.length);
      if (s >= e) continue;
      const r = document.createRange(); r.setStart(node, s - start); r.setEnd(node, e - start);
      const m = el("mark", { class: cls, ...attrs }); r.surroundContents(m); made.push(m);
    }
    return made;
  }
  // Ratings of the book (Moodle: local_codel\ratings, through the adapter's C.rating and C.rate): the average once enough
  // students have rated; a registered student rates with one to five stars and, if they wish, a comment for the course team.
  const rating = () => (C.rating ? C.rating() : null);
  const starsText = (n) => "★".repeat(Math.round(n)) + "☆".repeat(5 - Math.round(n));
  function ratingLine() {
    const r = rating();
    if (!r || !r.shown) return null;
    return el("p", { class: "small rating-line", title: `Average of ${r.count} students' ratings` }, el("span", { class: "stars", text: starsText(r.avg), "aria-hidden": "true" }),
      ` ${r.avg.toFixed(1)} · ${r.count} rating${r.count === 1 ? "" : "s"}`);
  }
  function rateBox() {
    const r = rating();
    if (!r || !r.can) return null;
    let stars = r.mine ? r.mine.stars : 0;
    const status = el("p", { class: "tiny muted", "aria-live": "polite", text: r.mine ? "Your rating is saved. You can change it." : "" });
    const btns = [1, 2, 3, 4, 5].map((n) => el("button", { type: "button", class: "starbtn", "aria-label": `${n} star${n === 1 ? "" : "s"}`, text: "★",
      onclick: () => { stars = n; paint(); } }));
    const paint = () => btns.forEach((b, i) => { b.classList.toggle("on", i < stars); b.setAttribute("aria-pressed", String(i < stars)); });
    paint();
    const comment = el("textarea", { class: "input", rows: 3, maxlength: 1000, placeholder: "A comment for the course team (optional): what helped, what was hard to follow", "aria-label": "Comment for the course team" });
    comment.value = r.mine ? r.mine.comment : "";
    const save = el("button", { type: "button", class: "btn sm", text: "Save my rating", onclick: () => {
      if (!stars) { status.textContent = "Choose one to five stars."; return; }
      save.disabled = true;
      C.rate(stars, comment.value).then(() => { status.textContent = "Your rating is saved. You can change it."; }).catch((e) => { status.textContent = e.message || "The rating could not be saved. Try again."; })
        .finally(() => { save.disabled = false; });
    } });
    return el("div", { class: "ratebox" }, el("h3", { text: "Rate this course book" }), el("div", { class: "stars-in", role: "group", "aria-label": "Stars" }, ...btns),
      comment, el("div", { class: "btns" }, save), status,
      el("p", { class: "tiny muted", text: `Your name is not shown with your comment. The average appears once ${r.min || 5} students have rated.` }));
  }
  // each line of a text layer is stretched to the width of the printed line, once the page has a width
  function fitLayer(fig) {
    const ro = new ResizeObserver(() => {
      const W = fig.clientWidth; if (!W) return;
      $$(".textlayer span", fig).forEach((s) => { const tw = s.getBoundingClientRect().width; if (tw > 0) s.style.transform = `scaleX(${(+s.dataset.w * W / tw).toFixed(4)})`; });
      ro.disconnect();
    });
    ro.observe(fig);
  }
  // a search hit shown in place: a box on the words in the block (on a page shown as printed, over the printed line)
  function showHit(b, v) {
    setTimeout(() => {
      $$("mark.sq", stage).forEach((m) => { m.replaceWith(...m.childNodes); });
      const e = document.getElementById("b-" + b.id), t = b.x || (b.items || []).join(" "), i = t.toLowerCase().indexOf(v);
      if (e && i >= 0) markText(e, t.slice(i, i + v.length), "sq");
    }, 450);
  }
  function applyAnnotations(wrap, n) {
    const find = (bid) => wrap.querySelector(`[data-bid="${bid}"]`);
    list("hl").filter((h) => h.p === n).forEach((h) => { const b = find(h.bid); if (b) markText(b, h.text, "hl c-" + (h.color || "yellow"), { "data-hid": h.id, title: "Highlight: click for options" }, h.off); });
    list("bm").filter((x) => x.p === n && x.bid).forEach((x) => { const b = find(x.bid); if (b) { const ms = markText(b, x.quote, "bmq", { "data-bmid": x.id, title: "Bookmark: " + x.label }, x.off); if (ms[0]) ms[0].classList.add("first"); } });
    list("notes").filter((x) => x.p === n).forEach((x) => {
      const b = x.bid && find(x.bid);
      const card = el("button", { class: "notecard", onclick: () => addNote(x) }, icon("note", "i sm"), el("span", { text: x.text }));
      if (b) { if (x.quote) markText(b, x.quote, "nq", {}, x.off); b.after(card); } else wrap.append(card);
    });
  }
  function flash(bid) { setTimeout(() => { const n = document.getElementById("b-" + bid); if (n) { n.classList.add("flash"); n.scrollIntoView({ block: "center", behavior: "smooth" }); setTimeout(() => n.classList.remove("flash"), 1800); } }, 350); }

  // ---------------------------------------------------------------- scroll view
  let io = null;
  function renderScroll() {
    stage.className = "rstage scroll";
    const art = el("article", { class: "pg-scroll", style: { fontSize: 18 * SCALES[prefs.ts] + "px" } });
    art.style.setProperty("--ts", SCALES[prefs.ts]);                       // (pages shown as printed grow with the text size)
    for (let n = 1; n <= BOOK.npages; n++) {
      if (BOOK.pages[n - 1].kind === "cover") continue;
      // a printed module's own front pages (cover, contents) are not in the book: no empty pages before its first unit
      if (blankFront(n)) continue;
      const mark = el("div", { class: "pmark", id: "p-" + n, "data-p": n }, el("span", { text: "p. " + n }), isBm(n) ? icon("mark", "i sm ribbon") : null);
      art.append(mark, pageContent(n));
      if (!allowedPage(n)) { art.append(el("div", { class: "locked-page" }, icon("lock", "i lg"), el("p", { text: access === "register" ? "The rest of the book opens when you have registered for this semester." : u ? "The rest of the book is available to students registered for this course." : "Sign in to read the rest of the book." }), access === "register" ? el("button", { class: "btn sm", type: "button", text: "I have registered", onclick: registerDialog }) : u ? null : el("a", { class: "btn sm", href: C.link("login"), text: "Sign in" }))); break; }
    }
    stage.replaceChildren(el("div", { class: "pagewrap" }, art));
    if (io) io.disconnect();
    stage.onscroll = null;
    let rafq = 0;
    window.onscroll = () => { if (rafq) return; rafq = requestAnimationFrame(() => { rafq = 0; const line = innerHeight * 0.35; const vis = $$(".pmark", art).filter((m) => m.getBoundingClientRect().top < line); const last = vis[vis.length - 1]; if (last && +last.dataset.p !== page) setPage(+last.dataset.p, false);
      const hs = $$("h3[data-bid]", art).filter((h) => h.getBoundingClientRect().top < line), h = hs[hs.length - 1], P = BOOK.pages[page - 1], hb = h && blocks[h.dataset.bid];
      if (hb && P && P.unit && BOOK.pages[hb.p - 1] && BOOK.pages[hb.p - 1].unit === P.unit) $("#rsub").textContent = `${course.code} · Unit ${P.unit} · ${h.textContent}`; }); };
  }
  function scrollToPage(n) { const m = document.getElementById("p-" + n) || (n === 1 ? document.getElementById("p-2") : $$(".pmark").find((x) => +x.dataset.p >= n)); if (m) window.scrollTo({ top: m.getBoundingClientRect().top + scrollY - 70, behavior: "auto" }); }

  // ---------------------------------------------------------------- flip view
  let spreadMode = false, anim = false, full = false;       // full: full screen (see below)
  const PW = 460, PH = 640;
  function renderFlip() {
    stage.className = "rstage flip";
    window.onscroll = null; if (io) io.disconnect();
    spreadMode = stage.clientWidth >= 900;
    const book = el("div", { class: "fbook" + (spreadMode ? " spread" : " single") });
    const sheet = el("div", { class: "fsheet" });
    const [L, R] = spreadPages(page);
    const lp = el("div", { class: "fpage left" }), rp = el("div", { class: "fpage right" });
    if (L) fillPage(lp, L); else lp.classList.add("blank");
    if (R) fillPage(rp, R); else rp.classList.add("blank");
    if (spreadMode) sheet.append(lp, rp); else sheet.append(rp.childNodes.length ? rp : lp);
    book.append(sheet,
      el("button", { class: "fnav prev", "aria-label": "Previous page", onclick: () => turn(-1) }, icon("back", "i lg")),
      el("button", { class: "fnav next", "aria-label": "Next page", onclick: () => turn(1) }, icon("chev", "i lg")));
    stage.replaceChildren(book);
    fitBook(book);
  }
  function spreadPages(n) {
    if (!spreadMode) return [null, n];
    const i = POS.get(shownFrom(n)) ?? 0;
    if (!i) return [null, SEQ[0] || 1];
    const left = i % 2 === 1 ? i : i - 1;
    return [SEQ[left], SEQ[left + 1] ?? null];
  }
  function fillPage(box, n) {
    const pin = el("div", { class: "fpin" }, pageContent(n));
    pin.addEventListener("scroll", () => box.classList.toggle("more", pin.scrollTop + pin.clientHeight < pin.scrollHeight - 4));
    box.replaceChildren(pin, el("div", { class: "ffoot" }, el("span", { text: u ? `${u.n} · ${u.id}` : "Preview" }), el("span", { text: n })));
    box.dataset.p = n; box.classList.toggle("iscover", BOOK.pages[n - 1].kind === "cover");
    if (isBm(n)) box.append(el("button", { class: "ribbon-btn", "aria-label": "Bookmarked page. Remove bookmark", onclick: (e) => { e.stopPropagation(); toggleBm(n); } }));
    box.addEventListener("click", (e) => {
      if (e.target.closest("a,button,mark,.notecard") || window.getSelection().toString()) return;
      const r = box.getBoundingClientRect(), x = (e.clientX - r.left) / r.width;
      if (box.classList.contains("right") && x > 0.8) turn(1); else if (box.classList.contains("left") && x < 0.2) turn(-1);
      else if (!spreadMode && x > 0.8) turn(1); else if (!spreadMode && x < 0.2) turn(-1);
    });
  }
  function fitBook(book) {
    if (!book) return;
    // the space really available: from the top of the stage (below the bar and any banner) to the footer; in full screen
    // the bars float over the page and hide while reading, so the whole screen counts
    const top = full ? 0 : stage.getBoundingClientRect().top;
    const bottom = full ? innerHeight : (foot.getBoundingClientRect().top || innerHeight);
    const w = stage.clientWidth - (innerWidth < 600 ? 24 : 110), h = Math.max(320, bottom - top - (innerWidth < 700 ? 26 : 32));
    const bw = spreadMode ? PW * 2 : PW;
    // one page follows the screen's shape: taller on a tall phone (instead of leaving the screen half empty), shorter on a
    // phone held sideways (instead of shrinking the page until the text cannot be read; the page then scrolls inside).
    // The text of the printed page and its number stay the same.
    const ph = spreadMode ? PH : Math.round(Math.min(Math.max(PH * 0.55, (bw * h) / w), PH * 1.45));
    const sc = Math.min(w / bw, h / ph), ts = SCALES[prefs.ts];
    const sheet = book.querySelector(".fsheet");
    sheet.style.width = bw + "px"; sheet.style.height = ph + "px"; sheet.style.setProperty("--ph", ph + "px");
    sheet.style.transform = `scale(${sc})`;
    book.style.height = ph * sc + "px"; book.style.width = bw * sc + "px";
    // A printed page cannot reflow, so larger text stays on the same page and the page scrolls inside the book.
    $$(".fpage", sheet).forEach((pg) => {
      const pin = pg.querySelector(".fpin"); if (!pin) return;
      let fs = 15 * ts; pin.style.fontSize = fs + "px"; pin.style.setProperty("--ts", ts); pin.classList.remove("scrolly");
      if (ts <= 1 && ph >= PH) while (pin.scrollHeight > pin.clientHeight + 1 && fs > 10.5) { fs -= 0.5; pin.style.fontSize = fs + "px"; }
      const over = pin.scrollHeight > pin.clientHeight + 1;
      pin.classList.toggle("scrolly", over); pg.classList.toggle("more", over && pin.scrollTop + pin.clientHeight < pin.scrollHeight - 4);
    });
  }
  function turn(dir) {
    if (anim) return;
    // the pages shown, in order (pages with nothing on them are left out)
    let target = SEQ[(POS.get(shownFrom(page)) ?? 0) + dir];
    if (spreadMode) {
      // spreads are 1 | 2-3 | 4-5 … of the pages shown: step from the spread's left page, whichever page of it is current
      const base = spreadPages(page)[0] || 1, bi = POS.get(base) ?? 0;
      target = dir > 0 ? (page === 1 ? SEQ[1] : SEQ[bi + 2]) : (bi <= 1 ? 1 : SEQ[bi - 2]);
    }
    if (target === undefined) { if (dir > 0) C.say("This is the end of the book."); return; }
    if (target === page || target < 1) return;
    if (!allowedPage(target) && dir > 0) return access === "register" ? registerDialog() : C.say("The rest of the book is locked in preview.");
    const sheet = stage.querySelector(".fsheet"); if (!sheet) { go(target); return; }
    anim = true;
    const leaf = el("div", { class: "leaf " + (dir > 0 ? "fwd" : "back") + (spreadMode ? "" : " solo") });
    const front = el("div", { class: "face front fpage" }), backf = el("div", { class: "face backf fpage" });
    const [L0, R0] = spreadPages(page), [L1, R1] = spreadPages(target);
    if (dir > 0) { if (R0 || !spreadMode) fillPage(front, spreadMode ? R0 : page); if (spreadMode && L1) fillPage(backf, L1); }
    else { if (spreadMode ? L0 : page) fillPage(front, spreadMode ? L0 : page); if (spreadMode && R1) fillPage(backf, R1); }
    leaf.append(front, backf);
    // underneath: show the destination pages already
    if (spreadMode) {
      const under = dir > 0 ? sheet.querySelector(".right") : sheet.querySelector(".left");
      const dest = dir > 0 ? R1 : L1;
      if (under) { if (dest) fillPage(under, dest); else { under.replaceChildren(); under.classList.add("blank"); } }
    } else {
      const under = sheet.querySelector(".fpage"); if (under) fillPage(under, target);
    }
    sheet.append(leaf);
    fitBook(stage.querySelector(".fbook"));
    requestAnimationFrame(() => requestAnimationFrame(() => leaf.classList.add("go")));
    const done = () => { anim = false; setPage(target, false); renderFlip(); };
    leaf.addEventListener("transitionend", done, { once: true });
    setTimeout(() => { if (anim) done(); }, 900);
  }
  let tx = null;
  stage.addEventListener("touchstart", (e) => { if (view === "flip") tx = [e.touches[0].clientX, e.touches[0].clientY]; }, { passive: true });
  stage.addEventListener("touchend", (e) => {
    if (view !== "flip" || !tx) return;
    const dx = e.changedTouches[0].clientX - tx[0], dy = e.changedTouches[0].clientY - tx[1]; tx = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) && !window.getSelection().toString()) turn(dx < 0 ? 1 : -1);
  });
  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input,textarea,select") || document.querySelector(".ov.open")) return;
    if (view === "flip" && (e.key === "ArrowRight" || e.key === "PageDown")) { e.preventDefault(); turn(1); }
    if (view === "flip" && (e.key === "ArrowLeft" || e.key === "PageUp")) { e.preventDefault(); turn(-1); }
  });
  window.addEventListener("resize", () => { if (BOOK && view === "flip") { const was = spreadMode; spreadMode = stage.clientWidth >= 900; if (was !== spreadMode) renderFlip(); else fitBook(stage.querySelector(".fbook")); } });

  // ---------------------------------------------------------------- full screen
  // The browser's full screen where it exists (computers, Android); on iPhones (no full screen for pages) a reading
  // mode that does the same inside the browser. In both, the bar and the footer float over the book and slide away
  // after a few seconds of reading; they come back when the mouse nears the top or bottom, on a tap in the middle of
  // the page, or with the keyboard. F switches full screen on and off; Esc leaves it.
  let idleT = null;
  const canFull = !!(document.fullscreenEnabled && document.documentElement.requestFullscreen);
  // the bars stay while something in them is in use (keyboard focus, not the focus a mouse click leaves behind)
  const busy = () => panel.classList.contains("open") || document.querySelector(".ov.open") || bar.querySelector(":focus-visible") ||
    foot.querySelector(":focus-visible") || selbar.classList.contains("open") || tpop.classList.contains("open");
  function wake() {
    root.classList.remove("idle"); clearTimeout(idleT);
    if (full) idleT = setTimeout(() => { if (full && !busy()) root.classList.add("idle"); else if (full) wake(); }, 3000);
  }
  function setFull(on) {
    if (full === on) return;
    full = on; root.classList.toggle("immersive", on);
    fsBtn.setAttribute("aria-pressed", String(on)); fsBtn.setAttribute("aria-label", on ? "Leave full screen (F)" : "Full screen (F)"); fsBtn.title = fsBtn.getAttribute("aria-label");
    fsBtn.replaceChildren(icon(on ? "unfull" : "full"));
    if (on) { if (panel.classList.contains("open")) togglePanel(false); wake(); }   // the whole width for the book
    else { clearTimeout(idleT); root.classList.remove("idle"); }
    if (BOOK && view === "flip") setTimeout(() => fitBook(stage.querySelector(".fbook")), 60);
    C.say(on ? "Full screen: the bars hide while you read. Move to the top or bottom, or tap the middle of the page, to bring them back." : "Full screen off.");
  }
  function toggleFull() {
    if (canFull) {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => setFull(false));
      else document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => setFull(!full));
    } else setFull(!full);
  }
  fsBtn.addEventListener("click", toggleFull);
  document.addEventListener("fullscreenchange", () => setFull(!!document.fullscreenElement));
  document.addEventListener("mousemove", (e) => { if (full && (e.clientY < 90 || e.clientY > innerHeight - 90)) wake(); });
  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input,textarea,select,[contenteditable]") || document.querySelector(".ov.open")) return;
    if ((e.key === "f" || e.key === "F") && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); toggleFull(); return; }
    if (full && (e.key === "Tab" || e.key === "Escape")) wake();
    if (full && e.key === "Escape" && !canFull) setFull(false);   // the reading mode has no browser Esc
  });
  // a tap or click in the middle of the page (not on a word you are selecting, a link or a button) shows or hides the bars
  stage.addEventListener("click", (e) => {
    if (!full || e.target.closest("a,button,mark,input,textarea,.notecard") || window.getSelection().toString()) return;
    if (view === "flip") { const pg = e.target.closest(".fpage"); if (pg) { const r = pg.getBoundingClientRect(), x = (e.clientX - r.left) / r.width; if (x < 0.2 || x > 0.8) return; } }
    if (root.classList.contains("idle")) wake(); else { clearTimeout(idleT); root.classList.add("idle"); }
  });

  // ---------------------------------------------------------------- navigation & state
  let savedPage = null, seenT = null;
  // pages read, one character per page ("1" read); a book read before this was kept counts its earlier progress from the start
  function markSeen(pages) {
    const all = ud.get("seen", {}), N = BOOK.npages;
    let s = all[slug];
    if (typeof s !== "string" || s.length !== N) { const upto = Math.round(((ud.get("prog", {})[slug] || 0) * N) / 100); s = Array.from({ length: N }, (_, i) => (i < upto ? "1" : "0")).join(""); }
    const a = s.split("");
    pages.forEach((p) => { if (p >= 1 && p <= N) a[p - 1] = "1"; });
    const now = a.join("");
    if (now === all[slug]) return;
    all[slug] = now; ud.set("seen", all);
    // progress counts the pages shown (pages with nothing on them are never turned to)
    const read = a.filter((c, i) => c === "1" && !EMPTY.has(i + 1)).length;
    const pr = ud.get("prog", {}); pr[slug] = Math.round((read / Math.max(1, N - EMPTY.size)) * 100); ud.set("prog", pr);
  }
  function setPage(n, scroll = true) {
    page = Math.max(1, Math.min(BOOK.npages, n));
    slider.value = page;
    pgInfo.textContent = `Page ${page} of ${BOOK.npages}`;
    $("#rsub").textContent = `${course.code} · ${pageLabel(page)}`;
    const bp = flipBmPage(); bmBtn.setAttribute("aria-pressed", String(isBm(bp))); bmBtn.classList.toggle("on", isBm(bp));
    if (u && savedPage !== page) {
      savedPage = page;
      const pos = ud.get("pos", {}); pos[slug] = page; ud.set("pos", pos);
      clearTimeout(seenT); const at = page;
      seenT = setTimeout(() => { if (page === at) markSeen(view === "flip" ? spreadPages(page).filter(Boolean) : [page]); }, 5000);
    }
    if (scroll && view === "scroll") scrollToPage(page);
  }
  // pages with nothing on them are left out of the book: a printed module's own cover and contents, its course planner,
  // pages left blank. The pages keep their printed numbers; the book goes on to the next page that has something on it.
  function blankFront(n) { return EMPTY.has(n); }
  function shownFrom(n, dir = 1) {
    for (let k = n; k >= 1 && k <= BOOK.npages; k += dir) if (!EMPTY.has(k)) return k;
    for (let k = n; k >= 1 && k <= BOOK.npages; k -= dir) if (!EMPTY.has(k)) return k;
    return 1;
  }
  function go(n) { n = shownFrom(Math.max(1, Math.min(BOOK.npages, n)), n < page ? -1 : 1); if (!allowedPage(n)) return access === "register" ? registerDialog() : C.say("That page is locked in preview."); if (view === "flip") { page = n; setPage(n, false); renderFlip(); } else setPage(n, true); }
  slider.addEventListener("change", () => go(+slider.value));
  prevB.addEventListener("click", () => (view === "flip" ? turn(-1) : go(page - 1)));
  nextB.addEventListener("click", () => (view === "flip" ? turn(1) : go(page + 1)));
  function setView(v) {
    view = v; prefs.view = v; savePrefs();
    $$("[data-v]", seg).forEach((b) => { b.classList.toggle("on", b.dataset.v === v); b.setAttribute("aria-pressed", String(b.dataset.v === v)); });
    render(); if (v === "scroll") setTimeout(() => scrollToPage(page), 20);
  }
  seg.addEventListener("click", (e) => { const b = e.target.closest("[data-v]"); if (b && b.dataset.v !== view) { setView(b.dataset.v); C.say(b.dataset.v === "flip" ? "Flip-book view: turn pages with the arrows, your keyboard or a swipe." : "Scroll view."); } });
  function render() { if (view === "flip") renderFlip(); else renderScroll(); }
  // re-draw annotations without losing the reader's place
  function refresh() { if (view === "flip") return renderFlip(); const y = window.scrollY; renderScroll(); window.scrollTo(0, y); setPage(page, false); }

  // ---------------------------------------------------------------- bookmarks (page or passage, each with its own name)
  const pageBm = (n) => list("bm").find((b) => b.p === n && !b.bid);
  const isBm = (n) => !!pageBm(n);
  function afterBm() { setPage(page, false); refresh(); if (panel.classList.contains("open") && curTab === "b") showTab("b"); }
  function toggleBm(n = page) {
    if (!u) return C.say("Sign in to save bookmarks.");
    const cur = pageBm(n);
    if (cur) { save("bm", list("bm").filter((b) => b.id !== cur.id)); C.say(`Bookmark removed from page ${n}.`); }
    else { const bms = list("bm"); bms.push({ id: C.uid("b"), p: n, label: pageLabel(n), at: Date.now() }); save("bm", bms); C.say(`Page ${n} bookmarked. Rename it in the Bookmarks tab.`); }
    afterBm();
  }
  function addPassageBm(sel) {
    if (!u) return C.say("Sign in to save bookmarks.");
    const bms = list("bm");
    if (bms.some((b) => b.bid === sel.bid && b.off === sel.off && b.quote === sel.parts[0].text)) return C.say("This passage is already bookmarked.");
    bms.push({ id: C.uid("b"), p: sel.p, bid: sel.bid, off: sel.off, quote: sel.parts[0].text, full: sel.text, label: clip(sel.text, 60), at: Date.now() }); save("bm", bms);
    C.say("Passage bookmarked. Rename it in the Bookmarks tab."); afterBm();
  }
  const flipBmPage = () => (view === "flip" && spreadMode ? (spreadPages(page)[0] && BOOK.pages[spreadPages(page)[0] - 1].kind === "text" ? spreadPages(page)[0] : spreadPages(page)[1] || page) : page);
  // name a new bookmark for the current page, or rename an existing one
  function nameBookmark(existing) {
    if (!u) return C.say("Sign in to save bookmarks.");
    const n = existing ? existing.p : flipBmPage();
    const inp = el("input", { class: "input", "aria-label": "Bookmark name", maxlength: 80, value: existing ? existing.label : pageLabel(n) });
    C.modal({ title: existing ? "Rename bookmark" : `Bookmark page ${n}`, body: el("div", { class: "stack" }, existing && existing.quote ? el("q", { class: "quote", text: clip(existing.full || existing.quote, 200) }) : null,
      el("div", { class: "field" }, el("label", { text: "Name" }), inp), el("p", { class: "tiny muted", text: "Give it a name you will recognise, for example “Revise before the quiz”." })),
      actions: [{ label: "Cancel", cls: "ghost", id: null }, { label: "Save", value: () => inp.value.trim() || (C.say("Give the bookmark a name."), false) }] })
      .then((label) => {
        if (!label) return;
        const bms = list("bm");
        if (existing) bms.find((b) => b.id === existing.id).label = label; else bms.push({ id: C.uid("b"), p: n, label, at: Date.now() });
        save("bm", bms); C.say(existing ? "Bookmark renamed." : `Page ${n} bookmarked.`); afterBm();
      });
  }
  bmBtn.addEventListener("click", () => toggleBm(flipBmPage()));

  // ---------------------------------------------------------------- notes & highlights
  function addNote(existing, sel) {
    if (!u) return C.say("Sign in to write notes.");
    const ta = el("textarea", { class: "input ta", rows: 5, placeholder: "Write your note", "aria-label": "Note" }); ta.value = existing ? existing.text : "";
    const q = existing ? existing.full || existing.quote : sel?.text;
    C.modal({ title: existing ? "Edit note" : `Add a note to page ${sel?.p || flipBmPage()}`, body: el("div", {}, q ? el("q", { class: "quote", text: q }) : null, ta),
      actions: [{ label: "Cancel", cls: "ghost", id: null }, { label: "Save note", value: () => ta.value.trim() || (C.say("Write something first."), false) }] })
      .then((txt) => {
        if (!txt) return;
        const notes = list("notes");
        if (existing) { const n = notes.find((x) => x.id === existing.id); n.text = txt; n.upd = Date.now(); }
        else notes.push({ id: C.uid("n"), p: sel?.p || flipBmPage(), bid: sel?.bid || null, off: sel ? sel.off : null, quote: sel ? sel.parts[0].text : null, full: sel?.text || null, text: txt, at: Date.now() });
        save("notes", notes); C.say(existing ? "Note updated." : "Note saved."); refresh();
        if (panel.classList.contains("open") && curTab === "n") showTab("n");
      });
  }
  noteBtn.addEventListener("click", () => addNote());
  function exportNotes() {
    const notes = list("notes").sort((a, b) => a.p - b.p), hls = list("hl").sort((a, b) => a.p - b.p);
    const txt = [`My notes: ${course.code} ${course.title}`, `${u ? u.n + " · " + u.id : ""}`, `Exported ${new Date().toLocaleString("en-GB")}`, "",
      "BOOKMARKS", ...list("bm").sort((a, b) => a.p - b.p).map((b) => `p. ${b.p} — ${b.label}`), "",
      "NOTES", ...notes.map((n) => `p. ${n.p}${n.quote ? ` — “${n.full || n.quote}”` : ""}\n  ${n.text}`), "", "HIGHLIGHTS", ...hlGroups().sort((a, b) => a.p - b.p).map((h) => `p. ${h.p} [${h.color}] — “${h.text}”`)].join("\n");
    const a = el("a", { href: URL.createObjectURL(new Blob([txt], { type: "text/plain" })), download: `${course.code}-notes.txt` });
    document.body.append(a); a.click(); a.remove(); C.say("Notes exported as a text file.");
  }
  // highlights: one record per block touched; records from one selection share a group id (gid)
  const hlGroups = () => { const g = {}; list("hl").forEach((h) => { const k = h.gid || h.id; (g[k] = g[k] || { gid: k, p: h.p, bid: h.bid, off: h.off, color: h.color || "yellow", at: h.at, parts: [] }).parts.push(h); }); return Object.values(g).map((x) => ({ ...x, text: x.parts.map((p) => p.text).join(" ") })); };
  function removeHl(gid) { save("hl", list("hl").filter((h) => (h.gid || h.id) !== gid)); refresh(); }
  function addHighlight(sel, color) {
    if (!u) { C.say("Sign in to highlight."); return null; }
    const hls = list("hl"), gid = C.uid("g");
    sel.parts.forEach((pt) => {
      const same = hls.find((h) => h.bid === pt.bid && h.off === pt.off && h.text === pt.text);
      if (same) same.color = color; else hls.push({ id: C.uid("h"), gid, bid: pt.bid, p: pt.p, off: pt.off, text: pt.text, color, at: Date.now() });
    });
    save("hl", hls); prefs.hc = color; savePrefs(); return gid;
  }
  // split a selection into the part that falls in each block, so it can span paragraphs and pages
  function blockParts(range) {
    const parts = [];
    for (const b of $$("[data-bid]", stage)) {
      if (b.closest(".leaf") || !range.intersectsNode(b)) continue;
      const r = document.createRange();
      if (b.contains(range.startContainer)) r.setStart(range.startContainer, range.startOffset); else r.setStart(b, 0);
      if (b.contains(range.endContainer)) r.setEnd(range.endContainer, range.endOffset); else r.setEnd(b, b.childNodes.length);
      let text = r.toString(); if (!text.trim()) continue;
      const pre = document.createRange(); pre.setStart(b, 0); pre.setEnd(r.startContainer, r.startOffset);
      const off = pre.toString().length + (text.length - text.trimStart().length); text = text.trim();
      let disp = text;
      if (b.tagName === "UL") disp = $$("li", b).filter((li) => range.intersectsNode(li)).map((li) => { const q = document.createRange(); q.selectNodeContents(li);
        if (li.contains(r.startContainer)) q.setStart(r.startContainer, r.startOffset); if (li.contains(r.endContainer)) q.setEnd(r.endContainer, r.endOffset); return q.toString().trim(); }).filter(Boolean).join("; ");
      parts.push({ bid: b.dataset.bid, p: blocks[b.dataset.bid].p, off, text, disp });
    }
    return parts;
  }
  let pendingSel = null;
  function readSelection() {
    const s = window.getSelection(); if (!s || s.isCollapsed || !s.rangeCount) return null;
    const range = s.getRangeAt(0); if (!stage.contains(range.commonAncestorContainer)) return null;
    const parts = blockParts(range); if (!parts.length) return null;
    const text = parts.map((p) => p.disp || p.text).join(" "); if (text.length < 2) return null;
    if (text.length > 1500) { C.say("That selection is too long. Select up to about 250 words."); return null; }
    return { parts, text, bid: parts[0].bid, p: parts[0].p, off: parts[0].off, rect: range.getBoundingClientRect() };
  }
  function openSelbar(s) {
    selbar.classList.add("open"); selbar.classList.toggle("edit", !!s.existing);
    $$(".hdot", selbar).forEach((d) => d.classList.toggle("on", !!s.existing && d.dataset.c === s.color));
    let top = s.rect.top - selbar.offsetHeight - 10; if (top < 8) top = Math.min(innerHeight - selbar.offsetHeight - 8, s.rect.bottom + 10);
    const left = Math.min(innerWidth - selbar.offsetWidth - 8, Math.max(8, s.rect.left + s.rect.width / 2 - selbar.offsetWidth / 2));
    selbar.style.top = Math.max(8, top) + "px"; selbar.style.left = left + "px";
  }
  const closeSelbar = () => { selbar.classList.remove("open", "edit"); };
  const showSel = () => { const s = readSelection(); if (s) { pendingSel = s; openSelbar(s); } else if (!(pendingSel && pendingSel.existing)) closeSelbar(); };
  document.addEventListener("mouseup", () => setTimeout(showSel, 10));
  document.addEventListener("keyup", (e) => { if (e.shiftKey || e.key === "Shift") setTimeout(showSel, 10); });
  document.addEventListener("touchend", () => setTimeout(showSel, 250));
  let barPress = false;
  selbar.addEventListener("pointerdown", () => { barPress = true; setTimeout(() => (barPress = false), 800); });
  document.addEventListener("selectionchange", () => { if (barPress) return; if (!window.getSelection().toString() && !(pendingSel && pendingSel.existing)) closeSelbar(); });
  const dismiss = (e) => { if (!selbar.contains(e.target) && pendingSel && pendingSel.existing) { pendingSel = null; closeSelbar(); } if (!tpop.contains(e.target) && !sizeBtn.contains(e.target)) tpop.classList.remove("open"); };
  document.addEventListener("mousedown", dismiss); document.addEventListener("touchstart", dismiss, { passive: true });
  // click an existing highlight to change its colour, bookmark it, attach a note, ask the AI or remove it
  stage.addEventListener("click", (e) => {
    const m = e.target.closest("mark.hl"); if (!m || window.getSelection().toString()) return;
    const g = hlGroups().find((x) => x.parts.some((h) => h.id === m.dataset.hid)); if (!g) return;
    pendingSel = { existing: true, gid: g.gid, color: g.color, parts: g.parts.map((h) => ({ bid: h.bid, p: h.p, off: h.off, text: h.text })), text: g.text, bid: g.bid, p: g.p, off: g.parts[0].off, rect: m.getBoundingClientRect() };
    openSelbar(pendingSel);
  });
  selbar.addEventListener("mousedown", (e) => e.preventDefault());
  selbar.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]"); if (!b || !pendingSel) return;
    const sel = pendingSel, act = b.dataset.act; pendingSel = null; closeSelbar(); window.getSelection().removeAllRanges();
    if (act === "hl") {
      if (!u) return C.say("Sign in to highlight.");
      if (sel.existing) { const hls = list("hl"); hls.forEach((h) => { if ((h.gid || h.id) === sel.gid) h.color = b.dataset.c; }); save("hl", hls); prefs.hc = b.dataset.c; savePrefs(); }
      else addHighlight(sel, b.dataset.c);
      refresh(); if (panel.classList.contains("open") && curTab === "n") showTab("n"); C.say(sel.existing ? "Highlight colour changed." : "Highlighted in " + b.dataset.c + ".");
    } else if (act === "bm") { if (!sel.existing && u) addHighlight(sel, prefs.hc); addPassageBm(sel); }
    else if (act === "note") addNote(null, sel);
    else if (act === "read") { if (!("speechSynthesis" in window)) C.say("Read aloud is not supported in this browser."); else readText(sel.text); }
    else if (act === "ask") { aiCtx = { text: sel.text, p: sel.p, bid: sel.bid }; togglePanel(true); showTab("a"); }
    else if (act === "rm" && sel.existing) { removeHl(sel.gid); if (panel.classList.contains("open") && curTab === "n") showTab("n"); C.say("Highlight removed."); }
  });

  // Copying (the user's request, 27 October 2026, against copying out whole books): a student may copy up to about 250
  // words at a time; a longer passage gives its first part, followed by its source (course, edition, page, and whose
  // copy it is) and a note. Selecting, highlighting, notes, the AI assistant and read aloud are not limited, nor staff.
  const COPYMAX = 1500;
  document.addEventListener("copy", (e) => {
    if (access === "staff" || !e.clipboardData) return;
    const s = window.getSelection(); if (!s || s.isCollapsed || !s.rangeCount) return;
    const range = s.getRangeAt(0);
    if (!stage.contains(range.commonAncestorContainer) && !range.intersectsNode(stage)) return;
    const text = s.toString().replace(/[ \t]+\n/g, "\n"); if (text.length <= COPYMAX) return;
    let part = text.slice(0, COPYMAX); const sp = part.search(/\s\S*$/); if (sp > COPYMAX * 0.8) part = part.slice(0, sp);
    const parts = blockParts(range), p = parts.length ? parts[0].p : page;
    const src = `${course.code} ${course.title}, edition ${BOOK.edition}, p. ${p}` + (u ? `. Copy licensed to ${u.n} · ${u.id}` : "");
    e.clipboardData.setData("text/plain", part.trim() + " …\n\n[" + src + ". Up to about 250 words can be copied at a time.]");
    e.preventDefault();
    C.say("Up to about 250 words can be copied at a time: the first part was copied, with its source.", 5000);
  });

  // ---------------------------------------------------------------- tools
  function applySize() {
    if (view === "flip") { const b = stage.querySelector(".fbook"); if (b) fitBook(b); return; }
    const art = stage.querySelector(".pg-scroll"); if (!art) return;
    const m = document.getElementById("p-" + page), before = m ? m.getBoundingClientRect().top : null;
    art.style.fontSize = 18 * SCALES[prefs.ts] + "px"; art.style.setProperty("--ts", SCALES[prefs.ts]);   // (pages shown as printed grow with it)
    if (m) window.scrollBy(0, m.getBoundingClientRect().top - before);       // keep the same page in view
  }
  function sizeControl() {
    const pct = el("b", { class: "tpct", "aria-live": "polite" });
    const minus = el("button", { class: "btn sec sm", type: "button", "aria-label": "Smaller text", onclick: () => set(prefs.ts - 1) }, "A−");
    const plus = el("button", { class: "btn sec sm", type: "button", "aria-label": "Larger text", onclick: () => set(prefs.ts + 1) }, "A+");
    const upd = () => { pct.textContent = Math.round(SCALES[prefs.ts] * 100) + "%"; minus.disabled = prefs.ts === 0; plus.disabled = prefs.ts === SCALES.length - 1; };
    function set(i) { prefs.ts = Math.max(0, Math.min(SCALES.length - 1, i)); savePrefs(); applySize(); upd(); }
    upd();
    return el("div", { class: "tsize" }, el("span", { class: "small", text: "Text size" }), minus, pct, plus, el("button", { class: "btn ghost sm", type: "button", onclick: () => set(1), text: "Reset" }));
  }
  sizeBtn.setAttribute("aria-haspopup", "dialog");
  sizeBtn.addEventListener("click", () => {
    if (!tpop.classList.toggle("open")) return;
    tpop.replaceChildren(sizeControl()); const r = sizeBtn.getBoundingClientRect();
    tpop.style.top = r.bottom + 6 + "px"; tpop.style.left = Math.max(8, Math.min(innerWidth - tpop.offsetWidth - 8, r.left + r.width / 2 - tpop.offsetWidth / 2)) + "px";
  });
  darkBtn.addEventListener("click", () => { prefs.dark = !prefs.dark; root.classList.toggle("night", prefs.dark); darkBtn.setAttribute("aria-pressed", String(prefs.dark)); savePrefs(); });
  // Read aloud (the user's requests, 26 and 27 October 2026). What is read: text selected on the page, on its own; else
  // from the word last clicked (a line of the text layer on a page shown as printed), if it is still in view; else the
  // page in view from its top. Sentence by sentence (browsers stop a long passage part-way, silently: Chrome after
  // about fifteen seconds), then the following pages, turning to each, until stopped. Clicking in the text while
  // reading goes on from there. The voice: female or male (the device's English voices, told apart by their names; when
  // the device has none of the kind asked for, another voice is pitched to suit), a deep, normal or high tone and the
  // speed; changed while reading, they apply at once. A small player bar (pause, stop, voice, tone, speed) shows while
  // reading; the same settings are in Reader options.
  const PITCH = { deep: 0.7, normal: 1, high: 1.25, higher: 1.25 };
  const TONES = { deep: "Deep", normal: "Normal", high: "High" };
  const FEMALE = /\b(zira|hazel|susan|libby|sonia|aria|jenny|michelle|natasha|clara|emily|samantha|karen|moira|tessa|serena|fiona|victoria|kate|ava|allison|joanna|salli|kimberly|ivy|amy|emma|olivia|ezinne|asilia|leah|neerja|catherine|linda|hayley|heather|nancy|elizabeth|sara|ashley|cora|monica|maisie|bella|hollie|abbi|female)\b/i;
  const MALE = /\b(david|mark|george|ryan|guy|thomas|daniel|alex|fred|arthur|oliver|james|william|liam|brian|christopher|eric|roger|steffan|andrew|brandon|davis|jason|tony|ravi|prabhat|abeo|chilemba|connor|elliot|noah|ethan|jacob|luke|mitchell|wayne|ken|kofi|ollie|alfie|rishi|sean|aaron|male)\b/i;
  const englishVoices = () => ("speechSynthesis" in window ? speechSynthesis.getVoices() : []).filter((v) => /^en([-_]|$)/i.test(v.lang));
  const voiceKind = (v) => (FEMALE.test(v.name) ? "female" : MALE.test(v.name) ? "male" : "");
  const rateOf = () => (typeof prefs.vrate === "number" ? prefs.vrate : { slower: 0.8, normal: 1, faster: 1.2 }[prefs.vrate] || 1);
  const voiceName = (v) => v.name.replace(/^(Microsoft|Google)\s+/, "").replace(/\s+Online.*$/, "").replace(/\s+-\s+English.*$/, "");
  // the voice to use: one the student picked, else the device's best English voice of the kind asked for (African or
  // British English and natural voices first), else another English voice with its pitch moved towards that kind
  function voicePlan() {
    const vs = englishVoices(), kind = prefs.vkind === "male" ? "male" : "female";
    const rank = (v) => (/en[-_](GH|NG|KE|ZA)/i.test(v.lang) ? 0 : /en[-_]GB/i.test(v.lang) ? 1 : 2) + (/natural|online|neural/i.test(v.name) ? 0 : 0.5);
    const pick = prefs.voice ? vs.find((v) => v.voiceURI === prefs.voice) : null;
    const ofKind = vs.filter((v) => voiceKind(v) === kind).sort((a, b) => rank(a) - rank(b));
    const v = pick || ofKind[0] || vs.slice().sort((a, b) => rank(a) - rank(b))[0] || null;
    const fake = !pick && !ofKind.length && !!v;
    const pitch = (PITCH[prefs.vpitch] || 1) * (fake ? (kind === "male" ? 0.7 : 1.2) : 1);
    return { v, kind, fake, pitch: Math.max(0.1, Math.min(2, pitch)), rate: rateOf() };
  }
  // a block's text to read; headings and list items end with a full stop, so the voice pauses after them
  const stopped = (t) => { t = String(t || "").trim(); return !t || /[.!?;:]["”’)]*$/.test(t) ? t : t + "."; };
  const blockText = (id) => { const b = blocks[id]; if (!b) return ""; if (b.items) return b.items.map(stopped).join(" "); return b.t === "h" ? stopped(b.x) : b.x || ""; };
  const pageText = (n) => pageBlocks(n).map(blockText).join(" ").replace(/\s+/g, " ").trim();
  function sentences(text) {
    const out = [];
    for (const s of text.match(/(?:[^.!?;:]|\.(?=\d))+[.!?;:]*["”’)]*\s*/g) || [text]) {
      let t = s.trim();
      while (t.length > 220) {                         // a long sentence: at a comma or a space
        let k = t.lastIndexOf(", ", 220); if (k < 80) k = t.lastIndexOf(" ", 220); if (k < 40) k = 220;
        out.push(t.slice(0, k + 1)); t = t.slice(k + 1).trim();
      }
      if (t) { if (out.length && out[out.length - 1].length + t.length < 160) out[out.length - 1] += " " + t; else out.push(t); }
    }
    return out;
  }
  let readQueue = [], readPage = 0, readOnly = false, current = null, paused = false, seq = 0, readMark = null;
  const player = el("div", { class: "rplayer", role: "region", "aria-label": "Read aloud" });
  root.append(player);
  function utter(text, onend) {
    const p = voicePlan(), utt = new SpeechSynthesisUtterance(text);
    if (p.v) { utt.voice = p.v; utt.lang = p.v.lang; } else utt.lang = "en-GB";
    utt.pitch = p.pitch; utt.rate = p.rate;
    if (onend) { utt.onend = onend; utt.onerror = (e) => { if (e.error !== "interrupted" && e.error !== "canceled") onend(); }; }
    speechSynthesis.speak(utt);
  }
  function stopReading(msg) {
    readQueue = []; current = null; speaking = false; paused = false; seq++;
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    speakBtn.setAttribute("aria-pressed", "false"); speakBtn.classList.remove("on"); player.classList.remove("open");
    if (msg) C.say(msg);
  }
  function speakNext() {
    if (!speaking || paused) return;
    const t = readQueue.shift();
    if (t === undefined) { current = null; return readOnly ? stopReading("Finished reading the selection.") : readFrom(readPage + 1, false); }
    current = t; const my = ++seq;
    utter(t, () => { if (my === seq) speakNext(); });
  }
  // say the current piece again (a setting changed, or resuming after a pause)
  function respeak() {
    if (!speaking || paused || !current) return;
    seq++; speechSynthesis.cancel(); readQueue.unshift(current); current = null; setTimeout(speakNext, 60);
  }
  function begin(only) {
    seq++; speechSynthesis.cancel();
    speaking = true; paused = false; readOnly = !!only; current = null;
    speakBtn.setAttribute("aria-pressed", "true"); speakBtn.classList.add("on");
    showPlayer();
    const p = voicePlan();
    C.say((only ? "Reading the selection aloud." : "Reading aloud.") + (p.fake ? ` This device has no ${p.kind} English voice, so another voice is pitched ${p.kind === "male" ? "lower" : "higher"}.` : " Press Stop or the button again to stop."), 5000);
  }
  function readFrom(n, first) {
    const last = BOOK.pages.length;
    while (n <= last && allowedPage(n) && !pageText(n)) n++;            // (pages with nothing to read: a picture, a blank)
    if (n > last || !allowedPage(n)) { stopReading(first ? "" : "Read aloud finished."); return false; }
    readPage = n; readQueue = sentences(pageText(n));
    if (!first && n !== page) go(n);                                    // keep the page being read in view
    speakNext();
    return true;
  }
  // from a place in the text: the rest of its block, then the page's following blocks, then the following pages
  function readAt(m) {
    begin(false);
    const ids = pageBlocks(m.p), i = ids.indexOf(m.bid);
    readPage = m.p;
    readQueue = sentences([m.rest, ...ids.slice(i + 1).map(blockText)].join(" ").replace(/\s+/g, " ").trim());
    speakNext();
  }
  function readText(text) {
    begin(true);
    readQueue = sentences(text.replace(/\s+/g, " ").trim());
    speakNext();
  }
  // the place clicked: the block and the text from the start of the word clicked to the end of the block; on a page
  // shown as printed, the line of its text layer under the point (or the first line below it)
  function placeAt(x, y, target) {
    let node = null, off = 0;
    if (document.caretPositionFromPoint) { const c = document.caretPositionFromPoint(x, y); if (c) { node = c.offsetNode; off = c.offset; } }
    else if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(x, y); if (r) { node = r.startContainer; off = r.startOffset; } }
    const fig = target.closest(".bpage");
    if (fig && !(node && node.nodeType === 3 && fig.contains(node))) {
      const line = $$(".textlayer span", fig).find((s) => s.getBoundingClientRect().bottom >= y);
      if (!line || !line.firstChild) return null;
      node = line.firstChild; off = 0;
    }
    if (!node || node.nodeType !== 3) return null;
    const bel = node.parentElement && node.parentElement.closest("[data-bid]");
    if (!bel || !stage.contains(bel) || !blocks[bel.dataset.bid]) return null;
    const head = document.createRange(); head.setStart(bel, 0); head.setEnd(node, Math.min(off, node.length));
    const all = document.createRange(); all.selectNodeContents(bel);
    const before = head.toString(), w = before.search(/\S+$/);
    const rest = all.toString().slice(w >= 0 ? w : before.length).replace(/\s+/g, " ").trim();
    if (!rest) return null;
    return { bid: bel.dataset.bid, p: blocks[bel.dataset.bid].p || page, rest };
  }
  const placeInView = (m) => { const n = document.getElementById("b-" + m.bid); if (!n) return false; const r = n.getBoundingClientRect(); return r.width > 0 && r.bottom > 70 && r.top < innerHeight - 50; };
  stage.addEventListener("click", (e) => {
    if (e.target.closest("a,button,input,textarea,select,.notecard,.locked-page")) return;
    const s = window.getSelection(); if (s && s.toString().trim()) return;
    const m = placeAt(e.clientX, e.clientY, e.target); if (!m) return;
    readMark = m;
    if (speaking) readAt(m);                                            // while reading: go on from the place clicked
  });
  const selectedText = () => {
    const s = window.getSelection();
    if (!s || s.isCollapsed || !s.rangeCount || !stage.contains(s.getRangeAt(0).commonAncestorContainer)) return "";
    return s.toString().replace(/\s+/g, " ").trim();
  };
  window.addEventListener("pagehide", () => { if (speaking) stopReading(); });   // (some browsers go on reading after the page is left)
  let selAtPress = "";
  speakBtn.addEventListener("pointerdown", () => { selAtPress = selectedText(); });
  speakBtn.addEventListener("mousedown", (e) => e.preventDefault());              // (keeps the selection)
  speakBtn.addEventListener("click", () => {
    if (!("speechSynthesis" in window)) return C.say("Read aloud is not supported in this browser.");
    if (speaking) return stopReading();
    const sel = selectedText() || selAtPress; selAtPress = "";
    if (sel.length > 1) return readText(sel);
    if (readMark && placeInView(readMark)) return readAt(readMark);
    begin(false);
    const from = view === "flip" ? (spreadPages(page).filter(Boolean)[0] || page) : page;
    if (!readFrom(from, true)) C.say("Nothing to read on this page.");
  });
  // the voice settings: female or male, a device voice (optional), the tone and the speed
  function voiceControl(compact) {
    const kind = el("select", { class: "input", "aria-label": "Voice" },
      el("option", { value: "female", text: "Female voice" }), el("option", { value: "male", text: "Male voice" }));
    kind.value = prefs.vkind === "male" ? "male" : "female";
    const dev = el("select", { class: "input", "aria-label": "Device voice" });
    const fill = () => {
      const vs = englishVoices();
      dev.replaceChildren(el("option", { value: "", text: "Best voice of that kind" }),
        ...vs.map((v) => el("option", { value: v.voiceURI, text: voiceName(v) + " (" + v.lang + (voiceKind(v) ? ", " + voiceKind(v) : "") + ")" })));
      dev.value = vs.some((v) => v.voiceURI === prefs.voice) ? prefs.voice : "";
    };
    fill();
    if ("speechSynthesis" in window) speechSynthesis.addEventListener("voiceschanged", fill);
    kind.addEventListener("change", () => { prefs.vkind = kind.value; prefs.voice = ""; dev.value = ""; savePrefs(); respeak(); });
    dev.addEventListener("change", () => {
      prefs.voice = dev.value;
      const v = englishVoices().find((x) => x.voiceURI === dev.value); if (v && voiceKind(v)) { prefs.vkind = voiceKind(v); kind.value = prefs.vkind; }
      savePrefs(); respeak();
    });
    const tone = el("select", { class: "input", "aria-label": "Tone" }, ...Object.entries(TONES).map(([k, t]) => el("option", { value: k, text: t + " tone" })));
    tone.value = PITCH[prefs.vpitch] ? (prefs.vpitch === "higher" ? "high" : prefs.vpitch) : "normal";
    tone.addEventListener("change", () => { prefs.vpitch = tone.value; savePrefs(); respeak(); });
    const out = el("output", { class: "small", text: rateOf().toFixed(1) + "×" });
    const speed = el("input", { type: "range", min: "0.6", max: "1.8", step: "0.1", value: String(rateOf()), "aria-label": "Speed" });
    speed.addEventListener("input", () => { out.textContent = (+speed.value).toFixed(1) + "×"; });
    speed.addEventListener("change", () => { prefs.vrate = +speed.value; out.textContent = prefs.vrate.toFixed(1) + "×"; savePrefs(); respeak(); });
    const speedBox = el("label", { class: "small rspeed" }, "Speed ", speed, out);
    if (compact) return [kind, tone, speedBox];
    const tryIt = el("button", { class: "btn ghost sm", type: "button", text: "Try it", onclick: () => {
      if (!("speechSynthesis" in window)) return C.say("Read aloud is not supported in this browser.");
      stopReading(); utter("This is how the course book will be read to you.");
    } });
    return el("div", { class: "voicectl" }, el("span", { class: "small", text: "Read-aloud voice" }), el("div", { class: "row2" }, kind, tone), dev,
      el("div", { class: "row2" }, speedBox, tryIt),
      el("p", { class: "tiny muted", text: "Read aloud starts at the word you last clicked, or reads only the text you have selected." }));
  }
  function showPlayer() {
    const pause = el("button", { class: "btn sm", type: "button", "aria-label": "Pause reading", text: "Pause" });
    pause.addEventListener("click", () => {
      if (!paused) { paused = true; seq++; speechSynthesis.cancel(); if (current) readQueue.unshift(current); current = null; pause.textContent = "Resume"; pause.setAttribute("aria-label", "Resume reading"); }
      else { paused = false; pause.textContent = "Pause"; pause.setAttribute("aria-label", "Pause reading"); speakNext(); }
    });
    const stop = el("button", { class: "btn ghost sm", type: "button", "aria-label": "Stop reading", text: "Stop", onclick: () => stopReading() });
    player.replaceChildren(icon("head", "i sm"), pause, stop, ...voiceControl(true));
    player.classList.add("open");
  }
  more.addEventListener("click", () => C.modal({ title: "Reader options", body: el("div", { class: "stack" },
    sizeControl(),
    el("button", { class: "btn sec block", onclick: () => darkBtn.click() }, icon("sun"), "Night mode"),
    el("button", { class: "btn sec block", onclick: () => speakBtn.click() }, icon("head"), "Read aloud"),
    voiceControl(),
    rating() && rating().can ? el("button", { class: "btn sec block", onclick: () => { document.querySelector(".ov.open .mhead button")?.click();
      setTimeout(() => C.modal({ title: "Rate this course book", body: rateBox(), actions: [{ label: "Close", id: 1 }] }), 50); } }, "★ Rate this course book") : null,
    el("button", { class: "btn sec block", onclick: () => { document.querySelector(".ov.open .mhead button")?.click(); setTimeout(toggleFull, 50); } }, icon("full"), "Full screen"),
    // on phones the Print button is not in the bar: the same watermarked study copy (quota 2) from here
    el("button", { class: "btn sec block", onclick: () => { document.querySelector(".ov.open .mhead button")?.click(); setTimeout(() => prBtn.click(), 50); } }, icon(canPrint ? "print" : "lock"), "Print a study copy"),
    el("button", { class: "btn sec block", onclick: () => { document.querySelector(".ov.open .mhead button")?.click(); setTimeout(() => noteBtn.click(), 50); } }, icon("note"), "Add a note to this page")), actions: [{ label: "Done", id: 1 }] }));
  dlBtn.addEventListener("click", () => {
    if (!canDownload) return C.say(access === "retro" ? "Not available during retrospective access: read online only." : "Downloading is available to registered students.");
    const dl = ud.get("dl", {}); dl[slug] = Date.now(); ud.set("dl", dl); C.log(u, "download", { c: slug });
    C.say(`Downloaded for offline reading (${(BOOK.npages * 0.09).toFixed(1)} MB), watermarked with your index number.`);
  });
  if (T("download", true) === false) dlBtn.style.display = "none";   // offline download not offered (Moodle)
  prBtn.addEventListener("click", () => (canPrint ? printDialog() : C.say(access === "retro" ? "Not available during retrospective access: read online only." : "Printing is available to registered students.")));
  function printDialog() {
    const used = (ud.get("prints", {})[slug] || []).length, quota = 2;
    const boxes = BOOK.units.map((un) => { const next = BOOK.units[un.n] ? BOOK.units[un.n].page : BOOK.npages; return { un, n: next - un.page, cb: el("input", { type: "checkbox", checked: un.n <= 2 }) }; });
    const cnt = el("b");
    const upd = () => { cnt.textContent = boxes.filter((b) => b.cb.checked).reduce((a, b) => a + b.n, 0) + " pages"; };
    boxes.forEach((b) => b.cb.addEventListener("change", upd)); upd();
    C.modal({ title: "Print a personal study copy", wide: true, body: el("div", { class: "pgrid" },
      el("div", {}, el("p", { class: "small muted", text: "Choose what to print. A print-ready copy is created with your name and index number on every page." }),
        ...boxes.map((b) => el("label", { class: "ck" }, b.cb, el("span", { text: `Unit ${b.un.n} · ${b.un.title}` }), el("span", { class: "n", text: b.n + " pages" }))),
        el("p", { class: "small", style: { marginTop: "10px" } }, "Selected: ", cnt),
        el("div", { class: "banner" + (used >= quota ? " warn" : "") }, icon("print", "i lg"), el("div", { class: "small" }, el("b", { text: `You have used ${used} of ${quota} print copies of this book this semester. ` }), "Printing is at your own cost. Copies are for personal study only; reproduction for sale is prohibited."))),
      el("div", { class: "thumb" }, ...Array.from({ length: 11 }, (_, i) => el("div", { class: "ln", style: { width: [40, 75, 100, 100, 85, 100, 70, 100, 100, 60, 90][i] + "%" } })),
        el("div", { class: "diag", text: `${u.n.toUpperCase()} · ${u.id} · PERSONAL STUDY COPY` }), el("div", { class: "ft" }, el("span", { text: `${u.n} · ${u.id} · ${C.fmt(Date.now())}` }), el("span", { text: "Copy ID on print" })))),
      actions: [{ label: "Cancel", cls: "ghost", id: null }, { label: "Create print-ready copy", value: () => {
        if (used >= quota && access !== "staff") { C.say("You have used your print quota for this book this semester."); return false; }
        const units = boxes.filter((b) => b.cb.checked).map((b) => b.un.n); if (!units.length) { C.say("Select at least one unit."); return false; }
        return units;
      } }] }).then((units) => {
      if (!units) return;
      if (C.createPrint) return C.createPrint(slug, units).then((id) => { if (id) location.href = C.link("print", { c: slug, id }); });
      const id = "P-" + (C.hashNum(u.id + slug + Date.now()) % 60466176).toString(36).toUpperCase().padStart(5, "0");
      const pr = ud.get("prints", {}); (pr[slug] = pr[slug] || []).push({ id, units, at: Date.now() }); ud.set("prints", pr);
      const log = C.store.get("printlog", []); log.push({ id, user: u.id, c: slug, units, at: Date.now() }); C.store.set("printlog", log);
      location.href = C.link("print", { c: slug, id });
    });
  }

  // ---------------------------------------------------------------- boot
  // an outline of a page with grey lines, shown while the book is on its way
  function skeleton() {
    const pg = el("div", { class: "rskel-page" });
    [40, 75, 100, 100, 92, 100, 64, 0, 100, 100, 85, 100, 100, 70, 0, 100, 96, 100, 58].forEach((w) => pg.append(el("div", { class: "rskel-l", style: { width: w + "%", visibility: w ? null : "hidden" } })));
    return el("div", { class: "rskel", role: "status", "aria-label": "Loading the course book" }, pg, el("p", { class: "rskel-msg", text: "Loading the course book…" }));
  }
  C.ready(async () => {
    if (!document.getElementById("rskel")) stage.replaceChildren(skeleton());
    try { BOOK = await C.loadBook(slug); } catch (e) { const pre = document.getElementById("rskel"); if (pre) pre.remove(); stage.replaceChildren(el("p", { class: "pad", text: e.message })); return; }
    EMPTY = new Set(BOOK.units.length ? BOOK.pages.filter((p) => p.kind === "text" && !p.blocks.length).map((p) => p.n) : []);
    SEQ = BOOK.pages.map((p) => p.n).filter((n) => !EMPTY.has(n)); POS = new Map(SEQ.map((n, i) => [n, i]));
    BOOK.units.forEach((un) => un.blocks.forEach((b) => (blocks[b.id] = b)));
    slider.max = BOOK.npages;
    if (u) { const bms = list("bm"); if (bms.some((b) => !b.id)) { bms.forEach((b) => (b.id = b.id || C.uid("b"))); save("bm", bms); } }
    document.title = `${course.code} course book · ${T("siteName", "CODeL Courseware prototype")}`;
    const qp = parseInt(C.Q.get("p"), 10), qu = parseInt(C.Q.get("u"), 10), qs = parseInt(C.Q.get("s"), 10);
    let target = null;
    if (qu && BOOK.units[qu - 1]) { const h = qs && blocks[`u${qu}s${qs}`]; target = h ? h.p : BOOK.units[qu - 1].page; }
    page = qp && qp >= 1 ? Math.min(qp, BOOK.npages) : target || (u ? (ud.get("pos", {})[slug] || 1) : 1);
    page = shownFrom(page);
    if (!allowedPage(page)) page = 1;
    $$("[data-v]", seg).forEach((b) => { b.classList.toggle("on", b.dataset.v === view); b.setAttribute("aria-pressed", String(b.dataset.v === view)); });
    render(); setPage(page, true);
    const pre = document.getElementById("rskel"); if (pre) pre.remove();          // the outline the server sent first
    if (C.Q.get("b")) flash(C.Q.get("b")); else if (qu && qs && blocks[`u${qu}s${qs}`]) flash(`u${qu}s${qs}`);
    showTab("c");
    if (innerWidth >= 1000) togglePanel(true);
    if (C.Q.get("mode") === "print" && canPrint) printDialog();
    if (C.Q.get("tab") || askPq) { togglePanel(true); showTab(askPq ? "a" : C.Q.get("tab")); }
  });
})();
