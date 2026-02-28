-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "file_name" VARCHAR(255),
ADD COLUMN     "file_size" INTEGER,
ADD COLUMN     "file_type" VARCHAR(100),
ADD COLUMN     "file_url" TEXT,
ADD COLUMN     "is_read" BOOLEAN DEFAULT false,
ADD COLUMN     "message_type" VARCHAR(20) DEFAULT 'TEXT';

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "application_id" UUID,
ADD COLUMN     "opportunity_id" UUID,
ADD COLUMN     "post_id" UUID,
ADD COLUMN     "project_id" UUID;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "instagram_url" TEXT;

-- CreateIndex
CREATE INDEX "idx_messages_type" ON "messages"("message_type");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
