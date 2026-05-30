/**
 * new.harvous.com: legacy /prototype/* bookmarks → same path without prefix.
 */
(function newHostPrototypeLegacyPaths() {
  if (typeof window === 'undefined') return;
  if (window.location.hostname !== 'new.harvous.com') return;
  var path = window.location.pathname;
  if (!path.startsWith('/prototype')) return;
  var rest = path.slice('/prototype'.length) || '/';
  if (rest.charAt(0) !== '/') rest = '/' + rest;
  window.location.replace(rest + window.location.search + window.location.hash);
})();
