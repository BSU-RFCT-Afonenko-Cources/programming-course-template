// Mechanical evidence helpers; pedagogical/resource policy belongs to installed Core.
import { dirname, join, relative } from "stdlib/path";
export { dirname, join, relative };
export function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`PORTAL_CONSUMER: ${message}`);
}
export async function exists(path: string) {
  try {
    await Deno.stat(path);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}
export async function files(root: string): Promise<string[]> {
  assert(!(await Deno.lstat(root)).isSymlink, `symlink root ${root}`);
  const result: string[] = [];
  for await (const entry of Deno.readDir(root)) {
    assert(!entry.isSymlink, `symlink ${join(root, entry.name)}`);
    const path = join(root, entry.name);
    if (entry.isDirectory) result.push(...await files(path));
    else if (entry.isFile) result.push(path);
  }
  return result.sort();
}
export async function hash(path: string) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", await Deno.readFile(path)),
    ),
  ].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
export async function treeHashes(root: string) {
  return Object.fromEntries(
    await Promise.all(
      (await files(root)).map(
        async (path) => [relative(root, path), await hash(path)],
      ),
    ),
  );
}
export async function write(root: string, path: string, text: string) {
  const target = join(root, path);
  await Deno.mkdir(dirname(target), { recursive: true });
  await Deno.writeTextFile(target, text);
}
export async function command(
  executable: string,
  args: string[],
  cwd: string,
  env: Record<string, string> = {},
) {
  const result = await new Deno.Command(executable, {
    args,
    cwd,
    env,
    stdout: "piped",
    stderr: "piped",
  }).output();
  const text = new TextDecoder().decode(result.stdout) +
    new TextDecoder().decode(result.stderr);
  assert(result.success, `${executable} ${args.join(" ")}: ${text}`);
  return text;
}
export async function event(
  ctx: any,
  stage: string,
  extra: Record<string, unknown> = {},
) {
  const root = join(ctx.root, ".project-publish");
  await Deno.mkdir(root, { recursive: true });
  await Deno.writeTextFile(
    join(root, "consumer-events.jsonl"),
    JSON.stringify({ attemptId: ctx.attemptId, stage, ...extra }) + "\n",
    { append: true },
  );
}
