// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTool } from "../shared/tool-registration.js";
import { WebApi } from "azure-devops-node-api";
import { AlertType, AlertValidityStatus, Confidence, Severity, State } from "azure-devops-node-api/interfaces/AlertInterfaces.js";
import { z } from "zod";
import { getEnumKeys, mapStringArrayToEnum, mapStringToEnum } from "../utils.js";
import { optionalProjectWith, requiredProject } from "../shared/common-params.js";
import { adoFetch, subdomainBaseUrl } from "../shared/ado-rest.js";

const ADVSEC_TOOLS = {
  get_alerts: "advsec_get_alerts",
  get_alert_details: "advsec_get_alert_details",
  update_alert: "advsec_update_alert",
  list_alert_instances: "advsec_list_alert_instances",
  get_alert_metadata: "advsec_get_alert_metadata",
  list_analyzed_branches: "advsec_list_analyzed_branches",
  delete_pipeline_analysis: "advsec_delete_pipeline_analysis",
  get_enablement: "advsec_get_enablement",
  update_enablement: "advsec_update_enablement",
  get_committer_estimate: "advsec_get_committer_estimate",
  get_meter_usage: "advsec_get_meter_usage",
  get_alert_summary: "advsec_get_alert_summary",
  get_enablement_summary: "advsec_get_enablement_summary",
  list_organization_alerts: "advsec_list_organization_alerts",
};

// Alerts and reporting are served on 7.2-preview.1, enablement and billing on 7.2-preview.3.
const alertApiVersion = "7.2-preview.1";
const managementApiVersion = "7.2-preview.3";

const ALERT_TYPES = ["dependency", "secret", "code", "aiCode", "malware"] as const;
const PLANS = ["codeSecurity", "secretProtection", "all"] as const;
const SEVERITIES = ["low", "medium", "high", "critical", "note", "warning", "error"] as const;

function configureAdvSecTools(server: McpServer, tokenProvider: () => Promise<string>, connectionProvider: () => Promise<WebApi>, userAgentProvider: () => string = () => "") {
  registerTool(
    server,
    ADVSEC_TOOLS.get_alerts,
    "Retrieve Advanced Security alerts for a repository. Results are scoped to the specified project and repository. Branch filters (onlyDefaultBranch, ref) apply only to code, dependency, and license alerts; they are not applicable to secret alerts and are ignored by the service, so they neither include nor exclude secrets. To narrow secret alerts by confidence, pass a single 'confidenceLevels' value ('High' or 'Other'); selecting every level is treated as no confidence filter.",
    {
      project: requiredProject,
      repository: z.string().describe("The name or ID of the repository to get alerts for."),
      alertType: z
        .enum(getEnumKeys(AlertType) as [string, ...string[]])
        .optional()
        .describe("Filter alerts by type. If not specified, returns all alert types."),
      states: z
        .array(z.enum(getEnumKeys(State) as [string, ...string[]]))
        .optional()
        .describe("Filter alerts by state. If not specified, returns alerts in any state."),
      severities: z
        .array(z.enum(getEnumKeys(Severity) as [string, ...string[]]))
        .optional()
        .describe("Filter alerts by severity level. If not specified, returns alerts at any severity."),
      ruleId: z.string().optional().describe("Filter alerts by rule ID."),
      ruleName: z.string().optional().describe("Filter alerts by rule name."),
      toolName: z.string().optional().describe("Filter alerts by tool name."),
      ref: z
        .string()
        .optional()
        .describe(
          "Filter non-secret alerts by git reference (branch), e.g. 'refs/heads/main'. When omitted and onlyDefaultBranch is true, only alerts on the default branch are returned. Not applicable to secret alerts and ignored by this tool when alertType is 'Secret'. When alertType is unspecified, this filter is still sent and may exclude secret alerts from the results; query alertType 'Secret' separately to retrieve all secrets."
        ),
      onlyDefaultBranch: z
        .boolean()
        .optional()
        .describe(
          "For non-secret alerts: if true (the service default when omitted) only return alerts found on the default branch; if false, return alerts from all branches. Ignored when 'ref' is provided. Not applicable to secret alerts and ignored by this tool when alertType is 'Secret'. When alertType is unspecified, this filter is still sent and may exclude secret alerts from the results; query alertType 'Secret' separately to retrieve all secrets."
        ),
      confidenceLevels: z
        .array(z.enum(getEnumKeys(Confidence) as [string, ...string[]]))
        .optional()
        .describe(
          "Only applicable to secret alerts. Accepted values are 'High' and 'Other'. Pass a single value (e.g. ['High']) to narrow secrets to that confidence level. Leave unset to return secrets without a confidence filter. Do not select both levels to widen results: the Alerts service does not accept a multi-value confidence filter and would return no alerts, so this tool treats an all-levels selection as no filter and omits it."
        ),
      validity: z
        .array(z.enum(getEnumKeys(AlertValidityStatus) as [string, ...string[]]))
        .optional()
        .describe(
          "Only applicable to secret alerts. If omitted, alerts of all validity statuses are returned (no validity filter is applied). Filtering by validity may return fewer alerts than 'top'; use the continuation token to fetch any remaining alerts."
        ),
      top: z.coerce.number().optional().default(100).describe("Maximum number of alerts to return. Defaults to 100."),
      orderBy: z.enum(["id", "firstSeen", "lastSeen", "fixedOn", "severity"]).optional().default("severity").describe("Order results by specified field. Defaults to 'severity'."),
      continuationToken: z.string().optional().describe("Continuation token for pagination."),
    },
    async ({ project, repository, alertType, states, severities, ruleId, ruleName, toolName, ref, onlyDefaultBranch, confidenceLevels, validity, top, orderBy, continuationToken }) => {
      try {
        const connection = await connectionProvider();
        const alertApi = await connection.getAlertApi();

        const normalizedAlertType = alertType?.toLowerCase();
        // "onlyDefaultBranch" and "ref" are not applicable to secret alerts (secrets are not
        // branch-scoped and carry a null gitRef). Forwarding them for a secret-only query diverges
        // from the REST API / Advanced Security UI and can incorrectly return no alerts, so only
        // include them when the query is not restricted to secret alerts.
        const isSecretOnly = normalizedAlertType === "secret";
        // "confidenceLevels" and "validity" only apply to secret alerts, so include them whenever
        // the result set can contain secrets (an explicit "secret" type or no type filter at all).
        const canIncludeSecrets = !alertType || isSecretOnly;

        // The Alerts service does not accept the multi-value (comma-serialized) confidence filter
        // that the SDK emits: selecting every level (e.g. both "High" and "Other") returns zero
        // alerts, and it is a no-op filter regardless. Only forward confidenceLevels when it
        // narrows the result to a proper subset (a single level); otherwise omit it so secrets are
        // returned without a confidence filter instead of an empty set.
        const confidenceLevelValues = confidenceLevels ? mapStringArrayToEnum(confidenceLevels, Confidence) : [];
        const narrowsByConfidence = confidenceLevelValues.length > 0 && confidenceLevelValues.length < getEnumKeys(Confidence).length;

        const criteria = {
          ...(alertType && { alertType: mapStringToEnum(alertType, AlertType) }),
          ...(states && { states: mapStringArrayToEnum(states, State) }),
          ...(severities && { severities: mapStringArrayToEnum(severities, Severity) }),
          ...(ruleId && { ruleId }),
          ...(ruleName && { ruleName }),
          ...(toolName && { toolName }),
          ...(!isSecretOnly && ref && { ref }),
          ...(!isSecretOnly && onlyDefaultBranch !== undefined && { onlyDefaultBranch }),
          ...(canIncludeSecrets && narrowsByConfidence && { confidenceLevels: confidenceLevelValues }),
          ...(canIncludeSecrets && validity && { validity: mapStringArrayToEnum(validity, AlertValidityStatus) }),
        };

        const result = await alertApi.getAlerts(
          project,
          repository,
          top,
          orderBy,
          criteria,
          undefined, // expand parameter
          continuationToken
        );

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [
            {
              type: "text",
              text: `Error fetching Advanced Security alerts: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  registerTool(
    server,
    ADVSEC_TOOLS.get_alert_details,
    "Get detailed information about a specific Advanced Security alert.",
    {
      project: requiredProject,
      repository: z.string().describe("The name or ID of the repository containing the alert."),
      alertId: z.coerce.number().min(1).describe("The ID of the alert to retrieve details for."),
      ref: z.string().optional().describe("Git reference (branch) to filter the alert."),
    },
    async ({ project, repository, alertId, ref }) => {
      try {
        const connection = await connectionProvider();
        const alertApi = await connection.getAlertApi();

        const result = await alertApi.getAlert(
          project,
          alertId,
          repository,
          ref,
          undefined // expand parameter
        );

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [
            {
              type: "text",
              text: `Error fetching alert details: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // The REST operations below live on the advsec host; the node API client covers only alert reads.
  async function call(action: string, method: string, pathAndQuery: string, body?: unknown) {
    try {
      const connection = await connectionProvider();
      const token = await tokenProvider();
      const baseUrl = subdomainBaseUrl(connection.serverUrl, "advsec");
      const response = await adoFetch({ url: `${baseUrl}/${pathAndQuery}`, method, token, userAgent: userAgentProvider(), body });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`${response.status}: ${text}`);
      }
      const continuationToken = response.headers?.get("x-ms-continuationtoken");
      const result = continuationToken ? `${text}\n\nMore results: pass continuationToken ${continuationToken}.` : text;
      return { content: [{ type: "text" as const, text: result || "Done." }] };
    } catch (error) {
      return { content: [{ type: "text" as const, text: `Error ${action}: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  }

  function query(apiVersion: string, values: Record<string, string | number | boolean | string[] | undefined>): string {
    const params = new URLSearchParams({ "api-version": apiVersion });
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined || (Array.isArray(value) && value.length === 0)) continue;
      params.append(key, Array.isArray(value) ? value.join(",") : String(value));
    }
    return params.toString();
  }

  const projectPath = (project: string) => encodeURIComponent(project);
  const repositoryParam = z.string().describe("The name or ID of the repository.");
  const alertIdParam = z.coerce.number().min(1).describe("The ID of the alert.");

  // Enablement and committer estimates exist at organization, project and repository level;
  // each tool spells out its three routes.
  function managementScope(project: string | undefined, repository: string | undefined, routes: (p: string, r: string) => [string, string, string]): string | Error {
    if (repository && !project) {
      return new Error("Give the project of the repository too.");
    }
    const [organizationRoute, projectRoute, repositoryRoute] = routes(projectPath(project ?? ""), encodeURIComponent(repository ?? ""));
    return project && repository ? repositoryRoute : project ? projectRoute : organizationRoute;
  }
  const scopeError = (error: Error) => ({ content: [{ type: "text" as const, text: error.message }], isError: true });
  const scopedProject = optionalProjectWith("Leave out, together with repository, for the whole organization.");
  const scopedRepository = z.string().optional().describe("The name or ID of a repository in the project, for that repository only.");

  registerTool(
    server,
    ADVSEC_TOOLS.update_alert,
    "Dismiss an Advanced Security alert with a reason, or reopen a dismissed one. Fixed alerts close by themselves once a scan no longer finds the problem.",
    {
      project: requiredProject,
      repository: repositoryParam,
      alertId: alertIdParam,
      state: z.enum(["dismissed", "active"]).describe("'dismissed' to close the alert, 'active' to reopen it."),
      dismissedReason: z
        .enum(["acceptedRisk", "falsePositive", "agreedToGuidance", "toolUpgrade", "notDistributed", "fixed"])
        .optional()
        .describe("Why the alert is dismissed. Required when dismissing."),
      dismissedComment: z.string().optional().describe("A comment explaining the dismissal."),
    },
    async ({ project, repository, alertId, state, dismissedReason, dismissedComment }) => {
      if (state === "dismissed" && !dismissedReason) {
        return { content: [{ type: "text", text: "Give dismissedReason when dismissing an alert." }], isError: true };
      }
      return call(`updating alert ${alertId}`, "PATCH", `${projectPath(project)}/_apis/alert/repositories/${encodeURIComponent(repository)}/alerts/${alertId}?${query(alertApiVersion, {})}`, {
        state,
        dismissedReason,
        dismissedComment,
      });
    }
  );

  registerTool(
    server,
    ADVSEC_TOOLS.list_alert_instances,
    "List where an alert was found: each analysis instance with its file locations and the branch it was seen on.",
    {
      project: requiredProject,
      repository: repositoryParam,
      alertId: alertIdParam,
      ref: z.string().optional().describe("Only instances on this branch, e.g. 'refs/heads/main'. The default branch when omitted."),
    },
    async ({ project, repository, alertId, ref }) =>
      call(
        `listing instances of alert ${alertId}`,
        "GET",
        `${projectPath(project)}/_apis/alert/repositories/${encodeURIComponent(repository)}/alerts/${alertId}/instances?${query(alertApiVersion, { ref })}`
      )
  );

  registerTool(
    server,
    ADVSEC_TOOLS.get_alert_metadata,
    "Get the metadata attached to an alert.",
    {
      project: requiredProject,
      repository: repositoryParam,
      alertId: alertIdParam,
    },
    async ({ project, repository, alertId }) =>
      call(`getting metadata of alert ${alertId}`, "GET", `${projectPath(project)}/_apis/alert/repositories/${encodeURIComponent(repository)}/alerts/${alertId}/metadata?${query(alertApiVersion, {})}`)
  );

  registerTool(
    server,
    ADVSEC_TOOLS.list_analyzed_branches,
    "List the branches of a repository that have scan results for one kind of alert, in alphabetical order. Use it to pick a ref for advsec_get_alerts.",
    {
      project: requiredProject,
      repository: repositoryParam,
      alertType: z.enum(ALERT_TYPES).describe("The kind of alert."),
      branchNameContains: z.string().optional().describe("Only branches whose name contains this text (case-insensitive)."),
      includePullRequestBranches: z.boolean().optional().describe("Include pull request branches."),
      top: z.coerce.number().min(1).optional().describe("Maximum number of branches to return."),
      continuationToken: z.string().optional().describe("The last branch name of the previous page; branches after it are returned."),
    },
    async ({ project, repository, alertType, branchNameContains, includePullRequestBranches, top, continuationToken }) =>
      call(
        `listing analyzed branches of ${repository}`,
        "GET",
        `${projectPath(project)}/_apis/alert/repositories/${encodeURIComponent(repository)}/filters/branches?${query(alertApiVersion, { alertType, branchNameContains, includePullRequestBranches, top, continuationToken })}`
      )
  );

  registerTool(
    server,
    ADVSEC_TOOLS.delete_pipeline_analysis,
    "Soft-delete the analysis results a pipeline submitted for a repository, cleaning up the alerts associated with them — for a scanning pipeline that no longer exists. Without pipelineId the results of every pipeline in the repository are deleted.",
    {
      project: requiredProject,
      repository: repositoryParam,
      pipelineId: z.coerce.number().min(1).optional().describe("The pipeline (definition) ID. Leave out for all pipelines."),
    },
    async ({ project, repository, pipelineId }) => {
      const repo = encodeURIComponent(repository);
      const path =
        pipelineId === undefined
          ? `${projectPath(project)}/_apis/alert/repositories/${repo}/pipelineAnalyses`
          : `${projectPath(project)}/_apis/alert/repositories/${repo}/pipelineAnalysis/${pipelineId}`;
      return call(`deleting pipeline analysis of ${repository}`, "DELETE", `${path}?${query(alertApiVersion, {})}`);
    }
  );

  registerTool(
    server,
    ADVSEC_TOOLS.get_enablement,
    "Get which Advanced Security features are on — Secret Protection (secret scanning, push protection) and Code Security (dependency scanning, CodeQL, autofix) — for a repository, a project or the organization. Project and organization results list every repository and the settings applied to new repositories.",
    {
      project: scopedProject,
      repository: scopedRepository,
      includeAllProperties: z.boolean().optional().describe("Include every feature property, not only the main switches."),
    },
    async ({ project, repository, includeAllProperties }) => {
      const route = managementScope(project, repository, (p, r) => ["_apis/management/enablement", `${p}/_apis/management/enablement`, `${p}/_apis/management/repositories/${r}/enablement`]);
      if (route instanceof Error) return scopeError(route);
      return call("getting Advanced Security enablement", "GET", `${route}?${query(managementApiVersion, { includeAllProperties })}`);
    }
  );

  const featureSwitch = (description: string) => z.boolean().optional().describe(description);
  registerTool(
    server,
    ADVSEC_TOOLS.update_enablement,
    "Turn Advanced Security features on or off for a repository, a project or the organization. Turning a plan on starts billing for every active committer it covers — check advsec_get_committer_estimate first. For a project or the organization, onCreate settings decide what new repositories get. Settings left out stay as they are.",
    {
      project: scopedProject,
      repository: scopedRepository,
      secretProtection: z
        .object({
          secretProtectionEnabled: featureSwitch("Secret scanning."),
          blockPushes: featureSwitch("Push protection: reject pushes that contain secrets."),
        })
        .optional()
        .describe("Secret Protection features."),
      codeSecurity: z
        .object({
          codeSecurityEnabled: featureSwitch("Code Security."),
          dependencyScanningInjectionEnabled: featureSwitch("Inject dependency scanning into pipelines."),
          codeQLEnabled: featureSwitch("CodeQL default setup."),
          autofixEnabled: featureSwitch("Copilot Autofix."),
          malwareAlertsEnabled: featureSwitch("Malware alerts."),
        })
        .optional()
        .describe("Code Security features."),
      onCreate: z
        .object({
          enableSecretProtectionOnCreate: z.boolean().optional(),
          enableBlockPushesOnCreate: z.boolean().optional(),
          enableCodeSecurityOnCreate: z.boolean().optional(),
          enableDependencyScanningInjectionOnCreate: z.boolean().optional(),
          enableCodeQLOnCreate: z.boolean().optional(),
          enableAutofixOnCreate: z.boolean().optional(),
          enableMalwareAlertsOnCreate: z.boolean().optional(),
        })
        .optional()
        .describe("What newly created repositories get. Project or organization only."),
    },
    async ({ project, repository, secretProtection, codeSecurity, onCreate }) => {
      const route = managementScope(project, repository, (p, r) => ["_apis/management/enablement", `${p}/_apis/management/enablement`, `${p}/_apis/management/repositories/${r}/enablement`]);
      if (route instanceof Error) return scopeError(route);
      if (repository && onCreate) {
        return { content: [{ type: "text", text: "onCreate settings apply to a project or the organization, not a repository." }], isError: true };
      }
      if (!secretProtection && !codeSecurity && !onCreate) {
        return { content: [{ type: "text", text: "Nothing to change: give secretProtection, codeSecurity or onCreate." }], isError: true };
      }
      return call("updating Advanced Security enablement", "PATCH", `${route}?${query(managementApiVersion, {})}`, {
        secretProtectionFeatures: secretProtection,
        codeSecurityFeatures: codeSecurity,
        enablementOnCreateSettings: onCreate,
      });
    }
  );

  registerTool(
    server,
    ADVSEC_TOOLS.get_committer_estimate,
    "Estimate how many committers would be billed if a plan were turned on for a repository, a project or the organization, and who they are.",
    {
      project: scopedProject,
      repository: scopedRepository,
      plan: z.enum(PLANS).optional().describe("The plan to estimate: 'codeSecurity', 'secretProtection' or 'all'."),
    },
    async ({ project, repository, plan }) => {
      const route = managementScope(project, repository, (p, r) => [
        "_apis/management/meterUsageEstimate/default",
        `${p}/_apis/management/meterUsageEstimate/default`,
        `${p}/_apis/management/repositories/${r}/meterUsageEstimate/default`,
      ]);
      if (route instanceof Error) return scopeError(route);
      return call("estimating billed committers", "GET", `${route}?${query(managementApiVersion, { plan })}`);
    }
  );

  registerTool(
    server,
    ADVSEC_TOOLS.get_meter_usage,
    "Get the committers the organization was billed for on a given day, per plan. Fails with 404 when there is no billing record for that day, e.g. while no plan is on.",
    {
      plan: z.enum(PLANS).describe("The plan: 'codeSecurity', 'secretProtection' or 'all'."),
      billingDate: z.string().optional().describe("The day, e.g. '2026-09-01'. Today when omitted."),
    },
    async ({ plan, billingDate }) => call("getting meter usage", "GET", `_apis/management/meterusage/default?${query(managementApiVersion, { plan, billingDate })}`)
  );

  registerTool(
    server,
    ADVSEC_TOOLS.get_alert_summary,
    "Count alerts across the organization by severity, per project and repository — the security overview dashboard.",
    {
      alertTypes: z.array(z.enum(ALERT_TYPES)).optional().describe("Only these kinds of alert."),
      severities: z.array(z.enum(SEVERITIES)).optional().describe("Only these severities."),
      period: z.enum(["last24Hours", "last7Days", "last14Days", "last30Days", "last90Days"]).optional().describe("Only this time period."),
      projects: z.array(z.string()).optional().describe("Only these projects."),
      keywords: z.string().optional().describe("Only repositories whose name matches this text."),
    },
    async ({ alertTypes, severities, period, projects, keywords }) =>
      call(
        "getting the alert summary",
        "GET",
        `_apis/reporting/summary/alerts?${query(alertApiVersion, { "criteria.alertTypes": alertTypes, "criteria.severities": severities, "criteria.period": period, "criteria.projects": projects, "criteria.keywords": keywords })}`
      )
  );

  registerTool(
    server,
    ADVSEC_TOOLS.get_enablement_summary,
    "Summarize which repositories across the organization have which Advanced Security tools on. Filters narrow it to repositories where a tool is on (true) or off (false).",
    {
      projects: z.array(z.string()).optional().describe("Only these projects."),
      keywords: z.string().optional().describe("Only repositories whose name matches this text."),
      anyTool: z.boolean().optional().describe("Any tool on (true) or off (false)."),
      secretAlerts: z.boolean().optional().describe("Secret scanning on or off."),
      pushProtection: z.boolean().optional().describe("Push protection on or off."),
      dependencyAlerts: z.boolean().optional().describe("Dependency scanning on or off."),
      codeAlerts: z.boolean().optional().describe("Code scanning on or off."),
    },
    async ({ projects, keywords, anyTool, secretAlerts, pushProtection, dependencyAlerts, codeAlerts }) =>
      call(
        "getting the enablement summary",
        "GET",
        `_apis/reporting/summary/enablement?${query(alertApiVersion, {
          "criteria.projects": projects,
          "criteria.keywords": keywords,
          "criteria.states.anyTool": anyTool,
          "criteria.states.secretAlerts": secretAlerts,
          "criteria.states.pushProtection": pushProtection,
          "criteria.states.dependencyAlerts": dependencyAlerts,
          "criteria.states.codeAlerts": codeAlerts,
        })}`
      )
  );

  registerTool(
    server,
    ADVSEC_TOOLS.list_organization_alerts,
    "List alerts across every repository of the organization with filters — e.g. every open critical dependency alert for one package. When more alerts exist the response ends with a continuationToken for the next page. For one repository advsec_get_alerts has more filters.",
    {
      alertType: z.enum(ALERT_TYPES).optional().describe("Only this kind of alert."),
      state: z.enum(["open", "closed"]).optional().describe("Only open or only closed alerts."),
      severities: z.array(z.enum(SEVERITIES)).optional().describe("Only these severities."),
      projects: z.array(z.string()).optional().describe("Only these projects (names)."),
      repositories: z.array(z.string()).optional().describe("Only these repositories (names)."),
      keywords: z.string().optional().describe("Only alerts whose title matches this text."),
      ruleNames: z.array(z.string()).optional().describe("Only code scanning or secret alerts of these rules."),
      toolNames: z.array(z.string()).optional().describe("Only code scanning alerts from these tools."),
      componentNames: z.array(z.string()).optional().describe("Only dependency alerts for these packages."),
      componentTypes: z.array(z.string()).optional().describe("Only dependency alerts in these ecosystems, e.g. 'npm', 'nuget', 'maven'."),
      introducedDateStart: z.string().optional().describe("Only alerts introduced on or after this date."),
      introducedDateEnd: z.string().optional().describe("Only alerts introduced on or before this date."),
      top: z.coerce.number().min(1).optional().describe("Maximum number of alerts to return."),
      continuationToken: z.string().optional().describe("The continuationToken from a previous page."),
    },
    async ({ alertType, state, severities, projects, repositories, keywords, ruleNames, toolNames, componentNames, componentTypes, introducedDateStart, introducedDateEnd, top, continuationToken }) =>
      call(
        "listing organization alerts",
        "GET",
        `_apis/reporting/summary/alertsbatch?${query(alertApiVersion, {
          "criteria.alertType": alertType,
          "criteria.state": state,
          "criteria.severities": severities,
          "criteria.projects": projects,
          "criteria.repositories": repositories,
          "criteria.keywords": keywords,
          "criteria.ruleNames": ruleNames,
          "criteria.toolNames": toolNames,
          "criteria.componentNames": componentNames,
          "criteria.componentTypes": componentTypes,
          "criteria.introducedDateStart": introducedDateStart,
          "criteria.introducedDateEnd": introducedDateEnd,
          top,
          continuationToken,
        })}`
      )
  );
}

export { ADVSEC_TOOLS, configureAdvSecTools };
