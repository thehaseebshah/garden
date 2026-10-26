require("dotenv").config();
const settings = require("../../helpers/constants");
const { fixPermalink } = require("../../helpers/pathFixes");
const { defaultPermalink, getNoteByInputPath } = require("../../helpers/noteIndex");

const allSettings = settings.ALL_NOTE_SETTINGS;

module.exports = {
  eleventyComputed: {
    // Front matter title, else the file name (in the layout). Files named like
    // slugs ("lesson-01-logical-fallacies") use their leading "# Heading" instead;
    // in normally named notes a leading heading is often just the first section.
    title: (data) => {
      if (data.title) {
        return data.title;
      }
      if (!/^[a-z0-9]+(?:[-_][a-z0-9]+)+$/.test(data.page.fileSlug)) {
        return undefined;
      }
      const note = getNoteByInputPath(data.page.inputPath);
      return (note && note.leadingH1) || undefined;
    },
    layout: (data) => {
      if (data.tags.indexOf("gardenEntry") != -1) {
        return "layouts/index.njk";
      }
      return "layouts/note.njk";
    },
    permalink: (data) => {
      if (data.tags.indexOf("gardenEntry") != -1) {
        return "/";
      }
      if (data.permalink) {
        return fixPermalink(data.permalink);
      }
      // Notes published without a permalink get a clean slug URL instead of
      // "/notes/Folder/Note Name/"; the old URL redirects (src/site/redirects.11ty.js).
      return defaultPermalink(data.page.filePathStem);
    },
    settings: (data) => {
      const noteSettings = {};
      allSettings.forEach((setting) => {
        let noteSetting = data[setting];
        let globalSetting = process.env[setting];

        let settingValue =
          noteSetting || (globalSetting === "true" && noteSetting !== false);
        noteSettings[setting] = settingValue;
      });
      return noteSettings;
    },
  },
};
