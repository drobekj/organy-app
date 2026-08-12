import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { auth_user } from "./auth-generated";
import { appUsers } from "./index";

export const authUserActorLinks = pgTable("auth_user_actor_links", {
  authUserId: text("auth_user_id").primaryKey().references(() => auth_user.id, { onDelete: "cascade" }),
  actorUserId: text("actor_user_id").notNull().references(() => appUsers.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("auth_user_actor_links_actor_user_idx").on(table.actorUserId)]);
