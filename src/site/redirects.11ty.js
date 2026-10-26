const { getNoteIndex } = require("../helpers/noteIndex");

// Old URLs that should keep working:
// - notes whose permalink is corrected by src/helpers/pathFixes.js
// - notes without a permalink, which used to live at "/notes/<path>/"
// Each old URL gets a small page that forwards to the new one.
function getRedirects() {
  const redirects = [];
  for (const note of getNoteIndex().values()) {
    const from = note.originalPermalink || `/notes/${note.notePath}/`;
    if (from.replace(/\/?$/, "/") !== note.permalink) {
      redirects.push({ from, to: note.permalink });
    }
  }
  return redirects;
}

function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

module.exports = class {
  data() {
    return {
      redirects: getRedirects(),
      pagination: { data: "redirects", size: 1, alias: "redirect" },
      permalink: (data) => `${data.redirect.from.replace(/\/?$/, "/")}index.html`,
      eleventyExcludeFromCollections: true,
    };
  }

  render({ redirect, meta }) {
    const to = escapeAttribute(redirect.to);
    const canonical = meta && meta.siteBaseUrl ? `${escapeAttribute(meta.siteBaseUrl)}${to}` : to;
    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="refresh" content="0; url=${to}">
    <link rel="canonical" href="${canonical}">
    <meta name="robots" content="noindex">
    <title>Page moved</title>
  </head>
  <body>
    <p>This page has moved to <a href="${to}">${to}</a>.</p>
  </body>
</html>
`;
  }
};
