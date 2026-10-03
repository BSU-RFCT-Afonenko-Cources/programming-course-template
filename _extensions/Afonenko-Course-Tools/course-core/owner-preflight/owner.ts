// Opt-in internal owner attempt. Public Course/Fragment remain unchanged.
import {
  dirname,
  fromFileUrl,
  isAbsolute,
  join,
  relative,
  resolve,
  toFileUrl,
} from "stdlib/path";
import {
  earlyResourceGate,
  type ResourceSeal,
  sealResourceObservation,
  writeResourceIndex,
} from "./resources.ts";
import {
  auditNavigation,
  type NavigationScope,
  validateNavigationCompletion,
} from "./navigation.ts";
import {
  finishPublicationAddresses,
  type OwnerPublicationAddressContext,
  type OwnerPublicationAddressFinish,
  type PreparedPublicationAddresses,
  preparePublicationAddresses,
  validatePreparedPublicationAddresses,
} from "./publication-addresses.ts";
import {
  assertCaptureProjections,
  type CaptureProjection,
  privateCaptureOutput,
  retainCaptureProjection,
} from "./capture-projections.ts";
import {
  auditNativeListings,
  currentNativeListingPlans,
  NativeListingFailure,
  type NativeListingPlans,
} from "./native-listing.ts";
import {
  type NativeListingProviderBinding,
  NativeListingProviderFailure,
  resolveNativeListingProvider,
} from "./native-listing-provider.ts";
import {
  assertNativeListingEvidenceMaps,
  type ListingHashes,
  type ListingPaths,
  nativeListingEvidencePaths,
  retainNativeListingBaselineHashes,
  retainNativeListingProviderServices,
  validateNativeListingObservation,
} from "./native-listing-evidence.ts";
import { finishNativeListingAddresses } from "./native-listing-addresses.ts";
export { validateOwnerResources } from "./resources.ts";
export type {
  OwnerResourceFile,
  OwnerResourceIndex,
  ResolvedResourceUse,
  ResourceDiagnostic,
  ResourceFilePolicy,
  RuntimeEligibility,
} from "./resources.ts";
export class OwnerFailure extends Error {
  constructor(public code: string, public override cause: unknown) {
    super(`${code}: ${JSON.stringify(cause)}`);
  }
}
export const quarto = Deno.env.get("QUARTO") || "quarto";
const here = dirname(fromFileUrl(import.meta.url));
const decoder = new TextDecoder();
export async function invoke(
  executable: string,
  args: string[],
  cwd: string,
  env: Record<string, string> = {},
) {
  const r = await new Deno.Command(executable, {
    args,
    cwd,
    env,
    stdout: "piped",
    stderr: "piped",
  }).output();
  return {
    exitCode: r.code,
    stdout: decoder.decode(r.stdout),
    stderr: decoder.decode(r.stderr),
  };
}
function inside(root: string, path: string): string {
  const rel = relative(root, resolve(root, path));
  if (rel === ".." || rel.startsWith("../") || isAbsolute(rel)) {
    throw new OwnerFailure("SOURCE.OUTSIDE_OWNER", path);
  }
  return rel.replaceAll("\\", "/");
}
export async function exists(path: string) {
  try {
    await Deno.stat(path);
    return true;
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return false;
    throw e;
  }
}
export async function inspect(root: string, profile: string) {
  const cwd = (await Deno.stat(root)).isDirectory ? root : dirname(root);
  const r = await invoke(quarto, ["inspect", root, "--profile", profile], cwd);
  if (r.exitCode) throw new OwnerFailure("SOURCE.INSPECT_FAILED", r);
  return JSON.parse(r.stdout);
}
export interface Coverage {
  kind: "root" | "include" | "resource";
  profiles?: string[];
  evidence: unknown;
}
export interface Audit {
  root: string;
  profiles: Record<string, any>;
  coverage: Record<string, Coverage>;
  excluded: string[];
  dependencies: Record<string, string>;
  nativeListingPlans?: NativeListingPlans;
  nativeListingProvider?: NativeListingProviderBinding;
  download?: { helper: string; directory: string };
  navigation?: {
    profile: "student" | "full";
    scope: NavigationScope;
    document: any;
    members: {
      path: string;
      native: any;
      configHashes: Record<string, string>;
      download?: { helper: string; directory: string };
    }[];
    dormant: {
      path: string;
      native: any;
      configHashes: Record<string, string>;
      download?: { helper: string; directory: string };
    }[];
    addresses: {
      target: string;
      member: string;
      source: string;
      format: string;
    }[];
    rootAddresses: {
      target: string;
      member: string;
      source: string;
      format: string;
    }[];
  };
}
async function fileList(root: string, excluded: string[]): Promise<string[]> {
  const paths: string[] = [];
  async function visit(dir: string) {
    for await (const entry of Deno.readDir(dir)) {
      const path = join(dir, entry.name), rel = inside(root, path);
      if (excluded.some((x) => rel === x || rel.startsWith(x + "/"))) continue;
      if (entry.isSymlink) {
        throw new OwnerFailure("SOURCE.SYMLINK_UNSUPPORTED", rel);
      }
      if (entry.isDirectory) await visit(path);
      else if (entry.isFile) paths.push(rel);
    }
  }
  await visit(root);
  return paths.sort();
}
export async function auditOwner(
  input: string,
  delivery?: string,
): Promise<Audit> {
  const root = await Deno.realPath(input);
  const profiles: Record<string, any> = {},
    coverage: Record<string, Coverage> = {};
  const documents: Record<string, Record<string, any>> = {};
  const excluded = [
    ".git",
    ".quarto",
    "_freeze",
    ".course-owner",
    "_generated/course-spec",
  ];
  for (const profile of ["student", "full"]) {
    if (!await exists(join(root, `_quarto-${profile}.yml`))) {
      throw new OwnerFailure("SOURCE.MISSING_PROFILE", profile);
    }
    const info = await inspect(root, profile);
    profiles[profile] = info;
    documents[profile] = {};
    if (info.config.course?.view !== profile) {
      throw new OwnerFailure("SOURCE.PROFILE_VIEW_MISMATCH", {
        profile,
        view: info.config.course?.view,
      });
    }
    const project = info.config.project;
    if (!["default", "website", "book"].includes(project.type || "default")) {
      throw new OwnerFailure("SOURCE.PROJECT_TYPE_UNSUPPORTED", project.type);
    }
    if (project["output-dir"]) {
      const out = inside(root, project["output-dir"]);
      if (!out) throw new OwnerFailure("SOURCE.UNISOLATED_OUTPUT", out);
      excluded.push(out);
    } else throw new OwnerFailure("SOURCE.OUTPUT_DIR_REQUIRED", profile);
    const hooks = project["pre-render"] || [];
    const guard = delivery
      ? delivery + "/entrypoints/owner-freeze.ts"
      : relative(root, join(here, "../entrypoints/owner-freeze.ts")).replaceAll(
        "\\",
        "/",
      );
    // In an installed consumer `here` is inside that owner. Never add/reorder hooks silently.
    if (
      hooks.at(-1) !== guard ||
      hooks.filter((x: string) => x === guard).length !== 1
    ) {
      throw new OwnerFailure("SOURCE.FREEZE_GUARD_NOT_LAST", {
        profile,
        expected: guard,
        hooks,
      });
    }
    const filters = info.config.filters || [];
    if (
      JSON.stringify(filters) !==
        JSON.stringify(["course-core", "course-presentation"]) &&
      JSON.stringify(filters) !== JSON.stringify(["course-core"]) &&
      JSON.stringify(filters) !==
        JSON.stringify([
          "course-core",
          "course-presentation",
          "project-download",
        ])
    ) throw new OwnerFailure("SOURCE.FILTER_ORDER_UNSUPPORTED", filters);
    for (const path of info.files.input) {
      const rel = inside(root, path);
      if (!rel.endsWith(".qmd")) {
        throw new OwnerFailure("SOURCE.INPUT_FORMAT_UNSUPPORTED", rel);
      }
      const resolvedDocument = await inspect(path, profile);
      documents[profile][rel] = resolvedDocument;
      const documentFilters = resolvedDocument.formats?.html?.pandoc?.filters;
      if (JSON.stringify(documentFilters) !== JSON.stringify(filters)) {
        throw new OwnerFailure("SOURCE.DOCUMENT_FILTERS_UNSUPPORTED", {
          source: rel,
          profile,
          filters: documentFilters,
        });
      }
      const previous = coverage[rel];
      if (previous && previous.kind !== "root") {
        throw new OwnerFailure("SOURCE.AMBIGUOUS_QMD", rel);
      }
      coverage[rel] = {
        kind: "root",
        profiles: [...(previous?.profiles || []), profile],
        evidence: "quarto inspect files.input",
      };
    }
  }
  // Register all roots first; then resolve only native inspect include/resource edges.
  for (const [profile, info] of Object.entries(profiles)) {
    for (const facts of Object.values(info.fileInformation) as any[]) {
      for (const edge of facts.includeMap || []) {
        const source = resolve(root, edge.source),
          target = resolve(dirname(source), edge.target),
          rel = inside(root, target);
        if (!await exists(target)) {
          throw new OwnerFailure("SOURCE.INCLUDE_NOT_RESOLVED", edge);
        }
        if (coverage[rel]?.kind === "root") {
          throw new OwnerFailure("SOURCE.AMBIGUOUS_QMD", {
            path: rel,
            roles: ["root", "include"],
          });
        }
        coverage[rel] = { kind: "include", evidence: { profile, edge } };
      }
    }
    for (const path of info.files.resources || []) {
      const rel = inside(root, path), actual = join(root, rel);
      if (!await exists(actual)) {
        throw new OwnerFailure("SOURCE.RESOURCE_NOT_RESOLVED", path);
      }
      const entries = (await Deno.stat(actual)).isDirectory
        ? await fileList(actual, [])
        : [""];
      for (const child of entries) {
        const resource = child ? inside(root, join(actual, child)) : rel;
        if (!resource.endsWith(".qmd")) continue;
        // Raw delivery is a separate native edge. Keep canonical navigation identity;
        // the CUE early gate rejects selecting these source bytes.
        if (coverage[resource] && coverage[resource].kind !== "resource") {
          continue;
        }
        coverage[resource] = { kind: "resource", evidence: { profile, path } };
      }
    }
  }
  // Freeze every externally located file exposed by the public inspect dependency list.
  // Runtime packages and arbitrary dynamic reads are outside this finite dependency proof.
  const dependencies: Record<string, string> = {};
  for (const info of Object.values(profiles)) {
    for (const path of info.files.config || []) inside(root, path);
    for (const path of info.files.configResources || []) {
      const actual = resolve(root, path);
      if (!(await Deno.stat(actual)).isFile) {
        throw new OwnerFailure("SOURCE.DEPENDENCY_NOT_FILE", actual);
      }
      dependencies[actual] = await digestFile(actual);
    }
  }
  const installedPayloads: string[] = [];
  for (const info of Object.values(profiles)) {
    for (const extension of info.extensions || []) {
      const rel = relative(root, resolve(root, extension.path));
      if (rel && rel !== ".." && !rel.startsWith("../") && !isAbsolute(rel)) {
        installedPayloads.push(rel.replaceAll("\\", "/"));
      }
    }
  }
  let download: Audit["download"];
  if (
    Object.values(profiles).some((p: any) =>
      p.config.filters?.includes("project-download")
    )
  ) {
    const extension = delivery || inside(root, dirname(here));
    const owned = await downloadOwnership(root, extension, coverage);
    download = {
      helper: inside(root, owned.helper),
      directory: inside(root, owned.state.directory),
    };
    excluded.push(download.directory);
  }
  const uniqueExcluded = [...new Set(excluded)];
  for (const path of await fileList(root, uniqueExcluded)) {
    if (installedPayloads.some((p) => path.startsWith(p + "/"))) continue; // native installed payload, frozen by bytes below
    if (path.endsWith(".qmd") && !coverage[path]) {
      throw new OwnerFailure("SOURCE.UNCOVERED_QMD", path);
    }
  }
  let nativeListingProvider: NativeListingProviderBinding | undefined;
  let nativeListingPlans: NativeListingPlans | undefined;
  if (
    Object.values(documents).some((profile) =>
      Object.values(profile).some((document) =>
        document.formats?.html?.metadata?.listing !== undefined
      )
    )
  ) {
    try {
      nativeListingProvider = await resolveNativeListingProvider(quarto, {
        cwd: root,
      });
    } catch (error) {
      if (error instanceof NativeListingProviderFailure) {
        throw new OwnerFailure(error.code, error.message);
      }
      throw error;
    }
    nativeListingPlans = {};
    for (const [profile, project] of Object.entries(profiles)) {
      try {
        Object.assign(
          nativeListingPlans,
          await auditNativeListings({
            root,
            profile: profile as "student" | "full",
            project,
            documents: documents[profile],
            provider: nativeListingProvider,
          }),
        );
      } catch (error) {
        if (error instanceof NativeListingFailure) {
          throw new OwnerFailure(error.code, error.cause);
        }
        throw error;
      }
    }
  }
  return {
    root,
    profiles,
    coverage,
    excluded: uniqueExcluded,
    dependencies,
    ...(nativeListingPlans
      ? { nativeListingPlans, nativeListingProvider }
      : {}),
    ...(download ? { download } : {}),
  };
}
export async function fingerprint(audit: Audit) {
  const files: Record<string, string> = {};
  for (const path of await fileList(audit.root, audit.excluded)) {
    files[path] = Array.from(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          await Deno.readFile(join(audit.root, path)),
        ),
      ),
    ).map((n) => n.toString(16).padStart(2, "0")).join("");
  }
  return files;
}
export interface PreparedOwner {
  protocol: 1;
  root: string;
  attemptId: string;
  profile: "student" | "full";
  sessionId: string;
  sessionPath: string;
  sessionHash: string;
}
export interface OwnerResult {
  exitCode: 0 | 1 | 2;
  stage: string;
  report: Record<string, any>;
}
export interface Session {
  protocol: 1;
  root: string;
  attemptId: string;
  profile: "student" | "full";
  sessionId: string;
  extension: string;
  quarto: string;
  audit: Audit;
  files: Record<string, string>;
  validated: boolean;
  captures: Record<string, string>;
  captureHashes: Record<string, string>;
  captureProjections: Record<string, CaptureProjection>;
  captureProjectionHash: string;
  identities: Record<string, string>;
  identityHashes: Record<string, string>;
  identityReaders: Record<string, string>;
  identityReplays: Record<string, true>;
  readerInputs: Record<string, string>;
  readerInputHashes: Record<string, string>;
  nativeListingPlans?: NativeListingPlans;
  nativeListingProvider?: NativeListingProviderBinding;
  nativeListingInputs?: ListingPaths;
  nativeListingWitnesses?: ListingPaths;
  nativeListingHashes?: ListingHashes;
  nativeListingServiceFiles?: Record<string, string>;
  publicationAddresses?: PreparedPublicationAddresses;
  headers: {
    id: string;
    source: { rootQmd: string; owner: string };
    ordinal: number;
    topLevel: boolean;
    level: number;
    title: string;
    titleJson: string;
    classes: string[];
    attributes: { key: string; value: string }[];
    ancestors: {
      id: string;
      classes: string[];
      attributes: { key: string; value: string }[];
    }[];
  }[];
}
export interface Invocation {
  protocol: 1;
  root: string;
  attemptId: string;
  profile: "student" | "full";
  sessionId: string;
  sessionPath: string;
  sessionHash: string;
  invocationId: string;
  phase: "capture" | "render";
  inputsHash: string;
  output: string;
  identity?: true;
}
function invalid(cause: unknown): never {
  throw new OwnerFailure("SOURCE.INVALID_ATTEMPT", cause);
}
async function noLink(path: string) {
  if ((await Deno.lstat(path)).isSymlink) invalid("symlink: " + path);
}
async function noStateLinks(root: string, path: string) {
  const rel = inside(root, path);
  let current = root;
  for (const component of rel.split("/")) {
    current = join(current, component);
    await noLink(current);
  }
}
function record(value: any): boolean {
  return value && typeof value === "object" && !Array.isArray(value);
}
function hashes(value: any): boolean {
  return record(value) &&
    Object.values(value).every((v) =>
      typeof v === "string" && /^[a-f0-9]{64}$/.test(v)
    );
}
export async function digestFile(path: string) {
  await noLink(path);
  return digest(await Deno.readFile(path));
}
async function digestStateFile(root: string, path: string) {
  await noStateLinks(root, path);
  return digestFile(path);
}
async function digest(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)),
    ),
  ).map((n) => n.toString(16).padStart(2, "0")).join("");
}
async function objectHash(value: unknown) {
  return digest(new TextEncoder().encode(JSON.stringify(value)));
}
export async function sha(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-1", new TextEncoder().encode(value)),
    ),
  ).map((n) => n.toString(16).padStart(2, "0")).join("");
}
export async function sessionAt(path: string): Promise<Session> {
  try {
    await noLink(dirname(path));
    await noLink(path);
    const s = JSON.parse(await Deno.readTextFile(path));
    if (
      s.protocol !== 1 || !["student", "full"].includes(s.profile) ||
      typeof s.attemptId !== "string" || !s.attemptId ||
      typeof s.sessionId !== "string" || !s.sessionId ||
      typeof s.quarto !== "string" || !s.quarto || !hashes(s.files) ||
      !record(s.audit) || !record(s.captures) || !hashes(s.captureHashes) ||
      !record(s.captureProjections) ||
      typeof s.captureProjectionHash !== "string" ||
      !record(s.identities) || !hashes(s.identityHashes) ||
      !Array.isArray(s.headers) || !record(s.identityReaders) ||
      !record(s.identityReplays) ||
      !record(s.readerInputs) || !hashes(s.readerInputHashes) ||
      Object.values(s.identityReplays).some((value) => value !== true) ||
      Object.values(s.identityReaders).some((reader) =>
        typeof reader !== "string" || !reader.endsWith("-auto_identifiers")
      ) ||
      typeof s.validated !== "boolean" || typeof s.extension !== "string"
    ) invalid("missing fields");
    if (
      await Deno.realPath(s.root) !== s.root || s.audit.root !== s.root ||
      !["session.json", "preparation.json"].includes(
        relative(join(s.root, ".course-owner"), resolve(path)),
      )
    ) invalid("wrong owner session path");
    if (
      !inside(s.root, s.extension) ||
      inside(s.root, s.extension) !== s.extension
    ) invalid("escaping extension");
    const inputs = Object.entries(s.audit.coverage).filter((
      [, v]: [string, any],
    ) => v.kind === "root");
    const expected = inputs.flatMap(([source, v]: [string, any]) =>
      v.profiles.map((profile: string) => profile + ":" + source)
    ).sort();
    if (Object.keys(s.identityReplays).some((key) => !expected.includes(key))) {
      invalid("foreign native reader replay");
    }
    for (const [key, input] of Object.entries(s.readerInputs)) {
      if (
        !s.identityReplays[key] || input !== join(
            s.root,
            ".course-owner",
            "reader-input",
            key.split(":")[0],
            await sha(key.slice(key.indexOf(":") + 1)) + ".md",
          )
      ) invalid("foreign native reader input");
    }
    for (const [key, capture] of Object.entries(s.captures)) {
      if (
        !expected.includes(key) ||
        capture !==
          join(
            s.root,
            ".course-owner",
            "capture",
            key.split(":")[0],
            await sha(key.slice(key.indexOf(":") + 1)) + ".json",
          )
      ) invalid("foreign capture");
    }
    for (const [key, capture] of Object.entries(s.identities)) {
      if (
        !expected.includes(key) || capture !== join(
            s.root,
            ".course-owner",
            "identity",
            key.split(":")[0],
            await sha(key.slice(key.indexOf(":") + 1)) + ".json",
          )
      ) invalid("foreign Header identity capture");
    }
    if (
      s.validated &&
      JSON.stringify(Object.keys(s.captures).sort()) !==
        JSON.stringify(expected)
    ) invalid("incomplete baselines");
    if (
      s.validated &&
      [s.identities, s.identityHashes, s.identityReaders].some((map) =>
        JSON.stringify(Object.keys(map).sort()) !== JSON.stringify(expected)
      )
    ) invalid("incomplete Header identity evidence");
    if (
      s.validated &&
      [s.readerInputs, s.readerInputHashes].some((map) =>
        JSON.stringify(Object.keys(map).sort()) !==
          JSON.stringify(Object.keys(s.identityReplays).sort())
      )
    ) invalid("incomplete native reader input evidence");
    await assertCaptureProjections(s);
    await assertNativeListingEvidenceMaps(s);
    return s;
  } catch (error) {
    if (error instanceof OwnerFailure) throw error;
    invalid(String(error));
  }
}
async function assertCaptures(s: Session) {
  await assertCaptureProjections(s);
  if (!s.validated) return;
  for (const [key, path] of Object.entries(s.captures)) {
    if (await exists(path)) await noStateLinks(s.root, path);
    if (
      !s.captureHashes[key] || !await exists(path) ||
      await digestFile(path) !== s.captureHashes[key]
    ) throw new OwnerFailure("SOURCE.BASELINE_CHANGED", key);
  }
  for (const [key, path] of Object.entries(s.identities)) {
    if (await exists(path)) await noStateLinks(s.root, path);
    if (
      !s.identityHashes[key] || !await exists(path) ||
      await digestFile(path) !== s.identityHashes[key]
    ) {
      throw new OwnerFailure("SOURCE.HEADER_IDENTITY_CHANGED", key);
    }
  }
  for (const [key, path] of Object.entries(s.readerInputs)) {
    if (await exists(path)) await noStateLinks(s.root, path);
    if (
      !await exists(path) || await digestFile(path) !== s.readerInputHashes[key]
    ) {
      throw new OwnerFailure("SOURCE.HEADER_IDENTITY_CHANGED", key);
    }
    const proof =
      JSON.parse(await Deno.readTextFile(s.identities[key])).readerReplay;
    if (
      proof?.inputPath !== path ||
      proof?.inputHash !== s.readerInputHashes[key] ||
      typeof proof?.input !== "string" ||
      await digest(new TextEncoder().encode(proof.input)) !==
        s.readerInputHashes[key]
    ) throw new OwnerFailure("SOURCE.HEADER_IDENTITY_CHANGED", key);
  }
}
export interface DownloadOwnership {
  protocol: 1;
  root: string;
  directory: string;
  files: {
    path: string;
    source: string;
    resources: string[];
    sha256: string;
  }[];
}
function nativeSources(coverage: Record<string, Coverage>): string[] {
  return Object.entries(coverage).filter(([, fact]) => fact.kind === "root")
    .map(([source]) => source).sort();
}
/** Internal shared provider adapter; public consumers use inspectOwnerDownloads. */
export async function downloadOwnership(
  root: string,
  extension: string,
  coverage: Record<string, Coverage>,
) {
  const helper = join(
    root,
    dirname(extension),
    "project-download/ownership.ts",
  );
  let api: any;
  try {
    await noStateLinks(root, helper);
    api = await import(toFileUrl(helper).href);
    if (
      typeof api.inspectOwnedRequests !== "function" ||
      typeof api.clearOwnedRequests !== "function"
    ) throw new Error("missing public ownership functions");
  } catch (error) {
    throw new OwnerFailure(
      "SOURCE.DOWNLOAD_OWNERSHIP_UNSUPPORTED",
      String(error),
    );
  }
  const sources = nativeSources(coverage);
  let state: DownloadOwnership;
  try {
    state = await api.inspectOwnedRequests(root, sources);
  } catch (error) {
    invalid(String(error));
  }
  // Validate the public ownership envelope; provider alone validates its transport.
  if (
    !record(state) || state.protocol !== 1 || state.root !== root ||
    typeof state.directory !== "string" ||
    resolve(root, state.directory) !== state.directory ||
    !Array.isArray(state.files)
  ) invalid("invalid public Download ownership envelope");
  const directory = inside(root, state.directory);
  if (
    !directory || insideOrUndefined(state.directory, helper) !== undefined ||
    sources.some((source) =>
      insideOrUndefined(state.directory, join(root, source)) !== undefined
    )
  ) invalid("Download mutable directory overlaps immutable owner");
  const seen = new Set<string>();
  for (const file of state.files) {
    if (
      !record(file) || typeof file.path !== "string" ||
      resolve(root, file.path) !== file.path ||
      !inside(state.directory, file.path) || !sources.includes(file.source) ||
      !Array.isArray(file.resources) || file.resources.some((value: unknown) =>
        typeof value !== "string"
      ) || typeof file.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(file.sha256) || seen.has(file.path)
    ) invalid("invalid public Download ownership file");
    seen.add(file.path);
  }
  return { api, state, helper, sources };
}
async function inspectSessionDownload(s: Session) {
  if (!s.audit.download) return;
  const owned = await downloadOwnership(s.root, s.extension, s.audit.coverage);
  if (
    inside(s.root, owned.helper) !== s.audit.download.helper ||
    inside(s.root, owned.state.directory) !== s.audit.download.directory ||
    !s.audit.excluded.includes(s.audit.download.directory)
  ) invalid("Download ownership identity changed");
  return owned;
}
/** Provider-owned service evidence after the caller has awaited native render success. */
export async function inspectOwnerDownloads(
  prepared: PreparedOwner,
): Promise<DownloadOwnership | undefined> {
  const s = await preparedSession(prepared);
  await assertFrozen(prepared.sessionPath);
  return (await inspectSessionDownload(s))?.state;
}
export async function assertFrozen(path: string) {
  const s = await sessionAt(path);
  await assertCaptures(s);
  if (s.nativeListingPlans) {
    for (const [key, plan] of Object.entries(s.nativeListingPlans)) {
      if (plan?.root !== s.root) {
        invalid({ key, reason: "native listing plan root differs from owner" });
      }
    }
    try {
      await currentNativeListingPlans(s.nativeListingPlans);
    } catch (error) {
      if (error instanceof NativeListingFailure) {
        throw new OwnerFailure(error.code, error.cause);
      }
      throw error;
    }
  }
  await inspectSessionDownload(s);
  await validatePreparedPublicationAddresses(s);
  const audit = s.audit.navigation
    ? await auditNavigation(
      s.root,
      s.extension,
      s.profile,
      s.audit.navigation.scope,
    )
    : await auditOwner(s.root, s.extension);
  if (JSON.stringify(audit) !== JSON.stringify(s.audit)) {
    throw new OwnerFailure("SOURCE.CONFIGURATION_CHANGED", s.root);
  }
  const active = await activeOwner(s.root);
  const override = active?.phase === "render"
    ? insideOrUndefined(s.root, active.output)
    : undefined;
  const files = await fingerprint(
    override ? { ...audit, excluded: [...audit.excluded, override] } : audit,
  );
  const changed = [...new Set([...Object.keys(s.files), ...Object.keys(files)])]
    .filter((p) => s.files[p] !== files[p]);
  if (changed.length) {
    throw new OwnerFailure("SOURCE.FROZEN_INPUT_CHANGED", changed);
  }
}
export async function preparedSession(p: PreparedOwner): Promise<Session> {
  const s = await sessionAt(p.sessionPath);
  if (
    !s.validated || p.protocol !== 1 ||
    p.sessionPath !== join(s.root, ".course-owner/session.json") ||
    ["root", "attemptId", "profile", "sessionId"].some((k) =>
      (p as any)[k] !== (s as any)[k]
    ) || await digestFile(p.sessionPath) !== p.sessionHash
  ) invalid("handle/session mismatch");
  await assertCaptures(s);
  return s;
}
export async function activeOwner(
  root: string,
): Promise<Invocation | undefined> {
  const path = join(root, ".course-owner/active.json");
  try {
    await Deno.lstat(path);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return;
    invalid(String(error));
  }
  try {
    await noLink(join(root, ".course-owner"));
    await noLink(path);
    const a = JSON.parse(await Deno.readTextFile(path)) as Invocation;
    const s = await sessionAt(a.sessionPath);
    if (
      Object.keys(a).sort().join(",") !==
        (a.identity === true
          ? "attemptId,identity,inputsHash,invocationId,output,phase,profile,protocol,root,sessionHash,sessionId,sessionPath"
          : "attemptId,inputsHash,invocationId,output,phase,profile,protocol,root,sessionHash,sessionId,sessionPath") ||
      a.identity !== undefined && (a.identity !== true || a.phase !== "capture")
    ) invalid("unknown active fields");
    if (
      a.protocol !== 1 || a.root !== await Deno.realPath(root) ||
      ["root", "attemptId", "sessionId"].some((k) =>
        (a as any)[k] !== (s as any)[k]
      ) || !["student", "full"].includes(a.profile) ||
      !["capture", "render"].includes(a.phase) ||
      typeof a.invocationId !== "string" ||
      !/^[a-f0-9-]{36}$/.test(a.invocationId) || typeof a.output !== "string" ||
      !isAbsolute(a.output) ||
      await digestFile(a.sessionPath) !== a.sessionHash ||
      a.inputsHash !== await objectHash(s.audit.profiles[a.profile].files.input)
    ) invalid("active/session mismatch");
    if (
      a.phase === "capture" && a.output !== privateCaptureOutput(s, a.profile)
    ) invalid("capture output mismatch");
    if (a.phase === "render") {
      if (!s.validated || a.profile !== s.profile) {
        invalid("active render profile");
      }
      const reserved = join(root, ".course-owner/render-invocation.json");
      await noLink(reserved);
      if (
        JSON.stringify(JSON.parse(await Deno.readTextFile(reserved))) !==
          JSON.stringify(a)
      ) invalid("activation mirror mismatch");
    }
    return a;
  } catch (error) {
    if (error instanceof OwnerFailure) throw error;
    invalid(String(error));
  }
}
async function activate(
  s: Session,
  path: string,
  profile: "student" | "full",
  phase: "capture" | "render",
  output?: string,
  identity = false,
) {
  const a: Invocation = {
    protocol: 1,
    root: s.root,
    attemptId: s.attemptId,
    profile,
    sessionId: s.sessionId,
    sessionPath: path,
    sessionHash: await digestFile(path),
    invocationId: crypto.randomUUID(),
    phase,
    inputsHash: await objectHash(s.audit.profiles[profile].files.input),
    output: resolve(
      s.root,
      output || s.audit.profiles[profile].config.project["output-dir"],
    ),
    ...(identity ? { identity: true as const } : {}),
  };
  const privateCapture = phase === "capture" &&
    a.output === privateCaptureOutput(s, profile);
  if (
    a.output === s.root || insideOrUndefined(a.output, s.root) !== undefined ||
    [".course-owner", ".git", ".quarto", "_freeze"].some((name) => {
      if (name === ".course-owner" && privateCapture) return false;
      const rel = insideOrUndefined(s.root, a.output);
      return rel === name || rel?.startsWith(name + "/");
    }) ||
    insideOrUndefined(s.root, a.output) !== undefined &&
      Object.keys(s.files).some((p) =>
        p === insideOrUndefined(s.root, a.output) ||
        p.startsWith(insideOrUndefined(s.root, a.output) + "/")
      )
  ) throw new OwnerFailure("SOURCE.UNISOLATED_OUTPUT", a.output);
  if (privateCapture && !s.audit.navigation) {
    await noStateLinks(s.root, dirname(a.output));
  }
  if (phase === "render") {
    await Deno.writeTextFile(
      join(s.root, ".course-owner/render-invocation.json"),
      JSON.stringify(a),
      { createNew: true },
    );
  }
  await Deno.writeTextFile(
    join(s.root, ".course-owner/active.json"),
    JSON.stringify(a),
    { createNew: true },
  );
  return { "course-owner-session": a };
}
function insideOrUndefined(root: string, path: string) {
  try {
    return inside(root, path);
  } catch {
    return undefined;
  }
}
export async function activateOwner(
  p: PreparedOwner,
  options: { output?: string } = {},
): Promise<Record<string, unknown>> {
  const s = await preparedSession(p);
  if (
    await exists(join(s.root, ".course-owner/active.json")) ||
    await exists(join(s.root, ".course-owner/render-invocation.json"))
  ) {
    throw new OwnerFailure("SOURCE.INVOCATION_REUSED", s.sessionId);
  }
  await assertFrozen(p.sessionPath);
  if (
    s.audit.navigation &&
    options.output !== s.audit.navigation.scope.portal.output
  ) {
    throw new OwnerFailure(
      "SOURCE.NAVIGATION_DESCRIPTOR_INVALID",
      "navigation output override",
    );
  }
  return activate(s, p.sessionPath, p.profile, "render", options.output);
}
export async function freezeOwner(root: string) {
  const a = await activeOwner(root);
  if (!a) return;
  const session = await sessionAt(a.sessionPath);
  const nativeProfile =
    session.audit.navigation?.scope.portal.renderProfiles.join(",") ||
    a.profile;
  if (Deno.env.get("QUARTO_PROFILE") !== nativeProfile) {
    throw new OwnerFailure(
      "SOURCE.INVOCATION_PROFILE_MISMATCH",
      Deno.env.get("QUARTO_PROFILE"),
    );
  }
  const output = Deno.env.get("QUARTO_PROJECT_OUTPUT_DIR");
  if (output && resolve(root, output) !== a.output) {
    throw new OwnerFailure("SOURCE.INVOCATION_OUTPUT_MISMATCH", output);
  }
  await assertFrozen(a.sessionPath);
  const path = join(root, ".course-owner", `guard-${a.invocationId}.json`);
  await Deno.writeTextFile(path, JSON.stringify(a), { createNew: true });
}
async function requireGuard(a: Invocation) {
  const path = join(a.root, ".course-owner", `guard-${a.invocationId}.json`);
  if (!await exists(path)) {
    throw new OwnerFailure("SOURCE.GUARD_RECEIPT_MISSING", a.invocationId);
  }
  await noLink(path);
  if (
    JSON.stringify(JSON.parse(await Deno.readTextFile(path))) !==
      JSON.stringify(a)
  ) invalid("guard mismatch");
}
export async function evaluate(
  input: unknown,
  directory: string,
  schema = join(here, "reconcile.cue"),
) {
  const path = join(directory, `cue-${crypto.randomUUID()}.json`);
  await Deno.writeTextFile(path, JSON.stringify({ input }));
  const cue = Deno.env.get("CUE") || "cue";
  const vet = await invoke(
    cue,
    ["vet", schema, path, "-d", "#Transport", "-c"],
    directory,
  );
  if (vet.exitCode) throw new OwnerFailure("SOURCE.INVALID_ATTEMPT_FACTS", vet);
  const exported = await invoke(cue, [
    "export",
    schema,
    path,
    "-e",
    "report",
    "--out",
    "json",
  ], directory);
  if (exported.exitCode) {
    throw new OwnerFailure("SOURCE.RECONCILIATION_TOOL_FAILED", exported);
  }
  return JSON.parse(exported.stdout);
}
export async function reconcile(
  sessionPath: string,
  actualPath: string,
  invocationId: string,
  profile: string,
) {
  const s = await sessionAt(sessionPath), a = await activeOwner(s.root);
  if (!a) throw new OwnerFailure("SOURCE.ACTIVE_INVOCATION_MISSING", s.root);
  if (
    a.sessionPath !== sessionPath || a.invocationId !== invocationId ||
    a.profile !== profile
  ) invalid("observation identity");
  await requireGuard(a);
  await assertCaptures(s);
  await noStateLinks(s.root, actualPath);
  const actual = JSON.parse(await Deno.readTextFile(actualPath));
  if (s.audit.navigation) {
    const report = await evaluate(
      actual.navigation,
      join(s.root, ".course-owner"),
      join(s.root, s.extension, "owner-preflight/navigation.cue"),
    );
    if (report.diagnostics.length) {
      throw new OwnerFailure("SOURCE.NAVIGATION_UNSUPPORTED", report);
    }
  }
  const source = actual.source, key = profile + ":" + source;
  if (
    typeof source !== "string" ||
    !s.audit.coverage[source]?.profiles?.includes(profile) ||
    actualPath !==
      join(
        s.root,
        ".course-owner",
        a.identity ? "identity" : a.phase,
        profile,
        await sha(source) + ".json",
      )
  ) invalid("observation source/path");
  const observation = actual.resources;
  if (
    !observation || observation.source !== source ||
    observation.profile !== a.profile || observation.phase !== a.phase ||
    observation.effectiveBase !== source ||
    typeof observation.outputDirectory !== "string" ||
    resolve(s.root, observation.outputDirectory) !== a.output
  ) {
    invalid("resource observation identity/output mismatch");
  }
  await validateNativeListingObservation(s, observation);
  if (a.phase === "capture") return { status: "ok", source };
  if (!s.validated) {
    throw new OwnerFailure("SOURCE.UNVALIDATED_ATTEMPT", sessionPath);
  }
  const baseline = s.captures[key];
  if (!baseline) throw new OwnerFailure("SOURCE.BASELINE_MISSING", key);
  const before = JSON.parse(await Deno.readTextFile(baseline));
  before.identity = JSON.parse(await Deno.readTextFile(s.identities[key]));
  const report = await evaluate(
    { mode: "reconcile", before: [before], after: [actual] },
    join(s.root, ".course-owner"),
    join(s.root, s.extension, "owner-preflight/reconcile.cue"),
  );
  let resourceSealHash: string | undefined;
  let resourceFailure: OwnerFailure | undefined;
  if (!report.diagnostics.length) {
    try {
      const seal = await sealResourceObservation(s, a, observation);
      const sealPath = join(
        s.root,
        ".course-owner",
        `resource-seal-${await sha(key)}.json`,
      );
      await Deno.writeTextFile(sealPath, JSON.stringify(seal), {
        createNew: true,
      });
      resourceSealHash = await digestStateFile(s.root, sealPath);
    } catch (error) {
      if (!(error instanceof OwnerFailure)) throw error;
      resourceFailure = error;
    }
  }
  const result = {
    ...a,
    source,
    actualHash: await digestStateFile(s.root, actualPath),
    ...(report.diagnostics.length
      ? { status: "failure", code: "CORE.DECLARATION_DRIFT", ...report }
      : resourceFailure
      ? {
        status: "failure",
        code: resourceFailure.code,
        cause: resourceFailure.cause,
      }
      : { status: "ok", resourceSealHash }),
  };
  await Deno.writeTextFile(
    join(s.root, ".course-owner", `result-${await sha(key)}.json`),
    JSON.stringify(result),
    { createNew: true },
  );
  return result;
}
export async function prepareOwner(
  input: string,
  options: {
    attemptId: string;
    profile: "student" | "full";
    extension?: string;
    publicationAddresses?: OwnerPublicationAddressContext;
  },
): Promise<PreparedOwner> {
  return prepareOwnerSession(input, options);
}
/** Internal common lifecycle; public navigation callers use navigation.ts. */
export async function prepareOwnerSession(
  input: string,
  options: {
    attemptId: string;
    profile: "student" | "full";
    extension?: string;
    navigation?: NavigationScope;
    publicationAddresses?: OwnerPublicationAddressContext;
  },
): Promise<PreparedOwner> {
  if (!["student", "full"].includes(options.profile)) {
    throw new OwnerFailure("SOURCE.PROFILE_UNSUPPORTED", options.profile);
  }
  if (typeof options.attemptId !== "string" || !options.attemptId) {
    invalid("attemptId required");
  }
  for (
    const key of [
      "COURSE_OWNER_SESSION",
      "COURSE_OWNER_PHASE",
      "COURSE_OWNER_PROFILE",
      "COURSE_OWNER_HELPER",
      "COURSE_OWNER_QUARTO",
    ]
  ) {
    if (Deno.env.get(key)) {
      throw new OwnerFailure("SOURCE.LEGACY_OWNER_ENV_UNSUPPORTED", key);
    }
  }
  const root = await Deno.realPath(input),
    extension = options.extension || inside(root, dirname(here));
  if (options.navigation && options.publicationAddresses) {
    invalid("mixed navigation and child context");
  }
  const publicationAddresses = options.publicationAddresses
    ? await preparePublicationAddresses(
      root,
      options.attemptId,
      options.profile,
      options.publicationAddresses,
    )
    : undefined;
  const audit = options.navigation
      ? await auditNavigation(
        root,
        extension,
        options.profile,
        options.navigation,
      )
      : await auditOwner(root, extension),
    state = join(root, ".course-owner");
  try {
    await Deno.mkdir(state);
  } catch (e) {
    if (e instanceof Deno.errors.AlreadyExists) {
      throw new OwnerFailure("SOURCE.ATTEMPT_REUSED", root);
    }
    throw e;
  }
  const preparationPath = join(state, "preparation.json"),
    sessionPath = join(state, "session.json");
  const s: Session = {
    protocol: 1,
    root,
    attemptId: options.attemptId,
    profile: options.profile,
    sessionId: crypto.randomUUID(),
    extension,
    quarto: audit.nativeListingProvider?.executable || quarto,
    audit,
    files: await fingerprint(audit),
    validated: false,
    captures: {},
    captureHashes: {},
    captureProjections: {},
    captureProjectionHash: "",
    identities: {},
    identityHashes: {},
    identityReaders: {},
    identityReplays: {},
    readerInputs: {},
    readerInputHashes: {},
    ...(audit.nativeListingPlans
      ? {
        nativeListingPlans: audit.nativeListingPlans,
        nativeListingProvider: audit.nativeListingProvider,
        nativeListingHashes: {},
      }
      : {}),
    headers: [],
    ...(publicationAddresses ? { publicationAddresses } : {}),
  };
  if (s.nativeListingPlans) {
    const paths = await nativeListingEvidencePaths(
      root,
      Object.keys(s.nativeListingPlans),
    );
    s.nativeListingInputs = paths.inputs;
    s.nativeListingWitnesses = paths.witnesses;
    await retainNativeListingProviderServices(s);
  }
  const save = () => Deno.writeTextFile(preparationPath, JSON.stringify(s));
  await save();
  const captures: any[] = [];
  for (
    const profile
      of (audit.navigation ? [options.profile] : ["student", "full"]) as (
        | "student"
        | "full"
      )[]
  ) {
    for (const sourcePath of audit.profiles[profile].files.input) {
      const source = inside(root, sourcePath), key = profile + ":" + source;
      const document = await inspect(
        sourcePath,
        audit.navigation
          ? audit.navigation.scope.portal.renderProfiles.join(",")
          : profile,
      );
      const from = document.formats?.html?.pandoc?.from;
      if (
        from !== undefined &&
        (typeof from !== "string" || !/^markdown(?:[+-]|$)/.test(from))
      ) {
        throw new OwnerFailure("SOURCE.HEADER_READER_UNSUPPORTED", {
          source,
          profile,
          from,
        });
      }
      const reader = (from || "markdown") + "-auto_identifiers";
      s.identityReaders[key] = reader;
      const replay = document.formats?.html?.execute?.engine === "jupyter";
      if (replay) {
        s.identityReplays[key] = true;
        s.readerInputs[key] = join(
          state,
          "reader-input",
          profile,
          await sha(source) + ".md",
        );
      }
      await save();
      const captureOutput = privateCaptureOutput(s, profile);
      await Deno.mkdir(dirname(captureOutput), { recursive: true });
      if (await exists(captureOutput)) {
        throw new OwnerFailure(
          "SOURCE.CAPTURE_OUTPUT_NOT_EMPTY",
          captureOutput,
        );
      }
      const metadata = await activate(
        s,
        preparationPath,
        profile,
        "capture",
        captureOutput,
      );
      const metadataPath = join(state, "capture-metadata.json");
      await Deno.writeTextFile(metadataPath, JSON.stringify(metadata));
      const r = await invoke(
        s.quarto,
        [
          "render",
          audit.navigation ? "." : source,
          "--profile",
          audit.navigation
            ? audit.navigation.scope.portal.renderProfiles.join(",")
            : profile,
          "--to",
          "html",
          "--no-execute",
          "--no-cache",
          "--metadata-file",
          metadataPath,
          ...(captureOutput ? ["--output-dir", captureOutput] : []),
        ],
        root,
        audit.navigation ? { PROJECT_PUBLISH_MEMBER: "1" } : {},
      );
      await Deno.writeTextFile(
        join(state, `capture-${await sha(key)}.log`),
        JSON.stringify(r),
      );
      if (r.exitCode) throw new OwnerFailure("SOURCE.CAPTURE_FAILED", r);
      const capture = join(
        state,
        "capture",
        profile,
        await sha(source) + ".json",
      );
      if (!await exists(capture)) {
        throw new OwnerFailure("SOURCE.CAPTURE_MISSING", { source, profile });
      }
      const requests = await inspectSessionDownload(s);
      if (requests?.state.files.some((file) => file.resources.length)) {
        throw new OwnerFailure("SOURCE.CAPTURE_DOWNLOAD_REQUEST", source);
      }
      s.captures[key] = capture;
      const raw = JSON.parse(await Deno.readTextFile(capture));
      await retainNativeListingBaselineHashes(s, key, "capture");
      await retainCaptureProjection(
        s,
        (metadata as any)["course-owner-session"],
        source,
        document,
        raw,
        "ordinary",
        capture,
      );
      await Deno.remove(join(state, "active.json"));
      await save();
      await assertFrozen(preparationPath);
      const identityPath = join(
        state,
        "identity",
        profile,
        await sha(source) + ".json",
      );
      if (!replay) {
        const identityMetadata = await activate(
          s,
          preparationPath,
          profile,
          "capture",
          captureOutput,
          true,
        );
        await Deno.writeTextFile(
          metadataPath,
          JSON.stringify(identityMetadata),
        );
        const identityRender = await invoke(
          s.quarto,
          [
            "render",
            audit.navigation ? "." : source,
            "--profile",
            audit.navigation
              ? audit.navigation.scope.portal.renderProfiles.join(",")
              : profile,
            "--to",
            "html",
            "--no-execute",
            "--no-cache",
            "--metadata-file",
            metadataPath,
            "-M",
            "from:" + reader,
            ...(captureOutput ? ["--output-dir", captureOutput] : []),
          ],
          root,
          audit.navigation ? { PROJECT_PUBLISH_MEMBER: "1" } : {},
        );
        await Deno.writeTextFile(
          join(state, `identity-${await sha(key)}.log`),
          JSON.stringify(identityRender),
        );
        if (identityRender.exitCode) {
          throw new OwnerFailure(
            "SOURCE.HEADER_IDENTITY_CAPTURE_FAILED",
            identityRender,
          );
        }
        s.identities[key] = identityPath;
        await retainCaptureProjection(
          s,
          (identityMetadata as any)["course-owner-session"],
          source,
          document,
          JSON.parse(await Deno.readTextFile(identityPath)),
          "identity",
          identityPath,
        );
      }
      if (!await exists(identityPath)) {
        throw new OwnerFailure("SOURCE.HEADER_IDENTITY_MISSING", {
          source,
          profile,
        });
      }
      s.identities[key] = identityPath;
      await retainNativeListingBaselineHashes(s, key, "identity");
      raw.identity = JSON.parse(await Deno.readTextFile(identityPath));
      if (replay && raw.identity.readerReplay?.status !== "ok") {
        throw new OwnerFailure("SOURCE.HEADER_IDENTITY_UNSUPPORTED", {
          source,
          profile,
          replay: raw.identity.readerReplay,
        });
      }
      if (replay) {
        const proof = raw.identity.readerReplay,
          inputPath = s.readerInputs[key];
        await noStateLinks(root, inputPath);
        const inputHash = await digestFile(inputPath);
        if (
          proof.inputPath !== inputPath || typeof proof.input !== "string" ||
          inputHash !== await digest(new TextEncoder().encode(proof.input))
        ) throw new OwnerFailure("SOURCE.HEADER_IDENTITY_UNSUPPORTED", key);
        s.readerInputHashes[key] = inputHash;
        proof.inputHash = inputHash;
        await Deno.writeTextFile(identityPath, JSON.stringify(raw.identity));
      }
      const matching = captures.find((d) => d.source === raw.source);
      if (!matching) captures.push(raw);
      else {
        const same = await evaluate(
          { mode: "reconcile", before: [matching], after: [raw] },
          state,
          join(root, extension, "owner-preflight/reconcile.cue"),
        );
        if (same.diagnostics.length) {
          throw new OwnerFailure("SOURCE.PROFILE_DECLARATIONS_DIFFER", same);
        }
      }
      if (!replay) await Deno.remove(join(state, "active.json"));
      await save();
      await assertFrozen(preparationPath);
    }
  }
  const checked = await evaluate(
    { mode: "inventory", before: captures, after: [] },
    state,
    join(root, extension, "owner-preflight/reconcile.cue"),
  );
  if (checked.diagnostics.length) {
    throw new OwnerFailure("CORE.INVENTORY_INVALID", checked);
  }
  s.headers = checked.headers;
  for (const [key, path] of Object.entries(s.captures)) {
    s.captureHashes[key] = await digestFile(path);
  }
  for (const [key, path] of Object.entries(s.identities)) {
    s.identityHashes[key] = await digestFile(path);
  }
  await earlyResourceGate(s);
  s.validated = true;
  await Deno.writeTextFile(sessionPath, JSON.stringify(s), { createNew: true });
  const requests = await inspectSessionDownload(s);
  if (requests) {
    if (requests.state.files.some((file) => file.resources.length)) {
      throw new OwnerFailure("SOURCE.CAPTURE_DOWNLOAD_REQUEST", root);
    }
    await requests.api.clearOwnedRequests(root, requests.sources);
  }
  await assertFrozen(sessionPath);
  return {
    protocol: 1,
    root,
    attemptId: s.attemptId,
    profile: s.profile,
    sessionId: s.sessionId,
    sessionPath,
    sessionHash: await digestFile(sessionPath),
  };
}
/** Current complete native invocation evidence; never writes or finishes an owner. */
export async function readOwnerInvocationEvidence(p: PreparedOwner) {
  const s = await preparedSession(p), a = await activeOwner(p.root);
  if (!a) throw new OwnerFailure("SOURCE.ACTIVE_INVOCATION_MISSING", p.root);
  if (
    a.phase !== "render" || a.sessionHash !== p.sessionHash ||
    a.profile !== p.profile
  ) invalid("finish identity");
  await requireGuard(a);
  const expected = s.audit.profiles[p.profile].files.input.map((path: string) =>
    inside(p.root, path)
  );
  const names = await Promise.all(
    expected.map(async (source: string) =>
      `result-${await sha(p.profile + ":" + source)}.json`
    ),
  );
  for await (const entry of Deno.readDir(join(p.root, ".course-owner"))) {
    if (entry.name.startsWith("result-") && !names.includes(entry.name)) {
      invalid("unexpected observation receipt");
    }
  }
  const reports = [];
  const resourceSeals: ResourceSeal[] = [];
  for (let i = 0; i < expected.length; i++) {
    const path = join(p.root, ".course-owner", names[i]);
    if (!await exists(path)) {
      throw new OwnerFailure("SOURCE.RECONCILIATION_MISSING", expected[i]);
    }
    await noLink(path);
    const r = JSON.parse(await Deno.readTextFile(path));
    if (
      Object.keys(a).some((k) => r[k] !== (a as any)[k]) ||
      r.source !== expected[i] || !["ok", "failure"].includes(r.status) ||
      r.actualHash !==
        await digestStateFile(
          p.root,
          join(
            p.root,
            ".course-owner/render",
            p.profile,
            await sha(expected[i]) + ".json",
          ),
        )
    ) invalid("stale/corrupt observation receipt");
    const successKeys = [
      ...Object.keys(a),
      "source",
      "actualHash",
      "status",
      "resourceSealHash",
    ]
      .sort().join(",");
    if (r.status === "ok" && Object.keys(r).sort().join(",") !== successKeys) {
      invalid("malformed successful receipt");
    }
    if (
      r.status === "failure" &&
      !(r.code === "CORE.DECLARATION_DRIFT" && Array.isArray(r.diagnostics) &&
          r.diagnostics.length ||
        typeof r.code === "string" &&
          (r.code.startsWith("RESOURCE.") || [
            "SOURCE.PUBLICATION_ADDRESS_WRITER_UNSUPPORTED",
            "SOURCE.PUBLICATION_ADDRESS_WRITER_MISMATCH",
          ].includes(r.code)) && Object.hasOwn(r, "cause"))
    ) invalid("malformed failed receipt");
    if (r.status === "ok") {
      const sealPath = join(
        p.root,
        ".course-owner",
        `resource-seal-${await sha(p.profile + ":" + expected[i])}.json`,
      );
      if (
        !await exists(sealPath) ||
        await digestStateFile(p.root, sealPath) !== r.resourceSealHash
      ) invalid("resource seal changed");
      const seal = JSON.parse(
        await Deno.readTextFile(sealPath),
      ) as ResourceSeal;
      if (
        seal.protocol !== 1 || seal.invocationId !== a.invocationId ||
        seal.source !== expected[i] || !Array.isArray(seal.generated) ||
        !Array.isArray(seal.actual) ||
        s.publicationAddresses && !Array.isArray(seal.publicationAddresses)
      ) invalid("resource seal identity");
      resourceSeals.push(seal);
    }
    reports.push(r);
  }
  await assertFrozen(p.sessionPath);
  const failure = reports.find((r) => r.status !== "ok");
  return { session: s, invocation: a, reports, resourceSeals, failure };
}
export async function finishOwner(p: PreparedOwner, options: {
  publicationAddresses?: OwnerPublicationAddressFinish;
} = {}): Promise<OwnerResult> {
  const pending = await preparedSession(p);
  if (pending.publicationAddresses && !options.publicationAddresses) {
    throw new OwnerFailure(
      "SOURCE.PUBLICATION_ADDRESS_FINISH_REQUIRED",
      p.sessionId,
    );
  }
  if (!pending.publicationAddresses && options.publicationAddresses) {
    invalid("address finish without prepared context");
  }
  const current = await readOwnerInvocationEvidence(p);
  const { session: s, invocation: a, resourceSeals, failure } = current;
  if (!failure) {
    await finishNativeListingAddresses(
      p,
      current,
      options.publicationAddresses,
    );
    if (options.publicationAddresses) {
      await finishPublicationAddresses(p, options.publicationAddresses);
    }
    await validateNavigationCompletion(p);
    const downloads = await inspectOwnerDownloads(p);
    await writeResourceIndex(p, s, a, resourceSeals, downloads?.files || []);
  }
  return failure ? { exitCode: 1, stage: p.root, report: failure } : {
    exitCode: 0,
    stage: p.root,
    report: {
      status: "ok",
      profile: p.profile,
      coverage: s.audit.coverage,
      outputs: a.output,
      attemptId: p.attemptId,
      sessionId: p.sessionId,
      sessionHash: p.sessionHash,
      invocationId: a.invocationId,
    },
  };
}
export async function runOwner(
  input: string,
  profile: "student" | "full",
  options: { env?: Record<string, string> } = {},
): Promise<OwnerResult> {
  let stage = "";
  try {
    if (!["student", "full"].includes(profile)) {
      throw new OwnerFailure("SOURCE.PROFILE_UNSUPPORTED", profile);
    }
    const original = await auditOwner(input),
      extension = inside(original.root, dirname(here));
    stage = join(
      await Deno.makeTempDir({ prefix: "course-owner-attempt-" }),
      "owner",
    );
    await Deno.mkdir(stage);
    for (const path of await fileList(original.root, original.excluded)) {
      await Deno.mkdir(dirname(join(stage, path)), { recursive: true });
      await Deno.copyFile(join(original.root, path), join(stage, path));
    }
    const p = await prepareOwner(stage, {
      attemptId: crypto.randomUUID(),
      profile,
      extension,
    });
    const metadata = await activateOwner(p),
      metadataPath = join(stage, ".course-owner/render-metadata.json");
    await Deno.writeTextFile(metadataPath, JSON.stringify(metadata));
    // Legacy phase is supplied only to this child for older author hook sentinels, never global state.
    const rendered = await invoke(
      quarto,
      [
        "render",
        ".",
        "--profile",
        profile,
        "--to",
        "html",
        "--execute",
        "--no-cache",
        "--no-execute-daemon",
        "--metadata-file",
        metadataPath,
      ],
      stage,
      { ...options.env, COURSE_OWNER_PHASE: "render" },
    );
    await Deno.writeTextFile(
      join(stage, ".course-owner/render.log"),
      JSON.stringify(rendered),
    );
    if (await exists(join(stage, ".course-owner/guard-failure.json"))) {
      return {
        exitCode: 2,
        stage,
        report: JSON.parse(
          await Deno.readTextFile(
            join(stage, ".course-owner/guard-failure.json"),
          ),
        ),
      };
    }
    // Preserve declaration failure even when native render aborts before later source callbacks.
    if (rendered.exitCode) {
      for await (const entry of Deno.readDir(join(stage, ".course-owner"))) {
        if (entry.name.startsWith("result-")) {
          const r = JSON.parse(
            await Deno.readTextFile(join(stage, ".course-owner", entry.name)),
          );
          if (r.status === "failure") return { exitCode: 1, stage, report: r };
        }
      }
      throw new OwnerFailure("SOURCE.RENDER_FAILED", rendered);
    }
    const result = await finishOwner(p);
    if (result.exitCode === 0) {
      result.report.outputs =
        original.profiles[profile].config.project["output-dir"];
    }
    return result;
  } catch (error) {
    return {
      exitCode:
        error instanceof OwnerFailure && error.code === "CORE.INVENTORY_INVALID"
          ? 1
          : 2,
      stage,
      report: {
        status: "failure",
        code: error instanceof OwnerFailure
          ? error.code
          : "INTERNAL.OWNER_PREFLIGHT",
        ...(error instanceof OwnerFailure &&
            error.code === "CORE.INVENTORY_INVALID"
          ? error.cause as object
          : {
            cause: error instanceof OwnerFailure ? error.cause : String(error),
          }),
      },
    };
  }
}
