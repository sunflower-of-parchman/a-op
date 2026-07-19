import {
  CORE_CAPABILITY_KEYS,
  MODULE_KEYS,
  getModuleDefinition,
  isCapabilityKey,
  isCoreCapabilityKey,
  isModuleKey,
  resolveActiveCapabilities,
  type CapabilityKey,
  type ModuleKey,
} from "./registry.ts";

export const MODULE_ISSUE_CODES = Object.freeze({
  PLAN_INVALID: "module-plan-invalid",
  LIST_INVALID: "module-list-invalid",
  KEY_INVALID: "module-key-invalid",
  KEY_UNKNOWN: "module-key-unknown",
  KEY_DUPLICATE: "module-key-duplicate",
  CORE_IS_IMPLICIT: "module-core-is-implicit",
  DEPENDENCY_MISSING: "module-dependency-missing",
  CORE_DEACTIVATION: "module-core-non-deactivatable",
  CHANGE_CONFLICT: "module-change-conflict",
  ACTIVE_DEPENDENT: "module-active-dependent",
} as const);

export type ModuleIssueCode =
  (typeof MODULE_ISSUE_CODES)[keyof typeof MODULE_ISSUE_CODES];

export type ModuleIssueField =
  "plan" | "activeModules" | "currentModules" | "activate" | "deactivate";

export interface ModuleIssue {
  readonly code: ModuleIssueCode;
  readonly field: ModuleIssueField;
  readonly message: string;
  readonly index?: number;
  readonly moduleKey?: string;
  readonly dependencyKey?: ModuleKey;
  readonly dependentKey?: ModuleKey;
}

export interface ValidModuleSelection {
  readonly ok: true;
  readonly activeModules: readonly ModuleKey[];
  readonly activeCapabilities: readonly CapabilityKey[];
}

export interface InvalidModuleSelection {
  readonly ok: false;
  readonly issues: readonly ModuleIssue[];
}

export type ModuleSelectionResult =
  ValidModuleSelection | InvalidModuleSelection;

export interface ModuleTransitionInput {
  readonly currentModules: unknown;
  readonly activate?: unknown;
  readonly deactivate?: unknown;
}

export type ModuleStatePolicy = "validate-and-reuse" | "preserve";

export interface ModuleTransitionOperation {
  readonly action: "activate" | "deactivate";
  readonly moduleKey: ModuleKey;
  readonly statePolicy: ModuleStatePolicy;
}

export interface ModuleTransitionPlan {
  readonly ok: true;
  readonly activeModulesBefore: readonly ModuleKey[];
  readonly activeModulesAfter: readonly ModuleKey[];
  readonly activeCapabilitiesBefore: readonly CapabilityKey[];
  readonly activeCapabilitiesAfter: readonly CapabilityKey[];
  /** Dependencies first, ready for validation and reactivation. */
  readonly activate: readonly ModuleKey[];
  /** Dependents first, with their durable records left intact. */
  readonly deactivate: readonly ModuleKey[];
  readonly unchanged: readonly ModuleKey[];
  readonly operations: readonly ModuleTransitionOperation[];
}

export interface InvalidModuleTransition {
  readonly ok: false;
  readonly issues: readonly ModuleIssue[];
}

export type ModuleTransitionResult =
  ModuleTransitionPlan | InvalidModuleTransition;

interface ReadModuleListResult {
  readonly keys: readonly ModuleKey[];
  readonly issues: readonly ModuleIssue[];
}

interface ReadCapabilityListResult {
  readonly keys: readonly CapabilityKey[];
  readonly issues: readonly ModuleIssue[];
}

function freezeIssue(issue: ModuleIssue): ModuleIssue {
  return Object.freeze(issue);
}

function invalidResult(
  issues: readonly ModuleIssue[],
): InvalidModuleSelection | InvalidModuleTransition {
  return Object.freeze({
    ok: false,
    issues: Object.freeze(issues.map(freezeIssue)),
  });
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonicalModules(keys: Iterable<ModuleKey>): readonly ModuleKey[] {
  const keySet = new Set(keys);
  return Object.freeze(MODULE_KEYS.filter((key) => keySet.has(key)));
}

function readModuleList(
  value: unknown,
  field: "activeModules" | "currentModules",
): ReadModuleListResult {
  if (!Array.isArray(value)) {
    return {
      keys: [],
      issues: [
        {
          code: MODULE_ISSUE_CODES.LIST_INVALID,
          field,
          message: `${field} must be an array of module keys.`,
        },
      ],
    };
  }

  const keys: ModuleKey[] = [];
  const issues: ModuleIssue[] = [];
  const seen = new Set<string>();

  value.forEach((candidate, index) => {
    if (typeof candidate !== "string") {
      issues.push({
        code: MODULE_ISSUE_CODES.KEY_INVALID,
        field,
        index,
        message: `${field}[${index}] must be a module key string.`,
      });
      return;
    }

    if (seen.has(candidate)) {
      issues.push({
        code: MODULE_ISSUE_CODES.KEY_DUPLICATE,
        field,
        index,
        moduleKey: candidate,
        message: `Module key "${candidate}" appears more than once in ${field}.`,
      });
      return;
    }
    seen.add(candidate);

    if (isCoreCapabilityKey(candidate)) {
      issues.push({
        code: MODULE_ISSUE_CODES.CORE_IS_IMPLICIT,
        field,
        index,
        moduleKey: candidate,
        message: `Core capability "${candidate}" is implicitly active and is not stored as an activatable module.`,
      });
      return;
    }

    if (!isModuleKey(candidate)) {
      issues.push({
        code: MODULE_ISSUE_CODES.KEY_UNKNOWN,
        field,
        index,
        moduleKey: candidate,
        message: `Unknown module key "${candidate}".`,
      });
      return;
    }

    keys.push(candidate);
  });

  return { keys: canonicalModules(keys), issues };
}

function readCapabilityList(
  value: unknown,
  field: "activate" | "deactivate",
): ReadCapabilityListResult {
  if (!Array.isArray(value)) {
    return {
      keys: [],
      issues: [
        {
          code: MODULE_ISSUE_CODES.LIST_INVALID,
          field,
          message: `${field} must be an array of capability keys.`,
        },
      ],
    };
  }

  const keys: CapabilityKey[] = [];
  const issues: ModuleIssue[] = [];
  const seen = new Set<string>();

  value.forEach((candidate, index) => {
    if (typeof candidate !== "string") {
      issues.push({
        code: MODULE_ISSUE_CODES.KEY_INVALID,
        field,
        index,
        message: `${field}[${index}] must be a capability key string.`,
      });
      return;
    }

    if (seen.has(candidate)) {
      issues.push({
        code: MODULE_ISSUE_CODES.KEY_DUPLICATE,
        field,
        index,
        moduleKey: candidate,
        message: `Capability key "${candidate}" appears more than once in ${field}.`,
      });
      return;
    }
    seen.add(candidate);

    if (!isCapabilityKey(candidate)) {
      issues.push({
        code: MODULE_ISSUE_CODES.KEY_UNKNOWN,
        field,
        index,
        moduleKey: candidate,
        message: `Unknown capability key "${candidate}".`,
      });
      return;
    }

    keys.push(candidate);
  });

  return { keys: Object.freeze(keys), issues };
}

function dependencyIssues(
  activeModules: readonly ModuleKey[],
  field: "activeModules" | "currentModules",
): readonly ModuleIssue[] {
  const activeSet = new Set(activeModules);
  const issues: ModuleIssue[] = [];

  for (const moduleKey of MODULE_KEYS) {
    if (!activeSet.has(moduleKey)) continue;

    for (const dependencyKey of getModuleDefinition(moduleKey).requires) {
      if (activeSet.has(dependencyKey)) continue;

      issues.push({
        code: MODULE_ISSUE_CODES.DEPENDENCY_MISSING,
        field,
        moduleKey,
        dependencyKey,
        message: `Module "${moduleKey}" requires active module "${dependencyKey}".`,
      });
    }
  }

  return issues;
}

function validateSelection(
  value: unknown,
  field: "activeModules" | "currentModules",
): ModuleSelectionResult {
  const read = readModuleList(value, field);
  if (read.issues.length > 0) return invalidResult(read.issues);

  const issues = dependencyIssues(read.keys, field);
  if (issues.length > 0) return invalidResult(issues);

  return Object.freeze({
    ok: true,
    activeModules: read.keys,
    activeCapabilities: resolveActiveCapabilities(read.keys),
  });
}

export function validateModuleSelection(value: unknown): ModuleSelectionResult {
  return validateSelection(value, "activeModules");
}

function collectActivationClosure(
  requested: readonly CapabilityKey[],
): ReadonlySet<ModuleKey> {
  const collected = new Set<ModuleKey>();

  function collect(moduleKey: ModuleKey): void {
    if (collected.has(moduleKey)) return;

    for (const dependency of getModuleDefinition(moduleKey).requires) {
      collect(dependency);
    }
    collected.add(moduleKey);
  }

  for (const key of MODULE_KEYS) {
    if (requested.includes(key)) collect(key);
  }

  return collected;
}

function topologicalOrder(keys: ReadonlySet<ModuleKey>): readonly ModuleKey[] {
  const visited = new Set<ModuleKey>();
  const ordered: ModuleKey[] = [];

  function visit(moduleKey: ModuleKey): void {
    if (visited.has(moduleKey)) return;
    visited.add(moduleKey);

    for (const dependency of getModuleDefinition(moduleKey).requires) {
      if (keys.has(dependency)) visit(dependency);
    }
    ordered.push(moduleKey);
  }

  for (const moduleKey of MODULE_KEYS) {
    if (keys.has(moduleKey)) visit(moduleKey);
  }

  return Object.freeze(ordered);
}

function activeDependentIssues(
  activeAfter: ReadonlySet<ModuleKey>,
  removed: ReadonlySet<ModuleKey>,
): readonly ModuleIssue[] {
  const issues: ModuleIssue[] = [];

  for (const dependentKey of MODULE_KEYS) {
    if (!activeAfter.has(dependentKey)) continue;

    for (const dependencyKey of getModuleDefinition(dependentKey).requires) {
      if (!removed.has(dependencyKey)) continue;

      issues.push({
        code: MODULE_ISSUE_CODES.ACTIVE_DEPENDENT,
        field: "deactivate",
        moduleKey: dependencyKey,
        dependencyKey,
        dependentKey,
        message: `Module "${dependencyKey}" cannot be deactivated while "${dependentKey}" remains active.`,
      });
    }
  }

  return issues;
}

export function planModuleTransition(input: unknown): ModuleTransitionResult {
  if (!isPlainRecord(input)) {
    return invalidResult([
      {
        code: MODULE_ISSUE_CODES.PLAN_INVALID,
        field: "plan",
        message: "A module transition plan must be a plain object.",
      },
    ]);
  }

  const current = validateSelection(input.currentModules, "currentModules");
  const activate = readCapabilityList(input.activate ?? [], "activate");
  const deactivate = readCapabilityList(input.deactivate ?? [], "deactivate");
  const inputIssues: ModuleIssue[] = [
    ...(current.ok ? [] : current.issues),
    ...activate.issues,
    ...deactivate.issues,
  ];
  if (inputIssues.length > 0) return invalidResult(inputIssues);
  if (!current.ok) return current;

  const activationClosure = collectActivationClosure(activate.keys);
  const requestedDeactivation = new Set(deactivate.keys.filter(isModuleKey));
  const transitionIssues: ModuleIssue[] = [];

  for (const key of CORE_CAPABILITY_KEYS) {
    if (!deactivate.keys.includes(key)) continue;
    transitionIssues.push({
      code: MODULE_ISSUE_CODES.CORE_DEACTIVATION,
      field: "deactivate",
      moduleKey: key,
      message: `Core capability "${key}" cannot be deactivated.`,
    });
  }

  for (const key of MODULE_KEYS) {
    if (!activationClosure.has(key) || !requestedDeactivation.has(key)) {
      continue;
    }

    transitionIssues.push({
      code: MODULE_ISSUE_CODES.CHANGE_CONFLICT,
      field: "plan",
      moduleKey: key,
      message: `Module "${key}" cannot be activated and deactivated in the same plan.`,
    });
  }

  if (transitionIssues.length > 0) return invalidResult(transitionIssues);

  const activeBefore = new Set(current.activeModules);
  const activeAfter = new Set(activeBefore);
  for (const key of activationClosure) activeAfter.add(key);
  for (const key of requestedDeactivation) activeAfter.delete(key);

  const dependentIssues = activeDependentIssues(
    activeAfter,
    requestedDeactivation,
  );
  if (dependentIssues.length > 0) return invalidResult(dependentIssues);

  const activationSet = new Set(
    [...activationClosure].filter((key) => !activeBefore.has(key)),
  );
  const deactivationSet = new Set(
    [...requestedDeactivation].filter((key) => activeBefore.has(key)),
  );
  const activationOrder = topologicalOrder(activationSet);
  const deactivationOrder = Object.freeze(
    [...topologicalOrder(deactivationSet)].reverse(),
  );
  const activeModulesBefore = canonicalModules(activeBefore);
  const activeModulesAfter = canonicalModules(activeAfter);
  const unchanged = Object.freeze(
    activeModulesBefore.filter((key) => activeAfter.has(key)),
  );
  const operations = Object.freeze([
    ...activationOrder.map((moduleKey) =>
      Object.freeze({
        action: "activate" as const,
        moduleKey,
        statePolicy: "validate-and-reuse" as const,
      }),
    ),
    ...deactivationOrder.map((moduleKey) =>
      Object.freeze({
        action: "deactivate" as const,
        moduleKey,
        statePolicy: "preserve" as const,
      }),
    ),
  ]);

  return Object.freeze({
    ok: true,
    activeModulesBefore,
    activeModulesAfter,
    activeCapabilitiesBefore: resolveActiveCapabilities(activeModulesBefore),
    activeCapabilitiesAfter: resolveActiveCapabilities(activeModulesAfter),
    activate: activationOrder,
    deactivate: deactivationOrder,
    unchanged,
    operations,
  });
}
