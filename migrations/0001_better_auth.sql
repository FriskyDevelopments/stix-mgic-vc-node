-- NEBU Better Auth schema for Cloudflare D1 (generated from better-auth getMigrations, SQLite dialect,
-- table names ba_user / ba_session / ba_account / ba_verification as configured in server/betterAuth.ts).
create table "ba_user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" integer not null, "image" text, "createdAt" date not null, "updatedAt" date not null);
create table "ba_session" ("id" text not null primary key, "expiresAt" date not null, "token" text not null unique, "createdAt" date not null, "updatedAt" date not null, "ipAddress" text, "userAgent" text, "userId" text not null references "ba_user" ("id") on delete cascade);
create table "ba_account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "ba_user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" date, "refreshTokenExpiresAt" date, "scope" text, "password" text, "createdAt" date not null, "updatedAt" date not null);
create table "ba_verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" date not null, "createdAt" date not null, "updatedAt" date not null);
create index "ba_session_userId_idx" on "ba_session" ("userId");
create index "ba_account_userId_idx" on "ba_account" ("userId");
create index "ba_verification_identifier_idx" on "ba_verification" ("identifier");
