-- AlterTable
ALTER TABLE "webhooks" DROP COLUMN "secretHash",
ADD COLUMN     "secretEncrypted" VARCHAR(500) NOT NULL;
