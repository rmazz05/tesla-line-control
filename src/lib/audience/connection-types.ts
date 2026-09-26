export type AudienceConnection =
  | { status: "idle" }
  | { status: "starting"; message: string }
  | { status: "ready"; origin: string; checkedAt: number }
  | { status: "error"; message: string };
