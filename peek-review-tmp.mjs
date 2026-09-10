import 'dotenv/config';
import postgres from 'postgres';
const sql = postgres(process.env.SUPABASE_DATABASE_URL, { prepare: false, max: 1 });
const u = process.argv[2];
const rows = await sql`
  select id, kind, "scriptureReference", "noteId", "ladderStep", "reviewCount", "dueAt", status
  from "ReviewItems" where "userId" = ${u} order by "dueAt" limit 15
`;
for (const r of rows) {
  console.log(`${String(r.status).padEnd(9)} ${r.kind.padEnd(8)} step=${r.ladderStep} count=${r.reviewCount} due=${new Date(r.dueAt).toISOString().slice(0,10)}  ${r.scriptureReference ?? r.noteId?.slice(0,8)}`);
}
console.log('\ntotal:', rows.length);
const all = await sql`select count(*) c, status from "ReviewItems" where "userId" = ${u} group by status`;
console.log(all.map(r=>`${r.status}: ${r.c}`).join(', '));
await sql.end();
