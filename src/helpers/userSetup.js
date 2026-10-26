const { fixFolderName } = require("./pathFixes");

function userMarkdownSetup(md) {
  // The md parameter stands for the markdown-it instance used throughout the site generator.
  // Feel free to add any plugin you want here instead of /.eleventy.js
}
// Top-level folder of a note ("/notes/Discipline/Rules" -> "Discipline"), or "Other".
function getTopFolder(filePathStem) {
  const parts = ((filePathStem || "").split("notes/")[1] || "").split("/");
  return parts.length > 1 ? fixFolderName(parts[0]) : "Other";
}

function userEleventySetup(eleventyConfig) {
  // The eleventyConfig parameter stands for the the config instantiated in /.eleventy.js.
  // Feel free to add any plugin you want here instead of /.eleventy.js

  eleventyConfig.addFilter("noteFolder", getTopFolder);

  // Groups notes by their top-level folder for the homepage index:
  // [{ name: "Discipline", notes: [{ title, url }] }, ...]
  eleventyConfig.addFilter("notesByFolder", function (notes) {
    const folders = new Map();
    for (const note of notes || []) {
      if (!note.url || note.data.hide) {
        continue;
      }
      const folder = getTopFolder(note.filePathStem);
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

  // Notes linking to the page at `url`, from the site graph: [{ title, url }]
  eleventyConfig.addFilter("backlinksFor", function (graph, url) {
    const node = graph && graph.nodes && graph.nodes[url];
    if (!node) {
      return [];
    }
    return node.backLinks
      .map((backlink) => graph.nodes[backlink])
      .filter((linked) => linked && linked.url !== url && !linked.hide)
      .map((linked) => ({ title: linked.title, url: linked.url }))
      .sort((a, b) => a.title.localeCompare(b.title));
  });

  // Most recently updated notes for the homepage: [{ title, url, updated, folder, content }]
  eleventyConfig.addFilter("recentNotes", function (notes, limit = 6) {
    const timestamp = (note) => {
      const value = note.data.updated || note.data.created;
      const time = value ? new Date(value).getTime() : NaN;
      return isNaN(time) ? 0 : time;
    };
    return (notes || [])
      .filter((note) => note.url && !note.data.hide && timestamp(note) > 0)
      .sort((a, b) => timestamp(b) - timestamp(a))
      .slice(0, limit)
      .map((note) => ({
        title: note.data.title || note.fileSlug,
        url: note.url,
        updated: note.data.updated || note.data.created,
        folder: getTopFolder(note.filePathStem),
        content: note.templateContent,
      }));
  });
}
exports.userMarkdownSetup = userMarkdownSetup;
exports.userEleventySetup = userEleventySetup;
