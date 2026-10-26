const { getGraph } = require("../../helpers/linkUtils");
const { getFileTree } = require("../../helpers/filetreeUtils");
const { userComputed } = require("../../helpers/userUtils");

// The graph and file tree are the same for every page of a build, so compute
// them once per build (keyed on the build's note collection) instead of once per page.
const graphCache = new WeakMap();
const fileTreeCache = new WeakMap();

function memoizeByNotes(cache, compute) {
  return (data) => {
    const notes = data.collections && data.collections.note;
    if (!notes) {
      return compute(data);
    }
    if (!cache.has(notes)) {
      cache.set(notes, compute(data));
    }
    return cache.get(notes);
  };
}

module.exports = {
  graph: memoizeByNotes(graphCache, (data) => getGraph(data)),
  filetree: memoizeByNotes(fileTreeCache, (data) => getFileTree(data)),
  userComputed: (data) => userComputed(data)
};
