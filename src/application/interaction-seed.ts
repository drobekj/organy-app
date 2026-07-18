import type { Pool } from "pg";

export async function seedDemoInteractionKnowledge(pool: Pool): Promise<void> {
  await pool.query("insert into melody_equivalence_classes (id, label, synthetic) values ($1, $2, true) on conflict (id) do update set label = excluded.label, synthetic = true", ["synthetic-melody-a", "Synthetic melody A"]);
  await pool.query("insert into song_melody_equivalence (song_id, class_id) values ($1, $2) on conflict (song_id) do update set class_id = excluded.class_id", ["demo-cz-101", "synthetic-melody-a"]);
  await pool.query("insert into song_melody_equivalence (song_id, class_id) values ($1, $2) on conflict (song_id) do update set class_id = excluded.class_id", ["demo-pl-101", "synthetic-melody-a"]);
  await pool.query("insert into antiphon_mappings (id, antiphon_key, song_id, synthetic) values ($1, $2, $3, true) on conflict (id) do update set antiphon_key = excluded.antiphon_key, song_id = excluded.song_id, synthetic = true", ["synthetic-antiphon-entry", "synthetic-entry", "demo-cz-101"]);
  await pool.query("insert into liturgical_season_mappings (id, season_key, song_id, synthetic) values ($1, $2, $3, true) on conflict (id) do update set season_key = excluded.season_key, song_id = excluded.song_id, synthetic = true", ["synthetic-season-advent", "synthetic-advent", "demo-pl-101"]);
  await pool.query("insert into song_preferences (profile_id, song_id, score) values ($1, $2, 3) on conflict (profile_id, song_id) do update set score = excluded.score", ["pref-priest", "demo-cz-101"]);
  await pool.query("insert into song_preferences (profile_id, song_id, score) values ($1, $2, 2) on conflict (profile_id, song_id) do update set score = excluded.score", ["pref-organist", "demo-cz-101"]);
  await pool.query("insert into song_preferences (profile_id, song_id, score) values ($1, $2, 1) on conflict (profile_id, song_id) do update set score = excluded.score", ["pref-member", "demo-cz-101"]);
  await pool.query("insert into organist_repertoire (organist_person_id, song_id) values ($1, $2) on conflict do nothing", ["demo-organist", "demo-cz-101"]);
}
