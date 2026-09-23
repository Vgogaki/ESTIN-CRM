import "dotenv/config";
import { randomBytes } from "node:crypto";
import { db } from "../src/server/db";
import { DEFAULT_ROLES } from "../src/server/permissions";
import { hashPassword } from "../src/server/security/password";
import { writeAuditLog } from "../src/server/audit";

const FOUNDER_ADMIN_EMAIL = "valentina-gogaki@hotmail.com";

async function main() {
  for (const [name, permissions] of Object.entries(DEFAULT_ROLES)) {
    await db.adminRole.upsert({
      where: { name },
      update: { permissions: [...permissions] },
      create: { name, permissions: [...permissions] },
    });
  }
  console.log(`Seeded ${Object.keys(DEFAULT_ROLES).length} admin roles.`);

  const existingAdminCount = await db.adminUser.count();
  if (existingAdminCount > 0) {
    console.log("Admin users already exist — skipping founder account creation.");
    return;
  }

  const superAdminRole = await db.adminRole.findUniqueOrThrow({
    where: { name: "super_admin" },
  });

  const temporaryPassword = randomBytes(9).toString("base64url");
  const admin = await db.adminUser.create({
    data: {
      email: FOUNDER_ADMIN_EMAIL,
      name: "Founder",
      passwordHash: await hashPassword(temporaryPassword),
      roleId: superAdminRole.id,
    },
  });

  await writeAuditLog({
    actorType: "system",
    actorId: null,
    action: "admin.created",
    entityType: "AdminUser",
    entityId: admin.id,
    after: { email: admin.email, roleId: admin.roleId },
    reason: "Initial founder account created by seed script.",
  });

  console.log("\nCreated first admin account:");
  console.log(`  email:    ${admin.email}`);
  console.log(`  password: ${temporaryPassword}`);
  console.log("  (shown once — save it, then change it after your first login)\n");
}

main()
  .then(() => db.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await db.$disconnect();
    process.exit(1);
  });
