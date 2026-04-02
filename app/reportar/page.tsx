import { Suspense } from "react";
import { ReportShell } from "@/components/report-shell";

export default function ReportarPage() {
  return (
    <Suspense fallback={null}>
      <ReportShell />
    </Suspense>
  );
}
