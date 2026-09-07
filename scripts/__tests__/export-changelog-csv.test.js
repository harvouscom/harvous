/**
 * The backfill's high-water mark, and the branch that merges underneath it.
 *
 * 3.4.0 shipped from one branch and synced while 3.3.3–3.3.11 were still
 * unmerged on another. The mark moved to 3.4.0, and when the second branch
 * landed its nine files all sorted below it — so the whole Reminders release
 * was skipped permanently rather than late, and harvous.com announced a feature
 * its own changelog never mentioned.
 */
import { mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { exportChangelogToMarketingSite } from "../export-changelog-csv.js";

const HEADER =
  "Name,Slug,Collection ID,Locale ID,Item ID,Archived,Draft,Created On,Updated On,Published On,Version Number,Date,Commit Message,Category";

/** One CSV row, only the columns the exporter reads back. */
function row({ name, version, date }) {
  return `${name},slug,cid,lid,iid,false,false,${date},${date},,${version},${date},<p>${name}</p>,Feature`;
}

function csvWith(rows) {
  const path = join(mkdtempSync(join(tmpdir(), "changelog-csv-")), "changelog.csv");
  writeFileSync(path, [HEADER, ...rows].join("\n"), "utf-8");
  return path;
}

const SEP_5 = "Sat Sep 05 2026 12:00:00 GMT+0000 (Coordinated Universal Time)";

function rowsIn(path) {
  return readFileSync(path, "utf-8").split("\n").filter((l) => l.trim()).length - 1;
}

describe("recognising a row that is already published", () => {
  it("does not re-add an entry whose title was edited in the CSV", () => {
    // Export once so the CSV holds real rows, slugs included.
    const csvPath = csvWith([row({ name: "Older row", version: "3.4.0", date: SEP_5 })]);
    exportChangelogToMarketingSite({ csvPath, backfill: true, quiet: true });

    // Rewrite one Name and leave its Slug alone — what b6fbf6d did by hand.
    const lines = readFileSync(csvPath, "utf-8").split("\n");
    // An unquoted Name, so replacing the first field cannot corrupt the row.
    const idx = lines.findIndex(
      (l, i) => i > 0 && l.trim() && !l.startsWith('"') && !l.startsWith("Older row")
    );
    expect(idx).toBeGreaterThan(0);
    const originalName = lines[idx].slice(0, lines[idx].indexOf(","));
    lines[idx] = `A clearer hand-written title${lines[idx].slice(originalName.length)}`;
    writeFileSync(csvPath, lines.join("\n"), "utf-8");

    const before = rowsIn(csvPath);
    exportChangelogToMarketingSite({ csvPath, backfill: true, quiet: true });

    // Without the slug check the original wording comes back and the release
    // note lists the same change twice.
    expect(rowsIn(csvPath)).toBe(before);
    expect(readFileSync(csvPath, "utf-8")).toContain("A clearer hand-written title");
  });
});

describe("backfill and the high-water mark", () => {
  it("recovers a version that merged below the mark", () => {
    const csvPath = csvWith([row({ name: "Older row", version: "3.4.0", date: SEP_5 })]);

    exportChangelogToMarketingSite({ csvPath, backfill: true, quiet: true });
    const written = readFileSync(csvPath, "utf-8");

    // 3.3.3 sorts below the 3.4.0 mark but was released alongside it.
    expect(written).toContain("3.3.3");
    expect(written).toMatch(/Reminders/);
  });

  it("stays inside the recovery window, so the legacy backlog is left alone", () => {
    const csvPath = csvWith([row({ name: "Older row", version: "3.4.0", date: SEP_5 })]);

    exportChangelogToMarketingSite({ csvPath, backfill: true, quiet: true });
    const versions = readFileSync(csvPath, "utf-8")
      .split("\n")
      .slice(1)
      .map((line) => line.split(",")[10])
      .filter(Boolean);

    // The CSV began as a Webflow export that never covered 0.x. Treating
    // "absent" as "unpublished" would drag ~888 of those rows back in.
    expect(versions.some((v) => v.startsWith("0."))).toBe(false);
    expect(versions.some((v) => v.startsWith("1."))).toBe(false);
  });
});
