// AI study assistant. Reads the whole course book (with canonical page numbers) and the past-questions bank,
// and cites unit, section and page for every answer.
//   Built-in mode: an offline retrieval assistant that runs entirely in the browser (no data leave the device).
//   Live mode: Claude through the official Anthropic TypeScript SDK, with the demonstrator's own API key.
//              The key is kept only in this browser. In production the call goes through a UEW server instead.
(function () {
  "use strict";
  const { el, icon, $, store: S } = C;
  const STOP = new Set("a an and are as at be by can do does for from has have how i in into is it its of on or that the their them then there these this to was what when where which who why will with you your about explain tell me please give show us our we should would could more most than also not no yes use using used unit page section book course".split(" "));
  const MODELS = [["claude-opus-5-5", "Claude Opus 5.5 (most capable)"], ["claude-sonnet-5-5", "Claude Sonnet 5.5 (faster)"], ["claude-haiku-4-5", "Claude Haiku 4.5 (fastest, lowest cost)"]];
  const SHARED = {};                                     // conversation state shared by every mounted assistant
  const aiCfg = () => S.get("aicfg", { key: "", model: "claude-opus-5-5" });
  // In Moodle, C.aiServer (set by the Moodle adapter) sends questions to the university's server, which holds the key.
  C.aiLive = () => (C.aiServer ? !!C.aiServer.on : !!aiCfg().key);

  // ------------------------------------------------------------------ index of a book
  const tok = (s) => (s.toLowerCase().normalize("NFKD").match(/[a-z0-9]+/g) || []).filter((w) => w.length > 1 && !STOP.has(w)).map(stem);
  function stem(w) { return w.length > 4 ? w.replace(/(ing|ies|es|s|ed|ly)$/, "") : w; }
  const IDX = {};
  function index(book) {
    if (IDX[book.slug]) return IDX[book.slug];
    const docs = [], secTitle = {};
    book.units.forEach((un) => {
      let sec = null;
      un.blocks.forEach((b) => {
        if (b.t === "h") { sec = b; secTitle[b.id] = b.x; return; }
        const text = b.x || b.items.join(" ");
        const sn = sec ? sec.x.split(" ")[0] : un.n + ".1";
        docs.push({ id: b.id, unit: un.n, utitle: un.title, sec: sn, stitle: sec ? sec.x.replace(/^[\d.]+\s*/, "") : "", p: b.p, text, b, toks: tok(text + " " + (sec ? sec.x : "") + " " + un.title) });
      });
    });
    const df = {}; docs.forEach((d) => new Set(d.toks).forEach((t) => (df[t] = (df[t] || 0) + 1)));
    const avg = docs.reduce((a, d) => a + d.toks.length, 0) / Math.max(1, docs.length);
    return (IDX[book.slug] = { docs, df, avg, N: docs.length, book });
  }
  function bm25(ix, q, k = 4) {
    const qt = [...new Set(tok(q))]; if (!qt.length) return [];
    return ix.docs.map((d) => {
      let s = 0; const tf = {}; d.toks.forEach((t) => (tf[t] = (tf[t] || 0) + 1));
      qt.forEach((t) => { if (!tf[t]) return; const idf = Math.log(1 + (ix.N - ix.df[t] + 0.5) / (ix.df[t] + 0.5)); s += idf * (tf[t] * 2.2) / (tf[t] + 1.2 * (0.25 + 0.75 * d.toks.length / ix.avg)); });
      return { d, s };
    }).filter((x) => x.s > 0.8).sort((a, b) => b.s - a.s).slice(0, k);
  }
  const cite = (d) => ({ label: `Unit ${d.unit} · §${d.sec} · p. ${d.p}`, href: C.link("reader", { c: IDX_slug(d), p: d.p, b: d.id }) });
  let _slug = ""; const IDX_slug = () => _slug;

  // ------------------------------------------------------------------ built-in (offline) answers
  function offlineAnswer(book, pqs, q, opts = {}) {
    _slug = book.slug;
    const ix = index(book), lq = q.toLowerCase();
    const out = { parts: [], cites: [] };
    const say = (t) => out.parts.push(t);
    const addCite = (d) => { const c = cite(d); if (!out.cites.some((x) => x.label === c.label)) out.cites.push(c); return c.label; };
    const pqm = opts.pq || pqs.find((p) => lq.includes(p.id.toLowerCase()));
    // 0) a passage the student selected in the reader
    if (opts.ctx && !pqm) {
      const c = opts.ctx;
      const d = ix.docs.find((x) => x.id === c.bid) || ix.docs.find((x) => x.id.startsWith(c.bid + "b")) || ix.docs.find((x) => x.p === c.p);
      if (d) {
        const inUnit = (rx) => ix.docs.filter((x) => x.unit === d.unit && rx.test(x.stitle));
        const ptoks = new Set(tok(c.text));
        const overlap = (t) => tok(t).filter((w) => ptoks.has(w)).length;
        const terms = [...new Set((c.text.toLowerCase().match(/[a-z][a-z'’-]{3,}/g) || []).filter((w) => !STOP.has(w)))]
          .map((w) => [w, ix.df[stem(w)] || 0]).filter(([, n]) => n > 0).sort((a, b) => a[1] - b[1]).slice(0, 5).map(([w]) => w);
        say(`You selected a passage from **Unit ${d.unit}, section ${d.sec} ${d.stitle}**, page ${d.p} [${addCite(d)}].`);
        if (/\b(quiz|test me|question me|check my)/.test(lq)) {
          const pool = (C.pool ? C.pool(book.slug) : []).map((q) => ({ q, s: overlap(q.q + " " + (q.x || "")) })).sort((a, b) => b.s - a.s).slice(0, 3).map((x) => x.q);
          say("Here are practice questions closest to this passage. Try each one, then open the answer.");
          out.quiz = pool;
        } else if (/\b(exams?|examin\w*|past questions?|marks?)\b/.test(lq)) {
          const list = pqs.filter((p) => p.unit === d.unit);
          if (list.length) {
            say(`**How this could be examined.** Past questions linked to Unit ${d.unit}:`);
            list.slice(0, 3).forEach((p) => { say(`- ${p.year}, Q${p.q} (${p.marks} marks): ${clip(p.text, 150)} [PQ ${p.id}]`); out.cites.push({ label: "PQ " + p.id, href: C.link("pastq", { c: book.slug }) }); });
            say("In an answer, state the idea from your passage in one sentence, explain it, then give an example. The marking guides award marks for each of those steps.");
          } else say(`There are no past questions linked to Unit ${d.unit} yet. Examiners usually ask you to explain an idea like this one and illustrate it with an example.`);
        } else if (/\b(examples?|illustrat\w*|apply|applies|application|practi[cs]e|real life)\b/.test(lq)) {
          const we = inUnit(/Worked example/i), act = inUnit(/Activity/i)[0];
          if (we.length) say(`**An example from the book.** ${we.map((x) => `“${clip(x.text, 220)}” [${addCite(x)}]`).join(" ")}`);
          if (act) say(`**Try it yourself.** ${clip(act.text, 200)} [${addCite(act)}]`);
          say("To make your own example, take the idea in your passage and describe one situation from your school or community where it applies.");
        } else if (/\b(summar\w*|simpl\w*|short\w*|brief\w*|plain\w*|fewer words)\b/.test(lq)) {
          const first = (c.text.match(/[^.!?]+[.!?]?/) || [c.text])[0].trim();
          say(`**In short:** ${first}`);
          if (terms.length) say(`**Key terms to remember:** ${terms.join(", ")}.`);
          const sm = inUnit(/Summary/i)[0]; if (sm) say(`**How the unit sums it up:** ${clip(sm.text, 220)} [${addCite(sm)}]`);
        } else {
          if (terms.length) say(`**Key terms in this passage:** ${terms.join(", ")}.`);
          const around = ix.docs.filter((x) => x.unit === d.unit && x.sec === d.sec && x.id !== d.id).slice(0, 2);
          if (around.length) say("**In context**, the same section also says: " + around.map((x) => `“${clip(x.text, 170)}” [${addCite(x)}]`).join(" "));
          const more = bm25(ix, q + " " + c.text, 5).filter((h) => h.d.id !== d.id && !(h.d.unit === d.unit && h.d.sec === d.sec)).slice(0, 2);
          if (more.length) say("**Elsewhere in the book:** " + more.map((h) => `“${clip(h.d.text, 150)}” [${addCite(h.d)}]`).join(" "));
          const lo = ix.docs.find((x) => x.unit === d.unit && /Learning outcomes/i.test(x.stitle));
          if (lo) say(`**Why it matters:** it supports this learning outcome: ${lo.b.items[0]} [${addCite(lo)}]`);
          const best = (C.pool ? C.pool(book.slug) : []).map((qq) => ({ qq, s: overlap(qq.q + " " + (qq.x || "")) })).sort((a, b) => b.s - a.s)[0];
          if (best && best.s > 0) { say("**Check yourself** with this question:"); out.quiz = [best.qq]; }
        }
        say("Ask a follow-up about this passage, or choose: an example, a simple summary, a quiz, or how it could be examined.");
        return out;
      }
    }
    // 1) a past question
    if (pqm) {
      const hits = bm25(ix, pqm.text, 3);
      say(`**Past question ${pqm.year}, ${pqm.sem} semester, Question ${pqm.q} (${pqm.marks} marks)**`);
      say(pqm.text);
      say("**What the examiner is looking for** (from the marking guide): " + pqm.guide);
      const parts = [...pqm.guide.matchAll(/\((\d+)\s*marks?\)|(\d+)\s*marks?/g)].length;
      say(`**How to plan your answer**\n- Underline the command words (explain, compare, discuss) and the number of points asked for.\n- Allocate your time by marks: about ${Math.max(1, Math.round(pqm.marks * 1.5))} minutes for ${pqm.marks} marks.\n- Give one clear point per paragraph, each with an example${book.subject === "business" ? " or a worked figure" : " from a Ghanaian classroom or community"}.\n- End with a short conclusion that answers the question directly.` + (parts > 1 ? `\n- The guide splits the marks into ${parts} parts; answer each part under its own heading.` : ""));
      const un = book.units[pqm.unit - 1];
      if (un) { const d0 = ix.docs.find((d) => d.unit === un.n && /Key ideas/i.test(d.stitle)) || ix.docs.find((d) => d.unit === un.n); say(`**Where to read**: Unit ${un.n}, “${un.title}” [${addCite(d0)}].`); }
      hits.forEach((h) => say(`Related passage: “${clip(h.d.text, 170)}” [${addCite(h.d)}]`));
      return out;
    }
    // 2) a page
    const pm = lq.match(/\b(?:page|p\.)\s*(\d{1,3})\b/);
    if (pm && !/explain this passage/.test(lq)) {
      const n = +pm[1], P = book.pages[n - 1];
      if (!P) { say(`This book has ${book.npages} pages, so there is no page ${n}.`); return out; }
      if (P.kind !== "text") { say(`Page ${n} is the ${P.kind === "cover" ? "cover" : P.kind === "title" ? "title page" : P.kind === "contents" ? "contents page" : "last page"} of the book.` + (P.kind === "contents" ? " The units are: " + book.units.map((u) => `Unit ${u.n} ${u.title} (p. ${u.page})`).join("; ") + "." : "")); return out; }
      const ds = ix.docs.filter((d) => d.p === n);
      say(`**Page ${n}** is in Unit ${P.unit}, “${book.units[P.unit - 1].title}”. It covers:`);
      ds.forEach((d) => say(`- ${d.stitle ? d.stitle + ": " : ""}${clip(d.text, 200)} [${addCite(d)}]`));
      return out;
    }
    const um = lq.match(/\bunit\s*(\d)\b/);
    // 3a) past questions, optionally for one unit
    if (/past (exam )?questions?|exam questions?|past papers?/.test(lq)) {
      const list = pqs.filter((p) => !um || p.unit === +um[1]);
      if (!list.length) { say(`There are no past questions linked to Unit ${um[1]} in the bank yet. Try another unit or open the Past questions page.`); return out; }
      say(`**${list.length} past question${list.length > 1 ? "s" : ""}${um ? " on Unit " + um[1] : " for this course"}:**`);
      list.forEach((p) => { say(`- ${p.year}, ${p.sem} semester, Q${p.q} (${p.marks} marks, Unit ${p.unit}): ${clip(p.text, 150)} [PQ ${p.id}]`); out.cites.push({ label: "PQ " + p.id, href: C.link("pastq", { c: book.slug }) }); });
      say("Ask me about any of them, for example “how should I answer " + list[0].id + "?”, and I will explain what the examiner wants and where to read.");
      return out;
    }
    // 3b) summarise a unit
    if (um && /summar|overview|about|cover|main|key idea|outline|revise|revision/.test(lq)) {
      const un = book.units[+um[1] - 1];
      if (!un) { say(`This book has ${book.units.length} units.`); return out; }
      const ds = ix.docs.filter((d) => d.unit === un.n);
      const lo = ds.find((d) => /Learning outcomes/i.test(d.stitle)), key = ds.filter((d) => /Key ideas/i.test(d.stitle)), sm = ds.find((d) => /Summary/i.test(d.stitle));
      say(`**Unit ${un.n}: ${un.title}** starts on page ${un.page}.`);
      if (lo) say(`**By the end of the unit you should be able to:**\n${lo.b.items.map((x) => "- " + x).join("\n")} [${addCite(lo)}]`);
      if (key.length) say("**Key ideas**\n" + key.map((d) => (d.b.items ? d.b.items.map((x) => "- " + x).join("\n") : "- " + clip(d.text, 220)) + ` [${addCite(d)}]`).join("\n"));
      if (sm) say(`**Summary**: ${clip(sm.text, 260)} [${addCite(sm)}]`);
      return out;
    }
    // 4) quiz me
    if (/quiz me|test me|practice question|questions? (to|for) practi|check my understanding/.test(lq)) {
      const pool = C.pool ? C.shuffle(C.pool(book.slug), "ai" + Date.now()).slice(0, 3) : [];
      say("Here are three practice questions. Try each one, then open the answer.");
      out.quiz = pool;
      return out;
    }
    // 5) default: retrieval over the book and the past questions
    const quote = (q.match(/“([^”]{8,})”|"([^"]{8,})"/) || [])[1];
    const hits = bm25(ix, quote || q, 4);
    const pqHits = /exam|past question|examin|likely/.test(lq) ? pqs.map((p) => ({ p, s: tok(p.text).filter((t) => tok(q).includes(t)).length })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 2) : [];
    if (!hits.length && !pqHits.length) {
      say("I could not find this in your course book. Try different words, look in the Contents, or ask in the course discussion so your tutor can answer.");
      say("Tip: you can ask me to “summarise Unit 2”, “explain page 12”, “quiz me on this course” or about a past question.");
      out.none = true; return out;
    }
    if (quote && hits[0]) {
      const d = hits[0].d;
      say(`This passage is from **Unit ${d.unit}, section ${d.sec} ${d.stitle}** on page ${d.p} [${addCite(d)}].`);
      const around = ix.docs.filter((x) => x.unit === d.unit && x.sec === d.sec && x.id !== d.id);
      if (around.length) say("**In context**, the same section also says: " + around.map((x) => `“${clip(x.text, 160)}” [${addCite(x)}]`).join(" "));
      const lo = ix.docs.find((x) => x.unit === d.unit && /Learning outcomes/i.test(x.stitle));
      if (lo) say(`It supports this learning outcome: ${lo.b.items[0]} [${addCite(lo)}]`);
    } else {
      say("Here is what your course book says:");
      hits.forEach((h) => say(`- **${h.d.stitle || "Unit " + h.d.unit}** (Unit ${h.d.unit}): ${clip(h.d.text, 240)} [${addCite(h.d)}]`));
    }
    pqHits.forEach(({ p }) => { say(`**Related past question** (${p.year}, Q${p.q}, ${p.marks} marks): ${clip(p.text, 180)} [PQ ${p.id}]`); out.cites.push({ label: "PQ " + p.id, href: C.link("pastq", { c: book.slug }) }); });
    say("The built-in assistant quotes and points to the book. For fuller explanations in your own words, a live AI model can be connected in AI settings.");
    return out;
  }
  const clip = (s, n) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s);

  // ------------------------------------------------------------------ live mode (Claude via the Anthropic SDK)
  let sdk = null;
  async function client() {
    if (!sdk) sdk = await import("https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.130.0/+esm");
    const Anthropic = sdk.default || sdk.Anthropic;
    return new Anthropic({ apiKey: aiCfg().key, dangerouslyAllowBrowser: true });
  }
  function bookText(book, pqs) {
    const lines = [`COURSE BOOK: ${book.code} ${book.title} (edition ${book.edition}). ${book.npages} pages. Page numbers are canonical and match both reading views.`];
    book.units.forEach((un) => {
      lines.push(`\n=== Unit ${un.n}: ${un.title} (starts p. ${un.page}) ===`);
      un.blocks.forEach((b) => {
        if (b.t === "h") lines.push(`\n[p. ${b.p}] §${b.x}`);
        else lines.push(`[p. ${b.p}] ${b.x || b.items.map((x) => "• " + x).join("\n")}`);
      });
    });
    lines.push("\n=== PAST QUESTIONS BANK ===");
    pqs.forEach((p) => lines.push(`[PQ ${p.id}] ${p.year} ${p.sem} semester, Question ${p.q}, ${p.marks} marks, linked to Unit ${p.unit}.\nQuestion: ${p.text}\nMarking guide: ${p.guide}`));
    return lines.join("\n");
  }
  const SYS = (book) => `You are the CODeL AI study assistant for University of Education, Winneba distance students, helping with the course ${book.code} ${book.title}.
Rules:
- Answer only from the course book and past questions supplied below. If the answer is not there, say so and suggest asking the tutor in the course discussion.
- Cite every point with its location in exactly this form: [Unit 2 · §2.3 · p. 14]. For past questions cite [PQ <id>]. Page numbers must come from the [p. N] markers.
- Help students understand; do not write assignments or examination answers for them to submit. For past questions, explain what the examiner wants and how to plan an answer, and point to the pages to read.
- Be concise, clear and encouraging. Use British English and examples that make sense in Ghana. Use short paragraphs or bullet points.`;
  async function liveAnswer(book, pqs, history, q, onText) {
    const cfg = aiCfg(), cl = await client();
    const haiku = /haiku/.test(cfg.model);
    const params = {
      model: cfg.model, max_tokens: 6000,
      system: [{ type: "text", text: SYS(book) }, { type: "text", text: bookText(book, pqs), cache_control: { type: "ephemeral" } }],
      messages: [...history.slice(-8).map((m) => ({ role: m.role, content: m.api || m.text })), { role: "user", content: q }],
    };
    if (!haiku) Object.assign(params, { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default", output_config: { effort: "low" } });
    const stream = haiku ? cl.messages.stream(params) : cl.beta.messages.stream(params);
    stream.on("text", onText);
    const msg = await stream.finalMessage();
    if (msg.stop_reason === "refusal") throw new Error("The model declined to answer this question. Try rephrasing it.");
    const txt = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    return msg.stop_reason === "max_tokens" ? txt + "\n\n(The answer was cut short. Ask me to continue, or ask a narrower question.)" : txt;
  }

  // ------------------------------------------------------------------ rendering (no innerHTML: text is always escaped)
  function inline(text, slug, cites) {
    const frag = [], rx = /\*\*([^*]+)\*\*|\[((?:Unit\s*\d+\s*·\s*)?(?:§\s*[\d.]+\s*·\s*)?p\.\s*\d+)\]|\[(PQ [^\]]+)\]/g;
    let last = 0, m;
    while ((m = rx.exec(text))) {
      if (m.index > last) frag.push(text.slice(last, m.index));
      if (m[1]) frag.push(el("b", { text: m[1] }));
      else if (m[2]) { const p = m[2].match(/p\.\s*(\d+)/)[1]; const c = (cites || []).find((x) => x.label === m[2]); frag.push(el("a", { class: "cite", href: c ? c.href : C.link("reader", { c: slug, p }) }, icon("book", "i sm"), m[2])); }
      else frag.push(el("a", { class: "cite pq", href: C.link("pastq", { c: slug }) }, icon("archive", "i sm"), m[3]));
      last = rx.lastIndex;
    }
    if (last < text.length) frag.push(text.slice(last));
    return frag;
  }
  function renderText(text, slug, cites) {
    const box = el("div", { class: "md" }); let ul = null;
    text.split("\n").forEach((line) => {
      const t = line.trim(); if (!t) { ul = null; return; }
      const b = t.match(/^[-•*]\s+(.*)$/) || t.match(/^\d+[.)]\s+(.*)$/);
      if (b) { if (!ul) { ul = el("ul"); box.append(ul); } ul.append(el("li", {}, ...inline(b[1], slug, cites))); }
      else { ul = null; box.append(el("p", {}, ...inline(t.replace(/^#+\s*/, ""), slug, cites))); }
    });
    return box;
  }

  // ------------------------------------------------------------------ assistant widget (used on ai.html and inside the reader)
  C.mountAssistant = (host, opts) => {
    const { slug, compact = false, pq = null } = opts;
    let ctx = opts.context || null;                       // a passage selected in the reader: {text, p, bid}
    const u = C.me();
    host.replaceChildren();
    if (!u) { host.append(el("p", { class: "small muted", text: "Sign in to use the AI study assistant." })); return; }
    const ex = C.examActive && C.examActive(u);
    if (ex && !C.isStaff(u)) { host.append(el("div", { class: "banner warn" }, icon("lock", "i lg"), el("div", { class: "small" }, el("b", { text: "The AI assistant is switched off while your online exam is in progress. " }), el("a", { href: C.link("exam", { e: ex.id }), text: "Return to the exam" })))); return; }
    const acc = C.access(slug, u);
    if (acc !== "full" && acc !== "staff") { host.append(el("p", { class: "small muted", text: acc === "retro" ? "The AI assistant is not available during retrospective access." : "The AI assistant is available for courses you are registered for this semester." })); return; }
    if (u.r === "s" && !subscribed(u)) { host.append(subscribeBox(u, () => C.mountAssistant(host, opts), ctx)); return; }
    const ud = C.ud(u), hk = "ai:" + slug, sk = u.id + "|" + slug;
    const shared = SHARED[sk] || (SHARED[sk] = { history: ud.get(hk, []), busy: false, views: new Set() });
    const history = shared.history;
    const log = el("div", { class: "ailog", "aria-live": "polite" });
    const ta = el("textarea", { class: "input ta", rows: compact ? 3 : 2, placeholder: "Ask about this course book", "aria-label": "Your question" });
    const send = el("button", { class: "btn", "aria-label": "Ask" }, icon("send"), compact ? null : "Ask");
    const mode = el("div", { class: "aimode tiny" }, C.aiLive() ? el("span", { class: "pill ok" }, icon("spark", "i sm"), "Live: " + (C.aiServer ? C.aiServer.label : (MODELS.find((m) => m[0] === aiCfg().model) || [0, aiCfg().model])[1])) : el("span", { class: "pill grey" }, icon("wifi", "i sm"), "Built-in assistant · works offline"),
      C.link("aisettings") !== "#" ? el("a", { href: C.link("aisettings"), text: "Settings" }) : null, el("button", { class: "linkbtn", onclick: () => { if (shared.busy) return C.say("Wait for the current answer to finish."); history.length = 0; ud.set(hk, history); if (C.aiServer) C.aiServer.clear(); shared.views.forEach((f) => f()); }, text: "Clear chat" }));
    const chips = el("div", { class: "aichips" });
    const ctxBar = el("div", { class: "aictx" });
    const drawCtx = () => {
      ctxBar.replaceChildren(); ctxBar.hidden = !ctx;
      if (ctx) ctxBar.append(icon("pen", "i sm"), el("div", {}, el("b", { text: `Discussing a passage on page ${ctx.p}` }), el("q", { text: clip(ctx.text, 170) })),
        el("button", { class: "icon-btn dark sm", "aria-label": "Stop discussing this passage", onclick: () => { ctx = null; opts.context = null; if (opts.onClearContext) opts.onClearContext(); drawCtx(); } }, icon("x")));
      const list = ctx ? ["Explain this passage", "Give me an example", "Summarise it simply", "Quiz me on this", "How could this be examined?"]
        : compact ? [] : ["Summarise Unit 1", "What is on page 6?", "Explain the key ideas of Unit 2", "Quiz me on this course", "Which past questions came on Unit 4?"];
      chips.replaceChildren(...list.map((t) => el("button", { class: "pill", onclick: () => { ta.value = t; ask(); } }, t)));
      ta.placeholder = ctx ? "Ask about this passage" : "Ask about this course book";
    };
    host.append(mode, ctxBar, log, chips, el("div", { class: "aiin" }, ta, send), el("p", { class: "tiny muted", text: "Answers come from your course book and the past-questions bank, with the page they draw on. Check them against the book. Do not use the assistant for graded work." }));
    let book = null, pqs = [];
    const ready = C.loadBook(slug).then((b) => { book = b; pqs = C.pastQs ? C.pastQs(slug) : []; });
    function bubble(m) {
      if (m.role === "user") return el("div", { class: "aim me" }, el("div", { class: "bub" }, m.ctx ? el("q", { class: "aiq-ctx", text: `p. ${m.ctx.p}: ${clip(m.ctx.text, 90)}` }) : null, m.text));
      const b = el("div", { class: "bub" }, renderText(m.text, slug, m.cites));
      if (m.quiz && m.quiz.length) b.append(...m.quiz.map((q, i) => el("details", { class: "aiq" }, el("summary", {}, `${i + 1}. ${q.q}` + (q.o ? " " + q.o.map((o, j) => `(${String.fromCharCode(97 + j)}) ${o}`).join(" ") : q.t === "tf" ? " (true or false)" : "")),
        el("div", { class: "small" }, el("b", { text: "Answer: " + C.correctText(q) + ". " }), q.x || ""))));
      if (m.cites && m.cites.length) b.append(el("div", { class: "aicites" }, el("span", { class: "tiny muted", text: "Sources: " }), ...m.cites.slice(0, 6).map((c) => el("a", { class: "cite", href: c.href }, icon(c.label.startsWith("PQ") ? "archive" : "book", "i sm"), c.label))));
      return el("div", { class: "aim" + (m.err ? " err" : "") }, el("div", { class: "aiav" }, icon("spark", "i sm")), b);
    }
    function draw() {
      log.replaceChildren(...(history.length ? history.map(bubble) : [el("div", { class: "aiempty" }, icon("spark", "i lg"), el("p", { class: "small", text: `Ask anything about ${C.course(slug).code} ${C.course(slug).title}. I have read the whole course book and its past questions, and I will show you the unit, section and page for every point.` }))]));
      log.scrollTop = log.scrollHeight;
    }
    async function ask(pqItem) {
      const q = pqItem ? `Help me with past question ${pqItem.id}: how should I answer it and what should I read?` : ta.value.trim();
      if (!q) return;
      if (shared.busy) return C.say("Please wait for the current answer to finish.");
      shared.busy = true; ta.value = ""; send.disabled = true;
      const useCtx = pqItem ? null : ctx;
      const api = useCtx ? `Passage from the course book [p. ${useCtx.p}]: “${useCtx.text}”\n\nMy question about this passage: ${q}` : q;
      history.push({ role: "user", text: q, api, ctx: useCtx ? { p: useCtx.p, text: clip(useCtx.text, 200) } : null, at: Date.now() }); draw();
      const pending = { role: "assistant", text: "Reading the course book…", at: Date.now() }; history.push(pending); draw();
      try {
        await ready;
        if (C.aiLive()) {
          pending.text = "";
          const onText = (d) => { pending.text += d; const last = log.lastElementChild; if (last) last.replaceWith(bubble(pending)); log.scrollTop = log.scrollHeight; };
          const txt = C.aiServer ? await C.aiServer.ask({ q, ctx: useCtx }, onText)
            : await liveAnswer(book, pqs, history.slice(0, -2).filter((m) => !m.err && m.text), api, onText);
          pending.text = txt;
          _slug = slug; const ix = index(book);
          pending.cites = [...txt.matchAll(/\[((?:Unit\s*(\d+)\s*·\s*)?(?:§\s*([\d.]+)\s*·\s*)?p\.\s*(\d+))\]/g)].map((m) => { const d = ix.docs.find((x) => x.p === +m[4] && (!m[3] || x.sec === m[3])); return { label: m[1], href: C.link("reader", { c: slug, p: m[4], b: d ? d.id : null }) }; })
            .filter((c, i, a) => a.findIndex((x) => x.label === c.label) === i);
        } else {
          await new Promise((r) => setTimeout(r, 350));
          const r = offlineAnswer(book, pqs, q, { pq: pqItem, ctx: useCtx });
          pending.text = r.parts.join("\n"); pending.cites = r.cites; pending.quiz = r.quiz;
        }
        C.log(u, "ai", { c: slug, live: C.aiLive() });
      } catch (e) {
        pending.text = (C.aiServer ? (e && e.message ? e.message : String(e)) : C.aiLive() ? "The live AI service could not answer: " + (e && e.message ? e.message : e) + ". Check the API key in AI settings, or switch back to the built-in assistant." : "Something went wrong: " + e.message); pending.err = true;
      }
      if (history.length > 40) history.splice(0, history.length - 40);
      ud.set(hk, history); shared.busy = false; shared.views.forEach((f) => f()); send.disabled = false; if (!compact) ta.focus();
    }
    shared.views.add(draw);
    send.addEventListener("click", () => ask());
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } });
    drawCtx(); draw();
    if (ctx) setTimeout(() => ta.focus(), 50);
    if (pq) ready.then(() => { const item = pqs.find((p) => p.id === pq); if (item) ask(item); });
  };

  // ------------------------------------------------------------------ subscription (demonstration payment, nothing is charged)
  const subscribed = (u) => { const s = C.ud(u).get("aiSub", null); return s && s.until > Date.now(); };
  C.aiSubscribed = subscribed;
  function subscribeBox(u, done, ctx) {
    const plans = [["week", "One week", 5, 7], ["month", "One month", 15, 30], ["sem", "Whole semester", 40, 120]];
    let plan = "month";
    const cards = el("div", { class: "plans" }, ...plans.map(([k, t, p, d]) => el("button", { class: "plan" + (k === plan ? " on" : ""), "data-k": k, onclick: (e) => { plan = k; cards.querySelectorAll(".plan").forEach((b) => b.classList.toggle("on", b.dataset.k === k)); } },
      el("b", { text: t }), el("span", { class: "price", text: "GH₵" + p }), el("span", { class: "tiny muted", text: d + " days" }))));
    return el("div", { class: "card pad subbox" }, el("div", { class: "label", text: "Optional service" }), el("h2", {}, icon("spark"), " AI study assistant"),
      ctx ? el("p", { class: "small", text: `Subscribe to discuss the passage you selected on page ${ctx.p}.` }) : null,
      el("p", { class: "small", text: "Answers questions from your approved course books and the past-questions bank, and shows the unit, section and page it used. Prices are illustrative for the prototype." }),
      cards,
      el("button", { class: "btn red block", onclick: () => pay(u, plans.find((x) => x[0] === plan), done) }, "Pay with mobile money"),
      el("p", { class: "tiny muted", text: "Demonstration only: no payment is taken and no details are sent anywhere." }));
  }
  async function pay(u, [k, t, price, days], done) {
    const net = el("select", { class: "input", "aria-label": "Network" }, ...["MTN MoMo", "Telecel Cash", "AirtelTigo Money"].map((x) => el("option", { text: x })));
    const ok = await C.modal({ title: "Pay GH₵" + price + " for " + t.toLowerCase(), body: el("div", { class: "stack" }, el("div", { class: "field" }, el("label", { text: "Mobile money network" }), net),
      el("div", { class: "banner" }, icon("phone", "i lg"), el("div", { class: "small", text: "In the live service a payment prompt is sent to the student’s phone to approve with their PIN. In this demonstration the payment is simulated and nothing is charged." }))),
      actions: [{ label: "Cancel", cls: "ghost", id: false }, { label: "Simulate approval", id: true, cls: "red" }] });
    if (!ok) return;
    C.ud(u).set("aiSub", { plan: k, until: Date.now() + days * 86400000, at: Date.now(), ref: "AI-" + (C.hashNum(u.id + Date.now()) % 1e6).toString().padStart(6, "0"), net: net.value, price });
    C.log(u, "ai-subscribe", { plan: k }); C.say("Subscription active. Receipt sent by SMS in the live service."); done();
  }

  // ------------------------------------------------------------------ ai.html
  function aiPage() {
    const u = C.requireUser(), main = $("#main");
    const staff = C.isStaff(u);
    const mine = staff ? C.staffCourses(u) : C.enrol(u).current;
    const qc = C.course(C.Q.get("c")) ? C.Q.get("c") : null;
    const slug = qc && (mine.includes(qc) || staff) ? qc : mine[0];
    main.append(el("div", { class: "crumb" }, el("a", { href: staff ? "staff.html" : "dashboard.html", text: "Home" }), " / AI study assistant"));
    const sel = el("select", { class: "input", "aria-label": "Course" }, ...mine.map((s) => el("option", { value: s, text: `${C.course(s).code} ${C.course(s).title}`, selected: s === slug })));
    sel.addEventListener("change", () => (location.href = "ai.html?c=" + sel.value));
    const host = el("div", { class: "aihost card pad" });
    const sub = C.ud(u).get("aiSub", null);
    main.append(el("div", { class: "two" }, el("div", { class: "stack" }, el("h1", { text: "AI study assistant" }), el("div", { class: "toolbar" }, sel), host),
      el("aside", { class: "stack" },
        el("div", { class: "card pad" }, el("h3", { text: "How it works" }), el("ul", { class: "small tight" },
          el("li", { text: "It reads the whole course book with fixed page numbers, so the pages it cites match both the scroll and flip views." }),
          el("li", { text: "It also reads the past-questions bank and marking guides for the course." }),
          el("li", { text: "Every point links to the page: tap a citation to open the book there." }),
          el("li", { text: "It is switched off during online exams and for read-only courses." }))),
        !staff ? el("div", { class: "card pad" }, el("h3", { text: "Your subscription" }), el("p", { class: "small", text: sub && sub.until > Date.now() ? `Active until ${C.fmt(sub.until)} · receipt ${sub.ref}` : "Not subscribed." })) : null,
        settingsCard(u))));
    if (!slug) { host.append(el("p", { class: "muted", text: "You have no courses this semester." })); return; }
    C.mountAssistant(host, { slug, pq: C.Q.get("pq") });
    if (location.hash === "#settings") setTimeout(() => $("#settings").scrollIntoView({ behavior: "smooth" }), 100);
  }
  function settingsCard(u) {
    const cfg = aiCfg();
    const key = el("input", { class: "input", type: "password", autocomplete: "off", placeholder: cfg.key ? "A key is saved in this browser" : "sk-ant-…", "aria-label": "Anthropic API key" });
    const model = el("select", { class: "input", "aria-label": "Model" }, ...MODELS.map(([v, t]) => el("option", { value: v, text: t, selected: v === cfg.model })));
    const status = el("p", { class: "tiny muted", text: cfg.key ? "Live mode is on for this browser." : "Built-in assistant in use (works offline, no key needed)." });
    return el("div", { class: "card pad", id: "settings" }, el("h3", {}, icon("key"), " AI settings (demonstrator)"),
      el("p", { class: "small muted", text: "To demonstrate live answers from Claude, paste an Anthropic API key. It is stored only in this browser and sent only to the Anthropic API. In production the University’s server holds the key and students never see it." }),
      el("div", { class: "field" }, el("label", { text: "API key" }), key), el("div", { class: "field mt" }, el("label", { text: "Model" }), model),
      el("div", { class: "btns mt" },
        el("button", { class: "btn sm", onclick: async () => {
          const k = key.value.trim() || cfg.key; if (!k) return C.say("Paste an API key first.");
          S.set("aicfg", { key: k, model: model.value }); key.value = ""; status.textContent = "Testing the connection…";
          try { const cl = await client(); const r = await cl.messages.create({ model: model.value, max_tokens: 20, messages: [{ role: "user", content: "Reply with the word ready." }] }); status.textContent = "Connected. Live mode is on (" + r.model + ")."; C.say("Live AI connected."); }
          catch (e) { status.textContent = "Saved, but the test failed: " + (e.message || e); }
        } }, "Save and test"),
        el("button", { class: "btn ghost sm", onclick: () => { S.set("aicfg", { key: "", model: model.value }); status.textContent = "Key removed. Built-in assistant in use."; C.say("API key removed from this browser."); } }, "Remove key")), status);
  }

  C.ready(() => { if (C.page === "ai") aiPage(); });
})();
