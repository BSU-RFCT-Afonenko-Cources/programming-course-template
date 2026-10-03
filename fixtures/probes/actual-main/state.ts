// Test-only payload copied into the existing authored consumer integration slots.
import {
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "stdlib/path";
export { dirname, join, relative };
export function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`ACTUAL_MAIN_NATIVE: ${message}`);
}
export async function hash(path: string) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", await Deno.readFile(path)),
    ),
  ].map((n) => n.toString(16).padStart(2, "0")).join("");
}
export async function observe(
  ctx: any,
  stage: string,
  fields: Record<string, unknown> = {},
) {
  const path = Deno.env.get("ACTUAL_MAIN_OBSERVER_PATH");
  assert(path, "observer output missing");
  await Deno.writeTextFile(
    path,
    JSON.stringify({ attemptId: ctx.attemptId, stage, ...fields }) + "\n",
    { append: true },
  );
}
const path = (ctx: any) =>
  join(
    ctx.root,
    ".project-publish/builds",
    ctx.attemptId,
    "actual-main-adapter.json",
  );
export async function load(ctx: any) {
  const state = JSON.parse(await Deno.readTextFile(path(ctx)));
  assert(
    state.attemptId === ctx.attemptId && state.sourceRoot === ctx.sourceRoot,
    "not the current actual source/attempt",
  );
  return state;
}
export async function save(ctx: any, value: unknown) {
  await Deno.writeTextFile(path(ctx), JSON.stringify(value));
}
export function nativeMembers(ctx: any, state: any) {
  return ctx.members.map((member: any) => {
    const current = state.nativeMembers[member.namespace];
    assert(
      current && current.format === member.format,
      `missing current native metadata ${member.namespace}`,
    );
    return {
      path: member.path,
      mount: member.mount,
      format: member.format,
      output: current.output,
      ...(state.owners[member.namespace]
        ? { owner: state.owners[member.namespace] }
        : {}),
    };
  });
}

export interface FailureDiagnosticsRequest {
  protocol: 1;
  label: string;
  phase: string;
  profile: "student" | "full";
  root: string;
  sink: string;
  forbiddenRoots: string[];
  members: { namespace: string; path: string; mount: string; format: string }[];
  sourceInputs: Record<"student" | "full", Record<"book" | "essay", string[]>>;
  selectedHashes: Record<string, string>;
  run: Record<string, string | number | boolean | null>;
  anchors: {
    installManifestSha256: string;
    inspectSha256: Record<string, string>;
    template: { commit: string; tree: string };
    providers: { name: string; commit: string; tree: string }[];
    packages: { name: string; archiveSha256: string; fileMapSha256: string }[];
    installationsSha256: string;
    coreModuleSha256: Record<string, string>;
  };
}
export interface ArmedFailureDiagnostics {
  requestPath: string;
  requestSha256: string;
  directory: string;
}
export interface FailureRetentionTestHooks {
  afterRead?(
    candidate: { sourcePath: string; destinationPath: string; ordinal: number },
    bytes: Uint8Array,
  ): Promise<void>;
}

const failureProfiles = ["student", "full"] as const;
const attemptPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const sha256Pattern = /^[a-f0-9]{64}$/;
const sha1Pattern = /^[a-f0-9]{40}$/;
function closed(value: any, keys: string[], label: string) {
  assert(
    value && typeof value === "object" && !Array.isArray(value) &&
      Object.keys(value).every((key) => keys.includes(key)),
    `invalid ${label}`,
  );
}
function pathInside(root: string, path: string) {
  const r = relative(root, path);
  return r === "" || (!isAbsolute(r) && r !== ".." && !r.startsWith("../") &&
    !r.startsWith("..\\"));
}
function literalRelative(path: unknown): path is string {
  return typeof path === "string" && !!path && !isAbsolute(path) &&
    !path.includes("\\") &&
    path.split("/").every((part) =>
      part !== "" && part !== "." && part !== ".."
    );
}
function absoluteLiteral(path: unknown): path is string {
  return typeof path === "string" && isAbsolute(path) && resolve(path) === path;
}
function message(error: unknown): string {
  return error instanceof Error && typeof error.message === "string"
    ? error.message
    : "diagnostic filesystem failure";
}
export async function diagnosticDigest(
  bytes: Uint8Array,
  algorithm = "SHA-256",
) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest(algorithm, new Uint8Array(bytes)),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, "0")).join("");
}
function hashMap(value: any, label: string) {
  assert(
    value && typeof value === "object" && !Array.isArray(value) &&
      Object.values(value).every((hash) =>
        typeof hash === "string" &&
        sha256Pattern.test(hash)
      ),
    `invalid ${label}`,
  );
}
function validateRequest(request: FailureDiagnosticsRequest) {
  closed(request, [
    "protocol",
    "label",
    "phase",
    "profile",
    "root",
    "sink",
    "forbiddenRoots",
    "members",
    "sourceInputs",
    "selectedHashes",
    "run",
    "anchors",
  ], "diagnostic request");
  assert(
    request.protocol === 1 && typeof request.label === "string" &&
      /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(request.label) &&
      ["releases", "student-release", "full-release", "late"].includes(
        request.phase,
      ) &&
      failureProfiles.includes(request.profile),
    "invalid diagnostic runner",
  );
  assert(
    absoluteLiteral(request.root) && absoluteLiteral(request.sink) &&
      Array.isArray(request.forbiddenRoots) &&
      request.forbiddenRoots.every(absoluteLiteral),
    "invalid diagnostic roots",
  );
  for (const root of [request.root, ...request.forbiddenRoots]) {
    assert(
      !pathInside(root, request.sink) && !pathInside(request.sink, root),
      "diagnostic sink aliases protected root",
    );
  }
  assert(
    Array.isArray(request.members) && request.members.length === 5 &&
      new Set(request.members.map((m) => m.namespace)).size === 5,
    "invalid diagnostic member registry",
  );
  for (const member of request.members) {
    closed(
      member,
      ["namespace", "path", "mount", "format"],
      "diagnostic member",
    );
    assert(
      typeof member.namespace === "string" &&
        /^[A-Za-z_][A-Za-z0-9_-]*$/.test(member.namespace) &&
        literalRelative(member.path) && literalRelative(member.mount) &&
        ["html", "pdf", "revealjs"].includes(member.format),
      "invalid diagnostic member",
    );
  }
  closed(
    request.sourceInputs,
    ["student", "full"],
    "diagnostic source registry",
  );
  for (const profile of failureProfiles) {
    closed(
      request.sourceInputs[profile],
      ["book", "essay"],
      "diagnostic source registry",
    );
    for (const name of ["book", "essay"] as const) {
      const member = request.members.find((m) => m.namespace === name);
      const inputs = request.sourceInputs[profile][name];
      assert(
        member?.path === name && member.format === "html" &&
          Array.isArray(inputs) &&
          inputs.length === (name === "book" ? 4 : 5) &&
          new Set(inputs).size === inputs.length &&
          inputs.every((path) =>
            literalRelative(path) &&
            path.startsWith(name + "/") && path.endsWith(".qmd")
          ),
        "invalid diagnostic finite source registry",
      );
    }
  }
  hashMap(request.selectedHashes, "selected source hashes");
  assert(
    Object.keys(request.selectedHashes).length <= 53 &&
      Object.keys(request.selectedHashes).every(literalRelative),
    "invalid selected source hash paths",
  );
  assert(
    request.run && typeof request.run === "object" &&
      !Array.isArray(request.run) &&
      Object.values(request.run).every((value) =>
        value === null || typeof value === "string" ||
        typeof value === "boolean" ||
        (typeof value === "number" && Number.isFinite(value))
      ),
    "invalid diagnostic run",
  );
  const a = request.anchors;
  closed(a, [
    "installManifestSha256",
    "inspectSha256",
    "template",
    "providers",
    "packages",
    "installationsSha256",
    "coreModuleSha256",
  ], "diagnostic anchors");
  assert(
    sha256Pattern.test(a.installManifestSha256) &&
      sha256Pattern.test(a.installationsSha256),
    "invalid manifest hash anchors",
  );
  hashMap(a.inspectSha256, "inspect hash anchors");
  hashMap(a.coreModuleSha256, "Core module hash anchors");
  closed(a.template, ["commit", "tree"], "Template anchor");
  assert(
    sha1Pattern.test(a.template.commit) && sha1Pattern.test(a.template.tree),
    "invalid Template anchor",
  );
  assert(
    Array.isArray(a.providers) && a.providers.length === 4 &&
      new Set(a.providers.map((p) => p.name)).size === 4,
    "invalid provider anchors",
  );
  for (const p of a.providers) {
    closed(p, ["name", "commit", "tree"], "provider anchor");
    assert(
      ["publisher", "qrc", "core", "download"].includes(p.name) &&
        sha1Pattern.test(p.commit) && sha1Pattern.test(p.tree),
      "invalid provider anchor",
    );
  }
  assert(
    Array.isArray(a.packages) && a.packages.length === 6 &&
      new Set(a.packages.map((p) => p.name)).size === 6,
    "invalid package anchors",
  );
  for (const p of a.packages) {
    closed(p, ["name", "archiveSha256", "fileMapSha256"], "package anchor");
    assert(
      [
        "project-publish",
        "reference-catalog",
        "course-core",
        "course-presentation",
        "course-navigation",
        "project-download",
      ].includes(p.name) &&
        sha256Pattern.test(p.archiveSha256) &&
        sha256Pattern.test(p.fileMapSha256),
      "invalid package anchor",
    );
  }
}
async function safeDirectory(path: string, createParents = false) {
  assert(absoluteLiteral(path), "noncanonical diagnostic directory");
  const parsed = path.split("/").filter(Boolean);
  let current = "/";
  for (const part of parsed) {
    current = join(current, part);
    let info: Deno.FileInfo;
    try {
      info = await Deno.lstat(current);
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound) || !createParents) {
        throw error;
      }
      await Deno.mkdir(current);
      info = await Deno.lstat(current);
    }
    assert(
      info.isDirectory && !info.isSymlink,
      "diagnostic directory link or alias",
    );
  }
  assert(
    await Deno.realPath(path) === path,
    "diagnostic directory canonical alias",
  );
}
async function safeRegular(path: string, root: string) {
  assert(
    absoluteLiteral(path) && pathInside(root, path) && path !== root,
    "diagnostic file escapes declared root",
  );
  await safeDirectory(dirname(path));
  const info = await Deno.lstat(path);
  assert(
    info.isFile && !info.isSymlink && (info.nlink === null || info.nlink === 1),
    "diagnostic file is not an unlinked regular file",
  );
  assert(await Deno.realPath(path) === path, "diagnostic file canonical alias");
  return info;
}
function fingerprint(info: Deno.FileInfo) {
  return JSON.stringify([
    info.dev,
    info.ino,
    info.size,
    info.nlink,
    info.mtime?.getTime(),
    info.ctime?.getTime(),
  ]);
}
async function exclusiveBytes(path: string, bytes: Uint8Array) {
  const file = await Deno.open(path, { write: true, createNew: true });
  try {
    let offset = 0;
    while (offset < bytes.length) {
      const written = await file.write(bytes.subarray(offset));
      assert(written > 0, "diagnostic write made no progress");
      offset += written;
    }
  } finally {
    file.close();
  }
}
async function requestFrom(
  armed: Pick<ArmedFailureDiagnostics, "requestPath" | "requestSha256">,
) {
  assert(
    absoluteLiteral(armed.requestPath) &&
      sha256Pattern.test(armed.requestSha256),
    "invalid diagnostic request path/hash",
  );
  const before = await safeRegular(
    armed.requestPath,
    dirname(armed.requestPath),
  );
  const bytes = await Deno.readFile(armed.requestPath);
  const after = await safeRegular(
    armed.requestPath,
    dirname(armed.requestPath),
  );
  assert(
    fingerprint(before) === fingerprint(after) &&
      await diagnosticDigest(bytes) === armed.requestSha256,
    "diagnostic request SHA/stability mismatch",
  );
  const request: FailureDiagnosticsRequest = JSON.parse(
    new TextDecoder().decode(bytes),
  );
  validateRequest(request);
  assert(
    armed.requestPath === join(request.sink, "request.json"),
    "diagnostic request aliases sink",
  );
  await safeDirectory(request.root);
  await safeDirectory(request.sink);
  for (const root of request.forbiddenRoots) await safeDirectory(root);
  return request;
}
export async function armFailureDiagnostics(
  request: Omit<FailureDiagnosticsRequest, "protocol" | "sink">,
  directory: string,
): Promise<ArmedFailureDiagnostics> {
  const complete: FailureDiagnosticsRequest = {
    protocol: 1,
    ...request,
    sink: directory,
  };
  validateRequest(complete);
  await safeDirectory(complete.root);
  for (const root of complete.forbiddenRoots) await safeDirectory(root);
  await safeDirectory(dirname(directory), true);
  await Deno.mkdir(directory); // Each label/request is fresh; no overwrite.
  const requestPath = join(directory, "request.json");
  await exclusiveBytes(
    requestPath,
    new TextEncoder().encode(JSON.stringify(complete, null, 2)),
  );
  const armed = {
    requestPath,
    requestSha256: await hash(requestPath),
    directory,
  };
  await requestFrom(armed);
  return armed;
}
async function validateContext(ctx: any, request: FailureDiagnosticsRequest) {
  assert(
    ctx && ctx.root === request.root && attemptPattern.test(ctx.attemptId) &&
      ctx.sourceRoot ===
        join(
          request.root,
          ".project-publish",
          "builds",
          ctx.attemptId,
          "sources",
        ) &&
      JSON.stringify(ctx.profiles) === JSON.stringify([request.profile]),
    "diagnostic context root/attempt/source/profile mismatch",
  );
  await safeDirectory(ctx.sourceRoot);
  const members = request.members.map((m) => ({
    ...m,
    path: join(ctx.sourceRoot, m.path),
  }));
  assert(
    Array.isArray(ctx.members) && ctx.members.length === members.length &&
      ctx.members.every((actual: any, index: number) => {
        closed(
          actual,
          ["namespace", "path", "mount", "format"],
          "diagnostic context member",
        );
        return ["namespace", "path", "mount", "format"].every((key) =>
          actual[key] === (members[index] as any)[key]
        );
      }),
    "diagnostic member context mismatch",
  );
  const portal = ctx.portal;
  closed(portal, [
    "input",
    "output",
    "renderProfiles",
    "control",
    "controlHash",
    "configHashes",
  ], "diagnostic portal");
  assert(
    portal.input === join(ctx.sourceRoot, "index.qmd") &&
      portal.output ===
        join(
          request.root,
          ".project-publish",
          "builds",
          ctx.attemptId,
          "portal",
        ) &&
      portal.control === join(ctx.sourceRoot, "_quarto-publish-portal.yml") &&
      sha256Pattern.test(portal.controlHash) &&
      Array.isArray(portal.renderProfiles) &&
      portal.renderProfiles.includes(request.profile) &&
      portal.renderProfiles.every((p: unknown) =>
        typeof p === "string" &&
        /^[A-Za-z0-9_-]+$/.test(p)
      ),
    "diagnostic portal context mismatch",
  );
  hashMap(portal.configHashes, "portal config hash provenance");
  closed(ctx.failure, ["phase", "operation", "error"], "diagnostic failure");
  closed(ctx.failure.error, ["name", "message"], "diagnostic failure error");
  assert(
    ["preparation", "render", "publication"].includes(ctx.failure.phase) &&
      [
        "before-render",
        "metadata",
        "portal-render",
        "member-render",
        "save-state",
        "preview",
        "workspace",
        "stage",
        "finalize",
        "commit",
      ].includes(ctx.failure.operation) &&
      typeof ctx.failure.error.name === "string" &&
      typeof ctx.failure.error.message === "string",
    "diagnostic failure descriptor mismatch",
  );
  if (ctx.namespace !== undefined) {
    assert(
      request.members.some((m) => m.namespace === ctx.namespace),
      "diagnostic namespace mismatch",
    );
  }
  if (ctx.format !== undefined) {
    assert(
      ["html", "pdf", "revealjs"].includes(ctx.format),
      "diagnostic format mismatch",
    );
  }
  for (const path of [portal.output, ctx.output, ctx.stage]) {
    if (path === undefined) continue;
    assert(
      absoluteLiteral(path) && !pathInside(path, request.sink) &&
        !pathInside(request.sink, path),
      "diagnostic sink aliases output/stage",
    );
  }
  return {
    root: ctx.root,
    sourceRoot: ctx.sourceRoot,
    profiles: [...ctx.profiles],
    members,
    portal: structuredClone(portal),
    failure: structuredClone(ctx.failure),
    ...(ctx.namespace === undefined ? {} : { namespace: ctx.namespace }),
    ...(ctx.format === undefined ? {} : { format: ctx.format }),
    ...(ctx.output === undefined ? {} : { output: ctx.output }),
    ...(ctx.stage === undefined ? {} : { stage: ctx.stage }),
  };
}
interface FailureCandidate {
  ordinal: number;
  scope: string;
  profile: string;
  sourceRelative: string;
  role: string;
  sourcePath: string;
  destination: string;
}
async function candidates(request: FailureDiagnosticsRequest, ctx: any) {
  const tuples = [{
    scope: "root",
    root: ctx.sourceRoot,
    profile: request.profile,
    sourceRelative: relative(ctx.sourceRoot, ctx.portal.input),
  }];
  for (const profile of failureProfiles) {
    for (const scope of ["book", "essay"] as const) {
      const member = request.members.find((m) => m.namespace === scope)!;
      for (const input of request.sourceInputs[profile][scope]) {
        const coreRoot = join(ctx.sourceRoot, member.path);
        const sourceRelative = relative(coreRoot, join(ctx.sourceRoot, input));
        assert(
          literalRelative(sourceRelative),
          "diagnostic input escapes member Core root",
        );
        tuples.push({ scope, root: coreRoot, profile, sourceRelative });
      }
    }
  }
  assert(tuples.length === 19, "diagnostic finite tuple count");
  const result: FailureCandidate[] = [];
  for (const tuple of tuples) {
    const encode = new TextEncoder();
    const h = await diagnosticDigest(
      encode.encode(tuple.sourceRelative),
      "SHA-1",
    );
    const k = await diagnosticDigest(
      encode.encode(tuple.profile + ":" + tuple.sourceRelative),
      "SHA-1",
    );
    const add = (path: string, role: string) => {
      const ordinal = result.length + 1;
      result.push({
        ordinal,
        scope: tuple.scope,
        profile: tuple.profile,
        sourceRelative: tuple.sourceRelative,
        role,
        sourcePath: join(tuple.root, path),
        destination: "files/candidate-" + String(ordinal).padStart(4, "0") +
          extname(path),
      });
    };
    for (const phase of ["capture", "identity", "render"]) {
      add(
        `.course-owner/native-listing/input/${phase}/${tuple.profile}/${h}.md`,
        "native-listing-input:" + phase,
      );
      add(
        `.course-owner/native-listing/witness/${phase}/${tuple.profile}/${h}.json`,
        "native-listing-witness:" + phase,
      );
      add(
        `.course-owner/${phase}/${tuple.profile}/${h}.json`,
        "native-observation:" + phase,
      );
    }
    add(`.course-owner/reader-input/${tuple.profile}/${h}.md`, "reader-input");
    add(`.course-owner/capture-${k}.log`, "capture-log");
    add(`.course-owner/identity-${k}.log`, "identity-log");
  }
  assert(
    result.length === 228 &&
      new Set(result.map((c) => c.sourcePath)).size === 228,
    "diagnostic finite candidate count/uniqueness",
  );
  return result;
}
async function selectedHashes(
  request: FailureDiagnosticsRequest,
  sourceRoot: string,
) {
  const result: Record<string, unknown>[] = [];
  for (const [path, expected] of Object.entries(request.selectedHashes)) {
    try {
      const sourcePath = join(sourceRoot, path);
      const before = await safeRegular(sourcePath, sourceRoot);
      const bytes = await Deno.readFile(sourcePath);
      const after = await safeRegular(sourcePath, sourceRoot);
      assert(
        fingerprint(before) === fingerprint(after),
        "selected source changed while hashing",
      );
      const observed = await diagnosticDigest(bytes);
      result.push({
        path,
        expected,
        observed,
        status: observed === expected ? "equal" : "changed",
      });
    } catch (error) {
      result.push({
        path,
        expected,
        status: error instanceof Deno.errors.NotFound ? "absent" : "error",
        ...(error instanceof Deno.errors.NotFound
          ? {}
          : { error: message(error) }),
      });
    }
  }
  return result;
}
export async function retainFailureDiagnostics(
  ctx: any,
  supplied?: Pick<ArmedFailureDiagnostics, "requestPath" | "requestSha256">,
  testHooks?: FailureRetentionTestHooks,
): Promise<{ manifestPath: string; manifestSha256: string }> {
  const requestPath = supplied?.requestPath ||
    Deno.env.get("ACTUAL_MAIN_NATIVE_DIAGNOSTICS_REQUEST");
  const requestSha256 = supplied?.requestSha256 ||
    Deno.env.get("ACTUAL_MAIN_NATIVE_DIAGNOSTICS_REQUEST_SHA256");
  assert(requestPath && requestSha256, "diagnostic request missing");
  const request = await requestFrom({ requestPath, requestSha256 });
  const context = await validateContext(ctx, request);
  const attemptRoot = join(request.sink, ctx.attemptId);
  await Deno.mkdir(attemptRoot); // The prior notification's evidence cannot be overwritten.
  await Deno.mkdir(join(attemptRoot, "files"));
  const rows: Record<string, unknown>[] = [];
  for (const candidate of await candidates(request, ctx)) {
    const destinationPath = join(attemptRoot, candidate.destination);
    const { destination: _destination, ...facts } = candidate;
    let observed = false;
    try {
      const before = await safeRegular(candidate.sourcePath, ctx.sourceRoot);
      observed = true;
      const source = await Deno.open(candidate.sourcePath, { read: true });
      let bytes: Uint8Array;
      try {
        const stat = await source.stat();
        assert(
          fingerprint(stat) === fingerprint(before),
          "diagnostic source changed before open",
        );
        const parts: Uint8Array[] = [];
        const buffer = new Uint8Array(65536);
        let size = 0, count: number | null;
        while ((count = await source.read(buffer)) !== null) {
          if (count === 0) continue;
          parts.push(buffer.slice(0, count));
          size += count;
        }
        bytes = new Uint8Array(size);
        let offset = 0;
        for (const part of parts) {
          bytes.set(part, offset);
          offset += part.length;
        }
        assert(
          fingerprint(await source.stat()) === fingerprint(before),
          "diagnostic source unstable during read",
        );
      } finally {
        source.close();
      }
      await testHooks?.afterRead?.({
        sourcePath: candidate.sourcePath,
        destinationPath,
        ordinal: candidate.ordinal,
      }, bytes);
      const after = await safeRegular(candidate.sourcePath, ctx.sourceRoot);
      const sourceAgain = await Deno.readFile(candidate.sourcePath);
      const final = await safeRegular(candidate.sourcePath, ctx.sourceRoot);
      const sha256 = await diagnosticDigest(bytes);
      assert(
        fingerprint(before) === fingerprint(final) &&
          fingerprint(before) === fingerprint(after) &&
          sha256 === await diagnosticDigest(sourceAgain),
        "diagnostic source unstable after read",
      );
      await exclusiveBytes(destinationPath, bytes);
      await safeRegular(destinationPath, attemptRoot);
      const copied = await Deno.readFile(destinationPath);
      assert(
        copied.length === bytes.length &&
          await diagnosticDigest(copied) === sha256,
        "diagnostic copied bytes/SHA mismatch",
      );
      rows.push({
        ...facts,
        destination: candidate.destination,
        status: "retained",
        bytes: bytes.length,
        sha256,
      });
    } catch (error) {
      rows.push({
        ...facts,
        status: error instanceof Deno.errors.NotFound && !observed
          ? "absent-at-notification"
          : (error instanceof Deno.errors.NotFound && observed) ||
              /unstable|changed (before|while)/.test(message(error))
          ? "unstable"
          : "error",
        ...(error instanceof Deno.errors.NotFound && !observed
          ? {}
          : { error: message(error) }),
      });
    }
  }
  const hashes = await selectedHashes(request, ctx.sourceRoot);
  const counts = {
    total: rows.length,
    retained: rows.filter((row) => row.status === "retained").length,
    absent:
      rows.filter((row) => row.status === "absent-at-notification").length,
    errors:
      rows.filter((row) => row.status === "error" || row.status === "unstable")
        .length +
      hashes.filter((row) => row.status === "error").length,
  };
  const manifest = {
    protocol: 1,
    scope: "diagnostic-only",
    attemptId: ctx.attemptId,
    label: request.label,
    phase: request.phase,
    profile: request.profile,
    run: request.run,
    requestSha256,
    anchors: request.anchors,
    context,
    selectedHashes: hashes,
    candidates: rows,
    counts,
  };
  const manifestPath = join(attemptRoot, "manifest.json");
  await exclusiveBytes(
    manifestPath,
    new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
  );
  await safeRegular(manifestPath, attemptRoot);
  const manifestSha256 = await hash(manifestPath);
  if (counts.errors) {
    throw new Error(
      "ACTUAL_MAIN_NATIVE: retention incomplete; partial manifest " +
        manifestPath,
    );
  }
  return { manifestPath, manifestSha256 };
}
export async function readFailureDiagnostics(armed: ArmedFailureDiagnostics) {
  const attempts: {
    attemptId: string;
    manifestPath: string;
    manifestSha256: string;
    retainedCount: number;
    absentCount: number;
    errorCount: number;
  }[] = [];
  try {
    await requestFrom(armed);
    for await (const entry of Deno.readDir(armed.directory)) {
      if (entry.name === "request.json") continue;
      assert(
        entry.isDirectory && !entry.isSymlink &&
          attemptPattern.test(entry.name),
        "unexpected external diagnostic entry",
      );
      const root = join(armed.directory, entry.name);
      await safeDirectory(root);
      const manifestPath = join(root, "manifest.json");
      await safeRegular(manifestPath, root);
      const manifest = JSON.parse(await Deno.readTextFile(manifestPath));
      assert(
        manifest.protocol === 1 && manifest.scope === "diagnostic-only" &&
          manifest.attemptId === entry.name &&
          manifest.requestSha256 === armed.requestSha256 &&
          manifest.counts?.total === 228,
        "invalid external diagnostic manifest",
      );
      attempts.push({
        attemptId: entry.name,
        manifestPath,
        manifestSha256: await hash(manifestPath),
        retainedCount: manifest.counts.retained,
        absentCount: manifest.counts.absent,
        errorCount: manifest.counts.errors,
      });
    }
    assert(
      attempts.length <= 1,
      "multiple attempts for one diagnostic request",
    );
    return {
      requestSha256: armed.requestSha256,
      status: attempts.some((a) => a.errorCount)
        ? "retention-error"
        : attempts.length
        ? "retained"
        : "not-notified",
      attempts,
    };
  } catch (error) {
    return {
      requestSha256: armed.requestSha256,
      status: "inventory-error",
      attempts,
      error: message(error),
    };
  }
}

export async function writeFailureDiagnosticsObservation(
  armed: ArmedFailureDiagnostics,
  childExit: number,
) {
  const request = await requestFrom(armed);
  const inventory = await readFailureDiagnostics(armed);
  const observationPath = join(armed.directory, "observation.json");
  await exclusiveBytes(
    observationPath,
    new TextEncoder().encode(JSON.stringify(
      {
        label: request.label,
        phase: request.phase,
        profile: request.profile,
        childExit,
        ...inventory,
      },
      null,
      2,
    )),
  );
  return { observationPath, observationSha256: await hash(observationPath) };
}
