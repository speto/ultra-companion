export function getBadgeProps(status: string): {
  label: string;
  variant: "default" | "destructive" | "outline";
} {
  switch (status) {
    case "pending":
      return { label: "Pending", variant: "outline" };
    case "importing":
      return { label: "Importing", variant: "outline" };
    case "success":
      return { label: "Success", variant: "default" };
    case "skipped":
      return { label: "Skipped", variant: "outline" };
    case "failed":
      return { label: "Failed", variant: "destructive" };
    default:
      return { label: "Unknown", variant: "outline" };
  }
}
