import { relations, sql } from "drizzle-orm";
import {
  check,
  date,
  integer,
  time,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
  boolean,
} from "drizzle-orm/pg-core";

export const serviceSetStatus = pgEnum("service_set_status", ["working", "final"]);
export const serviceLanguage = pgEnum("service_language", ["czech", "polish", "mixed"]);
export const songLanguage = pgEnum("song_language", ["czech", "polish"]);

export const catalogPersons = pgTable("catalog_persons", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  active: boolean("active").notNull().default(true),
  priest: boolean("priest").notNull().default(false),
  organist: boolean("organist").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    serviceDateTime: uniqueIndex("service_contexts_service_date_time_idx").on(table.serviceDate, table.serviceTime),
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

export const preferenceProfiles = pgTable("preference_profiles", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => appUsers.id, { onDelete: "cascade" }),
  category: preferenceProfileCategory("category").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ oneProfilePerUser: uniqueIndex("preference_profiles_user_id_idx").on(table.userId) }));

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

export const organistRepertoire = pgTable("organist_repertoire", {
  organistPersonId: text("organist_person_id").notNull().references(() => catalogPersons.id, { onDelete: "cascade" }),
  songId: text("song_id").notNull().references(() => catalogSongs.songId, { onDelete: "cascade" }),
}, (table) => ({ oneRepertoireMembership: uniqueIndex("organist_repertoire_person_song_idx").on(table.organistPersonId, table.songId) }));

export const antiphonMappings = pgTable("antiphon_mappings", { id: text("id").primaryKey(), antiphonKey: text("antiphon_key").notNull(), songId: text("song_id").notNull().references(() => catalogSongs.songId, { onDelete: "cascade" }), synthetic: boolean("synthetic").notNull().default(false) });
export const liturgicalSeasonMappings = pgTable("liturgical_season_mappings", { id: text("id").primaryKey(), seasonKey: text("season_key").notNull(), songId: text("song_id").notNull().references(() => catalogSongs.songId, { onDelete: "cascade" }), synthetic: boolean("synthetic").notNull().default(false) });
export const melodyNonRepetitionConfig = pgTable("melody_non_repetition_config", { id: text("id").primaryKey().default("global"), daysBefore: integer("days_before").notNull().default(14), daysAfter: integer("days_after").notNull().default(0), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow() }, (table) => ({ singletonConfig: check("melody_non_repetition_config_singleton", sql`${table.id} = 'global'`), nonNegativeWindow: check("melody_non_repetition_config_non_negative", sql`${table.daysBefore} >= 0 and ${table.daysAfter} >= 0`) }));

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
