// Quizzes module, question bank, past-questions bank and online exams.
(function () {
  "use strict";
  const { el, icon, $, $$, store: S } = C;
  const B = () => window.CODEL_BANK || { orient: [], flags: {}, courses: {}, units: [] };
  const DAY = 86400000, MIN = 60000;

  // ------------------------------------------------------------------ seeded random helpers
  C.rand = (seed) => { let x = C.hashNum(seed) || 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 100000) / 100000; }; };
  C.shuffle = (arr, seed) => { const a = arr.slice(), r = C.rand(seed); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // ------------------------------------------------------------------ question bank per course
  function structureQs(c) {
    const U = B().units;
    return [
      { t: "mc", q: `In the course book for ${c.title}, which unit covers applications in the Ghanaian context?`, o: ["Unit 1", "Unit 2", "Unit 3", "Unit 4"], a: 3, x: "Unit 4 is “Applications in the Ghanaian context”.", ref: 3 },
      { t: "mc", q: "According to the course book, what is the title of Unit 3?", o: U, a: 1, x: "Unit 3 is “Theories and approaches”.", ref: 3 },
      { t: "tf", q: "Each unit of the course book ends with a summary and a self-check.", a: true, x: "Section 6 of every unit is the summary, followed by the self-check.", ref: 3 },
      { t: "mc", q: "In which section of each unit are the learning outcomes listed?", o: ["Section 1", "Section 2", "Section 4", "Section 6"], a: 1, x: "Section 2 of each unit lists the learning outcomes.", ref: 3 },
      { t: "mc", q: "Which unit is designed to help you prepare for assessment?", o: ["Unit 2", "Unit 3", "Unit 4", "Unit 5"], a: 3, x: "Unit 5 is “Revision and assessment preparation”.", ref: 3 },
    ];
  }
  C.flagOf = (slug) => (B().courses[slug] || {}).fl || null;
  C.pool = (slug) => { const c = C.course(slug), fl = C.flagOf(slug); return [...(fl ? B().flags[fl].quiz : []), ...structureQs(c)]; };
  C.customQuizzes = () => S.get("cquiz", []);
  C.quizzesFor = (slug) => {
    const c = C.course(slug), fl = C.flagOf(slug), out = [];
    out.push({ id: slug + "-orient", slug, unit: 0, title: "Getting started: how this course works", kind: "Orientation", qs: B().orient, ref: { href: "help.html", label: "Help and FAQs" } });
    if (fl) out.push({ id: slug + "-u1", slug, unit: 1, title: "Unit 1 self-check", kind: "Self-check", qs: B().flags[fl].quiz, ref: { href: `reader.html?c=${slug}&u=1&s=3`, label: "Unit 1 · §1.3 Key ideas" } });
    out.push({ id: slug + "-struct", slug, unit: 0, title: "Know your course book", kind: "Self-check", qs: structureQs(c), ref: { href: `reader.html?c=${slug}&p=3`, label: "Contents, p. 3" } });
    C.customQuizzes().filter((q) => q.slug === slug && (q.published || C.isStaff(C.me()))).forEach((q) => out.push({ ...q, kind: q.published ? "Tutor quiz" : "Draft" }));
    return out;
  };
  C.quizById = (id) => {
    const cq = C.customQuizzes().find((q) => q.id === id); if (cq) return { ...cq, kind: "Tutor quiz" };
    const m = id.match(/^(.+)-(orient|u1|struct)$/); if (!m || !C.course(m[1])) return null;
    return C.quizzesFor(m[1]).find((q) => q.id === id) || null;
  };

  // ------------------------------------------------------------------ marking and rendering
  const num = (s) => { const v = parseFloat(String(s).replace(/[^0-9.\-]/g, "")); return isNaN(v) ? null : v; };
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  C.qMark = (q, a) => {
    if (a == null || a === "" || (Array.isArray(a) && !a.length)) return 0;
    if (q.t === "mc") return a === q.a ? 1 : 0;
    if (q.t === "tf") return a === q.a ? 1 : 0;
    if (q.t === "multi") { const s = [...a].sort().join(), t = [...q.a].sort().join(); return s === t ? 1 : 0; }
    if (q.t === "num") { const v = num(a); return v != null && Math.abs(v - q.a) <= (q.tol || 0.001) ? 1 : 0; }
    if (q.t === "text") return q.a.map(norm).includes(norm(a)) ? 1 : 0;
    return 0;
  };
  const answered = (a) => !(a == null || a === "" || (Array.isArray(a) && !a.length));
  C.answerText = (q, a) => {
    if (!answered(a)) return "No answer";
    if (q.t === "mc") return q.o[a]; if (q.t === "tf") return a ? "True" : "False";
    if (q.t === "multi") return a.map((i) => q.o[i]).join("; "); return String(a);
  };
  C.correctText = (q) => (q.t === "mc" ? q.o[q.a] : q.t === "tf" ? (q.a ? "True" : "False") : q.t === "multi" ? q.a.map((i) => q.o[i]).join("; ") : q.t === "text" ? q.a[0] : String(q.a));
  const TYPES = { mc: "Choose one answer", multi: "Choose all that apply", tf: "True or false", num: "Type a number", text: "Type a short answer" };

  C.qView = (q, i, ans, onAns, review) => {
    const name = "q" + i + "-" + Math.random().toString(36).slice(2, 6);
    const box = el("fieldset", { class: "qbox" + (review ? (C.qMark(q, ans) ? " right" : " wrong") : "") },
      el("legend", {}, el("span", { class: "qn", text: "Question " + (i + 1) }), el("span", { class: "qt", text: TYPES[q.t] })),
      el("div", { class: "qq", text: q.q }));
    const opt = (label, val, type, checked) => {
      const inp = el("input", { type, name, value: String(val), checked, disabled: !!review });
      inp.addEventListener("change", () => {
        if (type === "radio") onAns(q.t === "tf" ? val : val);
        else onAns($$("input:checked", box).map((x) => +x.value));
      });
      const corr = review && (q.t === "multi" ? q.a.includes(val) : q.a === val);
      return el("label", { class: "opt" + (corr ? " corr" : "") + (review && checked && !corr ? " bad" : "") }, inp, el("span", { text: label }), corr ? icon("check", "i sm") : null);
    };
    if (q.t === "mc") box.append(...q.o.map((o, j) => opt(o, j, "radio", ans === j)));
    else if (q.t === "tf") box.append(opt("True", true, "radio", ans === true), opt("False", false, "radio", ans === false));
    else if (q.t === "multi") box.append(...q.o.map((o, j) => opt(o, j, "checkbox", Array.isArray(ans) && ans.includes(j))));
    else {
      const inp = el("input", { class: "input", type: "text", inputmode: q.t === "num" ? "decimal" : "text", autocomplete: "off", "aria-label": "Your answer", value: ans == null ? "" : ans, disabled: !!review, placeholder: q.t === "num" ? "e.g. 25" : "Your answer" });
      inp.addEventListener("input", () => onAns(inp.value));
      box.append(el("div", { class: "qin" }, inp));
    }
    if (review) box.append(el("div", { class: "qfb" }, el("b", { text: C.qMark(q, ans) ? "Correct. " : `Not quite. Correct answer: ${C.correctText(q)}. ` }), q.x || ""));
    return box;
  };

  // ------------------------------------------------------------------ question editor (tutors)
  C.qEditor = (q0) => {
    const q = q0 ? JSON.parse(JSON.stringify(q0)) : { t: "mc", q: "", o: ["", "", "", ""], a: 0, x: "" };
    const type = el("select", { class: "input", "aria-label": "Question type" }, ...Object.entries(TYPES).map(([k, v]) => el("option", { value: k, text: v, selected: k === q.t })));
    const qt = el("textarea", { class: "input ta", rows: 3, placeholder: "Question text", "aria-label": "Question text" }); qt.value = q.q;
    const opts = el("textarea", { class: "input ta", rows: 4, placeholder: "One option per line", "aria-label": "Options, one per line" }); opts.value = (q.o || []).join("\n");
    const ans = el("input", { class: "input", placeholder: "", "aria-label": "Correct answer" });
    const expl = el("textarea", { class: "input ta", rows: 2, placeholder: "Explanation shown after marking (optional)", "aria-label": "Explanation" }); expl.value = q.x || "";
    const hint = el("div", { class: "tiny muted" });
    const optsF = el("div", { class: "field" }, el("label", { text: "Options" }), opts);
    const sync = () => {
      const t = type.value; optsF.style.display = t === "mc" || t === "multi" ? "" : "none";
      hint.textContent = { mc: "Correct answer: number of the correct option (1, 2, 3…)", multi: "Correct answers: option numbers separated by commas, e.g. 1,3", tf: "Correct answer: true or false", num: "Correct answer: a number", text: "Accepted answers separated by | e.g. editing|edit" }[t];
    };
    ans.value = q0 ? (q.t === "mc" ? q.a + 1 : q.t === "multi" ? q.a.map((i) => i + 1).join(",") : q.t === "text" ? q.a.join("|") : String(q.a)) : "";
    type.addEventListener("change", sync); sync();
    const node = el("div", { class: "stack qed" }, el("div", { class: "field" }, el("label", { text: "Type" }), type), el("div", { class: "field" }, el("label", { text: "Question" }), qt), optsF,
      el("div", { class: "field" }, el("label", { text: "Correct answer" }), ans, hint), el("div", { class: "field" }, el("label", { text: "Explanation" }), expl));
    node.read = () => {
      const t = type.value, o = opts.value.split("\n").map((s) => s.trim()).filter(Boolean), a = ans.value.trim();
      if (!qt.value.trim()) return C.say("Write the question text."), null;
      const out = { t, q: qt.value.trim(), x: expl.value.trim() };
      if (t === "mc" || t === "multi") { if (o.length < 2) return C.say("Give at least two options."), null; out.o = o; }
      if (t === "mc") { const k = parseInt(a, 10) - 1; if (!(k >= 0 && k < o.length)) return C.say("Correct answer must be an option number."), null; out.a = k; }
      if (t === "multi") { const ks = a.split(",").map((s) => parseInt(s, 10) - 1).filter((k) => k >= 0 && k < o.length); if (!ks.length) return C.say("Give the correct option numbers."), null; out.a = [...new Set(ks)]; }
      if (t === "tf") { if (!/^(true|false)$/i.test(a)) return C.say("Correct answer must be true or false."), null; out.a = /^true$/i.test(a); }
      if (t === "num") { const v = num(a); if (v == null) return C.say("Correct answer must be a number."), null; out.a = v; }
      if (t === "text") { const v = a.split("|").map((s) => s.trim()).filter(Boolean); if (!v.length) return C.say("Give at least one accepted answer."), null; out.a = v; }
      return out;
    };
    return node;
  };
  // pick questions from a course pool + write new ones; resolves to a question array
  C.pickQuestions = (slug, preset = []) => {
    const pool = C.pool(slug), chosen = preset.slice();
    const list = el("div", { class: "picklist" });
    const count = el("b");
    const draw = () => {
      list.replaceChildren(...pool.map((q) => {
        const on = chosen.some((c) => c.q === q.q);
        const cb = el("input", { type: "checkbox", checked: on });
        cb.addEventListener("change", () => { if (cb.checked) chosen.push(q); else chosen.splice(chosen.findIndex((c) => c.q === q.q), 1); cnt(); });
        return el("label", { class: "ck" }, cb, el("span", { text: q.q }), el("span", { class: "n", text: TYPES[q.t] }));
      }), ...chosen.filter((c) => !pool.some((p) => p.q === c.q)).map((q) => el("div", { class: "ck own" }, icon("pen", "i sm"), el("span", { text: q.q }),
        el("button", { class: "btn ghost sm", type: "button", text: "Remove", onclick: () => { chosen.splice(chosen.indexOf(q), 1); draw(); } }))));
      cnt();
    };
    const cnt = () => (count.textContent = chosen.length + " selected");
    const add = el("button", { class: "btn sec sm", type: "button", onclick: async () => {
      const ed = C.qEditor();
      const q = await C.modal({ title: "Write a new question", body: ed, actions: [{ label: "Cancel", cls: "ghost", id: null }, { label: "Add question", value: () => ed.read() || false }] });
      if (q) { chosen.push(q); draw(); }
    } }, icon("plus"), "Write a new question");
    draw();
    const node = el("div", {}, el("div", { class: "btns between" }, el("span", { class: "small" }, "Question bank for this course · ", count), add), list);
    node.read = () => chosen.slice();
    return node;
  };

  // ------------------------------------------------------------------ attempts
  const attempts = (u, id) => C.ud(u).get("quiz:" + id, []);
  C.quizStats = (u, id) => { const a = attempts(u, id); return { n: a.length, best: a.length ? Math.max(...a.map((x) => x.pct)) : null, last: a[a.length - 1] || null }; };

  // ------------------------------------------------------------------ quizzes list page
  function quizzesPage() {
    const u = C.requireUser(), main = $("#main");
    const e = C.enrol(u);
    const staff = C.isStaff(u);
    const mine = staff ? C.staffCourses(u) : e.current;
    const pick = C.Q.get("c");
    const courses = pick && C.course(pick) ? [pick] : mine;
    main.append(el("div", { class: "crumb" }, el("a", { href: staff ? "staff.html" : "dashboard.html", text: "Home" }), " / Quizzes"),
      el("div", { class: "btns between" }, el("h1", { text: "Quizzes and self-checks" }), staff ? el("button", { class: "btn", onclick: () => buildQuiz(mine) }, icon("plus"), "Create a quiz") : null),
      el("p", { class: "muted", text: staff ? "Preview the self-checks in your courses and publish your own quizzes. Students’ attempts are saved on their device in this prototype." : "Practice quizzes for your courses this semester. They do not count towards your grade. Retake them as often as you like; your best score is kept." }));
    const filter = el("select", { class: "input", "aria-label": "Course" }, el("option", { value: "", text: staff ? "All my courses" : "All my courses this semester" }),
      ...mine.map((s) => el("option", { value: s, text: `${C.course(s).code} ${C.course(s).title}`, selected: s === pick })));
    filter.addEventListener("change", () => (location.href = "quizzes.html" + (filter.value ? "?c=" + filter.value : "")));
    main.append(el("div", { class: "toolbar" }, filter));
    if (!staff) {
      const all = mine.flatMap((s) => C.quizzesFor(s)), done = all.filter((q) => C.quizStats(u, q.id).n);
      const avg = done.length ? Math.round(done.reduce((a, q) => a + C.quizStats(u, q.id).best, 0) / done.length) : 0;
      main.append(el("div", { class: "tiles" }, tile("Quizzes available", all.length, "for " + mine.length + " courses"), tile("Completed", done.length, "at least one attempt"),
        tile("Average best score", done.length ? avg + "%" : "–", "across completed quizzes"), tile("Retrospective courses", e.retro.length, "quizzes closed, notes kept")));
    }
    courses.forEach((s) => {
      const c = C.course(s), qs = C.quizzesFor(s);
      main.append(el("section", { class: "qsec" }, el("div", { class: "sech" }, el("h2", {}, el("span", { class: "code", text: c.code }), " " + c.title), el("a", { class: "small", href: `course-${s}.html`, text: "Course page" })),
        el("div", { class: "grid g-courses" }, ...qs.map((q) => quizCard(u, q, staff)))));
    });
  }
  const tile = (l, v, s) => el("div", { class: "card pad tile" }, el("div", { class: "label", text: l }), el("div", { class: "v", text: v }), el("div", { class: "small muted", text: s }));
  function quizCard(u, q, staff) {
    const st = C.quizStats(u, q.id);
    return el("div", { class: "card qcard" }, el("div", { class: "qk" }, el("span", { class: "pill" + (q.kind === "Draft" ? " grey" : ""), text: q.kind }), el("span", { class: "tiny muted", text: q.qs.length + " questions" })),
      el("h3", { text: q.title }),
      st.n ? el("div", { class: "small" }, el("b", { text: `Best ${st.best}%` }), ` · ${st.n} attempt${st.n > 1 ? "s" : ""} · last ${C.ago(st.last.at)}`) : el("div", { class: "small muted", text: staff ? "Preview as a student" : "Not attempted yet" }),
      st.n ? el("div", { class: "bar" }, el("i", { style: { width: st.best + "%", background: st.best >= 50 ? "var(--ok)" : "var(--scarlet)" } })) : null,
      el("div", { class: "btns" }, el("a", { class: "btn sm", href: `quiz.html?q=${encodeURIComponent(q.id)}` }, st.n ? "Retake" : staff ? "Preview" : "Start"),
        st.n ? el("a", { class: "btn sec sm", href: `quiz.html?q=${encodeURIComponent(q.id)}&review=1` }, "Review") : null,
        staff && q.by ? el("button", { class: "btn ghost sm", onclick: () => toggleQuiz(q) }, q.published ? "Unpublish" : "Publish") : null));
  }
  function toggleQuiz(q) { const all = C.customQuizzes(); const x = all.find((y) => y.id === q.id); x.published = !x.published; S.set("cquiz", all); C.say(x.published ? "Quiz published to students." : "Quiz moved back to drafts."); setTimeout(() => location.reload(), 500); }
  async function buildQuiz(mine) {
    const u = C.me();
    const cs = el("select", { class: "input", "aria-label": "Course" }, ...mine.map((s) => el("option", { value: s, text: `${C.course(s).code} ${C.course(s).title}` })));
    const title = el("input", { class: "input", placeholder: "e.g. Unit 2 practice quiz", "aria-label": "Quiz title" });
    const unit = el("select", { class: "input", "aria-label": "Unit" }, ...[1, 2, 3, 4, 5].map((n) => el("option", { value: n, text: "Unit " + n })));
    const pubNow = el("input", { type: "checkbox", checked: true });
    const holder = el("div");
    let picker = C.pickQuestions(cs.value); holder.append(picker);
    cs.addEventListener("change", () => { picker = C.pickQuestions(cs.value); holder.replaceChildren(picker); });
    const r = await C.modal({ title: "Create a quiz", wide: true, body: el("div", { class: "stack" }, el("div", { class: "g2" }, el("div", { class: "field" }, el("label", { text: "Course" }), cs), el("div", { class: "field" }, el("label", { text: "Unit" }), unit)),
      el("div", { class: "field" }, el("label", { text: "Title" }), title), holder, el("label", { class: "ck" }, pubNow, el("span", { text: "Publish to students now" }))),
      actions: [{ label: "Cancel", cls: "ghost", id: null }, { label: "Save quiz", value: () => {
        const qs = picker.read(); if (!title.value.trim()) return C.say("Give the quiz a title."), false; if (!qs.length) return C.say("Select at least one question."), false;
        return { id: C.uid("cq"), slug: cs.value, unit: +unit.value, title: title.value.trim(), qs, by: u.id, published: pubNow.checked, at: Date.now(), ref: { href: `reader.html?c=${cs.value}&u=${unit.value}`, label: "Unit " + unit.value } };
      } }] });
    if (!r) return;
    const all = C.customQuizzes(); all.push(r); S.set("cquiz", all);
    if (r.published) { const an = S.get("announce:" + r.slug, []); an.push({ id: C.uid("a"), by: u.id, text: `New practice quiz: ${r.title}.`, at: Date.now() }); S.set("announce:" + r.slug, an); }
    C.say("Quiz saved."); setTimeout(() => location.reload(), 500);
  }

  // ------------------------------------------------------------------ quiz runner
  function quizRunner() {
    const u = C.requireUser(), main = $("#main");
    const quiz = C.quizById(C.Q.get("q") || "");
    if (!quiz) { main.append(el("h1", { text: "Quiz not found" }), el("a", { class: "btn", href: "quizzes.html", text: "Back to quizzes" })); return; }
    const acc = C.access(quiz.slug, u);
    const c = C.course(quiz.slug);
    main.append(el("div", { class: "crumb" }, el("a", { href: "quizzes.html", text: "Quizzes" }), " / ", el("a", { href: `quizzes.html?c=${quiz.slug}`, text: c.code }), " / " + quiz.title));
    if (acc === "preview" || acc === "retro") {
      main.append(el("h1", { text: quiz.title }), el("div", { class: "banner warn" }, icon("lock", "i lg"), el("div", { class: "small", text: acc === "retro" ? "Quizzes close when the semester ends. Your past attempts are kept below." : "This quiz is for students registered for the course this semester." })));
      const st = C.quizStats(u, quiz.id); if (!st.n) return;
    }
    const draftKey = "quizdraft:" + quiz.id;
    const ud = C.ud(u);
    if (C.Q.get("review")) { const last = attempts(u, quiz.id).slice(-1)[0]; if (last) return showResult(last, true); }
    let st = ud.get(draftKey, null) || { ans: {}, i: 0, t0: Date.now(), flags: [] };
    const save = () => ud.set(draftKey, st);
    const head = el("div", { class: "qhead card pad" });
    const body = el("div", { class: "qbody" });
    const dots = el("div", { class: "qdots", role: "navigation", "aria-label": "Questions" });
    main.append(head, el("div", { class: "qgrid" }, body, el("aside", { class: "card pad qside" }, el("div", { class: "label", text: "Questions" }), dots,
      el("button", { class: "btn red block", onclick: submit }, icon("check"), "Submit answers"), el("p", { class: "tiny muted", text: "Your answers are saved as you go. You can leave and continue later." }))));
    const n = quiz.qs.length;
    function draw() {
      head.replaceChildren(el("div", { class: "label", text: `${c.code} · ${quiz.kind}` }), el("h1", { text: quiz.title }),
        el("div", { class: "qprog" }, el("div", { class: "bar" }, el("i", { style: { width: (Object.keys(st.ans).filter((k) => answered(st.ans[k])).length / n * 100) + "%" } })), el("span", { class: "small muted", text: `Question ${st.i + 1} of ${n}` })));
      const q = quiz.qs[st.i];
      const flagBtn = el("button", { class: "btn ghost sm" + (st.flags.includes(st.i) ? " on" : ""), "aria-pressed": String(st.flags.includes(st.i)), onclick: () => { const k = st.flags.indexOf(st.i); if (k >= 0) st.flags.splice(k, 1); else st.flags.push(st.i); save(); draw(); } }, icon("flag"), st.flags.includes(st.i) ? "Flagged" : "Flag for review");
      body.replaceChildren(C.qView(q, st.i, st.ans[st.i], (v) => { st.ans[st.i] = v; save(); drawDots(); }),
        el("div", { class: "btns between qnav" }, el("button", { class: "btn sec", disabled: st.i === 0, onclick: () => { st.i--; save(); draw(); } }, icon("back"), "Previous"), flagBtn,
          st.i < n - 1 ? el("button", { class: "btn", onclick: () => { st.i++; save(); draw(); } }, "Next", icon("chev")) : el("button", { class: "btn red", onclick: submit }, "Finish")));
      drawDots();
      const f = body.querySelector("input"); if (f && innerWidth > 700) f.focus({ preventScroll: true });
    }
    function drawDots() {
      dots.replaceChildren(...quiz.qs.map((_, i) => el("button", { class: "qdot" + (answered(st.ans[i]) ? " done" : "") + (i === st.i ? " cur" : "") + (st.flags.includes(i) ? " fl" : ""), "aria-label": `Question ${i + 1}${answered(st.ans[i]) ? ", answered" : ""}`, text: i + 1, onclick: () => { st.i = i; save(); draw(); } })));
    }
    async function submit() {
      const left = quiz.qs.filter((_, i) => !answered(st.ans[i])).length;
      if (left && !(await C.confirm("Submit this quiz?", `${left} question${left > 1 ? "s are" : " is"} not answered. Unanswered questions score zero.`, "Submit"))) return;
      const marks = quiz.qs.map((q, i) => C.qMark(q, st.ans[i]));
      const score = marks.reduce((a, b) => a + b, 0);
      const at = { at: Date.now(), secs: Math.round((Date.now() - st.t0) / 1000), ans: quiz.qs.map((_, i) => st.ans[i] ?? null), score, total: n, pct: Math.round(score / n * 100) };
      const all = attempts(u, quiz.id); all.push(at); ud.set("quiz:" + quiz.id, all); ud.set(draftKey, null);
      C.log(u, "quiz", { q: quiz.id, pct: at.pct });
      showResult(at, false);
    }
    function showResult(at, reviewOnly) {
      main.querySelectorAll(".qhead,.qgrid").forEach((x) => x.remove());
      const st2 = C.quizStats(u, quiz.id);
      const mm = Math.floor(at.secs / 60), ss = at.secs % 60;
      main.append(el("div", { class: "card pad result " + (at.pct >= 50 ? "pass" : "fail") },
        el("div", { class: "label", text: `${c.code} · ${quiz.title}` }),
        el("div", { class: "big", text: at.pct + "%" }),
        el("p", { text: `${at.score} of ${at.total} correct · time ${mm} min ${ss} s · ${reviewOnly ? "attempt on " + C.fmtTime(at.at) : "best score " + st2.best + "%"}` }),
        el("p", { class: "small", text: at.pct >= 80 ? "Excellent. You are ready for the next unit." : at.pct >= 50 ? "Good work. Review the explanations below for the questions you missed." : "Read the relevant section of the course book again, then retake the quiz." }),
        el("div", { class: "btns" }, el("a", { class: "btn", href: `quiz.html?q=${encodeURIComponent(quiz.id)}` }, icon("sync"), "Retake"), el("a", { class: "btn sec", href: quiz.ref ? quiz.ref.href : `reader.html?c=${quiz.slug}` }, icon("book"), "Read: " + (quiz.ref ? quiz.ref.label : "course book")),
          el("a", { class: "btn ghost", href: `quizzes.html?c=${quiz.slug}`, text: "All quizzes" }))),
        el("h2", { class: "mt", text: "Review your answers" }),
        ...quiz.qs.map((q, i) => C.qView(q, i, at.ans[i], () => { }, true)));
      window.scrollTo(0, 0);
    }
    draw();
  }

  // ------------------------------------------------------------------ past questions
  C.pastQs = (slug) => [...((B().courses[slug] || {}).pq || []), ...S.get("pq:custom", []).filter((p) => p.slug === slug)].map((p) => ({ ...p, slug }));
  function pastqPage() {
    const u = C.requireUser(), main = $("#main");
    const staff = C.isStaff(u), e = C.enrol(u);
    const mine = staff ? C.staffCourses(u) : [...e.current, ...e.retro];
    const scope = C.Q.get("c") || "mine";
    main.append(el("div", { class: "crumb" }, el("a", { href: staff ? "staff.html" : "dashboard.html", text: "Home" }), " / Past questions"),
      el("div", { class: "btns between" }, el("h1", { text: "Past questions bank" }), staff ? el("button", { class: "btn", onclick: () => addPq(mine) }, icon("plus"), "Add a past question") : null),
      el("p", { class: "muted", text: "Past examination questions with marking guides, by course and year. Practise an answer, compare it with the guide, or ask the AI assistant to explain what the examiner is looking for." }),
      el("div", { class: "banner" }, icon("flag", "i lg"), el("div", { class: "small", text: "Sample questions written for the prototype. CODeL would load its own past papers and marking guides here." })));
    const cSel = el("select", { class: "input", "aria-label": "Course" }, el("option", { value: "mine", text: staff ? "All my courses" : "My courses (this and last semester)" }), el("option", { value: "all", text: "All CODeL courses" }),
      ...Object.values(C.D.courses).map((c) => el("option", { value: c.slug, text: `${c.code} ${c.title}`, selected: c.slug === scope })));
    if (scope === "all") cSel.value = "all";
    const ySel = el("select", { class: "input", "aria-label": "Year" }, el("option", { value: "", text: "All years" }), ...["2025", "2024", "2023"].map((y) => el("option", { value: y, text: y })));
    const q = el("input", { class: "input", type: "search", placeholder: "Search question text", "aria-label": "Search question text" });
    const out = el("div", { class: "stack" });
    main.append(el("div", { class: "toolbar" }, cSel, ySel, q), out);
    const draw = () => {
      const sl = cSel.value === "mine" ? mine : cSel.value === "all" ? Object.keys(C.D.courses) : [cSel.value];
      let rows = sl.flatMap((s) => C.pastQs(s));
      if (ySel.value) rows = rows.filter((r) => r.year === ySel.value);
      if (q.value.trim()) { const v = q.value.trim().toLowerCase(); rows = rows.filter((r) => r.text.toLowerCase().includes(v) || C.course(r.slug).code.toLowerCase().includes(v)); }
      out.replaceChildren(el("div", { class: "small muted", text: `${rows.length} question${rows.length === 1 ? "" : "s"}` + (rows.length > 60 ? " · showing the first 60; narrow the search to see more" : "") }), ...rows.slice(0, 60).map(pqCard));
    };
    [cSel, ySel].forEach((x) => x.addEventListener("change", draw)); q.addEventListener("input", draw); draw();
    function pqCard(p) {
      const c = C.course(p.slug), ud = C.ud(u), key = "pqans:" + p.id;
      const guide = el("div", { class: "guide", hidden: true }, el("b", { text: "Marking guide. " }), p.guide);
      const ta = el("textarea", { class: "input ta", rows: 5, placeholder: "Write your answer here. It is saved on this device.", "aria-label": "Your practice answer" }); ta.value = ud.get(key, "");
      const saved = el("span", { class: "tiny muted" });
      ta.addEventListener("input", () => { ud.set(key, ta.value); saved.textContent = "Saved"; });
      const practice = el("div", { class: "practice", hidden: true }, ta, el("div", { class: "btns between" }, saved, el("button", { class: "btn sec sm", onclick: () => { guide.hidden = false; C.say("Compare your answer with the marking guide."); }, text: "Compare with the guide" })));
      const canAI = C.access(p.slug, u) === "full" || staff;
      return el("article", { class: "card pad pq" },
        el("div", { class: "pqh" }, el("span", { class: "pill", text: c.code }), el("span", { class: "pill grey", text: `${p.year} · ${p.sem} semester · Question ${p.q}` }), el("span", { class: "pill grey", text: p.marks + " marks" })),
        el("div", { class: "pqt" }, ...p.text.split("\n").map((l) => el("p", { text: l }))),
        el("div", { class: "btns" },
          el("button", { class: "btn sec sm", onclick: (e) => { guide.hidden = !guide.hidden; e.currentTarget.textContent = guide.hidden ? "Show marking guide" : "Hide marking guide"; }, text: "Show marking guide" }),
          el("button", { class: "btn sec sm", onclick: () => { practice.hidden = !practice.hidden; if (!practice.hidden) ta.focus(); } }, icon("pen"), "Practise"),
          el("a", { class: "btn ghost sm", href: `reader.html?c=${p.slug}&u=${p.unit}` }, icon("book"), "Read Unit " + p.unit),
          canAI ? el("a", { class: "btn ghost sm", href: `ai.html?c=${p.slug}&pq=${encodeURIComponent(p.id)}` }, icon("spark"), "Ask AI") : null),
        guide, practice);
    }
  }
  async function addPq(mine) {
    const cs = el("select", { class: "input" }, ...mine.map((s) => el("option", { value: s, text: `${C.course(s).code} ${C.course(s).title}` })));
    const yr = el("select", { class: "input" }, ...["2025", "2024", "2023"].map((y) => el("option", { value: y, text: y })));
    const sem = el("select", { class: "input" }, el("option", { text: "First" }), el("option", { text: "Second" }));
    const qn = el("input", { class: "input", type: "number", min: 1, value: 1 }), marks = el("input", { class: "input", type: "number", min: 1, value: 15 });
    const unit = el("select", { class: "input" }, ...[1, 2, 3, 4, 5].map((n) => el("option", { value: n, text: "Unit " + n })));
    const text = el("textarea", { class: "input ta", rows: 5 }), guide = el("textarea", { class: "input ta", rows: 3 });
    const f = (l, x) => el("div", { class: "field" }, el("label", { text: l }), x);
    const r = await C.modal({ title: "Add a past question", wide: true, body: el("div", { class: "stack" }, f("Course", cs), el("div", { class: "g3" }, f("Year", yr), f("Semester", sem), f("Question number", qn)), el("div", { class: "g2" }, f("Marks", marks), f("Unit", unit)), f("Question", text), f("Marking guide", guide)),
      actions: [{ label: "Cancel", cls: "ghost", id: null }, { label: "Add to bank", value: () => (text.value.trim() && guide.value.trim() ? { id: `${C.course(cs.value).code}-${yr.value}-Q${qn.value}-${Date.now().toString(36)}`, slug: cs.value, year: yr.value, sem: sem.value, q: qn.value, marks: +marks.value, unit: +unit.value, text: text.value.trim(), guide: guide.value.trim(), by: C.me().id } : (C.say("Write the question and the marking guide."), false)) }] });
    if (!r) return; const all = S.get("pq:custom", []); all.push(r); S.set("pq:custom", all); C.say("Added to the past questions bank."); setTimeout(() => location.reload(), 500);
  }

  // ------------------------------------------------------------------ online exams
  const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
  C.seededExams = (slug) => {
    const t = today0();
    return [
      { id: "mid-" + slug, course: slug, title: "Mid-semester online quiz", dur: 20, n: 8, opens: t - 3 * DAY, closes: t + 5 * DAY - 1, release: "submit", seeded: true, instr: "Answer all questions. The quiz counts for 10% of the continuous assessment mark." },
      { id: "mock-" + slug, course: slug, title: "End-of-semester mock examination", dur: 45, n: 10, opens: t + 9 * DAY + 9 * 3600000, closes: t + 11 * DAY, release: "close", seeded: true, instr: "A practice run for the end-of-semester examination. It does not count towards your grade." },
    ];
  };
  C.examList = (slugs) => {
    const cfg = S.get("examcfg", {});
    const stored = S.get("exams", []);
    const list = [...(slugs || Object.keys(C.D.courses)).flatMap(C.seededExams), ...stored.filter((x) => !slugs || slugs.includes(x.course))];
    return list.filter((x) => !(cfg[x.id] && cfg[x.id].deleted)).map((x) => ({ ...x, ...(cfg[x.id] || {}) }));
  };
  C.examById = (id) => { const m = id.match(/^(mid|mock)-(.+)$/); return C.examList(m ? [m[2]] : undefined).find((x) => x.id === id) || null; };
  C.examQs = (x, uid) => {
    const qs = x.qs || C.shuffle(C.pool(x.course), x.id).slice(0, x.n);
    return C.shuffle(qs.map((q, i) => ({ ...q, _i: i })), x.id + ":" + uid);
  };
  C.examState = (x) => { const now = Date.now(); return now < x.opens ? "upcoming" : now > x.closes ? "closed" : "open"; };
  const subsKey = (id) => "examsubs:" + id;
  C.examSubs = (x) => {
    const real = S.get(subsKey(x.id), {});
    if (!x.seeded || x.id.startsWith("mock")) return real;
    // simulated class submissions so staff views have data (clearly labelled in the UI)
    const sim = {}, r = C.rand("sim" + x.id), roster = C.roster(x.course);
    roster.forEach((s) => {
      if (real[s.id] || s.id === "9925010001" || r() > 0.62) return;
      const total = x.n, score = Math.min(total, Math.max(0, Math.round(total * (0.35 + r() * 0.6))));
      const st = x.opens + Math.floor(r() * (Math.min(Date.now(), x.closes) - x.opens - 30 * MIN));
      sim[s.id] = { start: st, end: st + Math.floor((6 + r() * 13) * MIN), score, total, status: "submitted", events: r() > 0.85 ? [{ k: "hidden", at: st + 5 * MIN }] : [], sim: true };
    });
    return { ...sim, ...real };
  };
  const released = (x, sub) => x.release === "submit" || (x.release === "close" && Date.now() > x.closes) || x.released;
  C.examActive = (u = C.me()) => { if (!u) return null; const a = S.get("examActive:" + u.id, null); if (!a) return null; const x = C.examById(a.id); if (!x) return null; const s = S.get(subsKey(x.id), {})[u.id]; if (!s || s.status !== "in") return null; if (Date.now() > s.start + x.dur * MIN + 5000) return null; return x; };

  function examsPage() {
    const u = C.requireUser(), main = $("#main");
    const staff = C.isStaff(u);
    main.append(el("div", { class: "crumb" }, el("a", { href: staff ? "staff.html" : "dashboard.html", text: "Home" }), " / Online exams"));
    if (!staff) return studentExams(u, main);
    if (!["t", "c", "a"].includes(u.r)) { main.append(el("h1", { text: "Online exams" }), el("p", { text: "Exams are managed by tutors and course coordinators." })); return; }
    staffExams(u, main);
  }
  function studentExams(u, main) {
    const e = C.enrol(u), list = C.examList(e.current).sort((a, b) => a.opens - b.opens);
    main.append(el("h1", { text: "Online exams and timed quizzes" }),
      el("p", { class: "muted", text: "Timed assessments set by your tutors. Each has an opening window, a time limit and one attempt. The AI assistant is switched off while an exam is in progress." }));
    const groups = { open: [], upcoming: [], done: [], closed: [] };
    list.forEach((x) => { const s = S.get(subsKey(x.id), {})[u.id]; const st = C.examState(x); if (s && s.status === "submitted") groups.done.push([x, s]); else groups[st].push([x, s]); });
    const sec = (t, arr, empty) => el("section", {}, el("div", { class: "sech" }, el("h2", { text: t }), el("span", { class: "small muted", text: String(arr.length) })),
      arr.length ? el("div", { class: "stack" }, ...arr.map(([x, s]) => examRow(u, x, s))) : el("p", { class: "small muted", text: empty }));
    main.append(sec("Open now", groups.open, "No exams are open at the moment."), sec("Upcoming", groups.upcoming, "Nothing scheduled."), sec("Submitted", groups.done, "You have not submitted any exams yet."), sec("Closed", groups.closed, "None."));
  }
  function examRow(u, x, s) {
    const c = C.course(x.course), st = C.examState(x);
    let right;
    if (s && s.status === "submitted") right = released(x, s) ? el("div", { class: "score" }, el("b", { text: Math.round(s.score / s.total * 100) + "%" }), el("span", { class: "tiny muted", text: `${s.score}/${s.total}` })) : el("span", { class: "pill grey", text: "Results after " + C.fmtTime(x.closes) });
    else if (st === "open") right = el("a", { class: "btn" + (s && s.status === "in" ? " red" : ""), href: `exam.html?e=${encodeURIComponent(x.id)}` }, s && s.status === "in" ? "Resume" : "Start");
    else if (st === "upcoming") right = el("span", { class: "pill", text: "Opens " + C.fmtTime(x.opens) });
    else right = el("span", { class: "pill red", text: "Missed" });
    return el("div", { class: "card pad exrow" }, el("div", { class: "exi" }, icon("timer", "i lg")),
      el("div", { class: "ext" }, el("div", { class: "label", text: c.code }), el("h3", { text: x.title }),
        el("div", { class: "small muted", text: `${x.dur} minutes · ${x.qs ? x.qs.length : x.n} questions · ${st === "upcoming" ? "window " + C.fmtTime(x.opens) + " to " + C.fmtTime(x.closes) : "closes " + C.fmtTime(x.closes)}` })),
      el("div", { class: "exr" }, right));
  }
  function staffExams(u, main) {
    const mine = C.staffCourses(u);
    const sel = el("select", { class: "input", "aria-label": "Course" }, ...mine.map((s) => el("option", { value: s, text: `${C.course(s).code} ${C.course(s).title}`, selected: s === C.Q.get("c") })));
    const out = el("div", { class: "stack" });
    main.append(el("div", { class: "btns between" }, el("h1", { text: "Online exams" }), el("button", { class: "btn", onclick: () => createExam(u, sel.value) }, icon("plus"), "Schedule an exam")),
      el("p", { class: "muted", text: "Schedule timed exams, follow submissions and integrity events, and release results." }),
      el("div", { class: "toolbar" }, sel), out);
    const draw = () => {
      const list = C.examList([sel.value]).sort((a, b) => a.opens - b.opens), roster = C.roster(sel.value);
      out.replaceChildren(...list.map((x) => {
        const subs = C.examSubs(x), done = Object.values(subs).filter((s) => s.status === "submitted"), flagged = Object.values(subs).filter((s) => (s.events || []).some((e) => e.k === "hidden")).length;
        const avg = done.length ? Math.round(done.reduce((a, s) => a + s.score / s.total, 0) / done.length * 100) : null;
        return el("div", { class: "card pad" }, el("div", { class: "btns between" }, el("div", {}, el("div", { class: "label", text: C.examState(x) }), el("h3", { text: x.title })),
          el("div", { class: "btns" }, el("button", { class: "btn sec sm", onclick: () => showSubs(x) }, icon("list"), "Submissions"),
            x.release === "manual" ? el("button", { class: "btn sm" + (x.released ? " sec" : ""), onclick: () => { setCfg(x.id, { released: !x.released }); draw(); C.say(x.released ? "Results hidden." : "Results released to students."); } }, x.released ? "Hide results" : "Release results") : null,
            el("a", { class: "btn ghost sm", href: `exam.html?e=${encodeURIComponent(x.id)}&preview=1` }, icon("eye"), "Preview"),
            el("button", { class: "btn ghost sm red-t", onclick: async () => { if (await C.confirm("Remove this exam?", "Students will no longer see it. Existing submissions are kept in the log.", "Remove", "red")) { setCfg(x.id, { deleted: true }); draw(); } } }, icon("trash"), "Remove"))),
          el("div", { class: "small muted", text: `${C.fmtTime(x.opens)} to ${C.fmtTime(x.closes)} · ${x.dur} min · ${x.qs ? x.qs.length : x.n} questions · results ${x.release === "submit" ? "on submission" : x.release === "close" ? "after closing" : "when released"}` }),
          el("div", { class: "kpis" }, kpi("Registered", roster.length), kpi("Submitted", done.length), kpi("Average", avg == null ? "–" : avg + "%"), kpi("Left the page", flagged)));
      }));
    };
    sel.addEventListener("change", draw); draw();
  }
  const kpi = (l, v) => el("div", { class: "kpi" }, el("b", { text: v }), el("span", { text: l }));
  const setCfg = (id, patch) => { const cfg = S.get("examcfg", {}); cfg[id] = { ...(cfg[id] || {}), ...patch }; S.set("examcfg", cfg); };
  function showSubs(x) {
    const subs = C.examSubs(x), rows = Object.entries(subs).sort((a, b) => (b[1].end || 0) - (a[1].end || 0));
    const csv = () => {
      const lines = [["Index number", "Name", "Centre", "Started", "Submitted", "Minutes", "Score", "Total", "Left page"].join(",")].concat(rows.map(([id, s]) => {
        const st = C.userById[id.toLowerCase()] || { n: id, c: "" };
        return [id, `"${st.n}"`, C.centre(st.c), new Date(s.start).toISOString(), s.end ? new Date(s.end).toISOString() : "", s.end ? Math.round((s.end - s.start) / MIN) : "", s.score ?? "", s.total ?? "", (s.events || []).filter((e) => e.k === "hidden").length].join(",");
      }));
      const a = el("a", { href: URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" })), download: x.id + "-results.csv" }); document.body.append(a); a.click(); a.remove();
    };
    C.modal({ title: "Submissions: " + x.title, wide: true, body: el("div", {},
      rows.some(([, s]) => s.sim) ? el("p", { class: "tiny muted", text: "Most rows are simulated for the demonstration; rows without “(sim)” come from attempts made on this device." }) : null,
      el("div", { class: "tablewrap" }, el("table", { class: "t" }, el("tr", {}, ...["Student", "Centre", "Submitted", "Time", "Score", "Integrity"].map((h) => el("th", { text: h }))),
        ...rows.map(([id, s]) => { const st = C.userById[id.toLowerCase()] || { n: id, c: "" }; const hid = (s.events || []).filter((e) => e.k === "hidden").length;
          return el("tr", {}, el("td", {}, el("b", { text: st.n }), el("div", { class: "tiny muted", text: id + (s.sim ? " (sim)" : "") })), el("td", { text: C.centre(st.c) }), el("td", { text: s.end ? C.fmtTime(s.end) : "In progress" }),
            el("td", { class: "n", text: s.end ? Math.round((s.end - s.start) / MIN) + " min" : "–" }), el("td", { class: "n", text: s.score != null ? `${s.score}/${s.total}` : "–" }),
            el("td", {}, hid ? el("span", { class: "pill red", text: `Left page ${hid}×` }) : el("span", { class: "pill ok", text: "None" }))); })))),
      actions: [{ label: "Download CSV", cls: "sec", value: () => (csv(), false) }, { label: "Close", id: null }] });
  }
  async function createExam(u, slug) {
    const title = el("input", { class: "input", value: "Unit test", "aria-label": "Title" });
    const instr = el("textarea", { class: "input ta", rows: 2 }); instr.value = "Answer all questions. You have one attempt.";
    const pad = (n) => String(n).padStart(2, "0"), dl = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
    const opens = el("input", { class: "input", type: "datetime-local", value: dl(Date.now() - 5 * MIN) }), closes = el("input", { class: "input", type: "datetime-local", value: dl(Date.now() + 2 * DAY) });
    const dur = el("input", { class: "input", type: "number", min: 5, max: 180, value: 15 });
    const rel = el("select", { class: "input" }, el("option", { value: "submit", text: "Show score on submission" }), el("option", { value: "close", text: "After the exam closes" }), el("option", { value: "manual", text: "When I release them" }));
    const picker = C.pickQuestions(slug, C.pool(slug).slice(0, 5));
    const f = (l, x) => el("div", { class: "field" }, el("label", { text: l }), x);
    const r = await C.modal({ title: "Schedule an exam: " + C.course(slug).code, wide: true, body: el("div", { class: "stack" }, f("Title", title), f("Instructions", instr),
      el("div", { class: "g3" }, f("Opens", opens), f("Closes", closes), f("Time limit (minutes)", dur)), f("Results", rel), picker),
      actions: [{ label: "Cancel", cls: "ghost", id: null }, { label: "Schedule exam", value: () => {
        const qs = picker.read(), o = new Date(opens.value).getTime(), c = new Date(closes.value).getTime();
        if (!title.value.trim()) return C.say("Give the exam a title."), false; if (!qs.length) return C.say("Select at least one question."), false;
        if (!(c > o)) return C.say("The closing time must be after the opening time."), false;
        return { id: C.uid("ex"), course: slug, title: title.value.trim(), instr: instr.value.trim(), dur: Math.max(1, +dur.value || 15), opens: o, closes: c, release: rel.value, qs, by: u.id, created: Date.now() };
      } }] });
    if (!r) return;
    const all = S.get("exams", []); all.push(r); S.set("exams", all); C.say("Exam scheduled. Registered students are notified."); setTimeout(() => location.reload(), 600);
  }

  // ------------------------------------------------------------------ exam runner
  function examRunner() {
    const u = C.requireUser(), main = $("#main");
    const x = C.examById(C.Q.get("e") || "");
    if (!x) { main.append(el("h1", { text: "Exam not found" }), el("a", { class: "btn", href: "exams.html", text: "Back to exams" })); return; }
    const c = C.course(x.course), preview = C.isStaff(u);
    const qs = C.examQs(x, u.id);
    const subs = () => S.get(subsKey(x.id), {}), putSub = (s) => { const all = subs(); all[u.id] = s; S.set(subsKey(x.id), all); };
    let sub = subs()[u.id];
    main.append(el("div", { class: "crumb" }, el("a", { href: "exams.html", text: "Online exams" }), " / " + c.code));
    const st = C.examState(x);
    if (!preview && C.access(x.course, u) !== "full") { main.append(el("h1", { text: x.title }), el("p", { text: "This exam is for students registered for the course this semester." })); return; }
    if (sub && sub.status === "submitted") return done(sub);
    if (!preview && st !== "open") { main.append(el("h1", { text: x.title }), el("p", { class: "muted", text: st === "upcoming" ? "This exam opens " + C.fmtTime(x.opens) + "." : "This exam closed " + C.fmtTime(x.closes) + "." }), el("a", { class: "btn sec", href: "exams.html", text: "Back to exams" })); return; }
    if (!sub) {
      main.append(el("div", { class: "card pad exintro" }, el("div", { class: "label", text: c.code + " · " + c.title }), el("h1", { text: x.title }), x.instr ? el("p", { text: x.instr }) : null,
        el("ul", { class: "rules" }, el("li", { text: `Time limit: ${x.dur} minutes, starting when you press Start. The timer keeps running if you leave the page.` }),
          el("li", { text: `${qs.length} questions. One attempt only. Answers are saved as you go.` }),
          el("li", { text: "The exam is submitted automatically when time runs out or the window closes (" + C.fmtTime(x.closes) + ")." }),
          el("li", { text: "The AI assistant, notes panel and forums are switched off while the exam is in progress." }),
          el("li", { text: "Leaving this page or switching apps is recorded and reported to your tutor." })),
        preview ? el("div", { class: "banner" }, icon("eye", "i lg"), el("div", { class: "small", text: "Staff preview: nothing you answer is recorded." })) : null,
        el("label", { class: "ck" }, el("input", { type: "checkbox", id: "agree" }), el("span", { text: "I will work on my own and follow the University’s examination regulations." })),
        el("div", { class: "btns" }, el("button", { class: "btn red", id: "startx", onclick: () => {
          if (!$("#agree").checked) return C.say("Tick the declaration to start.");
          sub = { start: Date.now(), ans: {}, status: "in", events: [{ k: "start", at: Date.now() }] };
          if (!preview) { putSub(sub); S.set("examActive:" + u.id, { id: x.id, at: Date.now() }); C.log(u, "exam-start", { e: x.id }); }
          run();
        } }, icon("timer"), "Start the exam"), el("a", { class: "btn ghost", href: "exams.html", text: "Not now" }))));
      return;
    }
    sub.events.push({ k: "resume", at: Date.now() }); putSub(sub); run();

    function run() {
      main.replaceChildren();
      document.body.classList.add("exam-on");
      const end = Math.min(sub.start + x.dur * MIN, x.closes);
      const timer = el("div", { class: "xtimer", role: "timer", "aria-live": "off" });
      const bar = el("div", { class: "xbar" }, el("div", { class: "xt" }, el("b", { text: x.title }), el("span", { class: "tiny", text: c.code + (preview ? " · preview" : "") })), timer,
        el("button", { class: "btn red sm", onclick: () => submit(false) }, "Submit"));
      const list = el("div", { class: "stack" });
      main.append(bar, el("div", { class: "banner flat" }, icon("shield", "i lg"), el("div", { class: "small", text: "Exam in progress. Answers are saved automatically. Leaving the page is recorded." })), list);
      qs.forEach((q, i) => list.append(C.qView(q, i, sub.ans[q._i], (v) => { sub.ans[q._i] = v; sub.saved = Date.now(); if (!preview) putSub(sub); })));
      list.append(el("div", { class: "btns" }, el("button", { class: "btn red", onclick: () => submit(false) }, icon("check"), "Submit my answers")));
      let warned = false;
      const tick = () => {
        const left = end - Date.now();
        if (left <= 0) { clearInterval(iv); return submit(true); }
        const m = Math.floor(left / MIN), s = Math.floor(left % MIN / 1000);
        timer.textContent = `${m}:${String(s).padStart(2, "0")} left`;
        timer.classList.toggle("low", left < 2 * MIN);
        if (left < 2 * MIN && !warned) { warned = true; C.say("Two minutes left. Your answers are saved."); }
      };
      const iv = setInterval(tick, 500); tick();
      const onHide = () => { if (document.hidden && !preview) { sub.events.push({ k: "hidden", at: Date.now() }); putSub(sub); } else if (!document.hidden) C.say("Leaving the exam page has been recorded."); };
      document.addEventListener("visibilitychange", onHide);
      window.onbeforeunload = () => "Your exam is in progress. Your answers are saved and the timer keeps running.";
      run.stop = () => { clearInterval(iv); document.removeEventListener("visibilitychange", onHide); window.onbeforeunload = null; document.body.classList.remove("exam-on"); };
    }
    async function submit(auto) {
      if (!auto) {
        const left = qs.filter((q) => !answered(sub.ans[q._i])).length;
        if (!(await C.confirm("Submit your exam?", (left ? `${left} question${left > 1 ? "s are" : " is"} not answered. ` : "") + "You cannot change your answers after submitting.", "Submit", "red"))) return;
      }
      run.stop && run.stop();
      const score = qs.reduce((a, q) => a + C.qMark(q, sub.ans[q._i]), 0);
      Object.assign(sub, { status: "submitted", end: Date.now(), score, total: qs.length }); sub.events.push({ k: auto ? "auto-submit" : "submit", at: Date.now() });
      if (!preview) { putSub(sub); S.del("examActive:" + u.id); C.log(u, "exam-submit", { e: x.id }); }
      main.replaceChildren(el("div", { class: "crumb" }, el("a", { href: "exams.html", text: "Online exams" }), " / " + c.code));
      done(sub, auto);
    }
    function done(s, auto) {
      const rel = released(x, s) || preview;
      main.append(el("div", { class: "card pad result " + (rel ? (s.score / s.total >= 0.5 ? "pass" : "fail") : "") }, el("div", { class: "label", text: c.code + " · " + x.title }),
        el("h1", { text: auto ? "Time is up: your exam was submitted" : "Exam submitted" }),
        el("p", { text: `Submitted ${C.fmtTime(s.end)} · receipt ${(C.hashNum(u.id + x.id + s.end) % 1e8).toString().padStart(8, "0")}` }),
        rel ? el("div", { class: "big", text: Math.round(s.score / s.total * 100) + "%" }) : el("p", { class: "small", text: x.release === "close" ? "Results are released after the exam closes on " + C.fmtTime(x.closes) + "." : "Your tutor will release the results." }),
        rel ? el("p", { text: `${s.score} of ${s.total} correct` }) : null,
        el("div", { class: "btns" }, el("a", { class: "btn", href: "exams.html", text: "Back to exams" }), el("a", { class: "btn sec", href: "dashboard.html", text: "Dashboard" }))));
      if (rel && (x.release === "submit" || preview)) {
        main.append(el("h2", { class: "mt", text: "Review" }), ...qs.map((q, i) => C.qView(q, i, s.ans[q._i], () => { }, true)));
      }
    }
  }

  C.ready(() => {
    const p = C.page;
    if (p === "quizzes") quizzesPage();
    else if (p === "quiz") quizRunner();
    else if (p === "pastq") pastqPage();
    else if (p === "exams") examsPage();
    else if (p === "exam") examRunner();
  });
})();
