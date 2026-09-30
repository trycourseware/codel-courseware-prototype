// E-book reader: scroll view + flip-book view, bookmarks, highlights, notes, search, read aloud, download, print, AI panel.
(function () {
  "use strict";
  if (document.body.dataset.page !== "reader") return;
  const { el, icon, $, $$ } = C;
  const u = C.me();
  const slug = C.course(C.Q.get("c")) ? C.Q.get("c") : Object.keys(C.D.courses)[0];
  const course = C.course(slug);
  const access = C.access(slug, u);                       // full | retro | preview | staff
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
  let BOOK = null, page = 1, view = C.Q.get("view") || prefs.view, speaking = false;

  // ---------------------------------------------------------------- data helpers
  const blocks = {};                                     // id -> block
  const pageBlocks = (n) => (BOOK.pages[n - 1] && BOOK.pages[n - 1].blocks) || [];
  const allowedPage = (n) => { const P = BOOK.pages[n - 1]; if (!P) return false; return access !== "preview" || n <= 3 || P.unit === 1 || P.kind === "end"; };
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
  const banner = access === "retro" ? el("div", { class: "banner warn flat" }, icon("eye", "i lg"), el("div", { class: "small" }, el("b", { text: "Retrospective access: read-only until 30 April 2027. " }), "Your bookmarks, highlights and notes are kept. Downloading, printing and the AI assistant are not available in this period."))
    : access === "preview" ? el("div", { class: "banner warn flat" }, icon("lock", "i lg"), el("div", { class: "small" }, el("b", { text: "Preview. " }), u ? "You are not registered for this course this semester, so only Unit 1 is available." : "Sign in to read the full course book. Only Unit 1 is available in preview."))
      : null;
  const back = el("a", { class: "tb", href: access === "retro" ? "dashboard.html" : `course-${slug}.html`, "aria-label": "Back" }, icon("back", "i lg"));
  const tocBtn = el("button", { class: "tb", "aria-label": "Contents, bookmarks and notes", "aria-expanded": "false" }, icon("list", "i lg"));
  const title = el("div", { class: "t" }, el("span", { text: course.title }), el("small", { id: "rsub", text: course.code }));
  const seg = el("div", { class: "vseg", role: "group", "aria-label": "Reading view" },
    el("button", { "data-v": "scroll", title: "Scroll view" }, icon("scroll"), el("span", { class: "txt", text: "Scroll" })),
    el("button", { "data-v": "flip", title: "Flip-book view" }, icon("book"), el("span", { class: "txt", text: "Flip" })));
  const bmBtn = el("button", { class: "tb", "aria-label": "Bookmark this page", "aria-pressed": "false" }, icon("mark"));
  const noteBtn = el("button", { class: "tb", "aria-label": "Add a note to this page" }, icon("note"));
  const sizeBtn = el("button", { class: "tb hide-sm", "aria-label": "Text size" }, icon("text"));
  const darkBtn = el("button", { class: "tb hide-sm", "aria-label": "Night mode", "aria-pressed": String(!!prefs.dark) }, icon("sun"));
  const speakBtn = el("button", { class: "tb hide-sm", "aria-label": "Read aloud", "aria-pressed": "false" }, icon("head"));
  const dlBtn = el("button", { class: "tb lab" + (canDownload ? "" : " off"), "aria-label": "Download for offline reading" }, icon(canDownload ? "dl" : "lock"), el("span", { class: "txt", text: "Download" }));
  const prBtn = el("button", { class: "tb lab" + (canPrint ? "" : " off"), "aria-label": "Print a study copy" }, icon(canPrint ? "print" : "lock"), el("span", { class: "txt", text: "Print" }));
  const more = el("button", { class: "tb show-sm", "aria-label": "More options" }, icon("more"));
  const bar = el("div", { class: "rbar" }, back, tocBtn, title, seg, bmBtn, noteBtn, sizeBtn, darkBtn, speakBtn, dlBtn, prBtn, more);

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
  const selbar = el("div", { class: "selbar", role: "toolbar", "aria-label": "Highlight, bookmark, note or ask AI" },
    el("div", { class: "hdots" }, ...HC.map(([c, n]) => el("button", { class: "hdot c-" + c, "data-act": "hl", "data-c": c, "aria-label": "Highlight in " + n.toLowerCase(), title: "Highlight in " + n.toLowerCase() }))),
    el("button", { "data-act": "bm", title: "Bookmark this passage" }, icon("mark"), el("span", { text: "Bookmark" })),
    el("button", { "data-act": "note", title: "Attach a note" }, icon("note"), el("span", { text: "Note" })),
    canAI ? el("button", { "data-act": "ask", title: "Discuss this passage with the AI assistant" }, icon("spark"), el("span", { text: "Ask AI" })) : null,
    el("button", { "data-act": "rm", class: "rm", title: "Remove this highlight" }, icon("trash"), el("span", { text: "Remove" })));
  const tpop = el("div", { class: "tpop", role: "dialog", "aria-label": "Text size" });
  document.body.append(selbar, tpop);

  // ---------------------------------------------------------------- panel
  let curTab = "c", aiCtx = null, bmSort = "page", hlFilter = "";
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
          const t = b.x || b.items.join(" "); const i = t.toLowerCase().indexOf(v);
          const snip = (i > 30 ? "…" : "") + t.slice(Math.max(0, i - 30), i + v.length + 50) + "…";
          res.append(item(snip, `p. ${b.p} · Unit ${b.id.match(/u(\d+)/)[1]}`, () => { go(b.p); flash(b.id); }, !allowedPage(b.p)));
        });
      });
      pbody.append(q, res); setTimeout(() => q.focus(), 30);
    } else if (k === "a") {
      if (!canAI) { pbody.append(el("p", { class: "small muted pad", text: access === "retro" ? "The AI assistant is closed during retrospective access." : "The AI assistant is available to students registered for this course." })); return; }
      const box = el("div", { class: "aibox" }); pbody.append(box);
      C.mountAssistant && C.mountAssistant(box, { slug, compact: true, context: aiCtx, onClearContext: () => { aiCtx = null; } });
    }
  }
  function item(t, sub, onGo, locked, onDel) {
    return el("div", { class: "bm" + (locked ? " locked" : "") },
      el("a", { href: "#", onclick: (e) => { e.preventDefault(); if (locked) return C.say("This part of the book is locked in preview."); onGo(); if (innerWidth < 1000) togglePanel(false); } }, el("b", { text: t }), el("span", { text: sub })),
      onDel ? el("button", { class: "icon-btn dark sm", "aria-label": "Remove", onclick: onDel }, icon("x")) : null);
  }

  // ---------------------------------------------------------------- block rendering
  function blockEl(b) {
    let n;
    if (b.t === "h") n = el("h3", { text: b.x });
    else if (b.t === "p") n = el("p", { text: b.x });
    else if (b.t === "ul") n = el("ul", {}, ...b.items.map((x) => el("li", { text: x })));
    else n = el("div", { class: "callout" }, icon("quiz"), el("span", { text: b.x }), el("a", { href: `quizzes.html?c=${slug}`, class: "tiny", text: " Open quizzes" }));
    n.dataset.bid = b.id; n.id = "b-" + b.id;
    return n;
  }
  function pageContent(n) {
    const P = BOOK.pages[n - 1], wrap = el("div", { class: "pcontent" });
    if (!allowedPage(n)) { wrap.append(el("div", { class: "locked-page" }, icon("lock", "i lg"), el("p", { text: "This page is not available in preview." }))); return wrap; }
    if (P.kind === "cover") wrap.append(C.cover(course, "big"));
    else if (P.kind === "title") wrap.append(el("div", { class: "titlepage" },
      el("div", { class: "label", text: "College for Distance and e-Learning" }), el("h2", { text: course.title }), el("p", { class: "muted", text: course.code + " · Edition " + BOOK.edition + " (sample)" }),
      el("p", { class: "small", text: "Offered in: " + [...new Set(course.offerings.map((o) => C.prog(o.p).short))].join(", ") }),
      el("p", { class: "small muted lic2", text: u ? `Licensed to ${u.n} · ${u.id}. For personal study only.` : "Preview copy." }),
      el("p", { class: "tiny muted", text: "Sample text for the prototype. The approved course book appears here." })));
    else if (P.kind === "contents") wrap.append(el("h2", { text: "Contents" }), el("ol", { class: "contents" }, ...BOOK.units.map((un) =>
      el("li", {}, el("a", { href: "#", onclick: (e) => { e.preventDefault(); go(un.page); } }, el("span", { text: `Unit ${un.n}  ${un.title}` }), el("span", { class: "dots" }), el("span", { text: un.page }))))));
    else if (P.kind === "end") wrap.append(el("div", { class: "titlepage" }, el("h2", { text: "End of the course book" }),
      el("p", { text: "Take the self-checks in Quizzes, practise with past questions and join the course discussion." }),
      el("div", { class: "btns" }, el("a", { class: "btn sec sm", href: `quizzes.html?c=${slug}`, text: "Quizzes" }), el("a", { class: "btn sec sm", href: `pastq.html?c=${slug}`, text: "Past questions" }))));
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
    for (let n = 1; n <= BOOK.npages; n++) {
      if (BOOK.pages[n - 1].kind === "cover") continue;
      const mark = el("div", { class: "pmark", id: "p-" + n, "data-p": n }, el("span", { text: "p. " + n }), isBm(n) ? icon("mark", "i sm ribbon") : null);
      art.append(mark, pageContent(n));
      if (!allowedPage(n)) { art.append(el("div", { class: "locked-page" }, icon("lock", "i lg"), el("p", { text: u ? "The rest of the book is available to students registered for this course." : "Sign in to read the rest of the book." }), u ? null : el("a", { class: "btn sm", href: "login.html", text: "Sign in" }))); break; }
    }
    stage.replaceChildren(el("div", { class: "pagewrap" }, art));
    if (io) io.disconnect();
    stage.onscroll = null;
    let rafq = 0;
    window.onscroll = () => { if (rafq) return; rafq = requestAnimationFrame(() => { rafq = 0; const vis = $$(".pmark", art).filter((m) => m.getBoundingClientRect().top < innerHeight * 0.35); const last = vis[vis.length - 1]; if (last && +last.dataset.p !== page) setPage(+last.dataset.p, false); }); };
  }
  function scrollToPage(n) { const m = document.getElementById("p-" + n) || (n === 1 ? document.getElementById("p-2") : null); if (m) window.scrollTo({ top: m.getBoundingClientRect().top + scrollY - 70, behavior: "auto" }); }

  // ---------------------------------------------------------------- flip view
  let spreadMode = false, anim = false;
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
    if (n === 1) return [null, 1];
    const left = n % 2 === 0 ? n : n - 1;
    return [left, left + 1 <= BOOK.npages ? left + 1 : null];
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
    const w = stage.clientWidth - (innerWidth < 600 ? 24 : 110), h = Math.max(320, innerHeight - (root.querySelector(".banner") ? 190 : 140));
    const bw = spreadMode ? PW * 2 : PW;
    const sc = Math.min(w / bw, h / PH), ts = SCALES[prefs.ts];
    const sheet = book.querySelector(".fsheet");
    sheet.style.width = bw + "px"; sheet.style.height = PH + "px";
    sheet.style.transform = `scale(${sc})`;
    book.style.height = PH * sc + "px"; book.style.width = bw * sc + "px";
    // A printed page cannot reflow, so larger text stays on the same page and the page scrolls inside the book.
    $$(".fpage", sheet).forEach((pg) => {
      const pin = pg.querySelector(".fpin"); if (!pin) return;
      let fs = 15 * ts; pin.style.fontSize = fs + "px"; pin.classList.remove("scrolly");
      if (ts <= 1) while (pin.scrollHeight > pin.clientHeight + 1 && fs > 10.5) { fs -= 0.5; pin.style.fontSize = fs + "px"; }
      const over = pin.scrollHeight > pin.clientHeight + 1;
      pin.classList.toggle("scrolly", over); pg.classList.toggle("more", over && pin.scrollTop + pin.clientHeight < pin.scrollHeight - 4);
    });
  }
  function turn(dir) {
    if (anim) return;
    const step = spreadMode ? (page === 1 && dir > 0 ? 1 : 2) : 1;
    let target = page + dir * step;
    if (spreadMode) { if (dir > 0 && page === 1) target = 2; if (dir < 0 && page <= 3) target = 1; }
    if (target < 1 || target > BOOK.npages) return;
    if (!allowedPage(target) && dir > 0) return C.say("The rest of the book is locked in preview.");
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

  // ---------------------------------------------------------------- navigation & state
  let savedPage = null;
  function setPage(n, scroll = true) {
    page = Math.max(1, Math.min(BOOK.npages, n));
    slider.value = page;
    pgInfo.textContent = `Page ${page} of ${BOOK.npages}`;
    $("#rsub").textContent = `${course.code} · ${pageLabel(page)}`;
    const bp = flipBmPage(); bmBtn.setAttribute("aria-pressed", String(isBm(bp))); bmBtn.classList.toggle("on", isBm(bp));
    if (u && savedPage !== page) {
      savedPage = page;
      const pos = ud.get("pos", {}); pos[slug] = page; ud.set("pos", pos);
      const pr = ud.get("prog", {}); const pct = Math.round(page / BOOK.npages * 100); if (pct > (pr[slug] || 0)) { pr[slug] = pct; ud.set("prog", pr); }
    }
    if (scroll && view === "scroll") scrollToPage(page);
  }
  function go(n) { if (!allowedPage(n)) return C.say("That page is locked in preview."); if (view === "flip") { page = n; setPage(n, false); renderFlip(); } else setPage(n, true); }
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
    else if (act === "ask") { aiCtx = { text: sel.text, p: sel.p, bid: sel.bid }; togglePanel(true); showTab("a"); }
    else if (act === "rm" && sel.existing) { removeHl(sel.gid); if (panel.classList.contains("open") && curTab === "n") showTab("n"); C.say("Highlight removed."); }
  });

  // ---------------------------------------------------------------- tools
  function applySize() {
    if (view === "flip") { const b = stage.querySelector(".fbook"); if (b) fitBook(b); return; }
    const art = stage.querySelector(".pg-scroll"); if (!art) return;
    const m = document.getElementById("p-" + page), before = m ? m.getBoundingClientRect().top : null;
    art.style.fontSize = 18 * SCALES[prefs.ts] + "px";
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
  speakBtn.addEventListener("click", () => {
    if (!("speechSynthesis" in window)) return C.say("Read aloud is not supported in this browser.");
    if (speaking) { speechSynthesis.cancel(); speaking = false; speakBtn.setAttribute("aria-pressed", "false"); speakBtn.classList.remove("on"); return; }
    const ps = view === "flip" ? spreadPages(page).filter(Boolean) : [page, page + 1];
    const text = ps.filter(allowedPage).flatMap((n) => pageBlocks(n).map((id) => blocks[id].x || blocks[id].items.join(". "))).join(" ");
    if (!text) return C.say("Nothing to read on this page.");
    const utt = new SpeechSynthesisUtterance(text); utt.lang = "en-GB"; utt.rate = 0.95;
    utt.onend = () => { speaking = false; speakBtn.setAttribute("aria-pressed", "false"); speakBtn.classList.remove("on"); };
    speechSynthesis.cancel(); speechSynthesis.speak(utt); speaking = true; speakBtn.setAttribute("aria-pressed", "true"); speakBtn.classList.add("on"); C.say("Reading aloud. Press again to stop.");
  });
  more.addEventListener("click", () => C.modal({ title: "Reader options", body: el("div", { class: "stack" },
    sizeControl(),
    el("button", { class: "btn sec block", onclick: () => darkBtn.click() }, icon("sun"), "Night mode"),
    el("button", { class: "btn sec block", onclick: () => speakBtn.click() }, icon("head"), "Read aloud")), actions: [{ label: "Done", id: 1 }] }));
  dlBtn.addEventListener("click", () => {
    if (!canDownload) return C.say(access === "retro" ? "Not available during retrospective access: read online only." : "Downloading is available to registered students.");
    const dl = ud.get("dl", {}); dl[slug] = Date.now(); ud.set("dl", dl); C.log(u, "download", { c: slug });
    C.say(`Downloaded for offline reading (${(BOOK.npages * 0.09).toFixed(1)} MB), watermarked with your index number.`);
  });
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
        if (used >= quota) { C.say("You have used your print quota for this book this semester."); return false; }
        const units = boxes.filter((b) => b.cb.checked).map((b) => b.un.n); if (!units.length) { C.say("Select at least one unit."); return false; }
        return units;
      } }] }).then((units) => {
      if (!units) return;
      const id = "P-" + (C.hashNum(u.id + slug + Date.now()) % 60466176).toString(36).toUpperCase().padStart(5, "0");
      const pr = ud.get("prints", {}); (pr[slug] = pr[slug] || []).push({ id, units, at: Date.now() }); ud.set("prints", pr);
      const log = C.store.get("printlog", []); log.push({ id, user: u.id, c: slug, units, at: Date.now() }); C.store.set("printlog", log);
      location.href = `print.html?c=${slug}&id=${id}`;
    });
  }

  // ---------------------------------------------------------------- boot
  C.ready(async () => {
    try { BOOK = await C.loadBook(slug); } catch (e) { stage.replaceChildren(el("p", { class: "pad", text: e.message })); return; }
    BOOK.units.forEach((un) => un.blocks.forEach((b) => (blocks[b.id] = b)));
    slider.max = BOOK.npages;
    if (u) { const bms = list("bm"); if (bms.some((b) => !b.id)) { bms.forEach((b) => (b.id = b.id || C.uid("b"))); save("bm", bms); } }
    document.title = `${course.code} course book · CODeL Courseware prototype`;
    const qp = parseInt(C.Q.get("p"), 10), qu = parseInt(C.Q.get("u"), 10), qs = parseInt(C.Q.get("s"), 10);
    let target = null;
    if (qu && BOOK.units[qu - 1]) { const h = qs && blocks[`u${qu}s${qs}`]; target = h ? h.p : BOOK.units[qu - 1].page; }
    page = qp && qp >= 1 ? Math.min(qp, BOOK.npages) : target || (u ? (ud.get("pos", {})[slug] || 1) : 1);
    if (!allowedPage(page)) page = 1;
    $$("[data-v]", seg).forEach((b) => { b.classList.toggle("on", b.dataset.v === view); b.setAttribute("aria-pressed", String(b.dataset.v === view)); });
    render(); setPage(page, true);
    if (C.Q.get("b")) flash(C.Q.get("b")); else if (qu && qs && blocks[`u${qu}s${qs}`]) flash(`u${qu}s${qs}`);
    showTab("c");
    if (innerWidth >= 1000) togglePanel(true);
    if (C.Q.get("mode") === "print" && canPrint) printDialog();
    if (C.Q.get("tab")) { togglePanel(true); showTab(C.Q.get("tab")); }
  });
})();
