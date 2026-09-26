import { AudienceParticipant } from "@/components/audience/participant";

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <AudienceParticipant key={code.toUpperCase()} code={code.toUpperCase()} />;
}
