/**
 * Fallback when edge redirect rules miss: new.harvous.com root → /prototype/.
 * Runs before the Vite bundle so TanStack Router sees the prototype path.
 */
(function newHostPrototypeRoot() {
  if (typeof window === 'undefined') return;
  if (window.location.hostname !== 'new.harvous.com') return;
  var path = window.location.pathname;
  if (path !== '/' && path !== '') return;
  var target = '/prototype/' + window.location.search + window.location.hash;
  window.location.replace(target);
})();
