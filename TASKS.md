# Tasks

Working list for the garden site. Check items off as they're done; add new ones at the bottom of a section.

## Status (2026-10-26)

Done and merged:
- PR #7: security fixes (search XSS), performance, homepage note index, a11y, SEO, feature fixes.
- PR #8: design pass (palette, type scale, note header, homepage cards, footer, 404).

In review:
- [ ] **PR #9**: light mode, backlinks, local + full graph, unpublished-link text, browser QA (`npm run qa`) in CI.
      Open: https://github.com/thehaseebshah/garden/pull/9. Merge once CI (build + QA step) is green and the Codex reviews have no blocking findings.
      First run of the new CI QA step: watch that `npx playwright install --with-deps chromium` and `npm run qa` pass on GitHub's runner.

## Next: threaded comments with Giscus

Decision: **Giscus** (comments stored as GitHub Discussions in this repo; threaded replies and reactions; readers sign in with GitHub; no ads or tracking). The repo is public, which Giscus requires.

Owner setup (only the repo owner can do this):
- [ ] Enable Discussions: repo Settings → General → Features → Discussions.
- [ ] Create a discussion category for comments, e.g. "Comments", type **Announcement** (only Giscus/maintainers can start threads; anyone can reply).
- [ ] Install the giscus app on this repo: https://github.com/apps/giscus
- [ ] On https://giscus.app enter `thehaseebshah/garden`, pick the category and "pathname" mapping, then copy the `data-repo-id` and `data-category-id` values.

Implementation (code):
- [ ] Load the versioned web component from npm instead of the unversioned `giscus.app/client.js`, so it can be pinned with SRI like the other third-party scripts:
      `https://cdn.jsdelivr.net/npm/giscus@1.6.0/dist/giscus.mjs` (module script with `integrity`; compute the sha384 hash).
- [ ] Config via `.env`, so nothing renders until it's set up: `GISCUS_REPO`, `GISCUS_REPO_ID`, `GISCUS_CATEGORY`, `GISCUS_CATEGORY_ID` (read in `src/site/_data/meta.js`).
- [ ] New `src/site/_includes/components/comments.njk`, included in `layouts/note.njk` after the Connections section and before the contact card. Use `<giscus-widget>` with `mapping="pathname"`, `reactionsenabled="1"`, `inputposition="top"`, `loading="lazy"`, `lang="en"`.
- [ ] Theme: set the widget's `theme` from the current site theme (`dark` / `light`, or a custom CSS theme URL that matches the garden palette) and update it on the existing `garden:themechange` event.
- [ ] Style the section like the other cards in `src/site/styles/custom-style.scss`; check both themes and phone width.
- [ ] Optional: a per-note opt-out via front matter (e.g. `comments: false`).
- [ ] Extend `tests/qa.js`: comments section present on notes and absent from the homepage and 404 page; the widget's script is SRI-pinned; no console errors. (In CI the iframe needs network access to giscus.app; assert on our markup, not on the iframe's content.)
- [ ] Mention the new `.env` variables in `AGENTS.md`.

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
