import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const serviceSetKind = pgEnum('service_set_kind', ['working', 'final']);

const lifecycleTimestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const serviceContexts = pgTable('service_contexts', {
  id: uuid('id').primaryKey().defaultRandom(),
  serviceDate: timestamp('service_date', { withTimezone: true }).notNull(),
  title: text('title').notNull(),
  locationName: text('location_name'),
  seasonName: text('season_name'),
  notes: text('notes'),
  ...lifecycleTimestamps,
});

export const serviceSets = pgTable('service_sets', {
  id: uuid('id').primaryKey().defaultRandom(),
  serviceContextId: uuid('service_context_id')
    .notNull()
    .references(() => serviceContexts.id, { onDelete: 'cascade' }),
  kind: serviceSetKind('kind').notNull(),
  label: text('label'),
  isActive: boolean('is_active').notNull().default(true),
  ...lifecycleTimestamps,
});

export const serviceSetRows = pgTable(
  'service_set_rows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    serviceSetId: uuid('service_set_id')
      .notNull()
      .references(() => serviceSets.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    sourceKey: text('source_key'),
    title: text('title').notNull(),
    category: text('category'),
    notes: text('notes'),
    metadata: jsonb('metadata'),
    ...lifecycleTimestamps,
  },
  (table) => [
    uniqueIndex('service_set_rows_service_set_position_idx').on(table.serviceSetId, table.position),
  ],
);

export const completedServices = pgTable('completed_services', {
  id: uuid('id').primaryKey().defaultRandom(),
  serviceContextId: uuid('service_context_id')
    .notNull()
    .references(() => serviceContexts.id, { onDelete: 'restrict' }),
  completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
  title: text('title').notNull(),
  locationName: text('location_name'),
  notes: text('notes'),
  snapshot: jsonb('snapshot'),
  ...lifecycleTimestamps,
});

export const completedServiceRows = pgTable(
  'completed_service_rows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    completedServiceId: uuid('completed_service_id')
      .notNull()
      .references(() => completedServices.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    sourceKey: text('source_key'),
    title: text('title').notNull(),
    category: text('category'),
    notes: text('notes'),
    metadata: jsonb('metadata'),
    ...lifecycleTimestamps,
  },
  (table) => [
    uniqueIndex('completed_service_rows_completed_service_position_idx').on(
      table.completedServiceId,
      table.position,
    ),
  ],
);
