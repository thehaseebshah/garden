# Tasks

Working list for the garden site. Check items off as they're done; add new ones at the bottom of a section.

## Status (2026-10-30)

Done and merged:
- PR #7: security fixes (search XSS), performance, homepage note index, a11y, SEO, feature fixes.
- PR #8: design pass (palette, type scale, note header, homepage cards, footer, 404).
- PR #9: light mode, backlinks, local + full graph, unpublished-link text, browser QA (`npm run qa`) in CI.

- PR #10: share image for link previews (`src/site/img/og-default.png`, `og:image` on every page); Giscus comments built (hidden until configured).
- PR #11: comments switched on. PR #12: email card removed from notes; contents list as a rail.
- PR #13: local graph zoom capped so labels stay readable.
- PR #14: browser QA runs in its own CI job alongside the deploy, so publishing from Obsidian goes live in a couple of minutes (it had grown to ~15); removed an accidental duplicate of "Q4 2026 Projects" under "+ Inbox".

Working agreement: PRs from this work are merged as soon as their checks pass, no need to ask.

## Comments (Giscus): on

Threaded comments are live on every note: stored as GitHub Discussions in this repo (category
"Announcements"), threaded replies, GitHub sign-in. Config is in `src/site/_data/giscus.json`;
a note opts out with `comments: false` in its front matter. The widget is bundled into
`src/site/scripts/vendor/giscus.js` (regenerate with `npm run vendor:giscus`).

- [x] Discussions enabled, giscus app installed, IDs filled in.
- [ ] Moderation: new comments appear under Discussions → Announcements; delete or lock threads there.
      Consider turning on GitHub notifications for the repo's Discussions so replies reach you.
- Note: the Obsidian plugin commits to `main` directly (often twice per publish: add, then move). If a
  note is moved in Obsidian, check the old path isn't left published (as happened with "+ Inbox").

## Owner tasks in Obsidian (can't be done from the repo)

- [ ] Set `dg-publish: false` on "Test_file_4" and "Tasks/Views/Today" (removed from the repo; the plugin would re-publish them).
- [ ] Digital Garden plugin settings: turn on "Show backlinks" and "Show local graph". The plugin rewrites `.env` on "update site settings", which would otherwise switch them off.
- [ ] Optional: rename the vault folder "Productivtiy" → "Productivity" (the site already fixes the URL and folder name in `src/helpers/pathFixes.js`).
- [ ] Links to unpublished notes now show as plain text ("Not published yet"). For each, publish the note or remove the link:
  - From "Setups/Pillars, Areas, Projects and Routines": About me/My Main Skills; Energy/Purpose Of Life; Keep/100 Year Timeline (Just Visualization); Keep/100 Year Timeline (Sep 2022); Keep/Apps and Tools for Daily Use (Old); Keep/Areas and Sub-Areas Of Life (Old); Keep/Areas of Life (Research); Keep/Core Life Values (Old); Keep/Core Life Values (Pre Jan 2025); Keep/Life Organization in Al Dimagh (Old); Keep/OPTIMUS & OPUM Goals; Keep/Our Life Management System; Keep/Purpose of Life (Pre Jan 2025); Keep/Roadmap (Aug 2022); Keep/Seven Focuses of Life (Old); Keep/The 100 Year Timeline (2018); Keep/The Purpose Of Life Itself (Old); Keep/Tools and Apps I am using (Pre January 2025); Keep/Ultimate Goals (Sep 2022)
  - From the note-taking notes: Ideas/Digital vs Analog Cal Newport; Ideas/Freestyle Productivity; Ideas/Example Use Cases of Notes (Old); Ideas/Old Research on PKM; Ideas/PARA Cons and the PKM Scam; Ideas/PARA Zettlekasten (Discarded Idea); Ideas/The CEPIDAM  Method (Old); Ideas/Zen to Done
  - From the planning notes: Productivtiy/Task Mgt and Planning System/All Brain Dump Sources; …/External Inboxes; …/Time Off
  - Others: Keep/Deep Pomo Checklist (from "Discipline/Rules"); 2026-02-24 daily note (from "Tech/Pixel 9A Phone is Final Decision"); Tech/Digital Tools I am Recommending and Why; Tech/My Online Accounts to Delete

## Later / ideas

- [x] Share image (`og:image`): branded 1200×630 card at `src/site/img/og-default.png`, declared on every page (`summary_large_image`).
- [ ] Growth labels ("seedling", "budding", "evergreen") from front matter, shown in the note header and on homepage cards.
- [ ] Style or remove leftover base-theme rules for the old right sidebar (graph/backlinks moved into the Connections section in PR #9).
- [ ] Product Sans font licence: confirm it may be self-hosted, or switch to an openly licensed font.
- [ ] Custom heading ids (`## Heading {#id}`) are ignored: `markdown-it-anchor` and `namedHeadingsFilter` both assign ids. Fixing it changes existing anchors, so only do it if needed.
