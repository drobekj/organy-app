import type { Pool } from "pg";

export async function seedDemoInteractionKnowledge(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("insert into app_users (id, display_name, person_id, active) values ($1, $2, $3, true) on conflict (id) do update set display_name = excluded.display_name, person_id = excluded.person_id, active = true", ["demo-priest-user", "Demo Priest User", "demo-priest"]);
    await client.query("insert into app_users (id, display_name, person_id, active) values ($1, $2, $3, true) on conflict (id) do update set display_name = excluded.display_name, person_id = excluded.person_id, active = true", ["demo-organist-user", "Demo Organist User", "demo-organist"]);
    await client.query("insert into app_users (id, display_name, person_id, active) values ($1, $2, null, true) on conflict (id) do update set display_name = excluded.display_name, person_id = null, active = true", ["demo-admin-user", "Demo Admin User"]);
    await client.query("insert into app_users (id, display_name, person_id, active) values ($1, $2, null, true) on conflict (id) do update set display_name = excluded.display_name, person_id = null, active = true", ["demo-member-user", "Demo Congregation User"]);
    await client.query("insert into app_user_roles (user_id, role) values ($1, 'priest'), ($2, 'organist'), ($3, 'admin'), ($4, 'congregation_member') on conflict do nothing", ["demo-priest-user", "demo-organist-user", "demo-admin-user", "demo-member-user"]);
    await client.query("insert into preference_profiles (id, user_id, category) values ($1, $2, 'priest'), ($3, $4, 'organist'), ($5, $6, 'congregation_member') on conflict (user_id) do update set id = excluded.id, category = excluded.category", ["pref-priest", "demo-priest-user", "pref-organist", "demo-organist-user", "pref-member", "demo-member-user"]);
    await client.query("insert into melody_equivalence_classes (id, label, synthetic) values ($1, $2, true) on conflict (id) do update set label = excluded.label, synthetic = true", ["synthetic-melody-a", "Synthetic melody A"]);
    await client.query("insert into song_melody_equivalence (song_id, class_id) values ($1, $2) on conflict (song_id) do update set class_id = excluded.class_id", ["demo-cz-101", "synthetic-melody-a"]);
    await client.query("insert into song_melody_equivalence (song_id, class_id) values ($1, $2) on conflict (song_id) do update set class_id = excluded.class_id", ["demo-pl-101", "synthetic-melody-a"]);
    await client.query("insert into antiphon_mappings (id, antiphon_key, song_id, synthetic) values ($1, $2, $3, true) on conflict (id) do update set antiphon_key = excluded.antiphon_key, song_id = excluded.song_id, synthetic = true", ["synthetic-antiphon-entry", "synthetic-entry", "demo-cz-101"]);
    await client.query("insert into liturgical_season_mappings (id, season_key, song_id, synthetic) values ($1, $2, $3, true) on conflict (id) do update set season_key = excluded.season_key, song_id = excluded.song_id, synthetic = true", ["synthetic-season-advent", "synthetic-advent", "demo-pl-101"]);
    await client.query("insert into song_preferences (profile_id, song_id, score) values ($1, $2, 3) on conflict (profile_id, song_id) do update set score = excluded.score", ["pref-priest", "demo-cz-101"]);
    await client.query("insert into song_preferences (profile_id, song_id, score) values ($1, $2, 2) on conflict (profile_id, song_id) do update set score = excluded.score", ["pref-organist", "demo-cz-101"]);
    await client.query("insert into song_preferences (profile_id, song_id, score) values ($1, $2, 1) on conflict (profile_id, song_id) do update set score = excluded.score", ["pref-member", "demo-cz-101"]);
    await client.query("insert into organist_repertoire (organist_person_id, song_id) values ($1, $2) on conflict do nothing", ["demo-organist", "demo-cz-101"]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
