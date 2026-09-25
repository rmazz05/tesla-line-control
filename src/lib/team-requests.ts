import type { Incident } from "./line-data";

export type SupportTeam =
  | "maintenance"
  | "quality"
  | "material_flow"
  | "production_planning"
  | "engineering";

export type TicketStatus =
  | "awaiting_ack"
  | "acknowledged"
  | "working"
  | "blocked"
  | "ready_for_check"
  | "closed";

export type TicketUpdate = {
  id: string;
  time: string;
  status: TicketStatus;
  author: string;
  message: string;
};

export type TeamTicket = {
  id: string;
  incidentId: string;
  stationId: string;
  team: SupportTeam;
  subject: string;
  request: string;
  status: TicketStatus;
  priority: "urgent" | "high" | "normal";
  sentAt: string;
  responseTargetMinutes: number;
  etaMinutes?: number;
  assignee?: string;
  blockedBy?: string;
  updates: TicketUpdate[];
};

export const teamLabels: Record<SupportTeam, string> = {
  maintenance: "Maintenance",
  quality: "Quality",
  material_flow: "Material flow",
  production_planning: "Production planning",
  engineering: "Engineering",
};

export const ticketStatusLabels: Record<TicketStatus, string> = {
  awaiting_ack: "Awaiting acknowledgement",
  acknowledged: "Acknowledged",
  working: "In progress",
  blocked: "Blocked",
  ready_for_check: "Ready for supervisor check",
  closed: "Closed",
};

const includesAny = (text: string, terms: string[]) =>
  terms.some((term) => text.includes(term));

export function recommendedTeamForIncident(incident: Incident): SupportTeam {
  const text = [
    incident.code,
    incident.title,
    incident.description,
    incident.source,
    incident.owner,
  ]
    .join(" ")
    .toLowerCase();

  if (
    includesAny(text, [
      "cart",
      "material",
      "delivery",
      "sequence",
      "tugger",
      "buffer",
    ])
  ) {
    return "material_flow";
  }

  if (
    incident.impact === "quality_hold" ||
    includesAny(text, ["quality", "torque", "specification", "rework"])
  ) {
    return "quality";
  }

  if (
    includesAny(text, [
      "scanner",
      "robot",
      "plc",
      "electrical",
      "mechanical",
      "tool",
      "sensor",
    ])
  ) {
    return "maintenance";
  }

  if (
    includesAny(text, ["cycle time", "program", "process", "calibration"])
  ) {
    return "engineering";
  }

  return incident.impact === "line_stop" || incident.impact === "safety_stop"
    ? "production_planning"
    : "engineering";
}

export const initialTickets: TeamTicket[] = [
  {
    id: "REQ-1094",
    incidentId: "INC-4271",
    stationId: "GA-24",
    team: "maintenance",
    subject: "Inspect scanner 24-B and restore cell permit",
    request:
      "Check the scanner field for an obstruction or alignment fault. Confirm both safety channels before handing the cell back for reset.",
    status: "awaiting_ack",
    priority: "urgent",
    sentAt: "18:42:34",
    responseTargetMinutes: 2,
    updates: [
      {
        id: "upd-1094-1",
        time: "18:42:34",
        status: "awaiting_ack",
        author: "M. Rossi · Production supervisor",
        message: "Request sent to electrical maintenance on call.",
      },
    ],
  },
  {
    id: "REQ-1093",
    incidentId: "INC-4271",
    stationId: "GA-24",
    team: "production_planning",
    subject: "Prepare recovery sequence for GA line stop",
    request:
      "Protect the next three bodies in the upstream buffer and prepare a restart sequence if the stop exceeds ten minutes.",
    status: "acknowledged",
    priority: "high",
    sentAt: "18:42:23",
    responseTargetMinutes: 3,
    etaMinutes: 6,
    assignee: "L. Weber",
    updates: [
      {
        id: "upd-1093-1",
        time: "18:42:23",
        status: "awaiting_ack",
        author: "M. Rossi · Production supervisor",
        message: "Recovery-planning request sent with the current buffer count.",
      },
      {
        id: "upd-1093-2",
        time: "18:43:02",
        status: "acknowledged",
        author: "L. Weber · Production planning",
        message: "Reviewing the next six units; no body has been diverted yet.",
      },
    ],
  },
  {
    id: "REQ-1089",
    incidentId: "INC-4268",
    stationId: "GA-32",
    team: "quality",
    subject: "Verify wheel torque on held unit 7YJ384",
    request:
      "Witness re-torque of all four wheels with backup tool TT-32-02, then release or retain the unit based on the recorded results.",
    status: "ready_for_check",
    priority: "high",
    sentAt: "18:40:18",
    responseTargetMinutes: 3,
    etaMinutes: 1,
    assignee: "S. Kaya",
    updates: [
      {
        id: "upd-1089-1",
        time: "18:40:18",
        status: "awaiting_ack",
        author: "M. Rossi · Production supervisor",
        message: "Verification request sent with unit and tool identifiers.",
      },
      {
        id: "upd-1089-2",
        time: "18:40:51",
        status: "working",
        author: "S. Kaya · Quality",
        message: "Unit located at rework position 2; backup tool check passed.",
      },
      {
        id: "upd-1089-3",
        time: "18:44:08",
        status: "ready_for_check",
        author: "S. Kaya · Quality",
        message: "Four-wheel re-torque completed. Results are ready for supervisor review.",
      },
    ],
  },
  {
    id: "REQ-1086",
    incidentId: "INC-4264",
    stationId: "GA-18",
    team: "material_flow",
    subject: "Recover dashboard cart for unit 7YJ391",
    request:
      "Locate the delayed cart, confirm its sequence ID and deliver it before the two-unit line-side buffer is consumed.",
    status: "working",
    priority: "normal",
    sentAt: "18:36:27",
    responseTargetMinutes: 4,
    etaMinutes: 4,
    assignee: "Route 3 · Tugger 12",
    updates: [
      {
        id: "upd-1086-1",
        time: "18:36:27",
        status: "awaiting_ack",
        author: "M. Rossi · Production supervisor",
        message: "Expedite request sent to Route 3.",
      },
      {
        id: "upd-1086-2",
        time: "18:37:04",
        status: "working",
        author: "Route 3 dispatcher",
        message: "Cart found one zone upstream and loaded onto tugger 12.",
      },
    ],
  },
];

export type CreateTeamTicketInput = {
  incident: Incident;
  team?: SupportTeam;
  request?: string;
  requestedBy?: string;
};

const currentTime = () =>
  new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());

const createTicketId = () => {
  const suffix = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID().slice(0, 6).toUpperCase()
    : Date.now().toString().slice(-6);

  return `REQ-${suffix}`;
};

const priorityForIncident = (
  incident: Incident,
): TeamTicket["priority"] => {
  if (incident.severity === "critical") return "urgent";
  if (incident.severity === "high") return "high";
  return "normal";
};

export function createTeamTicket({
  incident,
  team = recommendedTeamForIncident(incident),
  request,
  requestedBy = "Production supervisor",
}: CreateTeamTicketInput): TeamTicket {
  const id = createTicketId();
  const sentAt = currentTime();
  const teamLabel = teamLabels[team];

  return {
    id,
    incidentId: incident.id,
    stationId: incident.stationId,
    team,
    subject: `${incident.title} · ${incident.stationId}`,
    request:
      request?.trim() ||
      `Respond at ${incident.stationId}, verify the reported condition and update the supervisor with findings and an ETA.`,
    status: "awaiting_ack",
    priority: priorityForIncident(incident),
    sentAt,
    responseTargetMinutes: incident.severity === "critical" ? 2 : 5,
    updates: [
      {
        id: `${id}-1`,
        time: sentAt,
        status: "awaiting_ack",
        author: requestedBy,
        message: `Request sent to ${teamLabel}.`,
      },
    ],
  };
}
