/**
 * Dedicated prototype host: legacy /prototype/* bookmarks → same path without prefix.
 */
(function newHostPrototypeLegacyPaths() {
  if (typeof window === 'undefined') return;
  var protoHosts = ['new.harvous.com', 'app.harvous.com'];
  if (protoHosts.indexOf(window.location.hostname) < 0) return;
  var path = window.location.pathname;
  if (!path.startsWith('/prototype')) return;
  var rest = path.slice('/prototype'.length) || '/';
  if (rest.charAt(0) !== '/') rest = '/' + rest;
  window.location.replace(rest + window.location.search + window.location.hash);
})();
