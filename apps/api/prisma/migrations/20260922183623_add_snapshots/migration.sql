-- CreateEnum
CREATE TYPE "SnapshotKind" AS ENUM ('AUTO', 'NAMED', 'CHECKPOINT');

-- CreateTable
CREATE TABLE "Snapshot" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "kind" "SnapshotKind" NOT NULL,
    "name" TEXT,
    "state" BYTEA NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "editorIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Snapshot_documentId_createdAt_idx" ON "Snapshot"("documentId", "createdAt");

-- CreateIndex
CREATE INDEX "Snapshot_kind_createdAt_idx" ON "Snapshot"("kind", "createdAt");

-- AddForeignKey
ALTER TABLE "Snapshot" ADD CONSTRAINT "Snapshot_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

