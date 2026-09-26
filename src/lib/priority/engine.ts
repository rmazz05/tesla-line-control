import { assessConsequences } from "./case-library";
import { ACKNOWLEDGMENT_MINUTES, REVIEW_CHECKPOINT_MINUTES, SUPERVISOR_ACTION_MINUTES, areaBlockers, areaIsHeld, canRestartArea, equipmentIsolated, getAttentionPlan, responseTeam } from "./attention";
import { estimatedRepairMinutes, keepsRunningDuringRepair } from "./repair";
import { compareDecisions, PRIORITY_RULE, priorityDecision, type ImpactEvent } from "./policy";
import { FLOW_STEP_MINUTES, LOOKAHEAD_MINUTES, SIMULATION_MINUTES, STATIONS } from "./config";
import { simulationEvents } from "./scenarios";
import type { BenchmarkResult, FaultAssessment, MaintenanceTeam, PriorityIncident, RankedIncident, SimulationState, StationReading, WhatIfChange, WhatIfBranch, WhatIfResult, ProjectionFrame, RippleEvent } from "./types";

const EPS = 1e-7;
const FORECAST_STEP = 0.5;
const FORECAST_LIMIT = 60;
const DEFER_MINUTES = 5;
const nominalOutput = STATIONS[STATIONS.length - 1].ratePerMinute;
type Policy = BenchmarkResult["policy"];
type Forecast = { missedWindows: number; lostUnits: number; unfinishedMinutes: number };
type Detail = { event: ImpactEvent; critical: number | null; slack: number | null; restoration: number | null; team: MaintenanceTeam | null; wait: number; forecast: Forecast; delayLoss: number; delayMisses: number };
const rankedCache = new WeakMap<SimulationState, RankedIncident[]>();

function clone(state: SimulationState): SimulationState {
  return { ...state, supervisor: state.supervisor ? { ...state.supervisor, focus: state.supervisor.focus ? { ...state.supervisor.focus } : null, log: [...state.supervisor.log] } : undefined, buffers: [...state.buffers], incidents: state.incidents.map((incident) => ({ ...incident, response: incident.response ? { ...incident.response } : undefined, history: [...incident.history] })), teams: state.teams.map((team) => ({ ...team, skills: [...team.skills] })), injectedEventIds: [...state.injectedEventIds], rankChanges: [...state.rankChanges], previousOrder: [...state.previousOrder] };
}

function active(state: SimulationState) { return state.incidents.filter((incident) => incident.status !== "resolved"); }
function stationIndex(incident: PriorityIncident) { return STATIONS.findIndex((station) => station.id === incident.assessment.stationId); }
function stable(a: PriorityIncident, b: PriorityIncident) { return a.reportedAtMinute - b.reportedAtMinute || a.id.localeCompare(b.id); }
function safetyTier(incident: PriorityIncident) { return incident.assessment.safety === "confirmed" ? 2 : incident.assessment.safety === "suspected" ? 1 : 0; }
function actionable(incident: PriorityIncident) { return !incident.assessment.needsReview && incident.assessment.stationId !== null && incident.assessment.kind !== "unknown" && incident.assessment.repairMinutes.max > 0; }
/** Station faults multiply, so clearing one cannot silently clear another. Supply restricts external ingress. */
function capacities(state: SimulationState) {
  if (areaIsHeld(state)) return { rates: STATIONS.map(() => 0), external: 0 };
  const rates = STATIONS.map((station) => station.ratePerMinute);
  let external = STATIONS[0].ratePerMinute;
  for (const incident of active(state)) {
    const index = stationIndex(incident);
    if (index < 0) continue;
    const assessment = incident.assessment;
    // Unverified generic reports cannot silently create quantitative production
    // effects; a reported safety concern still triggers the explicit hold rule.
    const factor = assessment.needsReview ? 1 : Math.max(0, Math.min(1, assessment.capacityFactor));
    if (safetyTier(incident) > 0 || equipmentIsolated(incident)) rates[index] = 0;
    if (assessment.kind === "supply") {
      // The catalog's only supply boundary is external replenishment at GA-12.
      if (index === 0) external *= factor;
      continue;
    }
    const expired = !assessment.needsReview && assessment.criticalAfterMinutes !== null && state.minute + EPS >= incident.reportedAtMinute + assessment.criticalAfterMinutes;
    const held = equipmentIsolated(incident) || safetyTier(incident) > 0 || (incident.status === "repairing" && !keepsRunningDuringRepair(assessment)) || (expired && (assessment.kind === "condition" || assessment.kind === "quality"));
    rates[index] *= held ? 0 : factor;
  }
  return { rates, external };
}

/**
 * Boundary flows [external ingress, station 0 output, ..., final output].
 * Start at capacity, then monotonically apply inventory/space constraints. Each
 * body appears in exactly one buffer or in finished output; same-step transfer
 * is allowed by this fluid approximation. There is no independent per-fault loss.
 */
function flows(state: SimulationState, dt: number) {
  const { rates, external } = capacities(state);
  const result = [external, ...rates];
  for (let pass = 0; pass <= STATIONS.length; pass++) {
    for (let index = 0; index < STATIONS.length; index++) {
      result[index + 1] = Math.max(0, Math.min(result[index + 1], state.buffers[index] / dt + result[index]));
    }
    for (let index = STATIONS.length - 1; index >= 0; index--) {
      result[index] = Math.max(0, Math.min(result[index], (STATIONS[index].bufferCapacity - state.buffers[index]) / dt + result[index + 1]));
    }
  }
  return result;
}

/** Instantaneous flow: finite inventory constrains rates only at a boundary.
 * Forecasts must not average across a buffer-empty/full event and miss a short
 * restriction simply because it falls between two sampling instants. */
function instantaneousFlows(state: SimulationState) {
  const { rates, external } = capacities(state);
  const result = [external, ...rates];
  for (let pass = 0; pass <= STATIONS.length; pass++) {
    for (let index = 0; index < STATIONS.length; index++) {
      if (state.buffers[index] <= EPS) result[index + 1] = Math.min(result[index + 1], result[index]);
    }
    for (let index = STATIONS.length - 1; index >= 0; index--) {
      if (STATIONS[index].bufferCapacity - state.buffers[index] <= EPS) result[index] = Math.min(result[index], result[index + 1]);
    }
  }
  return result;
}

function finish(state: SimulationState, incident: PriorityIncident, manual: boolean) {
  if (state.supervisor && !manual) {
    if (incident.response) {
      incident.response.readyAt = state.minute;
      incident.response.checkpointAt = state.minute;
    }
    incident.repairCompletesAtMinute = null;
    incident.history.push({ minute: state.minute, text: "Team returned the work. Supervisor verification is required before release." });
    return;
  }
  incident.status = "resolved";
  incident.resolvedAtMinute = state.minute;
  incident.history.push({ minute: state.minute, text: manual ? "Supervisor marked response and verification complete." : "Repair and checks completed within the estimated response duration." });
  const team = state.teams.find((item) => item.id === incident.assignedTeamId);
  if (team) { team.assignedIncidentId = null; team.availableAtMinute = state.minute; team.stationId = incident.assessment.stationId; }
}

function completeRepairs(state: SimulationState) {
  for (const incident of state.incidents) {
    if (incident.status === "repairing" && incident.repairCompletesAtMinute !== null && incident.repairCompletesAtMinute <= state.minute + EPS) finish(state, incident, false);
  }
}

function tick(state: SimulationState, dt: number) {
  const movement = flows(state, dt);
  state.buffers = state.buffers.map((buffer, index) => Math.max(0, Math.min(STATIONS[index].bufferCapacity, buffer + dt * (movement[index] - movement[index + 1]))));
  const output = movement[movement.length - 1];
  state.producedUnits += output * dt;
  state.lostUnits += Math.max(0, nominalOutput - output) * dt;
  if (output < EPS) state.stoppedMinutes += dt;
  state.minute += dt;
  completeRepairs(state);
}

function nextStep(state: SimulationState, limit: number, maximum: number) {
  let dt = Math.min(maximum, limit - state.minute);
  for (const incident of active(state)) {
    const boundaries = [incident.repairCompletesAtMinute, incident.assessment.criticalAfterMinutes === null ? null : incident.reportedAtMinute + incident.assessment.criticalAfterMinutes];
    for (const boundary of boundaries) if (boundary !== null && boundary > state.minute + EPS) dt = Math.min(dt, boundary - state.minute);
  }
  const movement = instantaneousFlows(state);
  for (let index = 0; index < STATIONS.length; index++) {
    const net = movement[index] - movement[index + 1];
    const distance = net > EPS ? STATIONS[index].bufferCapacity - state.buffers[index] : state.buffers[index];
    if (Math.abs(net) > EPS && distance > EPS) dt = Math.min(dt, distance / Math.abs(net));
  }
  return dt;
}

function makeIncident(state: SimulationState, assessment: FaultAssessment, reportText: string, id: string): PriorityIncident {
  return { id, reportText, reportedAtMinute: state.minute, status: "open", assessment, repairStartedAtMinute: null, repairCompletesAtMinute: null, resolvedAtMinute: null, assignedTeamId: null, history: [
    { minute: state.minute, text: `Reported via ${assessment.source}; entered the repair order.` },
    ...(assessment.safety !== "none" ? [{ minute: state.minute, text: assessment.stationId ? "Demo hold rule: affected station stopped immediately. Effective isolation and personnel clearance still need supervisor confirmation." : "Safety escalation: equipment is unidentified. Identify and contain the affected equipment immediately; no station hold can be confirmed from this report." }] : []),
  ] };
}

function injectDueEvents(state: SimulationState) {
  for (const event of simulationEvents(state)) {
    if (event.minute <= state.minute + EPS && !state.injectedEventIds.includes(event.id)) {
      state.injectedEventIds.push(event.id);
      // A machine cannot develop the same outstanding fault repeatedly. Once
      // verified closed, a later random occurrence may create a new incident.
      if (state.scenario === "random" && state.incidents.some(i => i.status !== "resolved" && i.assessment.catalogId === event.assessment.catalogId && i.assessment.stationId === event.assessment.stationId)) continue;
      state.incidents.push(makeIncident(state, event.assessment, event.reportText, event.id));
    }
  }
}

function chooseTeam(state: SimulationState, incident: PriorityIncident): MaintenanceTeam | null {
  if (incident.status === "repairing") return state.teams.find(team => team.id === incident.assignedTeamId) ?? null;
  if (!actionable(incident)) return null;
  return {id: `response-${incident.id}`, name: "Maintenance", skills: [], assignedIncidentId: null, availableAtMinute: state.minute, stationId: incident.assessment.stationId};
}

function assign(state: SimulationState, incident: PriorityIncident, team: MaintenanceTeam) {
  if (!state.teams.some(item => item.id === team.id)) state.teams.push(team);
  const duration = estimatedRepairMinutes(incident.assessment);
  incident.status = "repairing";
  incident.assignedTeamId = team.id;
  incident.repairStartedAtMinute = state.minute;
  incident.repairCompletesAtMinute = state.minute + duration;
  team.assignedIncidentId = incident.id;
  team.availableAtMinute = incident.repairCompletesAtMinute;
  incident.history.push({ minute: state.minute, text: `Maintenance started: ${duration} min total, matching the displayed estimate. This includes the repair and checks; no extra time is added.` });
}

/** Critical event is conditional on actual connected flow, not incident age. */
function criticalForecast(state: SimulationState, incident: PriorityIncident): { minutes: number | null; event: ImpactEvent } {
  if (state.supervisor && areaIsHeld(state)) return { minutes: null, event: "unknown" };
  if (safetyTier(incident) || incident.containmentConfirmedAtMinute != null) return { minutes: 0, event: "safety_hold" };
  const assessment = incident.assessment;
  if (!actionable(incident)) return { minutes: null, event: "unknown" };
  if (assessment.criticalAfterMinutes !== null) return { minutes: Math.max(0, incident.reportedAtMinute + assessment.criticalAfterMinutes - state.minute), event: "station_hold" };
  const index = stationIndex(incident);
  const withFault = clone(state);
  const withoutFault = clone(state);
  withoutFault.incidents.find((item) => item.id === incident.id)!.status = "resolved";
  // Compare the same connected line with and without only this fault. Other
  // known faults and already committed repairs remain identical in both worlds.
  const limit = state.minute + FORECAST_LIMIT;
  while (withFault.minute <= limit + EPS) {
    const elapsed = withFault.minute - state.minute;
    const current = withFault.incidents.find((item) => item.id === incident.id)!;
    if (current.status === "resolved") return { minutes: null, event: "unknown" };
    const yes = instantaneousFlows(withFault);
    const no = instantaneousFlows(withoutFault);
    const finalImpact = yes[yes.length - 1] + EPS < no[no.length - 1];
    const starved = assessment.kind === "supply"
      ? withFault.buffers[0] <= EPS && yes[1] + EPS < no[1]
      : index + 1 < STATIONS.length && withFault.buffers[index + 1] <= EPS && yes[index + 2] + EPS < no[index + 2];
    const blocked = assessment.kind !== "supply" && withFault.buffers[index] >= STATIONS[index].bufferCapacity - EPS && yes[index] + EPS < no[index];
    if (assessment.kind === "supply" && starved) return { minutes: elapsed, event: "buffer_empty" };
    if (finalImpact) return { minutes: elapsed, event: yes[yes.length - 1] < EPS ? "output_stopped" : "output_slowed" };
    if (starved) return { minutes: elapsed, event: "downstream_starved" };
    if (blocked) return { minutes: elapsed, event: "upstream_blocked" };
    if (withFault.minute >= limit - EPS) break;
    // Both branches must cross every scheduled completion/hold at the exact
    // same instant. Rounding a restart to a half-minute step invents downtime
    // and amplifies a tiny phase error into minutes of buffer deadline jitter.
    const dt = Math.min(nextStep(withFault, limit, FORECAST_STEP), nextStep(withoutFault, limit, FORECAST_STEP));
    tick(withFault, dt);
    tick(withoutFault, dt);
  }
  return { minutes: null, event: "no_additional_impact" };
}

function simpleOrder(state: SimulationState, policy: Policy, criticals?: Map<string, number | null>) {
  return active(state).filter((incident) => incident.status === "open" && actionable(incident)).sort((a, b) => {
    const safety = safetyTier(b) - safetyTier(a);
    if (safety) return safety;
    if (policy === "fifo") return stable(a, b);
    if (policy === "severity") return b.assessment.severity - a.assessment.severity || stable(a, b);
    const deadlineA = criticals?.get(a.id) ?? (a.assessment.criticalAfterMinutes === null ? Infinity : Math.max(0, a.reportedAtMinute + a.assessment.criticalAfterMinutes - state.minute));
    const deadlineB = criticals?.get(b.id) ?? (b.assessment.criticalAfterMinutes === null ? Infinity : Math.max(0, b.reportedAtMinute + b.assessment.criticalAfterMinutes - state.minute));
    return deadlineA - deadlineB || stable(a, b);
  });
}

function dispatchOrder(state: SimulationState, order: string[], deferredId?: string, deferUntil = 0) {
  if (state.supervisor) return; // A simulation tick cannot manufacture a human acknowledgment.
  for (const id of order) {
    const incident = state.incidents.find((item) => item.id === id);
    if (!incident || incident.status !== "open" || !actionable(incident) || assessConsequences(incident).safetyReview || assessConsequences(incident).uncontainedSpread || (id === deferredId && state.minute < deferUntil - EPS)) continue;
    const team = chooseTeam(state, incident);
    if (team) assign(state, incident, team);
  }
}

function breachedWindows(state: SimulationState, misses: Set<string>) {
  for (const incident of active(state)) {
    const assessment = incident.assessment;
    if (!actionable(incident)) continue;
    if (assessment.criticalAfterMinutes !== null && state.minute + EPS >= incident.reportedAtMinute + assessment.criticalAfterMinutes) misses.add(incident.id);
    if (assessment.kind === "supply" && stationIndex(incident) === 0 && state.buffers[0] <= EPS) misses.add(incident.id);
  }
}

/** A bounded candidate-first rollout schedules every other known job greedily.
 * Maintenance is always available; future scenario events are absent.
 * Containment deadlines act through station holds in the same flow simulation.
 * Their breach count is diagnostic only, never an extra priority multiplier.
 * This is a local response comparison, not a global optimality claim.
 */
function rollout(initial: SimulationState, candidateId: string | null, fallback: string[], deferCandidate = false): Forecast {
  const state = clone(initial);
  const order = [...new Set([...(candidateId ? [candidateId] : []), ...fallback])].sort((a, b) => safetyTier(state.incidents.find((item) => item.id === b)!) - safetyTier(state.incidents.find((item) => item.id === a)!));
  const limit = state.minute + LOOKAHEAD_MINUTES;
  const misses = new Set<string>();
  let unfinishedMinutes = 0;
  while (state.minute < limit - EPS) {
    dispatchOrder(state, order, deferCandidate ? candidateId ?? undefined : undefined, initial.minute + DEFER_MINUTES);
    breachedWindows(state, misses);
    let dt = nextStep(state, limit, FORECAST_STEP);
    if (deferCandidate && state.minute < initial.minute + DEFER_MINUTES - EPS) dt = Math.min(dt, initial.minute + DEFER_MINUTES - state.minute);
    unfinishedMinutes += active(state).length * dt;
    tick(state, dt);
  }
  breachedWindows(state, misses);
  return { missedWindows: misses.size, lostUnits: state.lostUnits - initial.lostUnits, unfinishedMinutes };
}

function round(value: number) { return Math.round(value * 10) / 10; }

function calculateRanking(state: SimulationState): RankedIncident[] {
  const incidents = active(state);
  const readings = getStationReadings(state);
  const details = new Map<string, Detail>();
  const impacts = new Map(incidents.map((incident) => [incident.id, criticalForecast(state, incident)]));
  const criticals = new Map(incidents.map((incident) => [incident.id, impacts.get(incident.id)!.minutes]));
  const fallback = simpleOrder(state, "deadline", criticals).map((incident) => incident.id);
  const baseline = state.supervisor ? { missedWindows: 0, lostUnits: 0, unfinishedMinutes: 0 } : rollout(state, null, fallback);
  for (const incident of incidents) {
    const team = chooseTeam(state, incident);
    const wait = 0;
    const critical = criticals.get(incident.id) ?? null;
    const restoration = incident.status === "repairing" ? Math.max(0, (incident.repairCompletesAtMinute ?? state.minute) - state.minute) : team ? estimatedRepairMinutes(incident.assessment) : null;
    const response = restoration === null ? null : wait + restoration;
    const forecast = !state.supervisor && incident.status === "open" && actionable(incident) ? rollout(state, incident.id, fallback) : baseline;
    const deferred = !state.supervisor && incident.status === "open" && actionable(incident) ? rollout(state, incident.id, fallback, true) : forecast;
    details.set(incident.id, { event: impacts.get(incident.id)!.event, critical, slack: critical === null || response === null ? null : critical - response, restoration, team, wait, forecast, delayLoss: deferred.lostUnits - forecast.lostUnits, delayMisses: deferred.missedWindows - forecast.missedWindows });
  }
  const decision = (incident: PriorityIncident) => {
    const detail = details.get(incident.id)!;
    return priorityDecision(incident, detail.critical === null ? null : round(detail.critical), detail.event, detail.slack === null ? null : round(detail.slack), readings.find(reading => reading.id === incident.assessment.stationId) ?? null);
  };
  const compareVisible = (a: PriorityIncident, b: PriorityIncident) => {
    const ad = decision(a); const bd = decision(b);
    return compareDecisions(ad, bd);
  };
  incidents.sort((a, b) => compareVisible(a, b) || a.reportedAtMinute - b.reportedAtMinute || (a.assessment.stationId ?? "").localeCompare(b.assessment.stationId ?? "") || a.id.localeCompare(b.id));
  return incidents.map((incident, index) => {
    const info = details.get(incident.id)!;
    const closeCall = incidents.some((other) => other.id !== incident.id && compareVisible(incident, other) === 0);
    const stationReading = readings.find(reading => reading.id === incident.assessment.stationId) ?? null;
    const assessedDecision = decision(incident);
    const priorityReason = assessedDecision.reason + (closeCall ? " Equal decision factors; report time, station and incident ID keep the order stable." : "");
    const whyNow = `${assessedDecision.rule}. ${priorityReason} Policy: ${PRIORITY_RULE} Within comparable production risk: shortest supported start window, stopped before slowed production, required operation before a confirmed backup, then larger slowdown. No injury probability or time-to-injury is inferred. Repair includes checks; maintenance is always available.`;
    const latestChange = [...state.rankChanges].reverse().find((change) => change.incidentId === incident.id);
    return { incident, decision: assessedDecision, stationReading, rank: index + 1, previousRank: latestChange?.from ?? null, criticalInMinutes: info.critical === null ? null : round(info.critical), impactEvent: info.event, slackMinutes: info.slack === null ? null : round(info.slack), responseMinutes: info.slack === null || info.critical === null ? null : round(info.critical - info.slack), restorationMinutes: info.restoration === null ? null : round(info.restoration), delayLossUnits: round(info.delayLoss), delayMissedWindows: info.delayMisses, priorityReason, immediateLossUnits: round(info.forecast.lostUnits), deferredLossUnits: round(info.forecast.lostUnits + info.delayLoss), whyNow, affectedStations: incident.assessment.stationId ? STATIONS.slice(stationIndex(incident)).map((station) => station.id) : [], closeCall, recommendedTeamId: info.team?.id ?? null, teamWaitMinutes: round(info.wait) };
  });
}

function finalize(state: SimulationState, reason: string): SimulationState {
  if (state.supervisor && areaBlockers(state).length && !state.supervisor.areaStopped) {
    state.supervisor.areaStopped = true;
    state.supervisor.log.push({ minute: state.minute, text: "Whole modeled area held: personnel protection or quality containment requires confirmation." });
  }
  const ranks = calculateRanking(state);
  const order = ranks.map((item) => item.incident.id);
  for (const id of new Set([...state.previousOrder, ...order])) {
    const previousIndex = state.previousOrder.indexOf(id); const nextIndex = order.indexOf(id);
    if (previousIndex === nextIndex) continue;
    const row = ranks.find((item) => item.incident.id === id);
    const from = previousIndex < 0 ? null : previousIndex + 1;
    const to = nextIndex < 0 ? null : nextIndex + 1;
    const explanation = to === null ? "Response resolved; removed from active queue." : from === null ? `New incident entered at #${to}. ${reason}` : `${reason} ${row?.priorityReason ?? ""}`;
    state.rankChanges.push({ minute: state.minute, incidentId: id, from, to, reason: explanation });
    state.incidents.find((incident) => incident.id === id)?.history.push({ minute: state.minute, text: `Rank ${from === null ? "new" : `#${from}`} → ${to === null ? "closed" : `#${to}`}: ${explanation}` });
    if (row) row.previousRank = from;
  }
  state.previousOrder = order;
  rankedCache.set(state, ranks);
  return state;
}

export function createSimulation(scenario: NonNullable<SimulationState["scenario"]> = "shift", supervisorWorkflow = false): SimulationState {
  const state: SimulationState = { scenario, minute: 0, incidents: [], buffers: STATIONS.map((station) => station.initialBuffer), injectedEventIds: [], rankChanges: [], previousOrder: [], producedUnits: 0, lostUnits: 0, stoppedMinutes: 0, autoDispatch: false, teams: [] };
  if (supervisorWorkflow) state.supervisor = { areaStopped: false, focus: null, log: [] };
  if (scenario === "demo") state.buffers[0] = 12;
  injectDueEvents(state);
  return finalize(state, "Initial scenario observation.");
}

function dispatchPossible(state: SimulationState) { return state.incidents.some((incident) => incident.status === "open" && actionable(incident)); }

function dispatchForPolicy(state: SimulationState, policy: Policy) {
  if (!dispatchPossible(state)) return;
  const order = policy === "planner" ? calculateRanking(state).map((item) => item.incident.id) : simpleOrder(state, policy, (policy === "deadline" || policy === "reactive") ? new Map(active(state).map((incident) => [incident.id, criticalForecast(state, incident).minutes])) : undefined).map((incident) => incident.id);
  const eligible = policy === "reactive" ? order.filter(id => {
    const incident = state.incidents.find(i => i.id === id)!;
    const impact = criticalForecast(state, incident).minutes;
    return safetyTier(incident) > 0 || (impact !== null && impact <= EPS);
  }) : order;
  dispatchOrder(state, eligible);
}

function advanceInternal(state: SimulationState, minutes: number, policy: Policy, misses?: Set<string>) {
  const limit = state.minute + minutes;
  injectDueEvents(state);
  if (state.autoDispatch) dispatchForPolicy(state, policy);
  while (state.minute < limit - EPS) {
    let dt = nextStep(state, limit, FLOW_STEP_MINUTES);
    const nextEvent = simulationEvents(state).find((event) => !state.injectedEventIds.includes(event.id) && event.minute > state.minute + EPS);
    if (nextEvent) dt = Math.min(dt, nextEvent.minute - state.minute);
    tick(state, dt);
    if (misses) breachedWindows(state, misses);
    injectDueEvents(state);
    if (state.autoDispatch) dispatchForPolicy(state, policy);
  }
}

export function advanceSimulation(state: SimulationState, minutes: number): SimulationState {
  if (!Number.isFinite(minutes) || minutes <= 0) return state;
  const next = clone(state);
  advanceInternal(next, Math.min(120, minutes), "planner");
  return finalize(next, "Clock and buffers changed; repair start windows recalculated.");
}

export function getRankedIncidents(state: SimulationState): RankedIncident[] {
  const cached = rankedCache.get(state);
  if (cached) return cached;
  const ranks = calculateRanking(state);
  rankedCache.set(state, ranks);
  return ranks;
}

export function getStationReadings(state: SimulationState): StationReading[] {
  const movement = flows(state, FLOW_STEP_MINUTES);
  const { rates } = capacities(state);
  return STATIONS.map((station, index) => {
    const output = movement[index + 1];
    const status = rates[index] < EPS ? "stopped" : output < rates[index] - EPS && state.buffers[index] < EPS ? "starved" : output < rates[index] - EPS && index + 1 < STATIONS.length && state.buffers[index + 1] >= STATIONS[index + 1].bufferCapacity - EPS ? "blocked" : output < station.ratePerMinute - EPS ? "slowed" : "running";
    return { id: station.id, name: station.name, bufferUnits: round(state.buffers[index]), bufferCapacity: station.bufferCapacity, ratePerHour: round(output * 60), state: status, activeIncidentIds: active(state).filter((incident) => incident.assessment.stationId === station.id).map((incident) => incident.id) };
  });
}

export function addIncident(state: SimulationState, assessment: FaultAssessment, reportText: string, id?: string): SimulationState {
  const incidentId = id ?? `LIVE-${Math.floor(state.minute * 1000)}-${state.incidents.length + 1}`;
  if (state.incidents.some((incident) => incident.id === incidentId)) return state;
  const next = clone(state);
  next.incidents.push(makeIncident(next, assessment, reportText, incidentId));
  if (next.autoDispatch) dispatchForPolicy(next, "planner");
  return finalize(next, "A new report entered the consequence-based decision order.");
}

export function startRepair(state: SimulationState, incidentId: string): SimulationState {
  const incident = state.incidents.find((item) => item.id === incidentId);
  if (!incident || incident.status !== "open" || !actionable(incident)) return state;
  if (state.supervisor && (incident.response?.acknowledgedAt == null || incident.response.readyAt != null || assessConsequences(incident).safetyReview || assessConsequences(incident).uncontainedSpread)) return state;
  const team = chooseTeam(state, incident);
  if (!team) return state;
  const next = clone(state);
  assign(next, next.incidents.find((item) => item.id === incidentId)!, team);
  return finalize(next, "Maintenance dispatched immediately; existing repairs continue.");
}

/** Records an explicit supervisor confirmation, never an AI inference. */
export function confirmContainment(state: SimulationState, incidentId: string): SimulationState {
  const incident = state.incidents.find(item => item.id === incidentId);
  if (!incident || incident.status === "resolved" || !incident.assessment.stationId || incident.containmentConfirmedAtMinute != null) return state;
  const next = clone(state);
  const target = next.incidents.find(item => item.id === incidentId)!;
  target.containmentConfirmedAtMinute = next.minute;
  target.containmentMode = "equipment-isolated";
  target.history.push({ minute: next.minute, text: "Supervisor confirmed equipment isolation and personnel clear in the demo. Exposure contained; station remains stopped. Repair and verification still required." });
  next.supervisor?.log.push({ minute: next.minute, text: `${target.assessment.stationId}: equipment isolation and personnel clearance confirmed. Area restart remains a separate decision.` });
  return finalize(next, "Supervisor confirmed containment; consequences of delay reassessed.");
}

export function resolveIncident(state: SimulationState, incidentId: string): SimulationState {
  if (state.supervisor) return state; // Use verified handback; generic closure must not bypass checks.
  const incident = state.incidents.find((item) => item.id === incidentId);
  if (!incident || incident.status === "resolved") return state;
  const next = clone(state);
  finish(next, next.incidents.find((item) => item.id === incidentId)!, true);
  if (next.autoDispatch) dispatchForPolicy(next, "planner");
  return finalize(next, "A response closed; line dependencies changed.");
}

export function setAutoDispatch(state: SimulationState, enabled: boolean): SimulationState {
  if (state.supervisor) return state;
  if (state.autoDispatch === enabled) return state;
  const next = clone(state);
  next.autoDispatch = enabled;
  if (enabled) dispatchForPolicy(next, "planner");
  return finalize(next, enabled ? "Automatic shared-maintenance dispatch enabled." : "Automatic dispatch paused; existing work continues.");
}

function supervisorRecord(state: SimulationState, incident: PriorityIncident | null, text: string) {
  const entry = { minute: state.minute, text };
  incident?.history.push(entry);
  state.supervisor?.log.push({ ...entry, text: incident ? `${incident.assessment.stationId ?? "Unknown location"}: ${text}` : text });
}

/** Records a phone/radio request already made by the supervisor. Sends nothing externally. */
export function requestResponse(state: SimulationState, incidentId: string): SimulationState {
  const incident = state.incidents.find(i => i.id === incidentId);
  if (!state.supervisor || !incident || incident.status !== "open" || incident.response) return state;
  const next = clone(state);
  const target = next.incidents.find(i => i.id === incidentId)!;
  target.response = { team: responseTeam(target), requestedAt: next.minute, acknowledgedAt: null, owner: null, checkpointAt: next.minute + ACKNOWLEDGMENT_MINUTES, readyAt: null };
  supervisorRecord(next, target, `${target.response.team} contacted by phone/radio. Awaiting acknowledgment; no owner confirmed.`);
  return finalize(next, "Response requested; acknowledgment is still outstanding.");
}

export function acknowledgeResponse(state: SimulationState, incidentId: string, owner: string): SimulationState {
  const incident = state.incidents.find(i => i.id === incidentId);
  const name = owner.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 80);
  if (!state.supervisor || !incident?.response || incident.status === "resolved" || incident.response.acknowledgedAt !== null || name.length < 2) return state;
  const next = clone(state);
  const target = next.incidents.find(i => i.id === incidentId)!;
  target.response!.acknowledgedAt = next.minute;
  target.response!.owner = name;
  target.response!.checkpointAt = next.minute + REVIEW_CHECKPOINT_MINUTES;
  supervisorRecord(next, target, `${name} (${target.response!.team}) confirmed they are acting. Next update due at T+${target.response!.checkpointAt} min.`);
  const evidence = assessConsequences(target);
  // Known, contained work may begin after explicit acknowledgment. Unverified
  // reports remain investigations: no repair duration or physical recovery is invented.
  if (actionable(target) && !evidence.safetyReview && !evidence.uncontainedSpread) {
    const team = chooseTeam(next, target);
    if (team) {
      assign(next, target, team);
      target.response!.checkpointAt = Math.min(target.response!.checkpointAt, target.repairCompletesAtMinute!);
    }
  }
  return finalize(next, "A person accepted ownership of the response.");
}

export function recordResponseUpdate(state: SimulationState, incidentId: string, note: string, nextUpdateMinutes: number): SimulationState {
  const incident = state.incidents.find(i => i.id === incidentId);
  const text = note.trim().slice(0, 600);
  if (!state.supervisor || !incident?.response || incident.status === "resolved" || incident.response.readyAt !== null || text.length < 5 || !Number.isFinite(nextUpdateMinutes) || nextUpdateMinutes < 1 || nextUpdateMinutes > 30) return state;
  const next = clone(state);
  const target = next.incidents.find(i => i.id === incidentId)!;
  target.response!.checkpointAt = next.minute + nextUpdateMinutes;
  supervisorRecord(next, target, `Follow-up recorded: ${text} Next checkpoint T+${target.response!.checkpointAt} min. ${target.response!.acknowledgedAt === null ? "Acknowledgment still outstanding." : "Ownership unchanged."}`);
  return finalize(next, "Follow-up recorded without inventing acknowledgment or completion.");
}

export function recordInvestigationReturn(state: SimulationState, incidentId: string, note: string): SimulationState {
  const incident = state.incidents.find(i => i.id === incidentId);
  if (!state.supervisor || !incident?.response || incident.response.acknowledgedAt === null || incident.response.readyAt !== null || incident.status !== "open" || actionable(incident) || note.trim().length < 5) return state;
  const e = assessConsequences(incident);
  if (e.safetyReview || e.uncontainedSpread) return state;
  const next = clone(state);
  const target = next.incidents.find(i => i.id === incidentId)!;
  target.response!.readyAt = next.minute;
  supervisorRecord(next, target, `Responsible team returned its investigation: ${note.trim().slice(0, 600)} Supervisor verification still required.`);
  return finalize(next, "Investigation returned for supervisor verification.");
}

export function confirmIncidentLocation(state: SimulationState, incidentId: string, stationId: string, observation: string): SimulationState {
  const incident = state.incidents.find(i => i.id === incidentId);
  const station = STATIONS.find(s => s.id === stationId);
  if (!state.supervisor || !incident || incident.status !== "open" || incident.assessment.stationId || !station || observation.trim().length < 5) return state;
  const next = clone(state);
  const target = next.incidents.find(i => i.id === incidentId)!;
  // Confirming location supplies no diagnosis, numeric forecast or protection.
  target.assessment = { ...target.assessment, stationId: station.id, evidence: [...target.assessment.evidence, `Supervisor-confirmed location ${station.id}: ${observation.trim().slice(0, 600)}`] };
  supervisorRecord(next, target, `Equipment location confirmed: ${station.id}. ${observation.trim().slice(0, 600)}`);
  return finalize(next, "Location verified; consequences still require review.");
}

export function verifyResponse(state: SimulationState, incidentId: string, checksConfirmed: boolean, note: string): SimulationState {
  const incident = state.incidents.find(i => i.id === incidentId);
  if (!state.supervisor || !incident || incident.status === "resolved" || incident.response?.readyAt == null || !checksConfirmed || note.trim().length < 5) return state;
  const e = assessConsequences(incident);
  if (e.safetyReview || e.uncontainedSpread) return state;
  const next = clone(state);
  const target = next.incidents.find(i => i.id === incidentId)!;
  supervisorRecord(next, target, `Supervisor verified the returned work against the established checks: ${note.trim().slice(0, 600)}`);
  finish(next, target, true);
  return finalize(next, "Returned work verified. Any area restart remains a separate decision.");
}

export function confirmProductContainment(state: SimulationState, incidentId: string, confirmed: boolean): SimulationState {
  const incident = state.incidents.find(i => i.id === incidentId);
  if (!state.supervisor || !incident || incident.status !== "open" || !confirmed || incident.containmentConfirmedAtMinute != null) return state;
  const e = assessConsequences(incident);
  if (e.safetyReview || !e.uncontainedSpread || !incident.assessment.stationId) return state;
  const next = clone(state);
  const target = next.incidents.find(i => i.id === incidentId)!;
  target.containmentConfirmedAtMinute = next.minute;
  target.containmentMode = "product-held";
  supervisorRecord(next, target, "Supervisor confirmed affected product segregated and an approved check prevents further quality spread. Equipment isolation is not asserted; area restart still requires confirmation.");
  return finalize(next, "Affected product contained; area restart requires supervisor review.");
}

export function restartArea(state: SimulationState, checksConfirmed: boolean): SimulationState {
  if (!canRestartArea(state) || !checksConfirmed) return state;
  const next = clone(state);
  next.supervisor!.areaStopped = false;
  supervisorRecord(next, null, "Supervisor confirmed established area restart checks. Area hold released; individual equipment isolation and pending verification remain in force.");
  return finalize(next, "Area restart confirmed; production deadlines recalculated.");
}

export function focusSupervisorAction(state: SimulationState, actionId: string): SimulationState {
  if (!state.supervisor || !getAttentionPlan(state, getRankedIncidents(state)).actions.some(a => a.id === actionId)) return state;
  const next = clone(state);
  next.supervisor!.focus = { actionId, untilMinute: next.minute + SUPERVISOR_ACTION_MINUTES };
  return next;
}

export function addHandoverNote(state: SimulationState, note: string): SimulationState {
  if (!state.supervisor || note.trim().length < 5) return state;
  const next = clone(state);
  supervisorRecord(next, null, `Shift correction / handover note: ${note.trim().slice(0, 1200)}`);
  return next;
}

/** Same event stream, start inventory, resources, safety gates and durations for
 * every policy. Decisions see only incidents already reported at that instant. */
export function runBenchmark(): BenchmarkResult[] {
  const labels: Record<Policy, string> = { planner: "Safety + repair windows", fifo: "First reported", severity: "Fixed severity", deadline: "Earliest critical event", reactive: "Wait for impact" };
  return (["planner", "fifo", "severity", "deadline", "reactive"] as const).map((policy) => {
    const state = clone(createSimulation());
    state.autoDispatch = true;
    const missed = new Set<string>();
    advanceInternal(state, SIMULATION_MINUTES, policy, missed);
    return { policy, label: labels[policy], producedUnits: round(state.producedUnits), lostUnits: round(state.lostUnits), stoppedMinutes: round(state.stoppedMinutes), missedWindows: missed.size, safetyDeferrals: state.incidents.filter((incident) => incident.assessment.safety !== "none" && (incident.repairStartedAtMinute === null || incident.repairStartedAtMinute > incident.reportedAtMinute + EPS)).length };
  });
}


/** Apply only a present-day assumption, never a projected future or its invented history. */
export function applyWhatIfChange(initial: SimulationState, change: WhatIfChange): SimulationState {
  const state = clone(initial);
  if (change.kind === "buffer") {
    const index = STATIONS.findIndex(s => s.id === change.stationId);
    if (index < 0 || !Number.isFinite(change.units) || change.units < 0 || change.units > STATIONS[index].bufferCapacity) throw new Error("Choose a stock level within the station's buffer capacity.");
    state.buffers[index] = change.units;
  } else {
    return startRepair(initial, change.incidentId);
  }
  return finalize(state, "Supervisor applied a what-if assumption to the synthetic line.");
}

/** Paired counterfactuals see only currently known faults, never future demo arrivals.
 * Both follow the same maintenance queue and preserve committed repairs. The repair
 * experiment changes only when the selected job becomes eligible; safety is never delayed. */
export function compareWhatIf(initial: SimulationState, change: WhatIfChange, horizon = 45): WhatIfResult {
  if (!Number.isFinite(horizon) || horizon < 1 || horizon > 60) throw new Error("Choose a forecast between 1 and 60 minutes.");
  const target = change.kind === "repair" ? initial.incidents.find(i => i.id === change.incidentId) : undefined;
  if (change.kind === "repair" && (!target || target.status !== "open" || !actionable(target))) throw new Error("Choose a waiting incident with an established repair.");
  if (target && safetyTier(target)) throw new Error("Safety concerns cannot be deferred in this experiment.");
  if (change.kind === "repair" && change.delayMinutes !== null && (!Number.isFinite(change.delayMinutes) || change.delayMinutes < 0 || change.delayMinutes > 60)) throw new Error("Choose a delay between 0 and 60 minutes.");

  function replay(alternative: boolean): WhatIfBranch {
    const state = clone(alternative && change.kind !== "repair" ? applyWhatIfChange(initial, change) : initial);
    const frames: ProjectionFrame[] = [];
    const events: RippleEvent[] = [];
    let lastReadings = getStationReadings(initial);
    const startProduced = state.producedUnits;
    const startStopped = state.stoppedMinutes;
    const startMinute = state.minute;
    const selectedDelay = alternative && change.kind === "repair" ? change.delayMinutes ?? Infinity : 0;
    let queue = calculateRanking(state).filter(r => r.incident.status === "open").map(r => r.incident.id);
    let nextSample = startMinute;
    let previousActive = active(state).length;
    while (state.minute <= startMinute + horizon + EPS) {
      // Refresh decisions at sample boundaries or immediately after a repair completes.
      if (state.minute + EPS >= nextSample || active(state).length !== previousActive) {
        queue = calculateRanking(state).filter(r => r.incident.status === "open").map(r => r.incident.id);
        previousActive = active(state).length;
      }
      if (target) queue = [...new Set([target.id, ...queue])];
      queue.sort((a,b) => safetyTier(state.incidents.find(i=>i.id===b)!) - safetyTier(state.incidents.find(i=>i.id===a)!));
      dispatchOrder(state, queue, target?.id, startMinute + selectedDelay);
      const readings = getStationReadings(state);
      for (let i=0;i<readings.length;i++) {
        const reading = readings[i]; const before = lastReadings[i];
        if (reading.state === before.state) continue;
        const description = reading.state === "starved" ? "runs out of input" : reading.state === "blocked" ? "cannot pass work forward" : reading.state === "stopped" ? "stops for repair or checks" : reading.state === "running" ? "returns to normal flow" : "runs below normal speed";
        events.push({elapsed: round(state.minute-startMinute), stationId: reading.id, message: `${reading.name} ${description}`});
      }
      lastReadings = readings;
      if (state.minute + EPS >= nextSample || state.minute + EPS >= startMinute + horizon) {
        frames.push({elapsed: round(state.minute-startMinute), state: clone(state), readings, produced: round(state.producedUnits-startProduced), stopped: round(state.stoppedMinutes-startStopped)});
        nextSample += 1;
      }
      if (state.minute + EPS >= startMinute + horizon) break;
      let dt = nextStep(state, startMinute + horizon, FLOW_STEP_MINUTES);
      if (target && state.minute < startMinute+selectedDelay-EPS) dt = Math.min(dt,startMinute+selectedDelay-state.minute);
      dt = Math.min(dt,nextSample-state.minute);
      tick(state,dt);
    }
    const label = change.kind === "repair" ? alternative ? change.delayMinutes === null ? "Leave it waiting" : `Wait ${change.delayMinutes} min` : "Repair it next" : alternative ? `${change.units} bodies at ${change.stationId}` : "Current conditions";
    return {label,frames,events};
  }
  const baseline = replay(false); const alternative = replay(true);
  return { baseline, alternative, horizon, outputDifference: round(alternative.frames.at(-1)!.produced-baseline.frames.at(-1)!.produced), stoppedDifference: round(alternative.frames.at(-1)!.stopped-baseline.frames.at(-1)!.stopped) };
}
