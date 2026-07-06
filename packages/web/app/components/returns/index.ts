/**
 * Returns Components
 *
 * Components for handling return requests and displaying return status.
 */

export { ReturnEligibilityCheck } from "./ReturnEligibilityCheck";
export type { ReturnEligibilityCheckProps } from "./ReturnEligibilityCheck";

export { ReturnPolicyDisplay } from "./ReturnPolicyDisplay";
export type { ReturnPolicyDisplayProps } from "./ReturnPolicyDisplay";

export {
  ReturnRequestForm,
  RETURN_REASONS,
  MIN_DETAILS_LENGTH,
  MAX_DETAILS_LENGTH,
} from "./ReturnRequestForm";
export type { ReturnRequestFormProps } from "./ReturnRequestForm";

export { ReturnStatusCard, STATUS_CONFIG, REASON_LABELS } from "./ReturnStatusCard";
export type { ReturnStatusCardProps } from "./ReturnStatusCard";
