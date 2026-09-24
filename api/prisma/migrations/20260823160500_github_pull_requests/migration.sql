-- AlterTable
ALTER TABLE "tenants" ADD COLUMN "githubToken" TEXT;

-- AlterTable
ALTER TABLE "lots" ADD COLUMN "repoUrl" TEXT;
ALTER TABLE "lots" ADD COLUMN "baseBranch" TEXT NOT NULL DEFAULT 'main';

-- CreateTable
CREATE TABLE "pull_requests" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "headSha" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pull_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pull_requests_lotId_key" ON "pull_requests"("lotId");

-- AddForeignKey
ALTER TABLE "pull_requests" ADD CONSTRAINT "pull_requests_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
