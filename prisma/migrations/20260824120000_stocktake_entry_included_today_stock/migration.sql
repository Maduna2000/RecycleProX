-- AlterTable
ALTER TABLE "StocktakeEntry" ADD COLUMN IF NOT EXISTS "includedTodayStock" BOOLEAN NOT NULL DEFAULT false;
