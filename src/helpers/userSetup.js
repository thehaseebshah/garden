const { fixFolderName } = require("./pathFixes");

function userMarkdownSetup(md) {
  // The md parameter stands for the markdown-it instance used throughout the site generator.
  // Feel free to add any plugin you want here instead of /.eleventy.js
}
function userEleventySetup(eleventyConfig) {
  // The eleventyConfig parameter stands for the the config instantiated in /.eleventy.js.
  // Feel free to add any plugin you want here instead of /.eleventy.js

  // Groups notes by their top-level folder for the homepage index:
  // [{ name: "Discipline", notes: [{ title, url }] }, ...]
  eleventyConfig.addFilter("notesByFolder", function (notes) {
    const folders = new Map();
    for (const note of notes || []) {
      if (!note.url || note.data.hide) {
        continue;
      }
      const parts = (note.filePathStem.split("notes/")[1] || "").split("/");
      const folder = parts.length > 1 ? fixFolderName(parts[0]) : "Other";
      if (!folders.has(folder)) {
        folders.set(folder, []);
      }
      folders.get(folder).push({
        title: note.data.title || note.fileSlug,
        url: note.url,
      });
    }
    const byName = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
    return [...folders.keys()]
      .sort((a, b) => (a === "Other") - (b === "Other") || byName(a, b))
      .map((name) => ({
        name,
        notes: folders.get(name).sort((a, b) => byName(a.title, b.title)),
      }));
  });
}
exports.userMarkdownSetup = userMarkdownSetup;
exports.userEleventySetup = userEleventySetup;
