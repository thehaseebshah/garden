# Tasks

Working list for the garden site. Check items off as they're done; add new ones at the bottom of a section.

## Status (2026-10-26)

Done and merged:
- PR #7: security fixes (search XSS), performance, homepage note index, a11y, SEO, feature fixes.
- PR #8: design pass (palette, type scale, note header, homepage cards, footer, 404).
- PR #9: light mode, backlinks, local + full graph, unpublished-link text, browser QA (`npm run qa`) in CI.

Done in the next PR:
- [x] Share image for link previews (`src/site/img/og-default.png`, `og:image` on every page).
- [x] Threaded comments with Giscus, built and tested; **hidden until configured** (see below).

## Comments (Giscus): owner setup to switch them on

Comments are stored as GitHub Discussions in this repo; replies are threaded, readers sign in
with GitHub. The widget is bundled into `src/site/scripts/vendor/giscus.js` (giscus 1.6.0 + lit,
regenerate with `npm run vendor:giscus`), so no unpinned third-party script runs on the page.

- [ ] Enable Discussions: repo Settings → General → Features → Discussions.
- [ ] Create a discussion category for comments, e.g. "Comments", type **Announcement**
      (only Giscus/maintainers start threads; anyone can reply).
- [ ] Install the giscus app on this repo: https://github.com/apps/giscus
- [ ] On https://giscus.app enter `thehaseebshah/garden` and pick the category; copy the
      `data-repo-id` and `data-category-id` values.
- [ ] Fill in `src/site/_data/giscus.json` (`repo`, `repoId`, `category`, `categoryId`) and push.
      The comments section then appears below every note. A note can opt out with
      `comments: false` in its front matter.

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
