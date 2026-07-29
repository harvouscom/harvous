/**
 * Prototype shell path detection for pre-React boot scripts and the service worker.
 * Keep in sync with src/lib/prototype-path.ts.
 */
(function (global) {
  var DEDICATED_HOSTS = ['app.harvous.com', 'new.harvous.com', 'localhost'];
  var STATUS_HOST = 'status.harvous.com';
  var NON_PROTOTYPE_PREFIXES = [
    '/sign-in',
    '/sign-up',
    '/spaces/join',
    '/shared/',
    '/invitations/',
    '/addon',
    '/upgrade',
    '/status',
    '/api/',
  ];
  var RESERVED_SEGMENTS = {
    settings: 1,
    space: 1,
    search: 1,
    admin: 1,
    n: 1,
    new: 1,
    compose: 1,
    church: 1,
    challenges: 1,
    compete: 1,
    learn: 1,
    org: 1,
  };

  function isStatusHost(hostname) {
    return (hostname || '') === STATUS_HOST;
  }

  function isDedicatedPrototypeHost(hostname) {
    return DEDICATED_HOSTS.indexOf(hostname || '') >= 0;
  }

  function prototypeLogicalPath(pathname) {
    if (pathname.indexOf('/prototype') === 0) {
      var rest = pathname.slice('/prototype'.length);
      return rest || '/';
    }
    return pathname;
  }

  function isNonPrototypeAppPath(logical) {
    for (var i = 0; i < NON_PROTOTYPE_PREFIXES.length; i++) {
      var prefix = NON_PROTOTYPE_PREFIXES[i];
      if (logical === prefix || logical.indexOf(prefix) === 0) return true;
    }
    return false;
  }

  function singlePrototypeSegment(pathname, hostname) {
    var logical = prototypeLogicalPath(pathname);
    if (isNonPrototypeAppPath(logical)) return null;
    var trimmed = logical.replace(/^\/+/, '').replace(/\/+$/, '');
    if (trimmed === '' || trimmed.indexOf('/') >= 0) return null;
    return trimmed;
  }

  function isPrototypeShellPath(pathname, hostname) {
    if (isStatusHost(hostname)) return false;
    if (pathname.indexOf('/prototype') === 0) return true;
    if (!isDedicatedPrototypeHost(hostname)) return false;
    return !isNonPrototypeAppPath(prototypeLogicalPath(pathname));
  }

  function isPublicAppPath(pathname) {
    var logical = prototypeLogicalPath(pathname);
    return isNonPrototypeAppPath(logical) &&
      (logical.indexOf('/spaces/join') === 0 ||
        logical.indexOf('/shared/') === 0 ||
        logical.indexOf('/invitations/') === 0 ||
        logical === '/upgrade' ||
        logical.indexOf('/upgrade/') === 0 ||
        logical === '/addon' ||
        logical.indexOf('/addon/') === 0);
  }

  function isPrototypeNotePath(pathname, hostname) {
    var logical = prototypeLogicalPath(pathname);
    if (/^\/n\/[^/]+\/?$/.test(logical)) return true;
    var seg = singlePrototypeSegment(pathname, hostname);
    return seg != null && !RESERVED_SEGMENTS[seg];
  }

  global.__harvousPrototypeShellPath = {
    isDedicatedPrototypeHost: isDedicatedPrototypeHost,
    isPrototypeShellPath: isPrototypeShellPath,
    isPublicAppPath: isPublicAppPath,
    isPrototypeNotePath: isPrototypeNotePath,
  };
})(typeof window !== 'undefined' ? window : self);
