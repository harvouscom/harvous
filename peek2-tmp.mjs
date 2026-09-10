import 'dotenv/config';
import postgres from 'postgres';
const sql = postgres(process.env.SUPABASE_DATABASE_URL, { prepare: false, max: 1 });
// Whoever holds the 29 active items on the dev Clerk account.
const [{ userId: u }] = await sql`
  select "userId" from "ReviewItems" where status='active' group by "userId" order by count(*) desc limit 1
`;
console.log('account:', u, '\n');
const rows = await sql`
  select kind, "ladderStep", "reviewCount", "successStreak", "lastOutcome", count(*) c
  from "ReviewItems" where "userId"=${u} and status='active'
  group by kind, "ladderStep", "reviewCount", "successStreak", "lastOutcome"
  order by "ladderStep", kind
`;
console.log('kind      step  count  streak  lastOutcome   n');
for (const r of rows) {
  console.log(`${r.kind.padEnd(9)} ${String(r.ladderStep).padStart(4)} ${String(r.reviewCount).padStart(6)} ${String(r.successStreak).padStart(7)}  ${String(r.lastOutcome ?? '-').padEnd(12)} ${r.c}`);
}
const [tot] = await sql`select count(*) c, sum(case when "ladderStep"=0 then 1 else 0 end) at0 from "ReviewItems" where "userId"=${u} and status='active'`;
console.log(`\n${tot.at0} of ${tot.c} active items are still on step 0`);
await sql.end();
