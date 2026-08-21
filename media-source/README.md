# media-source

Source media kept in the repo but **not** served.

`public/` is copied wholesale into `dist-spa` and published, so anything left there is
downloadable by anyone — and, with no robots.txt until August 2026, by every crawler that
found it. These four brand videos (25MB, added November 2025) were in `public/videos/` and
referenced by nothing: not the app, not the marketing site, which keeps its own tour videos
in its own repo under Git LFS.

Moved rather than deleted. They are plainly deliberate work and cost nothing sitting here;
what they were costing was Netlify bandwidth on every crawl of a 60MB publish directory.

To serve one again, move that file back into `public/` — and give it a real reference, so
the next person auditing bandwidth can tell it is wanted.
