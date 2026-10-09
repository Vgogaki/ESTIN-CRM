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

  const superAdminRole = await db.adminRole.findUniqueOrThrow({
    where: { name: "super_admin" },
  });

  const existingAdminCount = await db.adminUser.count();
  if (existingAdminCount > 0) {
    console.log("Admin users already exist — skipping founder account creation.");
  } else {
    // On a hosted copy the password is supplied through the host's secret
    // settings, so it never appears in a log. Locally (no variable set) a random
    // one is generated and printed once, as before.
    const supplied = process.env.SEED_FOUNDER_PASSWORD;
    if (supplied !== undefined && supplied.length < 12) {
      throw new Error("SEED_FOUNDER_PASSWORD must be at least 12 characters.");
    }
    const password = supplied ?? randomBytes(9).toString("base64url");
    const admin = await db.adminUser.create({
      data: {
        email: FOUNDER_ADMIN_EMAIL,
        name: "Founder",
        passwordHash: await hashPassword(password),
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

    if (supplied === undefined) {
      console.log("\nCreated first admin account:");
      console.log(`  email:    ${admin.email}`);
      console.log(`  password: ${password}`);
      console.log("  (shown once — save it, then change it after your first login)\n");
    } else {
      console.log(`Created founder admin account for ${admin.email} (password from SEED_FOUNDER_PASSWORD).`);
    }
  }

  // Optional second super-admin (the co-founder reviewing a hosted copy). Both
  // variables must be set; a no-op if that email already has an account.
  const coEmail = process.env.SEED_COFOUNDER_EMAIL?.trim().toLowerCase();
  const coPassword = process.env.SEED_COFOUNDER_PASSWORD;
  if (coEmail && coPassword) {
    if (coPassword.length < 12) throw new Error("SEED_COFOUNDER_PASSWORD must be at least 12 characters.");
    if (await db.adminUser.findUnique({ where: { email: coEmail } })) {
      console.log(`Co-founder admin ${coEmail} already exists — left unchanged.`);
    } else {
      const co = await db.adminUser.create({
        data: { email: coEmail, name: "Co-founder", passwordHash: await hashPassword(coPassword), roleId: superAdminRole.id },
      });
      await writeAuditLog({
        actorType: "system",
        actorId: null,
        action: "admin.created",
        entityType: "AdminUser",
        entityId: co.id,
        after: { email: co.email, roleId: co.roleId },
        reason: "Co-founder account created by seed script (SEED_COFOUNDER_EMAIL).",
      });
      console.log(`Created co-founder admin account for ${co.email}.`);
    }
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await db.$disconnect();
    process.exit(1);
  });
