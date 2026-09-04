import { relations, sql } from "drizzle-orm";
import {
  check,
  date,
  integer,
  jsonb,
  time,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  index,
  varchar,
  boolean,
} from "drizzle-orm/pg-core";

export const serviceSetStatus = pgEnum("service_set_status", ["working", "final"]);
export const serviceLanguage = pgEnum("service_language", ["czech", "polish", "mixed"]);
export const songLanguage = pgEnum("song_language", ["czech", "polish"]);

export const referenceCatalogSongs = pgTable("reference_catalog_songs", {
  id: text("id").primaryKey(),
  language: songLanguage("language").notNull(),
  canonicalNumber: integer("canonical_number").notNull(),
  sourceId: text("source_id").notNull(),
  title: text("title").notNull(),
  sourceUrl: text("source_url"),
}, (table) => ({
  languageCanonicalNumber: uniqueIndex("reference_catalog_songs_language_canonical_number_idx").on(table.language, table.canonicalNumber),
  languageSourceId: uniqueIndex("reference_catalog_songs_language_source_id_idx").on(table.language, table.sourceId),
  positiveCanonicalNumber: check("reference_catalog_songs_canonical_number_positive", sql`${table.canonicalNumber} > 0`),
  nonEmptyId: check("reference_catalog_songs_id_non_empty", sql`btrim(${table.id}) <> ''`),
  nonEmptySourceId: check("reference_catalog_songs_source_id_non_empty", sql`btrim(${table.sourceId}) <> ''`),
  nonEmptyTitle: check("reference_catalog_songs_title_non_empty", sql`btrim(${table.title}) <> ''`),
}));

export const referenceAntiphons = pgTable("reference_antiphons", {
  id: text("id").primaryKey(),
  language: songLanguage("language").notNull(),
  canonicalNumber: integer("canonical_number").notNull(),
  title: text("title").notNull(),
  sourceUrl: text("source_url"),
}, (table) => ({
  languageCanonicalNumber: uniqueIndex("reference_antiphons_language_canonical_number_idx").on(table.language, table.canonicalNumber),
  positiveNumber: check("reference_antiphons_number_positive", sql`${table.canonicalNumber} > 0`),
  idMatchesNumber: check("reference_antiphons_id_matches_number", sql`${table.id} = ${table.language}::text || ':' || ${table.canonicalNumber}::text`),
  nonEmptyId: check("reference_antiphons_id_non_empty", sql`btrim(${table.id}) <> ''`),
  nonEmptyTitle: check("reference_antiphons_title_non_empty", sql`btrim(${table.title}) <> ''`),
  validSourceUrl: check("reference_antiphons_source_url_valid", sql`(
    ${table.language} = 'czech' and ${table.sourceUrl} is not null and ${table.sourceUrl} ~ '^https://www\\.evangelickykancional\\.cz(?:/|$)'
  ) or (
    ${table.language} = 'polish' and (${table.sourceUrl} is null or ${table.sourceUrl} ~ '^https://')
  )`),
}));

export const catalogPersons = pgTable("catalog_persons", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  active: boolean("active").notNull().default(true),
  priest: boolean("priest").notNull().default(false),
  organist: boolean("organist").notNull().default(false),
  melodyProtectionMonths: integer("melody_protection_months").notNull().default(2),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  melodyProtectionRange: check("catalog_persons_melody_protection_months_range", sql`${table.melodyProtectionMonths} between 0 and 12`),
}));

export const catalogSongs = pgTable("catalog_songs", {
  songId: text("song_id").primaryKey(),
  language: songLanguage("language").notNull(),
  number: text("number").notNull(),
  title: text("title").notNull(),
  active: boolean("active").notNull().default(true),
  sheetMusicUrl: text("sheet_music_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  languageNumber: uniqueIndex("catalog_songs_language_number_idx").on(table.language, table.number),
}));

export const serviceContexts = pgTable(
  "service_contexts",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }),
    serviceDate: date("service_date").notNull().default(sql`CURRENT_DATE`),
    serviceTime: time("service_time"),
    serviceLanguage: serviceLanguage("service_language").notNull().default("czech"),
    priestId: text("priest_id"),
    priestDisplayName: text("priest_display_name").notNull().default(""),
    organistId: text("organist_id"),
    organistDisplayName: text("organist_display_name").notNull().default(""),
    melodyProtectionMonths: integer("melody_protection_months").notNull().default(2),
    note: text("note"),
    referenceAntiphonId: text("reference_antiphon_id"),
    referenceAntiphonDisplayNumber: text("reference_antiphon_display_number"),
    referenceAntiphonTitle: text("reference_antiphon_title"),
    referenceAntiphonSourceUrl: text("reference_antiphon_source_url"),
    referenceTopicId: text("reference_topic_id"),
    referenceTopicTitle: text("reference_topic_title"),
    antiphonKey: text("antiphon_key"),
    liturgicalSeasonKey: text("liturgical_season_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    serviceDateTime: uniqueIndex("service_contexts_service_date_time_idx").on(table.serviceDate, table.serviceTime),
    melodyProtectionRange: check("service_contexts_melody_protection_months_range", sql`${table.melodyProtectionMonths} between 0 and 12`),
    referenceAntiphonSnapshotComplete: check(
      "service_contexts_reference_antiphon_snapshot_complete",
      sql`(
        ${table.referenceAntiphonId} is null and
        ${table.referenceAntiphonDisplayNumber} is null and
        ${table.referenceAntiphonTitle} is null and
        ${table.referenceAntiphonSourceUrl} is null
      ) or (
        ${table.referenceAntiphonId} is not null and
        ${table.referenceAntiphonDisplayNumber} is not null and
        ${table.referenceAntiphonTitle} is not null
      )`,
    ),
    referenceAntiphonIdentity: check(
      "service_contexts_reference_antiphon_identity",
      sql`${table.referenceAntiphonId} is null or ${table.referenceAntiphonId} ~ '^(czech|polish):[1-9][0-9]*$'`,
    ),
    referenceAntiphonSnapshotNonEmpty: check(
      "service_contexts_reference_antiphon_snapshot_non_empty",
      sql`${table.referenceAntiphonId} is null or (
        btrim(${table.referenceAntiphonDisplayNumber}) <> '' and
        btrim(${table.referenceAntiphonTitle}) <> ''
      )`,
    ),
    referenceAntiphonSourceUrlValid: check(
      "service_contexts_reference_antiphon_source_url_valid",
      sql`${table.referenceAntiphonSourceUrl} is null or ${table.referenceAntiphonSourceUrl} ~ '^https://'`,
    ),
    referenceTopicSnapshotComplete: check(
      "service_contexts_reference_topic_snapshot_complete",
      sql`(${table.referenceTopicId} is null and ${table.referenceTopicTitle} is null) or (${table.referenceTopicId} is not null and ${table.referenceTopicTitle} is not null)`,
    ),
    referenceTopicIdentity: check(
      "service_contexts_reference_topic_identity",
      sql`${table.referenceTopicId} is null or ${table.referenceTopicId} ~ '^(czech|polish):.+$'`,
    ),
    referenceTopicTitleNonEmpty: check(
      "service_contexts_reference_topic_title_non_empty",
      sql`${table.referenceTopicId} is null or btrim(${table.referenceTopicTitle}) <> ''`,
    ),
  }),
);

export const serviceSets = pgTable("service_sets", {
  id: serial("id").primaryKey(),
  serviceContextId: integer("service_context_id")
    .notNull()
    .references(() => serviceContexts.id, { onDelete: "cascade" }),
  status: serviceSetStatus("status").notNull().default("working"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const serviceSetRows = pgTable(
  "service_set_rows",
  {
    id: serial("id").primaryKey(),
    serviceSetId: integer("service_set_id")
      .notNull()
      .references(() => serviceSets.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    songId: text("song_id"),
    songLanguage: songLanguage("song_language"),
    songNumber: text("song_number"),
    songTitle: text("song_title"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    serviceSetPosition: uniqueIndex("service_set_rows_service_set_id_position_idx").on(
      table.serviceSetId,
      table.position,
    ),
    positivePosition: check("service_set_rows_position_positive", sql`${table.position} > 0`),
    completeSongReference: check(
      "service_set_rows_complete_song_reference",
      sql`(${table.songLanguage} is null and ${table.songNumber} is null) or (${table.songLanguage} is not null and ${table.songNumber} is not null)`,
    ),
  }),
);

export const completedServices = pgTable("completed_services", {
  id: serial("id").primaryKey(),
  serviceContextId: integer("service_context_id")
    .notNull()
    .references(() => serviceContexts.id, { onDelete: "cascade" }),
  serviceSetId: integer("service_set_id").references(() => serviceSets.id, { onDelete: "set null" }),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const completedServiceRows = pgTable(
  "completed_service_rows",
  {
    id: serial("id").primaryKey(),
    completedServiceId: integer("completed_service_id")
      .notNull()
      .references(() => completedServices.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    songId: text("song_id"),
    songLanguage: songLanguage("song_language"),
    songNumber: text("song_number"),
    songTitle: text("song_title"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    completedServicePosition: uniqueIndex("completed_service_rows_completed_service_id_position_idx").on(
      table.completedServiceId,
      table.position,
    ),
    positivePosition: check("completed_service_rows_position_positive", sql`${table.position} > 0`),
    completeSongReference: check(
      "completed_service_rows_complete_song_reference",
      sql`(${table.songLanguage} is null and ${table.songNumber} is null) or (${table.songLanguage} is not null and ${table.songNumber} is not null)`,
    ),
  }),
);


export const preferenceProfileCategory = pgEnum("preference_profile_category", ["priest", "organist", "congregation_member"]);
export const userRole = pgEnum("user_role", ["priest", "organist", "admin", "congregation_member"]);
export const congregationVoterStatus = pgEnum("congregation_voter_status", ["pending", "active", "legacy_unverified"]);

export const appUsers = pgTable("app_users", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  personId: text("person_id").references(() => catalogPersons.id, { onDelete: "set null" }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const appUserRoles = pgTable("app_user_roles", {
  userId: text("user_id").notNull().references(() => appUsers.id, { onDelete: "cascade" }),
  role: userRole("role").notNull(),
}, (table) => ({ userRoleUnique: uniqueIndex("app_user_roles_user_role_idx").on(table.userId, table.role) }));

export const authUsers = pgTable("auth_users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  username: text("username"),
  displayUsername: text("display_username"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  emailUnique: uniqueIndex("auth_users_email_idx").on(table.email),
  usernameUnique: uniqueIndex("auth_users_username_idx").on(table.username),
}));

export const authSessions = pgTable("auth_sessions", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
}, (table) => ({
  tokenUnique: uniqueIndex("auth_sessions_token_idx").on(table.token),
  userIndex: index("auth_sessions_user_id_idx").on(table.userId),
}));

export const authAccounts = pgTable("auth_accounts", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIndex: index("auth_accounts_user_id_idx").on(table.userId),
}));

export const authVerifications = pgTable("auth_verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  identifierIndex: index("auth_verifications_identifier_idx").on(table.identifier),
}));

export const protectedAccountActorLinks = pgTable("protected_account_actor_links", {
  authUserId: text("auth_user_id").primaryKey().references(() => authUsers.id, { onDelete: "cascade" }),
  appUserId: text("app_user_id").notNull().references(() => appUsers.id, { onDelete: "cascade" }),
  whatsappPhoneE164: text("whatsapp_phone_e164"),
  whatsappPhoneConfirmedAt: timestamp("whatsapp_phone_confirmed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  oneAccountPerActor: uniqueIndex("protected_account_actor_links_app_user_idx").on(table.appUserId),
  whatsappPhoneStateValid: check("protected_account_whatsapp_phone_state_valid", sql`(
    (${table.whatsappPhoneE164} is null and ${table.whatsappPhoneConfirmedAt} is null)
    or
    (${table.whatsappPhoneE164} ~ '^\\+[1-9][0-9]{7,14}$' and ${table.whatsappPhoneConfirmedAt} is not null)
  )`),
}));

export const preferenceProfiles = pgTable("preference_profiles", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => appUsers.id, { onDelete: "cascade" }),
  category: preferenceProfileCategory("category").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ oneProfilePerUser: uniqueIndex("preference_profiles_user_id_idx").on(table.userId) }));

export const congregationVoterAccounts = pgTable("congregation_voter_accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => appUsers.id, { onDelete: "cascade" }),
  nickname: text("nickname").notNull(),
  nicknameNormalized: text("nickname_normalized").notNull(),
  email: text("email"),
  emailNormalized: text("email_normalized"),
  status: congregationVoterStatus("status").notNull(),
  isNewRegistration: boolean("is_new_registration").notNull().default(true),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  oneAccountPerUser: uniqueIndex("congregation_voter_accounts_user_idx").on(table.userId),
  nicknameUnique: uniqueIndex("congregation_voter_accounts_nickname_normalized_idx").on(table.nicknameNormalized),
  emailUnique: uniqueIndex("congregation_voter_accounts_email_normalized_idx").on(table.emailNormalized),
  validState: check("congregation_voter_accounts_state_valid", sql`(
    (${table.status} = 'pending' and ${table.userId} is null and ${table.email} is not null and ${table.emailNormalized} is not null and ${table.confirmedAt} is null)
    or
    (${table.status} = 'active' and ${table.userId} is not null and ${table.email} is not null and ${table.emailNormalized} is not null and ${table.confirmedAt} is not null)
    or
    (${table.status} = 'legacy_unverified' and ${table.userId} is not null and ${table.confirmedAt} is null and ((${table.email} is null and ${table.emailNormalized} is null) or (${table.email} is not null and ${table.emailNormalized} is not null)))
  )`),
  nicknameNotEmpty: check("congregation_voter_accounts_nickname_not_empty", sql`btrim(${table.nickname}) <> '' and btrim(${table.nicknameNormalized}) <> ''`),
  emailPair: check("congregation_voter_accounts_email_pair", sql`(${table.email} is null) = (${table.emailNormalized} is null)`),
}));

export const congregationConfirmationTokens = pgTable("congregation_confirmation_tokens", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull().references(() => congregationVoterAccounts.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  invalidatedAt: timestamp("invalidated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  tokenHashUnique: uniqueIndex("congregation_confirmation_tokens_hash_idx").on(table.tokenHash),
  accountIndex: index("congregation_confirmation_tokens_account_idx").on(table.accountId),
  oneTerminalState: check("congregation_confirmation_tokens_terminal_state", sql`not (${table.usedAt} is not null and ${table.invalidatedAt} is not null)`),
}));

export const congregationVoterSessions = pgTable("congregation_voter_sessions", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull().references(() => congregationVoterAccounts.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  tokenHashUnique: uniqueIndex("congregation_voter_sessions_hash_idx").on(table.tokenHash),
  accountIndex: index("congregation_voter_sessions_account_idx").on(table.accountId),
}));

export const congregationRateLimitBuckets = pgTable("congregation_rate_limit_buckets", {
  id: text("id").primaryKey(),
  action: text("action").notNull(),
  scope: text("scope").notNull(),
  keyHash: text("key_hash").notNull(),
  bucketStart: timestamp("bucket_start", { withTimezone: true }).notNull(),
  requestCount: integer("request_count").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  bucketUnique: uniqueIndex("congregation_rate_limit_bucket_idx").on(table.action, table.scope, table.keyHash, table.bucketStart),
  positiveCount: check("congregation_rate_limit_request_count_positive", sql`${table.requestCount} > 0`),
}));

export const congregationRegistrationControl = pgTable("congregation_registration_control", {
  id: text("id").primaryKey(),
  registrationFrozen: boolean("registration_frozen").notNull().default(false),
  bootstrapCompletedAt: timestamp("bootstrap_completed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ singleton: check("congregation_registration_control_singleton", sql`${table.id} = 'global'`) }));

export const melodyEquivalenceClasses = pgTable("melody_equivalence_classes", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  synthetic: boolean("synthetic").notNull().default(false),
});

export const songMelodyEquivalence = pgTable("song_melody_equivalence", {
  songId: text("song_id").notNull().references(() => catalogSongs.songId, { onDelete: "cascade" }),
  classId: text("class_id").notNull().references(() => melodyEquivalenceClasses.id, { onDelete: "cascade" }),
}, (table) => ({ oneClassPerSong: uniqueIndex("song_melody_equivalence_song_id_idx").on(table.songId) }));

export const songPreferences = pgTable("song_preferences", {
  profileId: text("profile_id").notNull().references(() => preferenceProfiles.id, { onDelete: "cascade" }),
  songId: text("song_id").notNull().references(() => catalogSongs.songId, { onDelete: "cascade" }),
  score: integer("score").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ onePreferencePerProfileSong: uniqueIndex("song_preferences_profile_song_idx").on(table.profileId, table.songId), scoreRange: check("song_preferences_score_range", sql`${table.score} >= 0 and ${table.score} <= 3`) }));

export const referenceSongPreferences = pgTable("reference_song_preferences", {
  profileId: text("profile_id").notNull().references(() => preferenceProfiles.id, { onDelete: "cascade" }),
  referenceSongId: text("reference_song_id").notNull().references(() => referenceCatalogSongs.id, { onDelete: "cascade" }),
  score: integer("score").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ onePreferencePerProfileReference: uniqueIndex("reference_song_preferences_profile_reference_song_idx").on(table.profileId, table.referenceSongId), scoreRange: check("reference_song_preferences_score_range", sql`${table.score} >= 0 and ${table.score} <= 3`) }));

export const referenceOrganistRepertoire = pgTable("reference_organist_repertoire", {
  organistPersonId: text("organist_person_id").notNull().references(() => catalogPersons.id, { onDelete: "cascade" }),
  referenceSongId: text("reference_song_id").notNull().references(() => referenceCatalogSongs.id, { onDelete: "cascade" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ oneMembership: uniqueIndex("reference_organist_repertoire_person_song_idx").on(table.organistPersonId, table.referenceSongId) }));

export const referenceMelodyClasses = pgTable("reference_melody_classes", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const referenceSongMelodyMemberships = pgTable("reference_song_melody_memberships", {
  referenceSongId: text("reference_song_id").primaryKey().references(() => referenceCatalogSongs.id, { onDelete: "cascade" }),
  classId: text("class_id").notNull().references(() => referenceMelodyClasses.id, { onDelete: "cascade" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ classLookup: index("reference_song_melody_memberships_class_id_idx").on(table.classId) }));

export const referenceMelodyEdges = pgTable("reference_melody_edges", {
  songAId: text("song_a_id").notNull().references(() => referenceCatalogSongs.id, { onDelete: "cascade" }),
  songBId: text("song_b_id").notNull().references(() => referenceCatalogSongs.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  pair: uniqueIndex("reference_melody_edges_pair_idx").on(table.songAId, table.songBId),
  songBLookup: index("reference_melody_edges_song_b_idx").on(table.songBId),
  canonicalPair: check("reference_melody_edges_canonical_pair", sql`${table.songAId} < ${table.songBId}`),
}));

export const referenceAntiphonRecommendations = pgTable("reference_antiphon_recommendations", {
  antiphonId: text("antiphon_id").primaryKey().references(() => referenceAntiphons.id, { onDelete: "cascade" }),
  referenceSongId: text("reference_song_id").notNull().references(() => referenceCatalogSongs.id, { onDelete: "cascade" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ songLookup: index("reference_antiphon_recommendations_song_id_idx").on(table.referenceSongId) }));

export const organistRepertoire = pgTable("organist_repertoire", {
  organistPersonId: text("organist_person_id").notNull().references(() => catalogPersons.id, { onDelete: "cascade" }),
  songId: text("song_id").notNull().references(() => catalogSongs.songId, { onDelete: "cascade" }),
}, (table) => ({ oneRepertoireMembership: uniqueIndex("organist_repertoire_person_song_idx").on(table.organistPersonId, table.songId) }));

export const antiphonMappings = pgTable("antiphon_mappings", { id: text("id").primaryKey(), antiphonKey: text("antiphon_key").notNull(), songId: text("song_id").notNull().references(() => catalogSongs.songId, { onDelete: "cascade" }), synthetic: boolean("synthetic").notNull().default(false) });
export const liturgicalSeasonMappings = pgTable("liturgical_season_mappings", { id: text("id").primaryKey(), seasonKey: text("season_key").notNull(), songId: text("song_id").notNull().references(() => catalogSongs.songId, { onDelete: "cascade" }), synthetic: boolean("synthetic").notNull().default(false) });
export const melodyNonRepetitionConfig = pgTable("melody_non_repetition_config", { id: text("id").primaryKey().default("global"), months: integer("months").notNull().default(2), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow() }, (table) => ({ singletonConfig: check("melody_non_repetition_config_singleton", sql`${table.id} = 'global'`), nonNegativeWindow: check("melody_non_repetition_config_non_negative", sql`${table.months} >= 0`) }));

export const auditEvents = pgTable("audit_events", {
  id: serial("id").primaryKey(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  actorKind: text("actor_kind").notNull(),
  actorUserId: text("actor_user_id"),
  actorDisplayName: text("actor_display_name"),
  actorRole: text("actor_role"),
  actorPersonId: text("actor_person_id"),
  action: text("action").notNull(),
  objectKind: text("object_kind").notNull(),
  objectRef: text("object_ref").notNull(),
  beforeState: jsonb("before_state"),
  afterState: jsonb("after_state"),
}, (table) => ({
  occurredAtIndex: index("audit_events_occurred_at_idx").on(table.occurredAt),
  objectIndex: index("audit_events_object_idx").on(table.objectKind, table.objectRef),
  actorKindValid: check("audit_events_actor_kind_valid", sql`${table.actorKind} in ('human', 'system')`),
  actorSnapshotValid: check("audit_events_actor_snapshot_valid", sql`(
    ${table.actorKind} = 'system' and ${table.actorUserId} is null and ${table.actorDisplayName} is null and ${table.actorRole} is null
  ) or (
    ${table.actorKind} = 'human' and ${table.actorUserId} is not null and btrim(${table.actorUserId}) <> '' and
    ${table.actorDisplayName} is not null and btrim(${table.actorDisplayName}) <> '' and
    ${table.actorRole} is not null and btrim(${table.actorRole}) <> ''
  )`),
  actionNonEmpty: check("audit_events_action_non_empty", sql`btrim(${table.action}) <> ''`),
  objectKindNonEmpty: check("audit_events_object_kind_non_empty", sql`btrim(${table.objectKind}) <> ''`),
  objectRefNonEmpty: check("audit_events_object_ref_non_empty", sql`btrim(${table.objectRef}) <> ''`),
}));

export const serviceContextsRelations = relations(serviceContexts, ({ many }) => ({
  serviceSets: many(serviceSets),
  completedServices: many(completedServices),
}));

export const serviceSetsRelations = relations(serviceSets, ({ one, many }) => ({
  serviceContext: one(serviceContexts, {
    fields: [serviceSets.serviceContextId],
    references: [serviceContexts.id],
  }),
  rows: many(serviceSetRows),
  completedServices: many(completedServices),
}));

export const serviceSetRowsRelations = relations(serviceSetRows, ({ one }) => ({
  serviceSet: one(serviceSets, {
    fields: [serviceSetRows.serviceSetId],
    references: [serviceSets.id],
  }),
}));

export const completedServicesRelations = relations(completedServices, ({ one, many }) => ({
  serviceContext: one(serviceContexts, {
    fields: [completedServices.serviceContextId],
    references: [serviceContexts.id],
  }),
  serviceSet: one(serviceSets, {
    fields: [completedServices.serviceSetId],
    references: [serviceSets.id],
  }),
  rows: many(completedServiceRows),
}));

export const completedServiceRowsRelations = relations(completedServiceRows, ({ one }) => ({
  completedService: one(completedServices, {
    fields: [completedServiceRows.completedServiceId],
    references: [completedServices.id],
  }),
}));
