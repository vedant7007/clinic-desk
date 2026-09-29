import { Consult } from "@/components/Consult";

export default async function ConsultPage({ searchParams }: { searchParams: Promise<{ patient?: string | string[] }> }) {
  const sp = await searchParams;
  const patient = Array.isArray(sp.patient) ? sp.patient[0] : sp.patient;
  return <Consult initialPatientId={patient} />;
}
