import {
  contentCardIdPayloadSchema,
  createContentCardPayloadSchema,
  getContentCardsPayloadSchema,
  saveContentCardMediaPayloadSchema,
  updateContentCardPayloadSchema,
  type ContentCard,
  type ContentCardIdPayload,
  type ContentCardMediaItem,
  type CreateContentCardPayload,
  type GetContentCardsPayload,
  type SaveContentCardMediaPayload,
  type UpdateContentCardPayload,
} from "../../contracts";
import { definePayloadProcedure } from "../core";

export const contentCardProcedures = {
  getContentCards: definePayloadProcedure<GetContentCardsPayload, ContentCard[], "main-local">(
    "getContentCards",
    "main-local",
    getContentCardsPayloadSchema,
  ),
  createContentCard: definePayloadProcedure<CreateContentCardPayload, ContentCard, "main-local">(
    "createContentCard",
    "main-local",
    createContentCardPayloadSchema,
  ),
  updateContentCard: definePayloadProcedure<
    UpdateContentCardPayload,
    ContentCard | null,
    "main-local"
  >("updateContentCard", "main-local", updateContentCardPayloadSchema),
  deleteContentCard: definePayloadProcedure<ContentCardIdPayload, void, "main-local">(
    "deleteContentCard",
    "main-local",
    contentCardIdPayloadSchema,
  ),
  saveContentCardMedia: definePayloadProcedure<
    SaveContentCardMediaPayload,
    ContentCardMediaItem,
    "main-local"
  >("saveContentCardMedia", "main-local", saveContentCardMediaPayloadSchema),
} as const;
