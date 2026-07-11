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
} from "drizzle-orm/pg-core";

export const serviceSetStatus = pgEnum("service_set_status", ["working", "final"]);
export const serviceLanguage = pgEnum("service_language", ["czech", "polish", "mixed"]);
export const songLanguage = pgEnum("song_language", ["czech", "polish"]);

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
    songLanguage: songLanguage("song_language"),
    songNumber: text("song_number"),
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
    songLanguage: songLanguage("song_language"),
    songNumber: text("song_number"),
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
