import { CaseFile } from "@/components/case-file";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CaseFile id={id} key={id}/>;
}
