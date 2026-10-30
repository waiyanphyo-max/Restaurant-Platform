import { isValidAdminOrigin, parseAppStage } from "@/lib/deployment";

export default function AdminHome() {
  const stage = parseAppStage(process.env.APP_STAGE);
  const configured = isValidAdminOrigin(process.env.ADMIN_WEB_ORIGIN, stage);

  return (
    <main className="shell">
      <div className="eyebrow">Restaurant Platform</div>
      <h1>Platform Admin</h1>
      <p>
        This is the new platform operator website foundation. Restaurant data, sign-in, and
        management workflows will be connected in later milestones.
      </p>
      <div className="status" role="status">
        {configured
          ? `Environment: ${stage}. No production data is loaded by this starter.`
          : "Admin origin or stage is not configured. See the M1 environment guide."}
      </div>
    </main>
  );
}
