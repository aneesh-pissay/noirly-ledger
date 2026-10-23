import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";

/**
 * A saved what-if: a name and its changes (see ScenarioChange in
 * src/core/forecast.ts), stored as given after validation.
 */
const scenarioSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    changes: { type: [Schema.Types.Mixed], default: [] },
    createdById: { type: Schema.Types.ObjectId, ref: "LedgerUser", required: true },
  },
  { timestamps: true },
);

export type ScenarioDocument = InferSchemaType<typeof scenarioSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const Scenario: Model<ScenarioDocument> =
  (models.Scenario as Model<ScenarioDocument>) ||
  model<ScenarioDocument>("Scenario", scenarioSchema, "scenarios");
