import type { View } from "@/types/workspace";

export type WorkspaceNavGroup = {
  title: string;
  items: ReadonlyArray<readonly [View, string, string]>;
};

export const groups: ReadonlyArray<WorkspaceNavGroup> = [
  { title: "OPERATIONS", items: [["overview","Overview","⌂"],["orders","Orders","▤"],["staff-order","Staff order","＋"],["queue","Queue & pickup","◷"],["deliveries","Deliveries / driver","➤"],["reports","Daily report","▥"]] },
  { title: "RESTAURANT", items: [["menu","Menu & catalogue","☷"],["tables","Tables & QR","▦"],["settings","Settings","⚙"],["zones","Delivery zones","⌖"],["members","Team & roles","♙"],["restaurant","Restaurant profile","◉"]] },
  { title: "CUSTOMER POV", items: [["storefront","Delivery storefront","🛍"],["table-order","Table QR order","▦"],["profile","My profile","○"],["addresses","Saved addresses","⌖"],["my-orders","My orders","▣"],["notifications","Notifications","♧"],["devices","Push devices","▯"],["queue-track","Track queue ticket","◴"]] },
  { title: "TOOLS", items: [["api","API workbench","⌘"]] },
];
