import {
  pgTable,
  text,
  integer,
  real,
  timestamp,
  primaryKey,
  index,
} from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    steamId: text('steam_id').primaryKey(),
    personaName: text('persona_name').notNull(),
    avatar: text('avatar').notNull().default(''),
    profileUrl: text('profile_url').notNull().default(''),
    country: text('country'),
    credScore: real('cred_score').notNull().default(0),
    totalGames: integer('total_games').notNull().default(0),
    totalHours: real('total_hours').notNull().default(0),
    avgRating: real('avg_rating').notNull().default(0),
    lastCalculatedAt: timestamp('last_calculated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    credIdx: index('users_cred_idx').on(t.credScore),
  })
);

export const friendships = pgTable(
  'friendships',
  {
    userSteamId: text('user_steam_id').notNull(),
    friendSteamId: text('friend_steam_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userSteamId, t.friendSteamId] }),
  })
);

export const gameRatings = pgTable('game_ratings', {
  appId: integer('app_id').primaryKey(),
  name: text('name').notNull().default(''),
  positivePct: real('positive_pct').notNull().default(0),
  reviewCount: integer('review_count').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const auditLogs = pgTable('audit_logs', {
  id: text('id').primaryKey(),
  steamId: text('steam_id').notNull(),
  action: text('action').notNull(),
  details: text('details'),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const playtimeSnapshots = pgTable(
  'playtime_snapshots',
  {
    id: text('id').primaryKey(),
    steamId: text('steam_id').notNull(),
    totalHours: real('total_hours').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    steamIdx: index('snapshots_steam_idx').on(t.steamId),
    recordedIdx: index('snapshots_recorded_idx').on(t.recordedAt),
  })
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type GameRating = typeof gameRatings.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
export type PlaytimeSnapshot = typeof playtimeSnapshots.$inferSelect;
export type NewPlaytimeSnapshot = typeof playtimeSnapshots.$inferInsert;
