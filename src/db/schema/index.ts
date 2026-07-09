import { relations, sql } from "drizzle-orm";
import {
  check,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const serviceLanguage = pgEnum("service_language", ["czech", "polish", "mixed"]);
export const concreteSongLanguage = pgEnum("concrete_song_language", ["czech", "polish"]);
export const serviceSetStatus = pgEnum("service_set_status", ["working", "final"]);

export const serviceContexts = pgTable("service_contexts", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title"),
  serviceDate: timestamp("service_date", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const serviceSets = pgTable(
  "service_sets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    serviceContextId: uuid("service_context_id")
      .notNull()
      .references(() => serviceContexts.id, { onDelete: "cascade" }),
    status: serviceSetStatus("status").notNull(),
    language: serviceLanguage("language").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("service_sets_context_status_unique").on(table.serviceContextId, table.status)],
);

export const serviceSetRows = pgTable(
  "service_set_rows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    serviceSetId: uuid("service_set_id")
      .notNull()
      .references(() => serviceSets.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    songNumber: text("song_number"),
    songLanguage: concreteSongLanguage("song_language"),
    note: text("note"),
  },
  (table) => [
    uniqueIndex("service_set_rows_set_position_unique").on(table.serviceSetId, table.position),
    check("service_set_rows_position_positive", sql`${table.position} > 0`),
    check(
      "service_set_rows_song_complete_or_empty",
      sql`(${table.songNumber} is null and ${table.songLanguage} is null) or (${table.songNumber} is not null and ${table.songLanguage} is not null)`,
    ),
  ],
);

export const completedServices = pgTable("completed_services", {
  id: uuid("id").defaultRandom().primaryKey(),
  serviceContextId: uuid("service_context_id")
    .notNull()
    .references(() => serviceContexts.id, { onDelete: "restrict" })
    .unique(),
  completedAt: timestamp("completed_at", { withTimezone: true }).defaultNow().notNull(),
  language: serviceLanguage("language").notNull(),
});

export const completedServiceRows = pgTable(
  "completed_service_rows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    completedServiceId: uuid("completed_service_id")
      .notNull()
      .references(() => completedServices.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    songNumber: text("song_number"),
    songLanguage: concreteSongLanguage("song_language"),
    note: text("note"),
  },
  (table) => [
    uniqueIndex("completed_service_rows_service_position_unique").on(table.completedServiceId, table.position),
    check("completed_service_rows_position_positive", sql`${table.position} > 0`),
    check(
      "completed_service_rows_song_complete_or_empty",
      sql`(${table.songNumber} is null and ${table.songLanguage} is null) or (${table.songNumber} is not null and ${table.songLanguage} is not null)`,
    ),
  ],
);

export const serviceContextsRelations = relations(serviceContexts, ({ many, one }) => ({
  serviceSets: many(serviceSets),
  completedService: one(completedServices),
}));

export const serviceSetsRelations = relations(serviceSets, ({ one, many }) => ({
  serviceContext: one(serviceContexts, {
    fields: [serviceSets.serviceContextId],
    references: [serviceContexts.id],
  }),
  rows: many(serviceSetRows),
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
  rows: many(completedServiceRows),
}));

export const completedServiceRowsRelations = relations(completedServiceRows, ({ one }) => ({
  completedService: one(completedServices, {
    fields: [completedServiceRows.completedServiceId],
    references: [completedServices.id],
  }),
}));
