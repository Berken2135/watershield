import { notFound } from "next/navigation";

export function generateStaticParams() {
  return [];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default async function PollutionDetailPage(_props: { params: Promise<{ id: string }> }) {
  notFound();
}
