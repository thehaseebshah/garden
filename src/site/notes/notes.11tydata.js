require("dotenv").config();
const settings = require("../../helpers/constants");
const { fixPermalink } = require("../../helpers/pathFixes");
const { defaultPermalink } = require("../../helpers/noteIndex");

const allSettings = settings.ALL_NOTE_SETTINGS;

module.exports = {
  eleventyComputed: {
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
