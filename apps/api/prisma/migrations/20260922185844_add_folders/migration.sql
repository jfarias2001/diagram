-- CreateEnum
CREATE TYPE "FolderKind" AS ENUM ('PERSONAL', 'SHARED');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "sharedFolderId" TEXT;

-- CreateTable
CREATE TABLE "Folder" (
    "id" TEXT NOT NULL,
    "kind" "FolderKind" NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "parentId" TEXT,
    "rootId" TEXT NOT NULL,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Folder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FolderMember" (
    "folderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FolderMember_pkey" PRIMARY KEY ("folderId","userId")
);

-- CreateTable
CREATE TABLE "DocumentPlacement" (
    "documentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentPlacement_pkey" PRIMARY KEY ("documentId","userId")
);

-- CreateIndex
CREATE INDEX "Folder_ownerId_kind_parentId_idx" ON "Folder"("ownerId", "kind", "parentId");

-- CreateIndex
CREATE INDEX "Folder_rootId_idx" ON "Folder"("rootId");

-- CreateIndex
CREATE INDEX "FolderMember_userId_idx" ON "FolderMember"("userId");

-- CreateIndex
CREATE INDEX "DocumentPlacement_folderId_idx" ON "DocumentPlacement"("folderId");

-- CreateIndex
CREATE INDEX "DocumentPlacement_userId_idx" ON "DocumentPlacement"("userId");

-- CreateIndex
CREATE INDEX "Document_sharedFolderId_idx" ON "Document"("sharedFolderId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_sharedFolderId_fkey" FOREIGN KEY ("sharedFolderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_rootId_fkey" FOREIGN KEY ("rootId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FolderMember" ADD CONSTRAINT "FolderMember_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FolderMember" ADD CONSTRAINT "FolderMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPlacement" ADD CONSTRAINT "DocumentPlacement_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPlacement" ADD CONSTRAINT "DocumentPlacement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPlacement" ADD CONSTRAINT "DocumentPlacement_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

