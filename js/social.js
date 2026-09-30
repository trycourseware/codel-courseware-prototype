// Course discussion forums (native) and student-built study groups (workspaces).
(function () {
  "use strict";
  const { el, icon, $, $$, store: S } = C;
  const HOUR = 3600000, DAY = 86400000;
  const who = (id) => C.userById[String(id).toLowerCase()] || { n: id, id, r: "s" };
  const initials = (n) => n.split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase();
  const av = (id, cls = "") => { const p = who(id); return el("span", { class: "avatar sm " + (p.r !== "s" ? "staff " : "") + cls, "aria-hidden": "true", text: initials(p.n) }); };
  const nameTag = (id) => { const p = who(id); return el("span", { class: "who" }, el("b", { text: p.n }), p.r !== "s" ? el("span", { class: "pill tiny-pill", text: C.roleName(p) }) : null); };
  const multiline = (t) => t.split(/\n+/).map((l) => el("p", { text: l }));

  // ------------------------------------------------------------------ forum data
  const fkey = (slug) => "forum:" + slug;
  C.forum = (slug) => {
    let f = S.get(fkey(slug), null);
    if (!f) { f = seedForum(slug); S.set(fkey(slug), f); }
    return f;
  };
  const saveForum = (slug, f) => S.set(fkey(slug), f);
  function seedForum(slug) {
    const c = C.course(slug), tutor = C.tutorsFor(slug)[0], roster = C.roster(slug).filter((s) => s.id !== "9925010001");
    const r = C.rand("forum" + slug), pick = () => roster[Math.floor(r() * roster.length)] || { id: "STF-H001" };
    const t0 = Date.now() - 12 * DAY, T = [];
    const post = (by, at, text, extra = {}) => ({ id: C.uid("p"), by: by.id || by, at, text, helpful: [], flags: [], ...extra });
    if (tutor) T.push({ id: "t-welcome", unit: 0, title: `Welcome to ${c.code}: read this first`, by: tutor.id, at: t0, pinned: true, posts: [
      post(tutor, t0, `Welcome to ${c.title}. Your course book is on the course page; read Unit 1 this week and take the Unit 1 self-check in Quizzes.\nAsk questions about each unit in the unit threads so that everyone benefits from the answers. I reply within two working days.`, { official: true })] });
    const a = pick(), b = pick(), d = pick();
    T.push({ id: "t-u1", unit: 1, title: "Unit 1: how should we use the learning outcomes?", by: a.id, at: t0 + 2 * DAY, posts: [
      post(a, t0 + 2 * DAY, "Please, are the learning outcomes in section 1.2 what the exam questions are based on? I want to plan my revision."),
      post(b, t0 + 2 * DAY + 5 * HOUR, "I think so. I rewrite each outcome as a question and answer it without looking at the book.", { helpful: [a.id] }),
      ...(tutor ? [post(tutor, t0 + 3 * DAY, "Good question. Examination questions test the learning outcomes, so b’s approach is a sound one. Also practise the past questions for this course in the Past questions bank.", { official: true, helpful: [a.id, b.id] })] : [])] });
    T.push({ id: "t-u2", unit: 2, title: "Unit 2 activity: sharing our three questions", by: d.id, at: t0 + 6 * DAY, posts: [
      post(d, t0 + 6 * DAY, "Here are my three questions for the Unit 2 activity. 1) How do the key concepts connect to Unit 1? 2) Which principle is most useful in a rural school? 3) How would you explain it to a colleague?"),
      post(a, t0 + 7 * DAY, "For question 2, I think the worked example in section 2.4 shows it clearly. Anyone else?")] });
    T.push({ id: "t-gen", unit: 0, title: "Study-centre tutorial this Saturday", by: b.id, at: t0 + 9 * DAY, posts: [
      post(b, t0 + 9 * DAY, "Is anyone from my study centre attending the Saturday tutorial? We could meet at 8:30 to revise Unit 2 before it starts.")] });
    return T;
  }

  function forumPage() {
    const u = C.requireUser(), main = $("#main");
    const slug = C.Q.get("c") && C.course(C.Q.get("c")) ? C.Q.get("c") : (C.enrol(u).current[0] || C.staffCourses(u)[0]);
    const c = C.course(slug), acc = C.access(slug, u);
    const isTutor = (u.r === "t" || u.r === "c") && (u.cs || []).includes(slug) || u.r === "a";
    const canPost = acc === "full" || isTutor;
    main.append(el("div", { class: "crumb" }, el("a", { href: "programmes.html", text: "Programmes" }), " / ", el("a", { href: `course-${slug}.html`, text: c.code }), " / Discussion"));
    if (acc === "preview") { main.append(el("h1", { text: `${c.code} discussion` }), el("div", { class: "banner warn" }, icon("lock", "i lg"), el("div", { class: "small", text: "The course discussion is open to students registered for this course this semester and their tutors." }))); return; }
    if (C.examActive(u) && !C.isStaff(u)) { main.append(el("h1", { text: "Discussion paused" }), el("p", { text: "Forums are switched off while your online exam is in progress." }), el("a", { class: "btn", href: `exam.html?e=${C.examActive(u).id}`, text: "Return to the exam" })); return; }
    const tid = C.Q.get("t");
    if (tid) return threadView(u, slug, tid, canPost, isTutor, main);
    const f = C.forum(slug);
    const unitSel = el("select", { class: "input", "aria-label": "Filter by unit" }, el("option", { value: "", text: "All topics" }), el("option", { value: "0", text: "General" }), ...[1, 2, 3, 4, 5].map((n) => el("option", { value: n, text: "Unit " + n, selected: C.Q.get("u") == n })));
    const q = el("input", { class: "input", type: "search", placeholder: "Search discussions", "aria-label": "Search discussions" });
    const list = el("div", { class: "tlist" });
    main.append(el("div", { class: "btns between" }, el("div", {}, el("div", { class: "label", text: c.code }), el("h1", { text: "Course discussion" })),
      canPost ? el("button", { class: "btn", onclick: () => newThread(u, slug, isTutor) }, icon("plus"), "Start a discussion") : null),
      acc === "retro" ? el("div", { class: "banner warn" }, icon("eye", "i lg"), el("div", { class: "small", text: "Read-only: you can read this discussion during your retrospective access period but not post." })) : null,
      el("p", { class: "small muted", text: `Open to the ${C.roster(slug).length} students registered this semester and the course tutors. Be respectful; tutors moderate reported posts.` }),
      el("div", { class: "toolbar" }, unitSel, q), list);
    const draw = () => {
      let ts = C.forum(slug).slice();
      if (unitSel.value !== "") ts = ts.filter((t) => String(t.unit) === unitSel.value);
      const v = q.value.trim().toLowerCase(); if (v) ts = ts.filter((t) => t.title.toLowerCase().includes(v) || t.posts.some((p) => p.text.toLowerCase().includes(v)));
      ts.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.posts[b.posts.length - 1].at - a.posts[a.posts.length - 1].at);
      list.replaceChildren(...(ts.length ? ts.map((t) => {
        const last = t.posts[t.posts.length - 1], answeredByTutor = t.posts.some((p) => p.official);
        return el("a", { class: "trow", href: `forum.html?c=${slug}&t=${t.id}` }, av(t.by),
          el("div", { class: "tt" }, el("div", { class: "tl" }, t.pinned ? el("span", { class: "pill red", text: "Pinned" }) : null, t.locked ? el("span", { class: "pill grey", text: "Locked" }) : null, el("b", { text: t.title })),
            el("div", { class: "tiny muted", text: `${t.unit ? "Unit " + t.unit : "General"} · started by ${who(t.by).n} · last post ${C.ago(last.at)}` })),
          el("div", { class: "tm" }, el("span", { class: "pill grey" }, icon("chat", "i sm"), String(t.posts.length - 1)), answeredByTutor ? el("span", { class: "pill ok" }, icon("check", "i sm"), "Tutor answered") : null));
      }) : [el("p", { class: "muted small pad", text: "No discussions match." })]));
    };
    unitSel.addEventListener("change", draw); q.addEventListener("input", draw); draw();
  }
  async function newThread(u, slug, isTutor) {
    const title = el("input", { class: "input", placeholder: "A clear title, e.g. Unit 2: meaning of …", "aria-label": "Title" });
    const unit = el("select", { class: "input", "aria-label": "Unit" }, el("option", { value: 0, text: "General" }), ...[1, 2, 3, 4, 5].map((n) => el("option", { value: n, text: "Unit " + n })));
    const text = el("textarea", { class: "input ta", rows: 6, "aria-label": "Message" });
    const pin = el("input", { type: "checkbox" });
    const r = await C.modal({ title: "Start a discussion", body: el("div", { class: "stack" }, el("div", { class: "field" }, el("label", { text: "Title" }), title), el("div", { class: "field" }, el("label", { text: "Topic" }), unit),
      el("div", { class: "field" }, el("label", { text: "Message" }), text), isTutor ? el("label", { class: "ck" }, pin, el("span", { text: "Pin this discussion and send it as an announcement" })) : null),
      actions: [{ label: "Cancel", cls: "ghost", id: null }, { label: "Post", value: () => (title.value.trim() && text.value.trim() ? true : (C.say("Write a title and a message."), false)) }] });
    if (!r) return;
    const f = C.forum(slug), t = { id: C.uid("t"), unit: +unit.value, title: title.value.trim(), by: u.id, at: Date.now(), pinned: pin.checked, posts: [{ id: C.uid("p"), by: u.id, at: Date.now(), text: text.value.trim(), helpful: [], flags: [], official: isTutor }] };
    f.push(t); saveForum(slug, f);
    if (pin.checked) { const an = S.get("announce:" + slug, []); an.push({ id: C.uid("a"), by: u.id, text: t.title, at: Date.now() }); S.set("announce:" + slug, an); }
    C.log(u, "forum-post", { c: slug });
    location.href = `forum.html?c=${slug}&t=${t.id}`;
  }
  function threadView(u, slug, tid, canPost, isTutor, main) {
    const c = C.course(slug);
    const box = el("div");
    main.append(box);
    const draw = () => {
      const f = C.forum(slug), t = f.find((x) => x.id === tid);
      if (!t) { box.replaceChildren(el("p", { text: "This discussion was not found." })); return; }
      const upd = (fn) => { const f2 = C.forum(slug), t2 = f2.find((x) => x.id === tid); fn(t2); saveForum(slug, f2); draw(); };
      const posts = t.posts.map((p, i) => {
        if (p.hidden && !isTutor && p.by !== u.id) return el("div", { class: "post hidden-post small muted", text: "This post was hidden by a moderator." });
        const mine = p.by === u.id, helped = p.helpful.includes(u.id);
        const acts = el("div", { class: "pacts" });
        if (canPost && !mine) acts.append(el("button", { class: "btn ghost sm" + (helped ? " on" : ""), "aria-pressed": String(helped), onclick: () => upd((t2) => { const pp = t2.posts.find((x) => x.id === p.id); const k = pp.helpful.indexOf(u.id); if (k >= 0) pp.helpful.splice(k, 1); else pp.helpful.push(u.id); }) }, icon("thumb", "i sm"), `Helpful${p.helpful.length ? " · " + p.helpful.length : ""}`));
        else if (p.helpful.length) acts.append(el("span", { class: "tiny muted" }, icon("thumb", "i sm"), ` ${p.helpful.length} found this helpful`));
        if (canPost && !t.locked) acts.append(el("button", { class: "btn ghost sm", onclick: () => { const ta = $("#reply"); ta.value = `@${who(p.by).n.split(" ")[0]} `; ta.focus(); } }, icon("chat", "i sm"), "Reply"));
        if (mine && i > 0 && !C.isStaff(u) && Date.now() - p.at < 30 * 60000) acts.append(el("button", { class: "btn ghost sm", onclick: async () => { if (await C.confirm("Delete your post?", "You can delete a post within 30 minutes of posting.", "Delete", "red")) upd((t2) => { t2.posts = t2.posts.filter((x) => x.id !== p.id); }); } }, icon("trash", "i sm"), "Delete"));
        if (!mine && canPost && !isTutor) acts.append(el("button", { class: "btn ghost sm", onclick: () => report(p) }, icon("flag", "i sm"), p.flags.some((f) => f.by === u.id) ? "Reported" : "Report"));
        if (isTutor) {
          acts.append(el("button", { class: "btn ghost sm", onclick: () => upd((t2) => { const pp = t2.posts.find((x) => x.id === p.id); pp.official = !pp.official; }) }, icon("check", "i sm"), p.official ? "Unmark answer" : "Mark as tutor answer"),
            el("button", { class: "btn ghost sm red-t", onclick: () => upd((t2) => { const pp = t2.posts.find((x) => x.id === p.id); pp.hidden = !pp.hidden; if (pp.hidden) pp.flags = []; }) }, icon("eye", "i sm"), p.hidden ? "Unhide" : "Hide"));
          if (p.flags.length) acts.append(el("button", { class: "btn ghost sm", onclick: () => upd((t2) => { t2.posts.find((x) => x.id === p.id).flags = []; }) }, "Dismiss reports"));
        }
        return el("article", { class: "post" + (p.official ? " official" : "") + (p.hidden ? " hid" : ""), id: p.id }, av(p.by),
          el("div", { class: "pb" }, el("div", { class: "ph" }, nameTag(p.by), el("span", { class: "tiny muted", text: C.fmtTime(p.at) }), p.official ? el("span", { class: "pill ok" }, icon("check", "i sm"), "Tutor answer") : null,
            isTutor && p.flags.length ? el("span", { class: "pill red", text: `Reported ${p.flags.length}× · ${p.flags.map((f) => f.reason).join(", ")}` }) : null, p.hidden ? el("span", { class: "pill grey", text: "Hidden" }) : null),
            el("div", { class: "ptext" }, ...multiline(p.text)), acts));
      });
      function report(p) {
        if (p.flags.some((f) => f.by === u.id)) return C.say("You have already reported this post.");
        const sel = el("select", { class: "input" }, ...["Disrespectful or abusive", "Off-topic or spam", "Academic dishonesty (sharing exam answers)", "Personal information", "Other"].map((x) => el("option", { text: x })));
        C.modal({ title: "Report this post", body: el("div", { class: "stack" }, el("p", { class: "small", text: "Reports go to the course tutors. The author is not told who reported the post." }), sel),
          actions: [{ label: "Cancel", cls: "ghost", id: null }, { label: "Report", cls: "red", value: () => sel.value }] })
          .then((reason) => { if (reason) { upd((t2) => t2.posts.find((x) => x.id === p.id).flags.push({ by: u.id, reason, at: Date.now() })); C.say("Thank you. The tutors will review this post."); } });
      }
      const reply = el("textarea", { class: "input ta", id: "reply", rows: 4, placeholder: "Write a reply", "aria-label": "Reply" });
      box.replaceChildren(
        el("div", { class: "btns between" }, el("div", {}, el("div", { class: "label", text: `${c.code} · ${t.unit ? "Unit " + t.unit : "General"}` }), el("h1", { text: t.title })),
          el("div", { class: "btns" }, el("a", { class: "btn ghost sm", href: `forum.html?c=${slug}` }, icon("back"), "All discussions"),
            isTutor ? el("button", { class: "btn sec sm", onclick: () => upd((t2) => { t2.pinned = !t2.pinned; }) }, icon("pin"), t.pinned ? "Unpin" : "Pin") : null,
            isTutor ? el("button", { class: "btn sec sm", onclick: () => upd((t2) => { t2.locked = !t2.locked; }) }, icon("lock"), t.locked ? "Unlock" : "Lock") : null)),
        el("div", { class: "posts" }, ...posts),
        t.locked ? el("div", { class: "banner" }, icon("lock", "i lg"), el("div", { class: "small", text: "This discussion is locked by a tutor." }))
          : canPost ? el("div", { class: "card pad replybox" }, reply, el("div", { class: "btns between" }, el("span", { class: "tiny muted", text: "Be kind and specific. Do not share answers to assessed work." }),
            el("button", { class: "btn", onclick: () => { const v = reply.value.trim(); if (!v) return C.say("Write your reply first."); upd((t2) => t2.posts.push({ id: C.uid("p"), by: u.id, at: Date.now(), text: v, helpful: [], flags: [], official: isTutor })); C.log(u, "forum-reply", { c: slug }); C.say("Reply posted."); } }, icon("send"), "Post reply")))
            : null);
    };
    draw();
  }

  // ------------------------------------------------------------------ study groups
  C.groups = () => { seedGroups(); return S.get("groups", []); };
  const saveGroups = (g) => S.set("groups", g);
  function seedGroups() {
    if (S.get("groups", null)) return;
    const ama = C.userById["9925010001"], e = ama ? C.enrol(ama) : { current: [] };
    const G = [], now = Date.now();
    const classmates = (slug, n, seed) => C.shuffle(C.roster(slug).filter((s) => s.id !== "9925010001"), seed).slice(0, n).map((s) => s.id);
    if (e.current.length) {
      const s0 = e.current.find((s) => /DJBI|science/i.test(C.course(s).code + C.course(s).title)) || e.current[0];
      const m = classmates(s0, 5, "g1");
      G.push({ id: "g-circle", name: `${C.course(s0).code} study circle`, desc: "We revise one unit a week, share notes and quiz each other before the Saturday tutorial.", course: s0, owner: "9925010001", admins: ["9925010001"], members: ["9925010001", ...m], invites: [], privacy: "invite", created: now - 10 * DAY,
        chat: [{ id: C.uid("m"), by: m[0], at: now - 2 * DAY, text: "Good evening all. Shall we do Unit 2 this week?" }, { id: C.uid("m"), by: "9925010001", at: now - 2 * DAY + HOUR, text: "Yes please. I have added my Unit 1 summary to the shared notes." },
          { id: C.uid("m"), by: m[1], at: now - DAY, text: "Thank you Ama. I found the worked example in 2.4 hard; can we go through it on Thursday?" }],
        notes: { text: "UNIT 1 SUMMARY (Ama)\n- Section 1.3 key ideas: learn the definitions first.\n- Rewrite each learning outcome as a question.\n\nUNIT 2 (to do)\n- ", by: "9925010001", at: now - 2 * DAY },
        resources: [{ id: C.uid("r"), title: "Unit 1 key ideas", href: `reader.html?c=${s0}&u=1&s=3`, by: "9925010001", at: now - 3 * DAY }, { id: C.uid("r"), title: "Past questions for this course", href: `pastq.html?c=${s0}`, by: m[0], at: now - 3 * DAY }],
        meetings: [{ id: C.uid("e"), title: "Unit 2 revision (online)", at: new Date(new Date(now + 2 * DAY).setHours(19, 0, 0, 0)).getTime(), dur: 60, where: "WhatsApp video call", by: "9925010001", rsvp: ["9925010001", m[0], m[1]] }] });
      const s1 = e.current[1] || s0, m2 = classmates(s1, 6, "g2");
      G.push({ id: "g-winneba", name: "Winneba weekend revision group", desc: "Students at the Winneba study centre who meet after the Saturday tutorial.", course: s1, owner: m2[0], admins: [m2[0]], members: m2, invites: ["9925010001"], privacy: "invite", created: now - 4 * DAY,
        chat: [{ id: C.uid("m"), by: m2[0], at: now - 3 * DAY, text: "Welcome everyone. We meet in Room 4 after the tutorial." }], notes: { text: "", by: m2[0], at: now - 4 * DAY }, resources: [], meetings: [] });
      e.current.slice(2, 4).forEach((s, i) => { const mm = classmates(s, 4, "g3" + i); if (mm.length) G.push({ id: "g-open-" + i, name: `${C.course(s).code} past questions practice`, desc: "Open group: we attempt one past question every week and compare answers with the marking guide.", course: s, owner: mm[0], admins: [mm[0]], members: mm, invites: [], privacy: "open", created: now - 6 * DAY, chat: [], notes: { text: "", by: mm[0], at: now - 6 * DAY }, resources: [{ id: C.uid("r"), title: "Past questions", href: `pastq.html?c=${s}`, by: mm[0], at: now - 6 * DAY }], meetings: [] }); });
    }
    saveGroups(G);
  }
  const updGroup = (id, fn) => { const all = C.groups(), g = all.find((x) => x.id === id); if (!g) return null; fn(g); saveGroups(all); return g; };
  const classmatesOf = (u) => { const ids = new Set(); C.enrol(u).current.forEach((s) => C.roster(s).forEach((x) => ids.add(x.id))); ids.delete(u.id); return [...ids].map(who); };

  function groupsPage() {
    const u = C.requireUser(), main = $("#main");
    if (C.isStaff(u)) { main.append(el("h1", { text: "Study groups" }), el("p", { text: "Study groups are private workspaces created by students. Staff do not see their content." })); return; }
    const all = C.groups(), e = C.enrol(u);
    const mine = all.filter((g) => g.members.includes(u.id)), inv = all.filter((g) => g.invites.includes(u.id)), open = all.filter((g) => g.privacy === "open" && !g.members.includes(u.id) && (!g.course || e.current.includes(g.course)));
    main.append(el("div", { class: "crumb" }, el("a", { href: "dashboard.html", text: "Home" }), " / Study groups"),
      el("div", { class: "btns between" }, el("h1", { text: "Study groups" }), el("button", { class: "btn", onclick: () => createGroup(u) }, icon("plus"), "Create a group")),
      el("p", { class: "muted", text: "Your own workspaces, separate from the course discussion: invite classmates, chat, keep shared notes, collect resources and plan meetings. Tutors do not see study-group content." }));
    if (inv.length) main.append(el("div", { class: "sech" }, el("h2", { text: "Invitations" })), el("div", { class: "stack" }, ...inv.map((g) => el("div", { class: "card pad grow" }, el("div", {}, el("h3", { text: g.name }), el("div", { class: "small muted", text: `Invited by ${who(g.owner).n} · ${g.members.length} members${g.course ? " · " + C.course(g.course).code : ""}` })),
      el("div", { class: "btns" }, el("button", { class: "btn sm", onclick: () => { updGroup(g.id, (x) => { x.invites = x.invites.filter((i) => i !== u.id); x.members.push(u.id); x.chat.push({ id: C.uid("m"), by: "system", at: Date.now(), text: `${u.n} joined the group.` }); }); location.href = "group.html?g=" + g.id; } }, "Accept"),
        el("button", { class: "btn ghost sm", onclick: () => { updGroup(g.id, (x) => { x.invites = x.invites.filter((i) => i !== u.id); }); C.say("Invitation declined."); setTimeout(() => location.reload(), 400); } }, "Decline"))))));
    main.append(el("div", { class: "sech" }, el("h2", { text: "My groups" }), el("span", { class: "small muted", text: String(mine.length) })),
      mine.length ? el("div", { class: "grid g-progs" }, ...mine.map((g) => groupCard(g, u))) : el("p", { class: "muted small", text: "You are not in any group yet. Create one and invite classmates by index number." }));
    main.append(el("div", { class: "sech" }, el("h2", { text: "Open groups in your courses" })),
      open.length ? el("div", { class: "grid g-progs" }, ...open.map((g) => groupCard(g, u, true))) : el("p", { class: "muted small", text: "No open groups at the moment." }));
  }
  function groupCard(g, u, join) {
    const next = (g.meetings || []).filter((m) => m.at > Date.now()).sort((a, b) => a.at - b.at)[0];
    return el("div", { class: "card gcard" }, el("div", { class: "gtop" }, el("div", { class: "gav", text: initials(g.name) }), el("div", {}, el("h3", { text: g.name }), el("div", { class: "tiny muted", text: `${g.members.length} members · ${g.privacy === "open" ? "open" : "invite only"}${g.course ? " · " + C.course(g.course).code : ""}` }))),
      el("p", { class: "small", text: g.desc }),
      next ? el("div", { class: "small" }, icon("cal", "i sm"), ` ${next.title}, ${C.fmtTime(next.at)}`) : null,
      el("div", { class: "avs" }, ...g.members.slice(0, 6).map((m) => av(m)), g.members.length > 6 ? el("span", { class: "tiny muted", text: "+" + (g.members.length - 6) }) : null),
      join ? el("button", { class: "btn sec sm", onclick: () => { updGroup(g.id, (x) => { x.members.push(u.id); x.chat.push({ id: C.uid("m"), by: "system", at: Date.now(), text: `${u.n} joined the group.` }); }); location.href = "group.html?g=" + g.id; } }, "Join group")
        : el("a", { class: "btn sm", href: "group.html?g=" + g.id }, "Open workspace"));
  }
  function memberPicker(u, exclude = []) {
    const mates = classmatesOf(u).filter((m) => !exclude.includes(m.id));
    const chosen = [];
    const inp = el("input", { class: "input", placeholder: "Type an index number or name", "aria-label": "Invite by index number or name", autocomplete: "off" });
    const sug = el("div", { class: "sugg" }), chips = el("div", { class: "pills" });
    const drawChips = () => chips.replaceChildren(...chosen.map((id) => el("span", { class: "pill" }, who(id).n + " · " + id, el("button", { class: "chipx", "aria-label": "Remove", onclick: () => { chosen.splice(chosen.indexOf(id), 1); drawChips(); } }, "×"))));
    const add = (id) => { if (!chosen.includes(id)) chosen.push(id); inp.value = ""; sug.replaceChildren(); drawChips(); };
    inp.addEventListener("input", () => {
      const v = inp.value.trim().toLowerCase(); sug.replaceChildren(); if (v.length < 2) return;
      const hits = mates.filter((m) => m.id.includes(v) || m.n.toLowerCase().includes(v)).slice(0, 6);
      const exact = C.userById[v];
      if (!hits.length && exact && exact.r === "s" && exact.id !== u.id) hits.push(exact);
      sug.append(...hits.map((m) => el("button", { type: "button", class: "sg", onclick: () => add(m.id) }, el("b", { text: m.n }), el("span", { class: "tiny muted", text: ` ${m.id} · ${C.centre(m.c)} · ${C.prog(m.p).short} L${m.l}` }))));
      if (!hits.length) sug.append(el("div", { class: "tiny muted pad0", text: "No classmate matches. Type the full 10-digit index number to invite any student." }));
    });
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); const b = sug.querySelector(".sg"); if (b) b.click(); } });
    const node = el("div", { class: "stack" }, inp, sug, chips, el("div", { class: "tiny muted", text: `${mates.length} classmates share at least one course with you.` }));
    node.read = () => chosen.slice();
    return node;
  }
  async function createGroup(u) {
    const name = el("input", { class: "input", "aria-label": "Group name", placeholder: "e.g. Unit 3 revision team" });
    const desc = el("textarea", { class: "input ta", rows: 2, "aria-label": "Purpose", placeholder: "What will the group do?" });
    const course = el("select", { class: "input", "aria-label": "Linked course" }, el("option", { value: "", text: "Not linked to a course" }), ...C.enrol(u).current.map((s) => el("option", { value: s, text: `${C.course(s).code} ${C.course(s).title}` })));
    const priv = el("select", { class: "input", "aria-label": "Who can join" }, el("option", { value: "invite", text: "Invite only" }), el("option", { value: "open", text: "Open to students in the linked course" }));
    const mp = memberPicker(u);
    const f = (l, x) => el("div", { class: "field" }, el("label", { text: l }), x);
    const r = await C.modal({ title: "Create a study group", wide: true, body: el("div", { class: "stack" }, f("Name", name), f("Purpose", desc), el("div", { class: "g2" }, f("Course", course), f("Who can join", priv)), f("Invite classmates", mp)),
      actions: [{ label: "Cancel", cls: "ghost", id: null }, { label: "Create group", value: () => (name.value.trim() ? true : (C.say("Give the group a name."), false)) }] });
    if (!r) return;
    const g = { id: C.uid("g"), name: name.value.trim(), desc: desc.value.trim() || "Study group", course: course.value || null, owner: u.id, admins: [u.id], members: [u.id], invites: mp.read(), privacy: priv.value, created: Date.now(),
      chat: [{ id: C.uid("m"), by: "system", at: Date.now(), text: `${u.n} created the group.` }], notes: { text: "", by: u.id, at: Date.now() }, resources: [], meetings: [] };
    const all = C.groups(); all.push(g); saveGroups(all); C.log(u, "group-create");
    location.href = "group.html?g=" + g.id;
  }

  function groupPage() {
    const u = C.requireUser(), main = $("#main");
    const gid = C.Q.get("g");
    let g = C.groups().find((x) => x.id === gid);
    if (!g || !g.members.includes(u.id)) { main.append(el("h1", { text: "Group not available" }), el("p", { class: "muted", text: "This study group does not exist or you are not a member." }), el("a", { class: "btn", href: "groups.html", text: "Study groups" })); return; }
    const isAdmin = () => g.admins.includes(u.id);
    let tab = location.hash.slice(1) || "chat";
    const head = el("div"), tabs = el("nav", { class: "tabs gtabs", "aria-label": "Workspace" }), body = el("div", { class: "gbody" });
    main.append(el("div", { class: "crumb" }, el("a", { href: "groups.html", text: "Study groups" }), " / " + g.name), head, tabs, body);
    const refresh = () => { g = C.groups().find((x) => x.id === gid); };
    const drawHead = () => head.replaceChildren(el("div", { class: "gtop" }, el("div", { class: "gav lg", text: initials(g.name) }), el("div", {}, el("h1", { text: g.name }),
      el("div", { class: "small muted", text: `${g.members.length} members · ${g.privacy === "open" ? "open group" : "invite only"}${g.course ? " · " + C.course(g.course).code + " " + C.course(g.course).title : ""}` }), el("p", { class: "small", text: g.desc }))));
    const T = [["chat", "Chat", "chat"], ["notes", "Shared notes", "note"], ["res", "Resources", "link"], ["meet", "Meetings", "cal"], ["members", "Members", "users"]];
    const drawTabs = () => tabs.replaceChildren(...T.map(([k, t, ic]) => el("a", { href: "#" + k, class: k === tab ? "on" : "", onclick: (e) => { e.preventDefault(); tab = k; history.replaceState(null, "", "#" + k); drawTabs(); draw(); } }, icon(ic, "i sm"), t)));
    function draw() {
      refresh(); drawHead();
      if (tab === "chat") {
        const log = el("div", { class: "chat", "aria-live": "polite" }, ...(g.chat.length ? g.chat.map((m) => m.by === "system" ? el("div", { class: "sys tiny muted", text: m.text + " · " + C.fmtTime(m.at) })
          : el("div", { class: "msg" + (m.by === u.id ? " me" : "") }, m.by === u.id ? null : av(m.by), el("div", { class: "bub" }, el("div", { class: "tiny" }, el("b", { text: m.by === u.id ? "You" : who(m.by).n }), " · " + C.fmtTime(m.at)), el("div", { text: m.text })))) : [el("p", { class: "muted small pad", text: "No messages yet. Say hello." })]));
        const inp = el("textarea", { class: "input ta", rows: 2, placeholder: "Message the group", "aria-label": "Message" });
        const send = () => { const v = inp.value.trim(); if (!v) return; updGroup(gid, (x) => x.chat.push({ id: C.uid("m"), by: u.id, at: Date.now(), text: v })); draw(); setTimeout(() => { const c = $(".chat"); c.scrollTop = c.scrollHeight; $(".gbody textarea").focus(); }, 10); };
        inp.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
        body.replaceChildren(el("div", { class: "card chatcard" }, log, el("div", { class: "chatin" }, inp, el("button", { class: "btn", "aria-label": "Send", onclick: send }, icon("send")))),
          el("p", { class: "tiny muted", text: "Group chat is for study support. Sharing answers to assessed work is academic misconduct." }));
        setTimeout(() => (log.scrollTop = log.scrollHeight), 0);
      } else if (tab === "notes") {
        const ta = el("textarea", { class: "input ta notes-ed", rows: 16, "aria-label": "Shared notes" }); ta.value = g.notes.text;
        const status = el("span", { class: "tiny muted", text: g.notes.text ? `Last edited by ${g.notes.by === u.id ? "you" : who(g.notes.by).n}, ${C.ago(g.notes.at)}` : "Nobody has written anything yet." });
        let tmr; ta.addEventListener("input", () => { status.textContent = "Saving…"; clearTimeout(tmr); tmr = setTimeout(() => { updGroup(gid, (x) => { x.notes = { text: ta.value, by: u.id, at: Date.now() }; }); status.textContent = "Saved · everyone in the group sees this"; }, 500); });
        body.replaceChildren(el("div", { class: "card pad stack" }, el("div", { class: "btns between" }, el("h2", { text: "Shared notes" }), status), ta,
          el("div", { class: "btns" }, el("button", { class: "btn sec sm", onclick: () => { const a = el("a", { href: URL.createObjectURL(new Blob([ta.value], { type: "text/plain" })), download: g.name.replace(/\W+/g, "-") + "-notes.txt" }); document.body.append(a); a.click(); a.remove(); } }, icon("dl"), "Download notes"))));
      } else if (tab === "res") {
        body.replaceChildren(el("div", { class: "btns between" }, el("h2", { text: "Resources" }), el("button", { class: "btn sm", onclick: addRes }, icon("plus"), "Add a resource")),
          g.resources.length ? el("div", { class: "clist" }, ...g.resources.map((r) => el("div", { class: "resrow" }, icon(/reader/.test(r.href) ? "book" : /pastq/.test(r.href) ? "archive" : "link"), el("a", { href: r.href, target: /^https?:/.test(r.href) ? "_blank" : null, rel: "noopener", text: r.title }),
            el("span", { class: "tiny muted", text: `${who(r.by).n.split(" ")[0]} · ${C.ago(r.at)}` }), r.by === u.id || isAdmin() ? el("button", { class: "icon-btn dark sm", "aria-label": "Remove", onclick: () => { updGroup(gid, (x) => { x.resources = x.resources.filter((y) => y.id !== r.id); }); draw(); } }, icon("x")) : null)))
            : el("p", { class: "muted small", text: "Share course-book pages, past questions or useful links." }));
      } else if (tab === "meet") {
        const up = g.meetings.slice().sort((a, b) => a.at - b.at);
        body.replaceChildren(el("div", { class: "btns between" }, el("h2", { text: "Meetings" }), el("button", { class: "btn sm", onclick: addMeet }, icon("plus"), "Schedule a meeting")),
          up.length ? el("div", { class: "stack" }, ...up.map((m) => { const going = m.rsvp.includes(u.id), past = m.at + m.dur * 60000 < Date.now();
            return el("div", { class: "card pad grow" + (past ? " past" : "") }, el("div", { class: "mdate" }, el("b", { text: new Date(m.at).getDate() }), el("span", { text: new Date(m.at).toLocaleDateString("en-GB", { month: "short" }) })),
              el("div", { class: "grow1" }, el("h3", { text: m.title }), el("div", { class: "small muted", text: `${C.fmtTime(m.at)} · ${m.dur} min · ${m.where}` }), el("div", { class: "tiny", text: `${m.rsvp.length} going: ${m.rsvp.map((i) => (i === u.id ? "you" : who(i).n.split(" ")[0])).join(", ")}` })),
              past ? el("span", { class: "pill grey", text: "Past" }) : el("div", { class: "btns" }, el("button", { class: "btn sm" + (going ? " sec" : ""), onclick: () => { updGroup(gid, (x) => { const mm = x.meetings.find((y) => y.id === m.id); if (going) mm.rsvp = mm.rsvp.filter((i) => i !== u.id); else mm.rsvp.push(u.id); }); draw(); } }, going ? "Not going" : "I’m going"),
                el("button", { class: "btn ghost sm", onclick: () => ics(m) }, icon("cal", "i sm"), "Add to calendar"))); }))
            : el("p", { class: "muted small", text: "No meetings yet." }));
      } else if (tab === "members") {
        body.replaceChildren(el("div", { class: "btns between" }, el("h2", { text: "Members" }), el("button", { class: "btn sm", onclick: invite }, icon("plus"), "Invite classmates")),
          el("div", { class: "clist" }, ...g.members.map((id) => { const p = who(id);
            return el("div", { class: "resrow" }, av(id), el("div", { class: "grow1" }, el("b", { text: p.n + (id === u.id ? " (you)" : "") }), el("div", { class: "tiny muted", text: `${id} · ${C.centre(p.c)}${g.admins.includes(id) ? " · group admin" : ""}` })),
              isAdmin() && id !== u.id ? el("button", { class: "btn ghost sm red-t", onclick: async () => { if (await C.confirm("Remove member?", `Remove ${p.n} from the group?`, "Remove", "red")) { updGroup(gid, (x) => { x.members = x.members.filter((i) => i !== id); x.admins = x.admins.filter((i) => i !== id); x.chat.push({ id: C.uid("m"), by: "system", at: Date.now(), text: `${p.n} was removed from the group.` }); }); draw(); } } }, "Remove") : null); })),
          g.invites.length ? el("p", { class: "small muted", text: "Invited, not yet joined: " + g.invites.map((i) => who(i).n).join(", ") }) : null,
          el("div", { class: "btns mt" }, el("button", { class: "btn sec", onclick: leave }, "Leave group"), g.owner === u.id ? el("button", { class: "btn ghost red-t", onclick: del }, icon("trash"), "Delete group") : null));
      }
    }
    async function addRes() {
      const t = el("input", { class: "input", placeholder: "Title", "aria-label": "Title" });
      const kind = el("select", { class: "input", "aria-label": "Type" }, el("option", { value: "book", text: "Course-book page" }), el("option", { value: "url", text: "Web link" }));
      const cs = el("select", { class: "input", "aria-label": "Course" }, ...C.enrol(u).current.map((s) => el("option", { value: s, text: C.course(s).code + " " + C.course(s).title, selected: s === g.course })));
      const pg = el("input", { class: "input", type: "number", min: 1, value: 4, "aria-label": "Page" });
      const url = el("input", { class: "input", type: "url", placeholder: "https://", "aria-label": "Link" });
      const bookF = el("div", { class: "g2" }, el("div", { class: "field" }, el("label", { text: "Course" }), cs), el("div", { class: "field" }, el("label", { text: "Page" }), pg));
      const urlF = el("div", { class: "field", hidden: true }, el("label", { text: "Link" }), url);
      kind.addEventListener("change", () => { bookF.hidden = kind.value !== "book"; urlF.hidden = kind.value === "book"; });
      const r = await C.modal({ title: "Add a resource", body: el("div", { class: "stack" }, el("div", { class: "field" }, el("label", { text: "Title" }), t), el("div", { class: "field" }, el("label", { text: "Type" }), kind), bookF, urlF),
        actions: [{ label: "Cancel", cls: "ghost", id: null }, { label: "Add", value: () => {
          if (!t.value.trim()) return C.say("Give the resource a title."), false;
          if (kind.value === "url" && !/^https?:\/\/\S+\.\S+/.test(url.value.trim())) return C.say("Enter a full web address starting with https://"), false;
          return kind.value === "book" ? `reader.html?c=${cs.value}&p=${Math.max(1, +pg.value || 1)}` : url.value.trim();
        } }] });
      if (!r) return; updGroup(gid, (x) => x.resources.push({ id: C.uid("r"), title: t.value.trim(), href: r, by: u.id, at: Date.now() })); draw(); C.say("Resource added.");
    }
    async function addMeet() {
      const t = el("input", { class: "input", placeholder: "e.g. Unit 3 revision", "aria-label": "Title" });
      const d = new Date(Date.now() + DAY); d.setHours(19, 0, 0, 0);
      const pad = (n) => String(n).padStart(2, "0");
      const when = el("input", { class: "input", type: "datetime-local", value: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T19:00`, "aria-label": "When" });
      const dur = el("select", { class: "input", "aria-label": "Duration" }, ...[30, 60, 90, 120].map((m) => el("option", { value: m, text: m + " minutes", selected: m === 60 })));
      const where = el("input", { class: "input", value: "WhatsApp video call", "aria-label": "Where" });
      const f = (l, x) => el("div", { class: "field" }, el("label", { text: l }), x);
      const r = await C.modal({ title: "Schedule a meeting", body: el("div", { class: "stack" }, f("Title", t), el("div", { class: "g2" }, f("When", when), f("Duration", dur)), f("Where", where)),
        actions: [{ label: "Cancel", cls: "ghost", id: null }, { label: "Schedule", value: () => (t.value.trim() && when.value ? true : (C.say("Give a title and time."), false)) }] });
      if (!r) return;
      const m = { id: C.uid("e"), title: t.value.trim(), at: new Date(when.value).getTime(), dur: +dur.value, where: where.value.trim() || "To be confirmed", by: u.id, rsvp: [u.id] };
      updGroup(gid, (x) => { x.meetings.push(m); x.chat.push({ id: C.uid("m"), by: "system", at: Date.now(), text: `${u.n} scheduled “${m.title}” for ${C.fmtTime(m.at)}.` }); }); draw(); C.say("Meeting scheduled.");
    }
    function ics(m) {
      const f = (t) => new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
      const txt = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//CODeL Courseware prototype//EN", "BEGIN:VEVENT", "UID:" + m.id + "@codel-prototype", "DTSTAMP:" + f(Date.now()), "DTSTART:" + f(m.at), "DTEND:" + f(m.at + m.dur * 60000),
        "SUMMARY:" + m.title.replace(/[,;]/g, " ") + " (" + g.name.replace(/[,;]/g, " ") + ")", "LOCATION:" + m.where.replace(/[,;]/g, " "), "END:VEVENT", "END:VCALENDAR"].join("\r\n");
      const a = el("a", { href: URL.createObjectURL(new Blob([txt], { type: "text/calendar" })), download: "study-group-meeting.ics" }); document.body.append(a); a.click(); a.remove(); C.say("Calendar file downloaded.");
    }
    async function invite() {
      const mp = memberPicker(u, [...g.members, ...g.invites]);
      const r = await C.modal({ title: "Invite classmates", body: mp, actions: [{ label: "Cancel", cls: "ghost", id: null }, { label: "Send invitations", value: () => { const ids = mp.read(); return ids.length ? ids : (C.say("Choose at least one classmate."), false); } }] });
      if (!r) return; updGroup(gid, (x) => { x.invites.push(...r.filter((i) => !x.invites.includes(i) && !x.members.includes(i))); }); draw(); C.say(`${r.length} invitation${r.length > 1 ? "s" : ""} sent. They appear in the invitee’s notifications.`);
    }
    async function leave() {
      if (!(await C.confirm("Leave this group?", "You can rejoin only if a member invites you again" + (g.privacy === "open" ? " or you join the open group." : "."), "Leave"))) return;
      updGroup(gid, (x) => { x.members = x.members.filter((i) => i !== u.id); x.admins = x.admins.filter((i) => i !== u.id); if (!x.admins.length && x.members.length) x.admins.push(x.members[0]); if (x.owner === u.id && x.members.length) x.owner = x.members[0]; x.chat.push({ id: C.uid("m"), by: "system", at: Date.now(), text: `${u.n} left the group.` }); });
      const all = C.groups().filter((x) => x.members.length); saveGroups(all); location.href = "groups.html";
    }
    async function del() {
      if (!(await C.confirm("Delete this group?", "Chat, notes, resources and meetings will be removed for all members.", "Delete", "red"))) return;
      saveGroups(C.groups().filter((x) => x.id !== gid)); location.href = "groups.html";
    }
    drawTabs(); draw();
  }

  try { seedGroups(); } catch (e) { }
  C.ready(() => {
    if (C.page === "forum") forumPage();
    else if (C.page === "groups") groupsPage();
    else if (C.page === "group") groupPage();
  });
})();
