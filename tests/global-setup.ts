import { mkdirSync, rmSync } from "node:fs";
import { TEST_DATABASE_DIR } from "./test-db";

export default function setup() {
  rmSync(TEST_DATABASE_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DATABASE_DIR, { recursive: true });
  return () => rmSync(TEST_DATABASE_DIR, { recursive: true, force: true });
}
