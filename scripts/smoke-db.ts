import "dotenv/config";
import { db } from "../src/server/db";

async function main() {
  const roleCount = await db.adminRole.count();
  const tableNames = await db.$queryRaw<
    { table_name: string }[]
  >`select table_name from information_schema.tables where table_schema = 'public' order by table_name`;

  console.log("Connected. AdminRole rows:", roleCount);
  console.log(
    "Tables:",
    tableNames.map((t) => t.table_name).join(", "),
  );
}

main()
  .then(() => db.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await db.$disconnect();
    process.exit(1);
  });
