# CODeL Courseware: working prototype

**University of Education, Winneba · College for Distance and e-Learning (CODeL)**
Prepared by Dr Beatrice Torto and Dr Enusah Abdulai, September 2026.

> **Concept prototype, not an official UEW service.** Do not enter real UEW passwords. All people, index numbers, course-book text and questions are fictional samples. Programme and course titles come from CODeL's September 2026 course list.

## What it demonstrates

| Area | Features |
|---|---|
| Sign-in | 1,000 demo students across 16 study centres, plus tutors, course coordinators, study-centre coordinators, helpdesk officers and administrators (passwords stored only as salted SHA-256 hashes) |
| Course books | 164 books with fixed page numbers; **scroll view** and **flip-book view** (toggle); bookmarks, highlights, notes, search, read-aloud, night mode, text size; offline download; watermarked print copies (quota 2); read-only access for the previous semester |
| Quizzes | Orientation quiz, Unit 1 self-checks and "Know your course book" for every course; review with explanations; best score; tutors build and publish their own quizzes |
| Online exams | Timed, one attempt, autosave, auto-submit, integrity log (leaving the page), results release, submissions table and CSV export |
| Past questions | Bank with marking guides, filters, practice answers and "Ask AI" |
| AI study assistant | Reads the whole course book and past questions and cites unit, section and page; built-in offline assistant, or live Claude with a demonstrator's API key; switched off during exams |
| Discussion | Unit threads, replies, helpful votes, reporting, tutor answers, pin/lock/hide, announcements |
| Study groups | Student-built workspaces: invite by index number, chat, shared notes, resources, meetings (.ics), members |
| Staff and admin | Tutor moderation, coordinator edition publishing, centre reports, helpdesk lookup and tickets, admin reports, print log, user directory |

## How data are stored

This is a static site (GitHub Pages). The application layer runs in the browser, and all activity is saved in the browser's local storage, so several demo accounts can be tried on one device and a tutor sees what a student posted on the same device. **Profile > Reset the whole demo** clears everything. A production deployment would use the University's Moodle and a server-side API.

## Demo accounts

Accounts and passwords are in a private workbook held by the demonstrators; it is deliberately not in this repository. The sign-in page also offers **Sample student** and **Sample tutor** buttons.
