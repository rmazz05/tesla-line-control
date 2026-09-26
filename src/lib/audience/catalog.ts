import { CATALOG } from "../priority/catalog";
import type { FaultAssessment, StationId } from "../priority/types";

export type AudienceFault = { id: string; stationId: StationId; component: string; label: string; detail: string; assessment: FaultAssessment };
function fault(stationId: StationId, id: string, component: string, label: string, detail: string, template: string, overrides: Partial<FaultAssessment> = {}): AudienceFault {
  const reference = CATALOG.find(item => item.id === template)!;
  return { id, stationId, component, label, detail, assessment: { ...reference.assessment, stationId, ...overrides } };
}
function custom(title: string, overrides: Partial<FaultAssessment> = {}): Partial<FaultAssessment> {
  return { title, catalogId: null, diagnosis: title + ". This is an audience-selected synthetic fault, not live equipment telemetry.", checks: ["Verify the reported condition and affected work before releasing equipment."], ...overrides };
}
// Each station has three independent component / product defects. A defect can
// remain present while another stops the station; a quality defect concerns work
// already produced. Thus every subset is physically coherent, including all three.
// Keep IDs stable so existing rooms and phones can reconnect after an update.
export const AUDIENCE_FAULTS: AudienceFault[] = [
  fault("GA-12", "body-supply", "Incoming supply", "No new car bodies", "No bodies are arriving. Stored bodies are still available.", "body-feed-interruption"),
  fault("GA-12", "body-drive", "Transfer drive", "Conveyor drive has failed", "Bodies cannot leave your station until the drive is repaired.", "body-transfer"),
  fault("GA-12", "body-slow", "Position sensor", "Position sensor is unreliable", "Missed readings delay each transfer when the conveyor runs.", "reported-cycle-slowdown", custom("Body position sensor misses readings", { requiredSkill: "electrical" })),
  fault("GA-18", "cockpit-vibration", "Fixture mounts", "Fixture mounts are loose", "The fixture vibrates when moving. Its mounts need checking.", "cockpit-locator", custom("Cockpit fixture mounts are loose")),
  fault("GA-18", "cockpit-fastener", "Dashboard fastening", "A screw was not tightened", "A dashboard you already fitted needs its attachment checked.", "fluid-meter-drift", custom("Dashboard fastener was not tightened", { recommendedAction: "Contain affected assemblies, inspect the fastening process, and verify attachment before release." })),
  fault("GA-18", "cockpit-jam", "Positioning slide", "Positioning slide is jammed", "The slide cannot move the next dashboard into place.", "reported-mechanical-jam", custom("Dashboard positioning slide is jammed")),
  fault("GA-24", "glass-servo", "Robot drive", "Robot controller keeps resetting", "Intermittent resets interrupt the robot’s movement.", "glass-servo"),
  fault("GA-24", "glass-placement", "Glass alignment", "A fitted window is misaligned", "Glass you already fitted needs checking before release.", "fluid-meter-drift", custom("Glass placement is out of alignment", { recommendedAction: "Contain affected vehicles and verify glass alignment before release." })),
  fault("GA-24", "glass-slow", "Adhesive dispenser", "Adhesive nozzle is partly blocked", "Applying adhesive takes longer whenever the station runs.", "reported-cycle-slowdown", custom("Glass adhesive nozzle is partially blocked")),
  fault("GA-28", "battery-guard", "Safety interlock", "Safety guard is faulty", "Your station is held until the guard has been checked.", "battery-guard"),
  fault("GA-28", "battery-lift", "Lift mechanism", "Battery lift is stuck", "The lift cannot raise the next battery into position.", "reported-mechanical-jam", custom("Battery lift is stuck")),
  fault("GA-28", "battery-alignment", "Battery mounting", "A battery mount is misaligned", "A battery you already installed needs its mounting checked.", "fluid-meter-drift", custom("Battery mounting is misaligned", { recommendedAction: "Contain affected assemblies and verify mounting before release." })),
  fault("GA-32", "wheel-backup", "Torque tool", "Primary torque tool has failed", "Only the slower backup tool is available for fastening.", "torque-backup"),
  fault("GA-32", "wheel-fastener", "Wheel fastening", "A wheel bolt was not tightened", "A wheel you already fitted needs its bolts checked.", "fluid-meter-drift", custom("Wheel bolt was not tightened", { recommendedAction: "Contain affected vehicles and verify every affected wheel attachment." })),
  fault("GA-32", "wheel-jam", "Wheel fixture", "Wheel fixture is jammed", "The fixture cannot position the next wheel.", "reported-mechanical-jam", custom("Wheel fitting fixture is jammed")),
  fault("GA-36", "fluid-meter", "Volume meter", "Fill readings do not match", "The meter disagrees with the check scale on completed fills.", "fluid-meter-drift"),
  fault("GA-36", "fluid-pump", "Supply filter", "Fluid filter is partly blocked", "The restriction slows fluid flow whenever the pump runs.", "fluid-pump", custom("Fluid supply filter is partially blocked")),
  fault("GA-36", "fluid-stop", "Pump motor", "Pump motor has failed", "Your station cannot fill vehicles until the motor is repaired.", "reported-electrical-stop", custom("Filling pump motor has failed")),
  fault("EOL-41", "roller-calibration", "Test sensor", "Test sensor is out of calibration", "Results from completed tests need checking.", "roller-calibration"),
  fault("EOL-41", "roller-stop", "Roller drive", "Roller drive is jammed", "The rollers cannot turn to run the next test.", "reported-mechanical-jam", custom("Test roller drive is jammed")),
  fault("EOL-41", "roller-slow", "Results connection", "Results connection is unstable", "Saving each completed test requires retries.", "reported-cycle-slowdown", custom("Roller test results connection is unstable", { requiredSkill: "electrical" })),
  fault("EOL-45", "inspection-camera", "Inspection camera", "Camera keeps retrying", "Image capture needs several attempts before a check can finish.", "final-gate-camera"),
  fault("EOL-45", "inspection-result", "Gap gauge", "Panel gap gauge is inaccurate", "Measurements on vehicles already checked need verification.", "fluid-meter-drift", custom("Final inspection panel gap gauge is inaccurate", { recommendedAction: "Hold affected vehicles and verify panel gap measurements before release." })),
  fault("EOL-45", "inspection-slow", "Vehicle ID scanner", "ID scanner misses barcodes", "Identifying the next vehicle takes repeated scans.", "reported-cycle-slowdown", custom("Final inspection vehicle ID scanner misses barcodes", { requiredSkill: "electrical" })),
];
export const MAX_PARTICIPANTS = 120;
export const PRESENCE_MS = 30_000;
export const DEMO_SPEED = 10;
