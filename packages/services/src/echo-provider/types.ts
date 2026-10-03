import { Schema } from "effect";

export interface EchoRequest {
  readonly taskId: string;
  readonly text: string;
}

/**
 * The provider's wire format, decoded at the boundary so a drifting
 * upstream API fails loudly instead of leaking bad data inward.
 */
export const EchoResult = Schema.Struct({
  echoed: Schema.String,
  sentiment: Schema.Literals(["positive", "neutral", "negative"]),
  processedAt: Schema.String,
});

export type EchoResult = Schema.Schema.Type<typeof EchoResult>;
